/* =====================================================================
   Lightweight, privacy-friendly analytics for the public site.
   Sends events to /api/track; nothing is shown to visitors.
   ===================================================================== */
(function () {
  'use strict';

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'v-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  var visitorKey = 'sd_visitor_id';
  var sessionKey = 'sd_session_id';
  var visitorId = null;
  var sessionId = null;
  try {
    visitorId = localStorage.getItem(visitorKey);
    if (!visitorId) { visitorId = uuid(); localStorage.setItem(visitorKey, visitorId); }
    sessionId = sessionStorage.getItem(sessionKey);
    if (!sessionId) { sessionId = uuid(); sessionStorage.setItem(sessionKey, sessionId); }
  } catch (e) {
    visitorId = uuid();
    sessionId = uuid();
  }

  function send(type, extra) {
    extra = extra || {};
    var payload = {
      type: type,
      path: (location.pathname || '/') + (location.hash || ''),
      visitorId: visitorId,
      sessionId: sessionId,
      target: extra.target || null,
      action: extra.action || null,
      meta: extra.meta || null
    };
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  window.sdTrack = send;

  // Page view
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { send('page_view'); });
  } else {
    send('page_view');
  }

  // Delegated click tracking
  document.addEventListener('click', function (event) {
    var node = event.target && event.target.closest ? event.target.closest('a,button') : null;
    if (!node) return;
    var label = (node.textContent || '').trim().slice(0, 80);
    var href = node.getAttribute('href') || '';

    if (node.closest('.site-nav')) {
      send('navigation_click', { target: label || href, action: href });
      return;
    }
    if (/resume/i.test(label) || /resume/i.test(href)) {
      send('resume_click', { target: label || 'Resume', action: href });
      return;
    }
    if (node.classList && node.classList.contains('btn')) {
      send('cta_click', { target: label || 'button', action: href });
    }
  }, true);
})();
