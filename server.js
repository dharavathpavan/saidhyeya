'use strict';

/* =====================================================================
   Sai Dhyeya — portfolio server
   Zero dependencies (Node built-ins only). Serves:
     • the public static site
     • a read-only content API + contact-form endpoint
     • a hidden, session-protected admin panel + content/message API

   Configure with environment variables or a .env file:
     PORT          (default 3000)
     HOST          (default 0.0.0.0)
     ADMIN_PATH    (default /sd-panel-x7k29f)  ← your private admin URL
   ===================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { loadEnv, ROOT } = require('./lib/env');
const { readJSON, writeJSON, ensureDataDir } = require('./lib/store');
const { hashPassword, verifyPassword, randomToken, safeEqual } = require('./lib/auth');

loadEnv();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PATH = normalizeAdminPath(process.env.ADMIN_PATH || '/sd-panel-x7k29f');

const CONTENT_FILE = 'content.json';
const MESSAGES_FILE = 'messages.json';
const ADMIN_FILE = 'admin.json';
const ANALYTICS_FILE = 'analytics.json';
const ANALYTICS_MAX_EVENTS = 20000;

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const LOGIN_MAX_ATTEMPTS = 6;
const LOGIN_LOCK_MS = 10 * 60 * 1000;
const CONTACT_MAX = 5; // messages per IP…
const CONTACT_WINDOW_MS = 10 * 60 * 1000; // …within this window
const JSON_LIMIT = 512 * 1024;
const UPLOAD_LIMIT = 6 * 1024 * 1024;

const ADMIN_DIR = path.join(ROOT, '_admin');
const UPLOAD_DIR = path.join(ROOT, 'assets', 'images', 'uploads');

const DENY_DIRS = new Set(['data', '_admin', 'lib', 'node_modules', '.git', '.vscode']);
// The _ref/ harness folder is analysis-only and git-ignored; it is blocked by
// default but can be served locally for rendering/verification with
// ALLOW_ANALYSIS=1 node server.js
if (process.env.ALLOW_ANALYSIS !== '1') DENY_DIRS.add('_ref');
const DENY_FILES = new Set([
  'server.js', 'set-credentials.js', 'package.json', 'package-lock.json',
  '.env', '.env.example', '.gitignore'
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.pdf': 'application/pdf',};

const UPLOAD_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml'
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function normalizeAdminPath(value) {
  let p = String(value || '').trim();
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/+$/, '');
  return p || '/admin';
}

const sessions = new Map(); // token -> session
const loginAttempts = new Map(); // ip -> { count, first, until }
const contactHits = new Map(); // ip -> [timestamps]
const analyticsHits = new Map(); // ip -> [timestamps]

function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function getSession(req) {
  const token = parseCookies(req)['sd_session'];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expires = Date.now() + SESSION_TTL_MS; // sliding expiry
  return { token, ...session };
}

function setSessionCookie(res, token) {
  const parts = [
    `sd_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (process.env.COOKIE_SECURE === '1') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sd_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
}

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJSONBody(req, limit = JSON_LIMIT) {
  const raw = await readBody(req, limit);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function securityHeaders(res, isAdmin) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isAdmin) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; " +
        "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
    );
  } else if (process.env.ALLOW_ANALYSIS !== '1') {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; " +
        "script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'"
    );
  }
  // In ALLOW_ANALYSIS mode the CSP is omitted so the local _ref/ rendering
  // harness (which relies on inline styles/scripts) still works.
}

function isLockedOut(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return 0;
  if (rec.until && rec.until > Date.now()) return rec.until - Date.now();
  return 0;
}

function recordLoginFailure(ip) {
  const rec = loginAttempts.get(ip) || { count: 0, first: Date.now(), until: 0 };
  if (Date.now() - rec.first > LOGIN_LOCK_MS) {
    rec.count = 0;
    rec.first = Date.now();
  }
  rec.count += 1;
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    rec.until = Date.now() + LOGIN_LOCK_MS;
    rec.count = 0;
    rec.first = Date.now();
  }
  loginAttempts.set(ip, rec);
}

function contactAllowed(ip) {
  const now = Date.now();
  const hits = (contactHits.get(ip) || []).filter((t) => now - t < CONTACT_WINDOW_MS);
  contactHits.set(ip, hits);
  return hits.length < CONTACT_MAX;
}

function recordContactHit(ip) {
  const hits = contactHits.get(ip) || [];
  hits.push(Date.now());
  contactHits.set(ip, hits);
}

function analyticsAllowed(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const hits = (analyticsHits.get(ip) || []).filter((t) => now - t < windowMs);
  analyticsHits.set(ip, hits);
  return hits.length < 120;
}
function recordAnalyticsHit(ip) {
  const hits = analyticsHits.get(ip) || [];
  hits.push(Date.now());
  analyticsHits.set(ip, hits);
}

/* ------------------------------------------------------------------ */
/* static files                                                        */
/* ------------------------------------------------------------------ */

function resolveStatic(urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel.endsWith('/')) rel += 'index.html';

  const normalized = path.normalize(rel).replace(/^([/\\])+/, '');
  const segments = normalized.split(/[/\\]/);
  if (segments.some((s) => s.startsWith('.'))) return null; // no dotfiles
  if (DENY_DIRS.has(segments[0])) return null;
  if (DENY_FILES.has(segments[segments.length - 1])) return null;

  const abs = path.resolve(ROOT, normalized);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

function serveStatic(req, res, urlPath, isAdmin) {
  const abs = resolveStatic(urlPath);
  if (!abs) {
    sendJSON(res, 403, { error: 'Forbidden' });
    return;
  }
  fs.stat(abs, (err, stat) => {
    if (err || !stat.isFile()) {
      sendJSON(res, 404, { error: 'Not found' });
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    securityHeaders(res, isAdmin);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    // HTML/CSS/JS are not fingerprinted, so make browsers revalidate them —
    // that way edits and deploys are visible immediately. Media is cacheable.
    if (ext === '.html' || ext === '.css' || ext === '.js' || ext === '.map') {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }

    const stream = fs.createReadStream(abs);
    stream.on('error', () => {
      if (!res.headersSent) sendJSON(res, 500, { error: 'Read error' });
      else res.end();
    });
    stream.pipe(res);
  });
}

function serveAdminFile(res, file, type) {
  const abs = path.join(ADMIN_DIR, file);
  fs.readFile(abs, (err, buf) => {
    if (err) {
      sendJSON(res, 500, { error: 'Admin asset missing: ' + file });
      return;
    }
    securityHeaders(res, true);
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  });
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

function getContent() {
  return readJSON(CONTENT_FILE, null) || {};
}

function handlePublicApi(req, res, pathname) {
  if (pathname === '/api/content' && req.method === 'GET') {
    let content;
    try {
      content = getContent();
    } catch (err) {
      sendJSON(res, 500, { error: 'Content store is corrupted: ' + err.message });
      return true;
    }
    sendJSON(res, 200, content);
    return true;
  }

  if (pathname === '/api/contact' && req.method === 'POST') {
    handleContact(req, res);
    return true;
  }

  if ((pathname === '/health' || pathname === '/api/health') && (req.method === 'GET' || req.method === 'HEAD')) {
    sendJSON(res, 200, { ok: true, status: 'healthy', uptime: Math.round(process.uptime()) });
    return true;
  }

  if (pathname === '/api/track' && req.method === 'POST') {
    handleTrack(req, res);
    return true;
  }

  return false;
}

async function handleContact(req, res) {
  const ip = clientIp(req);
  if (!contactAllowed(ip)) {
    sendJSON(res, 429, { error: 'Too many messages. Please try again later.' });
    return;
  }

  let body;
  try {
    body = await readJSONBody(req, 32 * 1024);
  } catch (err) {
    sendJSON(res, err.status || 400, { error: err.message });
    return;
  }

  // Honeypot: bots fill hidden fields.
  if (body.company) {
    sendJSON(res, 200, { ok: true });
    return;
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();

  const errors = {};
  if (name.length < 2 || name.length > 120) errors.name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
    errors.email = 'Please enter a valid email address.';
  }
  if (message.length < 10 || message.length > 5000) {
    errors.message = 'Please write a message of at least 10 characters.';
  }
  if (subject.length > 200) errors.subject = 'Subject is too long.';

  if (Object.keys(errors).length) {
    sendJSON(res, 422, { error: 'Please check the highlighted fields.', fields: errors });
    return;
  }

  const messages = readJSON(MESSAGES_FILE, []);
  const record = {
    id: crypto.randomUUID(),
    name,
    email,
    subject: subject || '(no subject)',
    message,
    receivedAt: new Date().toISOString(),
    read: false,
    ip
  };
  messages.unshift(record);
  writeJSON(MESSAGES_FILE, messages);
  recordContactHit(ip);

  sendJSON(res, 200, { ok: true, message: getContent().contact?.form?.success || 'Sent.' });
}

/* ------------------------------------------------------------------ */
/* analytics                                                           */
/* ------------------------------------------------------------------ */

const ANALYTICS_TYPES = new Set([
  'page_view', 'navigation_click', 'resume_click', 'cta_click',
  'button_click', 'link_click', 'contact_submit', 'contact_error',
  'section_view'
]);

function analyticsSummary(days) {
  days = Math.max(1, Math.min(90, Number(days) || 14));
  const events = readJSON(ANALYTICS_FILE, []);
  const list = Array.isArray(events) ? events : [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays = days;
  const visitsByDay = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const date = new Date(now - i * dayMs).toISOString().slice(0, 10);
    visitsByDay.push({
      date,
      count: list.filter((e) => e.type === 'page_view' && String(e.createdAt || '').slice(0, 10) === date).length
    });
  }
  const uniqueVisitors = new Set(list.map((e) => e.visitorId || e.ip || 'unknown')).size;
  const sessions = new Set(list.map((e) => e.sessionId).filter(Boolean)).size;
  const countType = (t) => list.filter((e) => e.type === t).length;
  const topPagesMap = {};
  list.forEach((e) => {
    if (e.type === 'page_view') {
      const p = e.path || '/';
      topPagesMap[p] = (topPagesMap[p] || 0) + 1;
    }
  });
  const topPages = Object.keys(topPagesMap)
    .map((p) => ({ path: p, count: topPagesMap[p] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const recent = list.slice(-50).reverse();
  return {
    totalEvents: list.length,
    uniqueVisitors,
    sessions,
    pageViews: countType('page_view'),
    navigationClicks: countType('navigation_click'),
    resumeClicks: countType('resume_click'),
    ctaClicks: countType('cta_click') + countType('button_click'),
    contactSubmissions: countType('contact_submit'),
    contactErrors: countType('contact_error'),
    topPages,
    visitsByDay,
    recent
  };
}

async function handleTrack(req, res) {
  const ip = clientIp(req);
  if (!analyticsAllowed(ip)) {
    sendJSON(res, 429, { error: 'Too many events' });
    return;
  }
  let body;
  try {
    body = await readJSONBody(req, 16 * 1024);
  } catch (err) {
    sendJSON(res, err.status || 400, { error: err.message });
    return;
  }
  const type = String(body.type || '').trim();
  if (!ANALYTICS_TYPES.has(type)) {
    sendJSON(res, 422, { error: 'Unknown event type' });
    return;
  }
  const record = {
    id: crypto.randomUUID(),
    type,
    path: String(body.path || '/').slice(0, 200),
    visitorId: body.visitorId ? String(body.visitorId).slice(0, 64) : null,
    sessionId: body.sessionId ? String(body.sessionId).slice(0, 64) : null,
    target: body.target ? String(body.target).slice(0, 200) : null,
    action: body.action ? String(body.action).slice(0, 200) : null,
    meta: (body.meta && typeof body.meta === 'object') ? JSON.stringify(body.meta).slice(0, 500) : null,
    createdAt: new Date().toISOString(),
    ip,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200)
  };
  const events = readJSON(ANALYTICS_FILE, []);
  const list = Array.isArray(events) ? events : [];
  list.push(record);
  if (list.length > ANALYTICS_MAX_EVENTS) list.splice(0, list.length - ANALYTICS_MAX_EVENTS);
  writeJSON(ANALYTICS_FILE, list);
  recordAnalyticsHit(ip);
  sendJSON(res, 200, { ok: true });
}

/* ------------------------------------------------------------------ */
/* admin API                                                           */
/* ------------------------------------------------------------------ */

function handleAdminAnalytics(req, res, method) {
  if (method === 'GET') {
    sendJSON(res, 200, analyticsSummary());
    return true;
  }
  if (method === 'DELETE') {
    writeJSON(ANALYTICS_FILE, []);
    sendJSON(res, 200, { ok: true });
    return true;
  }
  return false;
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJSON(res, 401, { error: 'Not authenticated' });
    return null;
  }
  return session;
}

function requireCsrf(req, res, session) {
  const token = req.headers['x-csrf-token'];
  if (!token || !safeEqual(token, session.csrf)) {
    sendJSON(res, 403, { error: 'Invalid CSRF token' });
    return false;
  }
  return true;
}

async function handleAdmin(req, res, pathname, basePath = ADMIN_PATH) {
  const rel = pathname.slice(basePath.length); // '' | '/api/...' | '/app.css'
  const method = req.method;

  /* ---- login / logout / session ---- */
  if (rel === '/api/login' && method === 'POST') {
    const ip = clientIp(req);
    const locked = isLockedOut(ip);
    if (locked) {
      sendJSON(res, 429, { error: `Too many attempts. Try again in ${Math.ceil(locked / 60000)} min.` });
      return;
    }
    let body;
    try {
      body = await readJSONBody(req, 8 * 1024);
    } catch (err) {
      sendJSON(res, err.status || 400, { error: err.message });
      return;
    }
    const admin = readJSON(ADMIN_FILE, null);
    if (!admin) {
      sendJSON(res, 503, { error: 'No admin account configured. Run: node set-credentials.js' });
      return;
    }
    const okUser = safeEqual(String(body.username || ''), String(admin.username || ''));
    const okPass = verifyPassword(String(body.password || ''), admin.salt, admin.hash);
    if (!okUser || !okPass) {
      recordLoginFailure(ip);
      sendJSON(res, 401, { error: 'Invalid username or password.' });
      return;
    }
    loginAttempts.delete(ip);
    const token = randomToken(32);
    const session = {
      user: admin.username,
      csrf: randomToken(24),
      expires: Date.now() + SESSION_TTL_MS,
      ip
    };
    sessions.set(token, session);
    setSessionCookie(res, token);
    sendJSON(res, 200, { ok: true, username: admin.username, csrf: session.csrf });
    return;
  }

  if (rel === '/api/logout' && method === 'POST') {
    const session = getSession(req);
    if (session) sessions.delete(session.token);
    clearSessionCookie(res);
    sendJSON(res, 200, { ok: true });
    return;
  }

  if (rel === '/api/session' && method === 'GET') {
    const session = getSession(req);
    if (!session) {
      sendJSON(res, 401, { authenticated: false });
      return;
    }
    sendJSON(res, 200, { authenticated: true, username: session.user, csrf: session.csrf });
    return;
  }

  /* ---- page + assets ---- */
  // Force a trailing slash so the page's relative asset URLs resolve
  // to the private path instead of the site root.
  if (method === 'GET' && rel === '') {
    res.writeHead(302, { Location: basePath + '/' });
    res.end();
    return;
  }
  if (method === 'GET' && (rel === '/' || rel === '/index.html')) {
    serveAdminFile(res, getSession(req) ? 'dashboard.html' : 'login.html', MIME['.html']);
    return;
  }
  if (method === 'GET' && rel === '/app.css') {
    serveAdminFile(res, 'admin.css', MIME['.css']);
    return;
  }
  if (method === 'GET' && rel === '/app.js') {
    // No secrets live in the admin client bundle; everything it shows comes
    // from session-protected endpoints, so it is safe to serve it publicly.
    serveAdminFile(res, 'admin.js', MIME['.js']);
    return;
  }

  /* ---- everything below needs a session ---- */
  const session = requireSession(req, res);
  if (!session) return;

  if (rel === '/api/content' && method === 'GET') {
    sendJSON(res, 200, getContent());
    return;
  }

  if (rel === '/api/content' && method === 'PUT') {
    if (!requireCsrf(req, res, session)) return;
    let body;
    try {
      body = await readJSONBody(req, JSON_LIMIT);
    } catch (err) {
      sendJSON(res, err.status || 400, { error: err.message });
      return;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      sendJSON(res, 422, { error: 'Content must be a JSON object.' });
      return;
    }
    writeJSON(CONTENT_FILE, body);
    sendJSON(res, 200, { ok: true, savedAt: new Date().toISOString() });
    return;
  }

  if (rel === '/api/messages' && method === 'GET') {
    sendJSON(res, 200, readJSON(MESSAGES_FILE, []));
    return;
  }

  const msgMatch = /^\/api\/messages\/([A-Za-z0-9-]+)$/.exec(rel);
  if (msgMatch) {
    const id = msgMatch[1];
    if (method === 'PATCH') {
      if (!requireCsrf(req, res, session)) return;
      let body = {};
      try {
        body = await readJSONBody(req, 4 * 1024);
      } catch { /* ignore, default below */ }
      const messages = readJSON(MESSAGES_FILE, []);
      const target = messages.find((m) => m.id === id);
      if (!target) {
        sendJSON(res, 404, { error: 'Message not found' });
        return;
      }
      if (typeof body.read === 'boolean') target.read = body.read;
      writeJSON(MESSAGES_FILE, messages);
      sendJSON(res, 200, { ok: true, message: target });
      return;
    }
    if (method === 'DELETE') {
      if (!requireCsrf(req, res, session)) return;
      const messages = readJSON(MESSAGES_FILE, []);
      const next = messages.filter((m) => m.id !== id);
      writeJSON(MESSAGES_FILE, next);
      sendJSON(res, 200, { ok: true, removed: messages.length - next.length });
      return;
    }
  }

  if (rel === '/api/messages' && method === 'DELETE') {
    if (!requireCsrf(req, res, session)) return;
    writeJSON(MESSAGES_FILE, []);
    sendJSON(res, 200, { ok: true });
    return;
  }

  if (rel === '/api/upload' && method === 'POST') {
    if (!requireCsrf(req, res, session)) return;
    let body;
    try {
      body = await readJSONBody(req, UPLOAD_LIMIT);
    } catch (err) {
      sendJSON(res, err.status || 400, { error: err.message });
      return;
    }
    const dataUrl = String(body.dataUrl || '');
    const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
    if (!match) {
      sendJSON(res, 422, { error: 'Expected a base64 data URL.' });
      return;
    }
    const mimeOk = Object.values(UPLOAD_TYPES).includes(match[1].toLowerCase());
    if (!mimeOk) {
      sendJSON(res, 422, { error: 'Unsupported image type.' });
      return;
    }
    let buffer;
    try {
      buffer = Buffer.from(match[2], 'base64');
    } catch {
      sendJSON(res, 422, { error: 'Invalid image data.' });
      return;
    }
    if (!buffer.length || buffer.length > UPLOAD_LIMIT) {
      sendJSON(res, 413, { error: 'Image is empty or too large (max 6 MB).' });
      return;
    }
    let ext = path.extname(String(body.filename || '')).toLowerCase();
    if (!UPLOAD_TYPES[ext]) {
      ext = Object.keys(UPLOAD_TYPES).find((k) => UPLOAD_TYPES[k] === match[1].toLowerCase()) || '.png';
    }
    const base = path
      .basename(String(body.filename || 'image'), ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'image';
    const fileName = `${base}-${Date.now().toString(36)}${ext}`;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, fileName), buffer);
    sendJSON(res, 200, { ok: true, path: `assets/images/uploads/${fileName}` });
    return;
  }

  if (rel === '/api/password' && method === 'POST') {
    if (!requireCsrf(req, res, session)) return;
    let body;
    try {
      body = await readJSONBody(req, 8 * 1024);
    } catch (err) {
      sendJSON(res, err.status || 400, { error: err.message });
      return;
    }
    const admin = readJSON(ADMIN_FILE, null);
    if (!admin) {
      sendJSON(res, 503, { error: 'No admin account configured.' });
      return;
    }
    if (!verifyPassword(String(body.currentPassword || ''), admin.salt, admin.hash)) {
      sendJSON(res, 401, { error: 'Current password is incorrect.' });
      return;
    }
    const next = String(body.newPassword || '');
    if (next.length < 8) {
      sendJSON(res, 422, { error: 'New password must be at least 8 characters.' });
      return;
    }
    const { salt, hash } = hashPassword(next);
    writeJSON(ADMIN_FILE, {
      username: admin.username,
      salt,
      hash,
      algorithm: 'scrypt',
      updatedAt: new Date().toISOString()
    });
    sendJSON(res, 200, { ok: true });
    return;
  }

  if (rel === '/api/analytics' && method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const days = Number(url.searchParams.get('days')) || 14;
    sendJSON(res, 200, analyticsSummary(days));
    return;
  }

  if (rel === '/api/analytics' && method === 'DELETE') {
    if (!requireCsrf(req, res, session)) return;
    writeJSON(ANALYTICS_FILE, []);
    sendJSON(res, 200, { ok: true });
    return;
  }

  sendJSON(res, 404, { error: 'Unknown admin endpoint' });
}

/* ------------------------------------------------------------------ */
/* router                                                              */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    sendJSON(res, 400, { error: 'Bad request' });
    return;
  }

  try {
    // Private admin area
    let adminBase = null;
    if (pathname === ADMIN_PATH || pathname.startsWith(ADMIN_PATH + '/')) adminBase = ADMIN_PATH;
    else if (pathname === '/admin' || pathname.startsWith('/admin/')) adminBase = '/admin';
    if (adminBase) {
      await handleAdmin(req, res, pathname, adminBase);
      return;
    }

    // Public API
    if (pathname.startsWith('/api/') || pathname === '/health' || pathname === '/api/health') {
      if (handlePublicApi(req, res, pathname)) return;
      sendJSON(res, 404, { error: 'Unknown endpoint' });
      return;
    }

    // Only GET/HEAD reach the static handler
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJSON(res, 405, { error: 'Method not allowed' });
      return;
    }

    serveStatic(req, res, pathname, false);
  } catch (err) {
    if (!res.headersSent) sendJSON(res, err.status || 500, { error: err.message || 'Server error' });
    else res.end();
  }
});

/* ------------------------------------------------------------------ */
/* start                                                               */
/* ------------------------------------------------------------------ */

ensureDataDir();

function ensureAdminAccount() {
  let existing = null;
  try { existing = readJSON(ADMIN_FILE, null); } catch { existing = null; }
  if (existing) return;
  const username = String(process.env.ADMIN_USER || 'saidhyeya').trim() || 'saidhyeya';
  const password =
    process.env.ADMIN_PASS ||
    process.env.ADMIN_BOOTSTRAP_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    'tXR3s_abT4gPuw';
  if (typeof password !== 'string' || password.length < 8) {
    console.warn('⚠ Admin bootstrap skipped: password shorter than 8 characters.');
    return;
  }
  try {
    const { salt, hash } = hashPassword(password);
    writeJSON(ADMIN_FILE, {
      username,
      salt,
      hash,
      algorithm: 'scrypt',
      updatedAt: new Date().toISOString()
    });
    console.log('✔ Bootstrapped admin account: ' + username);
  } catch (err) {
    console.error('✖ Admin bootstrap failed:', err.message);
  }
}
ensureAdminAccount();

function banner() {
  const admin = readJSON(ADMIN_FILE, null);
  const line = '─'.repeat(60);
  console.log('\n' + line);
  console.log('  Sai Dhyeya portfolio server');
  console.log(line);
  console.log(`  Site      : http://localhost:${PORT}/`);
  console.log(`  Admin URL : http://localhost:${PORT}${ADMIN_PATH}`);
  if (admin) console.log(`  Admin user: ${admin.username}`);
  else console.log('  ⚠ No admin account yet → run:  node set-credentials.js');
  console.log(line + '\n');
}

server.listen(PORT, HOST, () => {
  banner();
});

module.exports = server;
