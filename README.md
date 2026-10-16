# Sai Dhyeya — UI/UX Portfolio

A pixel-accurate portfolio site (HTML5 / CSS3 / vanilla JS) plus a small,
**zero-dependency Node.js backend** that powers a contact form and a private
admin panel for editing the site's content.

- **Public site** — static HTML/CSS/JS, fully responsive (1440px → 320px).
- **Contact form** — validated, spam-protected, stored server-side.
- **Admin panel** — hidden URL, username + password login, edit every section
  (brand, nav, hero, about, tools, projects, education, contact cards, form
  copy), manage uploaded images, and read / reply to contact messages.

---

## 1. Requirements

- **Node.js 18 or newer** (no `npm install` needed — there are no dependencies).
- Any modern browser.

Check your version:

```bash
node -v
```

---

## 2. Run it locally

```bash
cd portfiolo
node server.js          # or: npm start
```

You'll see:

```
────────────────────────────────────────────────────────────
  Sai Dhyeya portfolio server
────────────────────────────────────────────────────────────
  Site      : http://localhost:3000/
  Admin URL : http://localhost:3000/sd-panel-x7k29f
  Admin user: saidhyeya
────────────────────────────────────────────────────────────
```

| | URL |
|---|---|
| Public site | `http://localhost:3000/` |
| Admin panel | `http://localhost:3000/sd-panel-x7k29f` |

### First-run credentials

The admin account is created by `set-credentials.js`. A temporary password was
generated for you during setup:

```
username: saidhyeya
password: tXR3s_abT4gPuw      ← change this now (see below)
```

**Change it immediately** — either from the admin panel
(**Account → Update password**) or from the terminal:

```bash
node set-credentials.js                    # interactive (password is hidden)
node set-credentials.js saidhyeya          # prompts for the password only
node set-credentials.js saidhyeya MyPass123
```

Only a salted **scrypt hash** is ever written to `data/admin.json` — the
password itself is never stored.

> The admin path (`/sd-panel-x7k29f`) is the private door to the panel. Change it
> in `.env` to something only you know, and don't commit it to a public repo.

---

## 3. What the admin panel does

**Content tab** — every piece of text and imagery on the site:

| Section | Editable |
|---|---|
| Brand & footer | logo / nav title, footer text |
| Navigation links | add, remove, reorder, retitle |
| Hero | heading, sub-heading, description, both buttons + targets, portrait image + alt text |
| About | pill label, heading, the full paragraph |
| Tools | the list of tools and which icon each uses |
| Projects | title, description, layout (laptop left / laptop right / phones), image, alt text, button link, plus the "All projects" button |
| Education | each timeline entry: title, dates, role, location |
| Contact cards | phone / email cards and their links |
| Contact form | every label, placeholder and message |

Images can be typed as a path **or uploaded** (drag-to-choose, max 6 MB;
uploads land in `assets/images/uploads/`).

**Inbox tab** — contact-form submissions with an unread counter. Selecting a
message marks it read; messages can be deleted individually or all at once.

**Account tab** — change the admin password.

Changes are stored in `data/content.json` and take effect on the public site
immediately after saving.

---

## 4. Project structure

```
portfiolo/
├── server.js                 # zero-dependency HTTP server (site + API + admin)
├── set-credentials.js        # CLI to set the admin username / password
├── package.json              # scripts only — no dependencies
├── .env                      # local config (git-ignored)
├── .env.example              # config template
│
├── index.html                # public page
├── css/
│   ├── fonts.css             # @font-face for the bundled fonts
│   ├── styles.css            # all layout, typography, animations, responsive
│   └── noscript.css          # hides the loader when JS is unavailable
├── js/
│   ├── boot.js               # tiny head script (enables animation start-states)
│   ├── cms.js                # hydrates the page from /api/content
│   └── main.js               # loader, scroll reveals, nav, contact form
├── assets/
│   ├── fonts/                # Poppins + Inter (woff2, self-hosted)
│   └── images/               # portrait + project images (+ uploads/)
│
├── data/                     # runtime data (git-ignored except content.json)
│   ├── content.json          # ← all editable site content
│   ├── messages.json         # contact-form submissions
│   └── admin.json            # username + scrypt hash (created by the CLI)
│
└── _admin/                   # admin panel UI (never served as static files)
    ├── login.html
    ├── dashboard.html
    ├── admin.css
    └── admin.js
```

`_ref/` is a scratch folder used while matching the original design
(screenshots, PowerShell measuring scripts, verification harnesses). **It is not
part of the site and can be deleted.**

---

## 5. Configuration

Copy `.env.example` to `.env` and edit:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `0.0.0.0` | Interface to bind (`127.0.0.1` = local only) |
| `ADMIN_PATH` | `/sd-panel-x7k29f` | Private admin URL — change this |
| `COOKIE_SECURE` | – | Set to `1` when served over HTTPS |

`ALLOW_ANALYSIS=1` additionally un-blocks the `_ref/` folder and disables the
Content-Security-Policy; it exists only for local design verification. Never
enable it in production.

---

## 6. Deployment

The site needs a host that runs Node (the contact form and admin panel are
server-side). Static-only hosts (GitHub Pages, plain Netlify) can serve the
public page but **cannot** run the form or admin.

### Render / Railway / Fly.io / Heroku-style

1. Push the repo (minus `data/admin.json`, `data/messages.json`, `.env` — the
   `.gitignore` already excludes them).
2. Build command: *(none)*. Start command: `node server.js`.
3. Set environment variables `ADMIN_PATH`, `PORT` (usually provided),
   `COOKIE_SECURE=1`.
4. After the first deploy, run `node set-credentials.js` once (or shell in and
   run it) to create the admin account on the server.

> `data/` is on the local filesystem. On hosts with ephemeral disks (Render's
> free tier, Railway) content and messages reset on redeploy/restart — mount a
> persistent volume at `data/`, or commit `data/content.json` and keep the
> volume for messages.

### Any VPS (nginx + systemd)

```bash
git clone <your-repo> /var/www/portfiolo
cd /var/www/portfiolo
node set-credentials.js
```

`/etc/systemd/system/portfolio.service`:

```ini
[Unit]
Description=Sai Dhyeya portfolio
After=network.target

[Service]
WorkingDirectory=/var/www/portfiolo
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=3000
Environment=ADMIN_PATH=/your-secret-path
Environment=COOKIE_SECURE=1

[Install]
WantedBy=multi-user.target
```

Then put nginx in front and terminate TLS there.

### Static-only mode (public page only)

Upload `index.html`, `css/`, `js/`, `assets/` and any static host will serve
them. The page falls back to the content baked into `index.html`, and the
contact form reports a network error instead of sending. Use this only if you
don't need the form or the admin panel.

---

## 7. Security notes

- Passwords are hashed with **scrypt** + a per-account salt; no plaintext.
- Sessions use a random 256-bit token in an **HttpOnly, SameSite=Strict** cookie
  (add `Secure` via `COOKIE_SECURE=1` on HTTPS) with an 8-hour sliding expiry.
- Every state-changing admin request requires a **CSRF token** issued with the
  session.
- Login is **rate-limited** (6 failed attempts → 10-minute lock per IP).
- The contact endpoint is rate-limited (5 messages / 10 min / IP) and uses a
  honeypot field; input is length- and format-validated.
- The static file server blocks path traversal, dot-files, and the sensitive
  folders `data/`, `_admin/`, `lib/`, `_ref/`.
- Public pages send a strict Content-Security-Policy; the admin panel also sends
  `X-Frame-Options: DENY`.
- Sessions live in memory, so restarting the server signs you out.
- `data/messages.json` holds contact submissions in plain text — back it up and
  restrict access. If you later want email delivery, add an SMTP step to the
  `handleContact` function in `server.js`.

---

## 8. Design notes

- **Fonts** — Poppins (headings, buttons, pills) and Inter (body), self-hosted
  in `assets/fonts/` as woff2 (latin + latin-ext). No Google Fonts requests.
- **Breakpoints** — desktop first; tablet at 991px, mobile at 767px, small at
  480px. Verified free of horizontal overflow from 1440px down to 320px.
- **Animations** — a page loader plus additive, animation-based scroll reveals.
  Content is visible by default, so the page renders correctly even if
  JavaScript or `IntersectionObserver` is unavailable. All motion is disabled
  under `prefers-reduced-motion: reduce`.
- **Accessibility** — semantic landmarks, a skip link, labelled form fields,
  `aria-expanded` on the mobile nav toggle, visible focus styles, decorative
  graphics marked `aria-hidden`.
- **No-JS** — the full default content is in `index.html`; the CMS only
  *overrides* it. Without JavaScript the site is fully readable and the loader
  is hidden via `css/noscript.css`.

### Replacing images

Drop a file into `assets/images/` and point to it from the admin (Projects →
Image), or use the upload button in the panel. Recommended widths: project
laptop mockups **1920px**, phone mockups **~550px**, portrait **~1170px**.

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE` | Another process holds the port — change `PORT` in `.env`. |
| "No admin account configured" | Run `node set-credentials.js`. |
| Signed out unexpectedly | Sessions are in memory; a server restart clears them. |
| Admin URL 404s | It must match `ADMIN_PATH` in `.env` exactly. |
| Form says "Network error" | The Node server isn't running (static hosting can't handle it). |
| Content edits not visible | Hard-refresh (Ctrl/Cmd+Shift+R); confirm the save reported success. |
| Locked out after failed logins | Wait 10 minutes, or restart the server to clear the limiter. |
