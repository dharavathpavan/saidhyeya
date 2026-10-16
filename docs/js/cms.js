/* =====================================================================
   Public-site content hydration.
   Fetches the editable content and applies it to the static markup, so
   the page renders identical HTML whether or not the CMS is reachable.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- icon library (fixed set, selectable in the admin) ---------- */

  var ICON_SVG = {
    figma:
      '<svg class="tool__figma" viewBox="0 0 38 57" role="img" aria-label="Figma">' +
      '<path fill="#1ABCFE" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/>' +
      '<path fill="#0ACF83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 0 1-19 0z"/>' +
      '<path fill="#FF7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z"/>' +
      '<path fill="#F24E1E" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"/>' +
      '<path fill="#A259FF" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"/></svg>',
    photoshop:
      '<svg class="tool__badge" viewBox="0 0 48 48" role="img" aria-label="Adobe Photoshop">' +
      '<rect width="48" height="48" rx="11" fill="#001E36"/>' +
      '<text x="24" y="34" text-anchor="middle" font-family="Poppins, sans-serif" ' +
      'font-size="24" font-weight="600" fill="#31A8FF">Ps</text></svg>',
    xd:
      '<svg class="tool__badge" viewBox="0 0 48 48" role="img" aria-label="Adobe XD">' +
      '<rect width="48" height="48" rx="11" fill="#470137"/>' +
      '<text x="24" y="34" text-anchor="middle" font-family="Poppins, sans-serif" ' +
      'font-size="24" font-weight="600" fill="#FF61F6">Xd</text></svg>',
    openai:
      '<svg class="tool__openai" viewBox="0 0 48 48" role="img" aria-label="OpenAI ChatGPT">' +
      '<circle cx="24" cy="24" r="24" fill="#000000"/>' +
      '<g transform="translate(11 11) scale(1.0833)">' +
      '<path fill="#FFFFFF" d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>' +
      '</g></svg>'
  };

  var CONTACT_ICON = {
    phone:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    email:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="2" y="4" width="20" height="16" rx="2"/>' +
      '<path d="m22 7-10 6L2 7"/></svg>'
  };

  /* ---------- tiny DOM helpers ---------- */

  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text != null) node.textContent = opts.text;
    if (opts.attrs) {
      Object.keys(opts.attrs).forEach(function (key) {
        var value = opts.attrs[key];
        if (value != null && value !== '') node.setAttribute(key, value);
      });
    }
    (opts.children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function get(obj, path) {
    return path.split('.').reduce(function (acc, key) {
      return acc == null ? undefined : acc[key];
    }, obj);
  }

  function isArr(value) { return Array.isArray(value) && value.length >= 0; }

  /* ---------- list renderers ---------- */

  function renderNav(container, items) {
    container.textContent = '';
    items.forEach(function (item) {
      var link = el('a', { attrs: { href: item.href || '#' }, text: item.label });
      container.appendChild(el('li', { children: [link] }));
    });
  }

  function renderTools(container, items) {
    container.textContent = '';
    items.forEach(function (item) {
      var svg = ICON_SVG[item.icon] || ICON_SVG.figma;
      var circle = el('span', { className: 'tool__circle' });
      circle.innerHTML = svg; // trusted, fixed icon set
      container.appendChild(el('li', { className: 'tool', children: [circle] }));
    });
  }

  function projectBody(label, body) {
    var wrap = el('div', { className: 'project__body' });
    wrap.appendChild(el('div', { className: 'glow glow--project', attrs: { 'aria-hidden': 'true' } }));
    wrap.appendChild(el('h3', { className: 'project__title', text: body.title }));
    wrap.appendChild(el('p', { className: 'project__desc', text: body.description }));
    var btn = el('a', {
      className: 'btn btn--prototype',
      attrs: { href: body.href || '#' },
      children: [el('span', { text: label })]
    });
    wrap.appendChild(btn);
    return wrap;
  }

  function projectMedia(item) {
    var media = el('div', { className: 'project__media' });

    if (item.layout === 'phones') {
      media.appendChild(el('img', {
        className: 'project__phones',
        attrs: {
          src: item.image,
          alt: item.imageAlt || item.title || '',
          width: item.imageW || null,
          height: item.imageH || null,
          loading: 'lazy'
        }
      }));
      return media;
    }

    var laptop = el('div', { className: 'laptop' });
    var screen = el('div', { className: 'laptop__screen' });
    screen.appendChild(el('img', {
      attrs: {
        src: item.image,
        alt: item.imageAlt || item.title || '',
        width: item.imageW || null,
        height: item.imageH || null,
        loading: 'lazy'
      }
    }));
    var base = el('div', { className: 'laptop__base' });
    base.appendChild(el('span', { className: 'laptop__notch' }));
    laptop.appendChild(screen);
    laptop.appendChild(base);
    media.appendChild(laptop);
    return media;
  }

  function renderProjects(container, items, label) {
    container.textContent = '';
    items.forEach(function (item) {
      var classes = 'project reveal' + (item.layout === 'laptop-reverse' ? ' project--reverse' : '');
      var article = el('article', { className: classes });
      article.appendChild(projectMedia(item));
      article.appendChild(projectBody(label, item));
      container.appendChild(article);
    });
  }

  function renderEducation(container, items) {
    container.textContent = '';
    items.forEach(function (item) {
      var title = el('h3', { className: 'timeline__title', text: item.title });
      if (item.date) title.appendChild(el('span', { className: 'timeline__date', text: item.date }));
      var li = el('li', { className: 'timeline__item reveal', children: [title] });
      [item.role, item.location].forEach(function (line) {
        if (line) li.appendChild(el('p', { className: 'timeline__meta', text: line }));
      });
      container.appendChild(li);
    });
  }

  function renderContactCards(container, cards) {
    container.textContent = '';
    cards.forEach(function (card) {
      var icon = el('span', { className: 'contact-card__icon', attrs: { 'aria-hidden': 'true' } });
      icon.innerHTML = CONTACT_ICON[card.type] || CONTACT_ICON.phone; // trusted, fixed icon set
      var link = el('a', {
        className: 'contact-card',
        attrs: { href: card.href || '#' },
        children: [
          icon,
          el('span', { className: 'contact-card__divider', attrs: { 'aria-hidden': 'true' } }),
          el('span', { className: 'contact-card__value', text: card.value })
        ]
      });
      container.appendChild(link);
    });
  }

  /* ---------- apply ---------- */

  function applyScalars(content) {
    document.querySelectorAll('[data-cms]').forEach(function (node) {
      var value = get(content, node.getAttribute('data-cms'));
      if (typeof value === 'string') node.textContent = value;
    });
    document.querySelectorAll('[data-cms-href]').forEach(function (node) {
      var value = get(content, node.getAttribute('data-cms-href'));
      if (typeof value === 'string' && value) node.setAttribute('href', value);
    });
    document.querySelectorAll('[data-cms-ph]').forEach(function (node) {
      var value = get(content, node.getAttribute('data-cms-ph'));
      if (typeof value === 'string') node.setAttribute('placeholder', value);
    });
    document.querySelectorAll('[data-cms-src]').forEach(function (node) {
      var value = get(content, node.getAttribute('data-cms-src'));
      if (typeof value === 'string' && value) node.setAttribute('src', value);
    });
    document.querySelectorAll('[data-cms-alt]').forEach(function (node) {
      var value = get(content, node.getAttribute('data-cms-alt'));
      if (typeof value === 'string') node.setAttribute('alt', value);
    });
  }

  function applyLists(content) {
    var nav = content.nav;
    var tools = content.tools && content.tools.items;
    var projects = content.projects && content.projects.items;
    var education = content.education && content.education.items;
    var cards = content.contact && content.contact.cards;

    var navHost = document.querySelector('[data-cms-list="nav"]');
    if (navHost && isArr(nav)) renderNav(navHost, nav);

    var toolsHost = document.querySelector('[data-cms-list="tools"]');
    if (toolsHost && isArr(tools)) renderTools(toolsHost, tools);

    var projectsHost = document.querySelector('[data-cms-list="projects"]');
    if (projectsHost && isArr(projects)) {
      var label = (content.projects && content.projects.buttonLabel) || 'View prototype';
      renderProjects(projectsHost, projects, label);
    }

    var eduHost = document.querySelector('[data-cms-list="education"]');
    if (eduHost && isArr(education)) renderEducation(eduHost, education);

    var cardsHost = document.querySelector('[data-cms-list="contactCards"]');
    if (cardsHost && isArr(cards)) renderContactCards(cardsHost, cards);
  }

  function bootstrap() {
    fetch('/api/content', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('content unavailable');
        return res.json();
      })
      .then(function (content) {
        if (content && typeof content === 'object') {
          applyScalars(content);
          applyLists(content);
        }
        window.__cmsReady = true;
        window.dispatchEvent(new CustomEvent('cms:ready', { detail: content || null }));
      })
      .catch(function () {
        // Static markup already contains the default content — nothing to do.
        window.__cmsReady = true;
        window.dispatchEvent(new CustomEvent('cms:ready', { detail: null }));
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
