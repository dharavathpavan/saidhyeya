/* =====================================================================
   Admin client — login + content editor + contact inbox.
   Talks to the session-protected JSON API exposed by server.js.
   ===================================================================== */
(function () {
  'use strict';

  // The panel lives at a private path; derive it from the current URL.
  var BASE = location.pathname
    .replace(/\/index\.html$/, '')
    .replace(/\/+$/, '');

  var csrf = '';
  var draft = {};
  var content = {};

  /* ---------------- fetch helper ---------------- */

  function api(path, options) {
    var opts = options || {};
    var headers = { 'Accept': 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf && opts.method && opts.method !== 'GET') headers['X-CSRF-Token'] = csrf;

    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      credentials: 'same-origin',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401 && !opts.allowUnauth) {
          location.href = BASE + '/';
          throw new Error('unauthenticated');
        }
        if (!res.ok) {
          throw Object.assign(new Error(data.error || ('HTTP ' + res.status)), {
            status: res.status,
            fields: data.fields
          });
        }
        return data;
      });
    });
  }

  /* ---------------- small DOM helpers ---------------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function qs(sel, root) { return (root || document).querySelector(sel); }

  function setStatus(node, message, kind) {
    if (!node) return;
    node.textContent = message || '';
    node.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  var toastTimer = null;
  function toast(message) {
    var node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, 2600);
  }

  function deepClone(value) { return JSON.parse(JSON.stringify(value)); }

  function getPath(obj, path) {
    return path.split('.').reduce(function (acc, key) {
      if (acc === undefined || acc === null) return undefined;
      return acc[key];
    }, obj);
  }

  function setPath(obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (acc, key) {
      if (typeof acc[key] !== 'object' || acc[key] === null) acc[key] = {};
      return acc[key];
    }, obj);
    target[last] = value;
  }

  /* ================================================================
     LOGIN PAGE
     ================================================================ */

  var loginForm = document.getElementById('login-form');
  if (loginForm) {
    var loginStatus = document.getElementById('login-status');
    var loginSubmit = document.getElementById('login-submit');

    loginForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var username = loginForm.username.value.trim();
      var password = loginForm.password.value;
      if (!username || !password) {
        setStatus(loginStatus, 'Please enter your username and password.', 'error');
        return;
      }
      loginSubmit.disabled = true;
      setStatus(loginStatus, 'Signing in…', '');
      api('/api/login', { method: 'POST', body: { username: username, password: password } })
        .then(function () {
          setStatus(loginStatus, 'Signed in. Redirecting…', 'ok');
          location.href = BASE + '/';
        })
        .catch(function (err) {
          loginSubmit.disabled = false;
          setStatus(loginStatus, err.message || 'Sign in failed.', 'error');
        });
    });
    return;
  }

  /* ================================================================
     DASHBOARD
     ================================================================ */

  var ICONS = [
    ['figma', 'Figma'],
    ['photoshop', 'Adobe Photoshop'],
    ['xd', 'Adobe XD'],
    ['openai', 'OpenAI ChatGPT']
  ];
  var LAYOUTS = [
    ['laptop', 'Laptop — image left, text right'],
    ['laptop-reverse', 'Laptop — text left, image right'],
    ['phones', 'Phones — image left, text right']
  ];
  var CARD_TYPES = [['phone', 'Phone'], ['email', 'Email']];

  var SCHEMA = [
    { id: 'brand', title: 'Brand & footer', fields: [
      { path: 'brand.logo', label: 'Logo / nav title' },
      { path: 'brand.footerLead', label: 'Footer lead text' },
      { path: 'brand.footerName', label: 'Footer name' }
    ] },
    { id: 'nav', title: 'Navigation links', list: 'nav', addLabel: 'Add navigation link',
      itemLabel: function (it, i) { return it.label || ('Link ' + (i + 1)); },
      blank: { label: 'New link', href: '#about' },
      fields: [
        { path: 'label', label: 'Label' },
        { path: 'href', label: 'Target (e.g. #about)' }
      ] },
    { id: 'hero', title: 'Hero', fields: [
      { path: 'hero.title', label: 'Main heading' },
      { path: 'hero.subtitle', label: 'Sub-heading' },
      { path: 'hero.description', label: 'Description', type: 'textarea', wide: true },
      { path: 'hero.primary.label', label: 'Primary button label' },
      { path: 'hero.primary.href', label: 'Primary button target' },
      { path: 'hero.secondary.label', label: 'Secondary button label' },
      { path: 'hero.secondary.href', label: 'Secondary button target' },
      { path: 'hero.portrait', label: 'Portrait image', type: 'image', wide: true },
      { path: 'hero.portraitAlt', label: 'Portrait alt text', wide: true }
    ] },
    { id: 'about', title: 'About', fields: [
      { path: 'about.pill', label: 'Label pill' },
      { path: 'about.title', label: 'Heading' },
      { path: 'about.text', label: 'Paragraph', type: 'textarea', wide: true, rows: 12 }
    ] },
    { id: 'tools', title: 'Tools', fields: [
      { path: 'tools.pill', label: 'Label pill' }
    ], list: 'tools.items', addLabel: 'Add tool',
      itemLabel: function (it, i) { return it.label || ('Tool ' + (i + 1)); },
      blank: { label: 'New tool', icon: 'figma' },
      fields: [
        { path: 'label', label: 'Name' },
        { path: 'icon', label: 'Icon', type: 'select', options: ICONS }
      ] },
    { id: 'projects', title: 'Projects', fields: [
      { path: 'projects.pill', label: 'Label pill' },
      { path: 'projects.buttonLabel', label: 'Project button text' },
      { path: 'projects.more.label', label: '“All projects” button text' },
      { path: 'projects.more.href', label: '“All projects” button target' }
    ], list: 'projects.items', addLabel: 'Add project',
      itemLabel: function (it, i) { return it.title || ('Project ' + (i + 1)); },
      blank: { title: 'New project', description: '', layout: 'laptop', image: '', imageAlt: '', href: '#' },
      fields: [
        { path: 'title', label: 'Title' },
        { path: 'layout', label: 'Layout', type: 'select', options: LAYOUTS },
        { path: 'description', label: 'Description', type: 'textarea', wide: true },
        { path: 'image', label: 'Image', type: 'image', wide: true },
        { path: 'imageAlt', label: 'Image alt text', wide: true },
        { path: 'href', label: 'Button target', wide: true }
      ] },
    { id: 'education', title: 'Education timeline', fields: [
      { path: 'education.pill', label: 'Label pill' }
    ], list: 'education.items', addLabel: 'Add education entry',
      itemLabel: function (it, i) { return it.title || ('Entry ' + (i + 1)); },
      blank: { title: 'New entry', date: '– 2024-2025', role: '', location: '' },
      fields: [
        { path: 'title', label: 'Title' },
        { path: 'date', label: 'Dates' },
        { path: 'role', label: 'Role / subject' },
        { path: 'location', label: 'Location' }
      ] },
    { id: 'contact', title: 'Contact cards', fields: [
      { path: 'contact.pill', label: 'Label pill' }
    ], list: 'contact.cards', addLabel: 'Add contact card',
      itemLabel: function (it, i) { return it.value || ('Card ' + (i + 1)); },
      blank: { type: 'phone', value: '', href: '' },
      fields: [
        { path: 'type', label: 'Type', type: 'select', options: CARD_TYPES },
        { path: 'value', label: 'Displayed value' },
        { path: 'href', label: 'Link (tel: / mailto:)', wide: true }
      ] },
    { id: 'contact-form', title: 'Contact form', fields: [
      { path: 'contact.form.title', label: 'Form title' },
      { path: 'contact.form.subtitle', label: 'Form subtitle', type: 'textarea', wide: true },
      { path: 'contact.form.nameLabel', label: 'Name label' },
      { path: 'contact.form.emailLabel', label: 'Email label' },
      { path: 'contact.form.subjectLabel', label: 'Subject label' },
      { path: 'contact.form.messageLabel', label: 'Message label' },
      { path: 'contact.form.namePlaceholder', label: 'Name placeholder' },
      { path: 'contact.form.emailPlaceholder', label: 'Email placeholder' },
      { path: 'contact.form.subjectPlaceholder', label: 'Subject placeholder' },
      { path: 'contact.form.messagePlaceholder', label: 'Message placeholder', wide: true },
      { path: 'contact.form.button', label: 'Submit button text' },
      { path: 'contact.form.success', label: 'Success message', wide: true },
      { path: 'contact.form.error', label: 'Error message', wide: true }
    ] }
  ];

  function fieldNode(spec, obj, onChange) {
    var wrap = el(spec.type === 'image' ? 'div' : 'label',
      'field' + (spec.wide ? ' field--wide' : ''));
    wrap.appendChild(el('span', 'field__label', spec.label));
    var value = getPath(obj, spec.path);

    if (spec.type === 'textarea') {
      var ta = el('textarea', 'field__textarea');
      if (spec.rows) ta.rows = spec.rows;
      ta.value = value == null ? '' : String(value);
      ta.addEventListener('input', function () { setPath(obj, spec.path, ta.value); onChange(); });
      wrap.appendChild(ta);
      return wrap;
    }

    if (spec.type === 'select') {
      var sel = el('select', 'field__select');
      (spec.options || []).forEach(function (opt) {
        var option = el('option', null, opt[1]);
        option.value = opt[0];
        if (String(value) === opt[0]) option.selected = true;
        sel.appendChild(option);
      });
      sel.addEventListener('change', function () { setPath(obj, spec.path, sel.value); onChange(); });
      wrap.appendChild(sel);
      return wrap;
    }

    if (spec.type === 'image') {
      var box = el('div', 'image-field');
      var img = el('img', 'image-field__preview');
      img.alt = '';
      var controls = el('div', 'image-field__controls');
      var input = el('input', 'field__input');
      input.type = 'text';
      input.value = value == null ? '' : String(value);
      input.placeholder = 'assets/images/… or a URL';
      var file = el('input', '');
      file.type = 'file';
      file.accept = 'image/*';
      var uploadNote = el('span', 'admin-sub', 'Or upload a new image (max 6 MB).');

      function refreshPreview() {
        var src = input.value.trim();
        if (!src) { img.removeAttribute('src'); img.style.visibility = 'hidden'; }
        else { img.src = src; img.style.visibility = 'visible'; }
      }

      input.addEventListener('input', function () {
        setPath(obj, spec.path, input.value);
        refreshPreview();
        onChange();
      });

      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        if (f.size > 6 * 1024 * 1024) { toast('Image is larger than 6 MB.'); return; }
        var reader = new FileReader();
        reader.onload = function () {
          uploadNote.textContent = 'Uploading…';
          api('/api/upload', { method: 'POST', body: { filename: f.name, dataUrl: reader.result } })
            .then(function (res) {
              input.value = res.path;
              setPath(obj, spec.path, res.path);
              refreshPreview();
              onChange();
              uploadNote.textContent = 'Uploaded ✓';
              toast('Image uploaded');
            })
            .catch(function (err) {
              uploadNote.textContent = 'Or upload a new image (max 6 MB).';
              toast(err.message || 'Upload failed');
            });
        };
        reader.readAsDataURL(f);
      });

      controls.appendChild(input);
      controls.appendChild(file);
      controls.appendChild(uploadNote);
      box.appendChild(img);
      box.appendChild(controls);
      wrap.appendChild(box);
      refreshPreview();
      return wrap;
    }

    var inp = el('input', 'field__input');
    inp.type = 'text';
    inp.value = value == null ? '' : String(value);
    inp.addEventListener('input', function () { setPath(obj, spec.path, inp.value); onChange(); });
    wrap.appendChild(inp);
    return wrap;
  }

  function renderSection(spec) {
    var section = el('section', 'editor-section' + (spec.list ? '' : ' is-open'));
    var head = el('div', 'editor-section__head');
    head.appendChild(el('span', 'editor-section__title', spec.title));
    head.appendChild(el('span', 'editor-section__chev', '›'));
    head.addEventListener('click', function () { section.classList.toggle('is-open'); });
    section.appendChild(head);

    var body = el('div', 'editor-section__body');

    if (spec.fields && spec.fields.length) {
      var grid = el('div', 'editor-grid');
      spec.fields.forEach(function (field) {
        grid.appendChild(fieldNode(field, draft, markDirty));
      });
      body.appendChild(grid);
    }

    if (spec.list) {
      var listWrap = el('div', 'editor-list');
      var items = getPath(draft, spec.list);
      if (!Array.isArray(items)) { items = []; setPath(draft, spec.list, items); }

      if (!items.length) {
        listWrap.appendChild(el('p', 'list-empty', 'No items yet.'));
      }

      items.forEach(function (item, index) {
        var row = el('div', 'list-item');
        var rowHead = el('div', 'list-item__head');
        rowHead.appendChild(el('span', 'list-item__name',
          spec.itemLabel ? spec.itemLabel(item, index) : ('Item ' + (index + 1))));

        var tools = el('div', 'list-item__tools');
        function toolBtn(label, title, fn) {
          var b = el('button', 'btn-admin btn-admin--ghost btn-admin--small', label);
          b.type = 'button';
          b.title = title;
          b.addEventListener('click', fn);
          return b;
        }
        tools.appendChild(toolBtn('↑', 'Move up', function () {
          if (index === 0) return;
          items.splice(index - 1, 0, items.splice(index, 1)[0]);
          markDirty(); renderEditor();
        }));
        tools.appendChild(toolBtn('↓', 'Move down', function () {
          if (index === items.length - 1) return;
          items.splice(index + 1, 0, items.splice(index, 1)[0]);
          markDirty(); renderEditor();
        }));
        tools.appendChild(toolBtn('Remove', 'Remove item', function () {
          items.splice(index, 1);
          markDirty(); renderEditor();
        }));
        rowHead.appendChild(tools);
        row.appendChild(rowHead);

        var grid = el('div', 'editor-grid');
        spec.fields.forEach(function (field) {
          grid.appendChild(fieldNode(field, item, function () {
            markDirty();
            rowHead.querySelector('.list-item__name').textContent =
              spec.itemLabel ? spec.itemLabel(item, index) : ('Item ' + (index + 1));
          }));
        });
        row.appendChild(grid);
        listWrap.appendChild(row);
      });

      var addBtn = el('button', 'btn-admin btn-admin--ghost', '+ ' + (spec.addLabel || 'Add item'));
      addBtn.type = 'button';
      addBtn.addEventListener('click', function () {
        var arr = getPath(draft, spec.list);
        arr.push(deepClone(spec.blank || {}));
        markDirty();
        section.classList.add('is-open');
        renderEditor();
      });
      listWrap.appendChild(addBtn);
      body.appendChild(listWrap);
    }

    section.appendChild(body);
    return section;
  }

  var dirty = false;
  function markDirty() { dirty = true; }

  function renderEditor() {
    var host = document.getElementById('content-editor');
    host.textContent = '';
    SCHEMA.forEach(function (spec) { host.appendChild(renderSection(spec)); });
  }

  function loadContent() {
    setStatus(document.getElementById('content-status'), 'Loading…', '');
    return api('/api/content').then(function (data) {
      content = data && typeof data === 'object' ? data : {};
      draft = deepClone(content);
      dirty = false;
      renderEditor();
      setStatus(document.getElementById('content-status'), '', '');
    }).catch(function (err) {
      setStatus(document.getElementById('content-status'), err.message, 'error');
    });
  }

  function saveContent() {
    var status = document.getElementById('content-status');
    var btn = document.getElementById('content-save');
    btn.disabled = true;
    setStatus(status, 'Saving…', '');
    api('/api/content', { method: 'PUT', body: draft })
      .then(function () {
        content = deepClone(draft);
        dirty = false;
        setStatus(status, 'Saved ✓ Your changes are live on the site.', 'ok');
        toast('Content saved');
      })
      .catch(function (err) { setStatus(status, err.message, 'error'); })
      .then(function () { btn.disabled = false; });
  }

  /* ---------------- inbox ---------------- */

  var messages = [];
  var activeMessageId = null;

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch { return iso; }
  }

  function renderInbox() {
    var list = document.getElementById('inbox-list');
    var count = document.getElementById('msg-count');
    list.textContent = '';

    var unread = messages.filter(function (m) { return !m.read; }).length;
    if (unread) { count.hidden = false; count.textContent = String(unread); }
    else { count.hidden = true; }

    if (!messages.length) {
      list.appendChild(el('li', 'inbox__empty', 'No messages yet.'));
      return;
    }

    messages.forEach(function (msg) {
      var li = el('li');
      var row = el('button', 'inbox__row' +
        (msg.read ? '' : ' is-unread') +
        (msg.id === activeMessageId ? ' is-active' : ''));
      row.type = 'button';
      row.appendChild(el('div', 'inbox__row-name', msg.name));
      row.appendChild(el('div', 'inbox__row-subject', msg.subject));
      row.appendChild(el('div', 'inbox__row-date', formatDate(msg.receivedAt)));
      row.addEventListener('click', function () { openMessage(msg.id); });
      li.appendChild(row);
      list.appendChild(li);
    });
  }

  function openMessage(id) {
    var msg = messages.find(function (m) { return m.id === id; });
    if (!msg) return;
    activeMessageId = id;

    var detail = document.getElementById('inbox-detail');
    detail.textContent = '';

    detail.appendChild(el('h3', null, msg.subject));
    var meta = el('p', 'inbox__meta');
    meta.appendChild(document.createTextNode(msg.name + ' · '));
    var mail = el('a', null, msg.email);
    mail.href = 'mailto:' + msg.email;
    meta.appendChild(mail);
    meta.appendChild(document.createTextNode(' · ' + formatDate(msg.receivedAt)));
    detail.appendChild(meta);
    detail.appendChild(el('p', 'inbox__body', msg.message));

    var actions = el('div', 'inbox__detail-actions');
    var del = el('button', 'btn-admin btn-admin--danger btn-admin--small', 'Delete message');
    del.type = 'button';
    del.addEventListener('click', function () {
      api('/api/messages/' + msg.id, { method: 'DELETE' }).then(function () {
        activeMessageId = null;
        detail.textContent = '';
        detail.appendChild(el('p', 'inbox__empty', 'Select a message to read it.'));
        toast('Message deleted');
        return loadMessages();
      }).catch(function (err) { toast(err.message); });
    });
    actions.appendChild(del);
    detail.appendChild(actions);

    if (!msg.read) {
      api('/api/messages/' + msg.id, { method: 'PATCH', body: { read: true } })
        .then(function () { msg.read = true; renderInbox(); })
        .catch(function () { /* non-fatal */ });
    }
    renderInbox();
  }

  function loadMessages() {
    return api('/api/messages').then(function (data) {
      messages = Array.isArray(data) ? data : [];
      renderInbox();
    }).catch(function (err) {
      setStatus(document.getElementById('messages-status'), err.message, 'error');
    });
  }

/* ---------------- analytics ---------------- */

  var analyticsData = null;

  function statCard(label, value) {
    var card = el('div', 'stat-card');
    card.appendChild(el('div', 'stat-card__value', String(value)));
    card.appendChild(el('div', 'stat-card__label', label));
    return card;
  }

  function renderAnalytics() {
    var summary = document.getElementById('analytics-summary');
    var daysHost = document.getElementById('analytics-days');
    var pagesHost = document.getElementById('analytics-pages');
    var eventsHost = document.getElementById('analytics-events');
    if (!summary) return;
    summary.textContent = '';
    daysHost.textContent = '';
    pagesHost.textContent = '';
    eventsHost.textContent = '';

    if (!analyticsData) {
      summary.appendChild(el('p', 'inbox__empty', 'No analytics data yet.'));
      return;
    }

    var s = analyticsData;
    summary.appendChild(statCard('Unique visitors', s.uniqueVisitors));
    summary.appendChild(statCard('Sessions', s.sessions));
    summary.appendChild(statCard('Page views', s.pageViews));
    summary.appendChild(statCard('Resume clicks', s.resumeClicks));
    summary.appendChild(statCard('CTA clicks', s.ctaClicks));
    summary.appendChild(statCard('Nav clicks', s.navigationClicks));
    summary.appendChild(statCard('Contact submissions', s.contactSubmissions));
    summary.appendChild(statCard('Total events', s.totalEvents));

    (s.visitsByDay || []).forEach(function (d) {
      var row = el('div', 'analytics-day');
      row.appendChild(el('span', 'analytics-day__date', d.date));
      row.appendChild(el('span', 'analytics-day__bar'));
      var fill = el('span', 'analytics-day__fill');
      var max = Math.max.apply(null, (s.visitsByDay || []).map(function (x) { return x.count; }).concat([1]));
      fill.style.width = Math.round((d.count / max) * 100) + '%';
      row.querySelector('.analytics-day__bar').appendChild(fill);
      row.appendChild(el('span', 'analytics-day__count', String(d.count)));
      daysHost.appendChild(row);
    });

    if (!s.topPages || !s.topPages.length) {
      pagesHost.appendChild(el('li', 'inbox__empty', 'No page views yet.'));
    } else {
      s.topPages.forEach(function (p) {
        var li = el('li', 'analytics-row');
        li.appendChild(el('span', 'analytics-row__label', p.path));
        li.appendChild(el('span', 'analytics-row__value', String(p.count)));
        pagesHost.appendChild(li);
      });
    }

    if (!s.recent || !s.recent.length) {
      eventsHost.appendChild(el('li', 'inbox__empty', 'No events yet.'));
    } else {
      s.recent.forEach(function (e) {
        var li = el('li', 'analytics-row');
        var meta = (e.type || '') + ' · ' + (e.path || '/') + (e.target ? ' · ' + e.target : '');
        li.appendChild(el('span', 'analytics-row__label', meta));
        li.appendChild(el('span', 'analytics-row__value', (e.createdAt || '').replace('T', ' ').slice(0, 19)));
        eventsHost.appendChild(li);
      });
    }
  }

  function loadAnalytics() {
    setStatus(document.getElementById('analytics-status'), 'Loading…', '');
    return api('/api/analytics').then(function (data) {
      analyticsData = data && typeof data === 'object' ? data : null;
      renderAnalytics();
      setStatus(document.getElementById('analytics-status'), '', '');
    }).catch(function (err) {
      setStatus(document.getElementById('analytics-status'), err.message, 'error');
    });
  }

  /* ---------------- dashboard boot ---------------- */

  function initDashboard() {
    var savedUser = document.getElementById('admin-user');

    api('/api/session', { allowUnauth: true }).then(function (session) {
      if (!session.authenticated) { location.href = BASE + '/'; return; }
      csrf = session.csrf;
      savedUser.textContent = session.username;

      loadContent();
      loadMessages();
      loadAnalytics();

      // Tabs
      document.querySelectorAll('.admin-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          var name = tab.getAttribute('data-tab');
          document.querySelectorAll('.admin-tab').forEach(function (t) {
            t.classList.toggle('is-active', t === tab);
          });
          document.querySelectorAll('.admin-panel').forEach(function (p) {
            p.classList.toggle('is-active', p.getAttribute('data-panel') === name);
          });
          if (name === 'messages') loadMessages();
          if (name === 'analytics') loadAnalytics();
        });
      });

      document.getElementById('content-save').addEventListener('click', saveContent);
      document.getElementById('content-reload').addEventListener('click', function () {
        if (dirty && !confirm('Discard unsaved changes?')) return;
        loadContent();
      });

      document.getElementById('messages-reload').addEventListener('click', function () {
        loadMessages();
        toast('Refreshed');
      });
      document.getElementById('messages-clear').addEventListener('click', function () {
        if (!messages.length) { toast('Inbox is already empty'); return; }
        if (!confirm('Delete all messages permanently?')) return;
        api('/api/messages', { method: 'DELETE' }).then(function () {
          activeMessageId = null;
          var detail = document.getElementById('inbox-detail');
          detail.textContent = '';
          detail.appendChild(el('p', 'inbox__empty', 'Select a message to read it.'));
          toast('Inbox cleared');
          return loadMessages();
        }).catch(function (err) { toast(err.message); });
      });

      var analyticsReload = document.getElementById('analytics-reload');
      if (analyticsReload) analyticsReload.addEventListener('click', function () {
        loadAnalytics();
        toast('Refreshed');
      });
      var analyticsClear = document.getElementById('analytics-clear');
      if (analyticsClear) analyticsClear.addEventListener('click', function () {
        if (!confirm('Delete all analytics data permanently?')) return;
        api('/api/analytics', { method: 'DELETE' }).then(function () {
          toast('Analytics cleared');
          return loadAnalytics();
        }).catch(function (err) { toast(err.message); });
      });

      document.getElementById('logout-btn').addEventListener('click', function () {
        api('/api/logout', { method: 'POST' }).then(function () {
          location.href = BASE + '/';
        }).catch(function () { location.href = BASE + '/'; });
      });

      var pwForm = document.getElementById('password-form');
      pwForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var status = document.getElementById('password-status');
        var current = pwForm.currentPassword.value;
        var next = pwForm.newPassword.value;
        var repeat = pwForm.repeatPassword.value;
        if (next.length < 8) { setStatus(status, 'New password must be at least 8 characters.', 'error'); return; }
        if (next !== repeat) { setStatus(status, 'The new passwords do not match.', 'error'); return; }
        setStatus(status, 'Updating…', '');
        api('/api/password', { method: 'POST', body: { currentPassword: current, newPassword: next } })
          .then(function () {
            pwForm.reset();
            setStatus(status, 'Password updated ✓', 'ok');
            toast('Password updated');
          })
          .catch(function (err) { setStatus(status, err.message, 'error'); });
      });
    }).catch(function () {
      location.href = BASE + '/';
    });
  }

  initDashboard();
})();
