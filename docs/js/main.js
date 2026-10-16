/* =====================================================================
   Sai Dhyeya — portfolio interactions
   - Page loader
   - Scroll-reveal animations
   - Mobile navigation toggle
   - Contact form submission
   - Neutralise placeholder links (no destination defined in the design)
   ===================================================================== */
(function () {
  'use strict';

  var doc = document;

  /* ----------------------------------------------------------------
     Placeholder links ("Resume", "View prototype", "All projects").
     Delegated so it also covers links rendered later by the CMS.
     ---------------------------------------------------------------- */
  doc.addEventListener('click', function (event) {
    var link = event.target.closest ? event.target.closest('a[href="#"]') : null;
    if (link) event.preventDefault();
  });

  /* ----------------------------------------------------------------
     Mobile navigation
     ---------------------------------------------------------------- */
  var toggle = doc.querySelector('.nav-toggle');
  var nav = doc.querySelector('.site-nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 767) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ----------------------------------------------------------------
     Scroll reveal
     ---------------------------------------------------------------- */
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Safe to call repeatedly: only elements that have not been bound yet are
  // picked up, so list items re-rendered by the CMS also animate.
  function setupReveal() {
    var items = Array.prototype.slice.call(doc.querySelectorAll('.reveal:not([data-reveal-bound])'));
    if (!items.length) return;
    items.forEach(function (node) { node.setAttribute('data-reveal-bound', ''); });

    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (node) { node.classList.add('is-revealed'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });

    items.forEach(function (node) { observer.observe(node); });
  }

  /* ----------------------------------------------------------------
     Page loader — hides once the content and window are both ready
     ---------------------------------------------------------------- */
  var loader = doc.getElementById('page-loader');
  var startedAt = Date.now();
  var MIN_VISIBLE = 550;
  var loaderHidden = false;
  var contentReady = !!window.__cmsReady;
  var windowReady = doc.readyState === 'complete';

  function hideLoader() {
    if (loaderHidden) return;
    loaderHidden = true;
    if (loader && loader.parentNode) {
      loader.classList.add('is-hidden');
      window.setTimeout(function () {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      }, 700);
    }
  }

  function maybeHideLoader() {
    if (!contentReady || !windowReady) return;
    var wait = Math.max(0, MIN_VISIBLE - (Date.now() - startedAt));
    window.setTimeout(hideLoader, wait);
  }

  if (!contentReady) window.addEventListener('cms:ready', function () {
    contentReady = true;
    maybeHideLoader();
  });
  if (!windowReady) window.addEventListener('load', function () {
    windowReady = true;
    maybeHideLoader();
  });

  // Safety net: never leave the loader on screen.
  window.setTimeout(function () { hideLoader(); }, 4000);
  maybeHideLoader();

  // Reveal animations run against the hydrated DOM. The CMS re-renders its
  // lists, so bind again once hydration reports back.
  setupReveal();
  window.addEventListener('cms:ready', setupReveal);
  window.setTimeout(setupReveal, 1500);

  /* ----------------------------------------------------------------
     Contact form
     ---------------------------------------------------------------- */
  var form = doc.getElementById('contact-form');
  if (form) {
    var status = doc.getElementById('contact-status');
    var submit = form.querySelector('.contact-form__submit');
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function setStatus(message, kind) {
      if (!status) return;
      status.textContent = message || '';
      status.className = 'contact-form__status' + (kind ? ' is-' + kind : '');
    }

    function mark(field, invalid) {
      if (field) field.classList.toggle('is-invalid', !!invalid);
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var name = form.name.value.trim();
      var email = form.email.value.trim();
      var message = form.message.value.trim();
      var problems = [];

      mark(form.name, name.length < 2);
      mark(form.email, !EMAIL.test(email));
      mark(form.message, message.length < 10);

      if (name.length < 2) problems.push('your name');
      if (!EMAIL.test(email)) problems.push('a valid email');
      if (message.length < 10) problems.push('a message of at least 10 characters');

      if (problems.length) {
        setStatus('Please provide ' + problems.join(', ') + '.', 'error');
        return;
      }

      setStatus('Sending…', '');
      if (submit) submit.disabled = true;

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          email: email,
          subject: form.subject.value.trim(),
          message: message,
          company: form.company.value
        })
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (result.ok) {
            form.reset();
            [form.name, form.email, form.message].forEach(function (f) { mark(f, false); });
            setStatus(result.data && result.data.message ? result.data.message : 'Thanks! Your message has been sent.', 'ok');
          } else {
            setStatus((result.data && result.data.error) || 'Sorry, something went wrong. Please try again.', 'error');
          }
        })
        .catch(function () {
          setStatus('Network error — please check your connection and try again.', 'error');
        })
        .then(function () {
          if (submit) submit.disabled = false;
        });
    });
  }
})();
