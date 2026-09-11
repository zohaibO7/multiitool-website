/* ==========================================================================
   MultiTool — assets/js/common.js
   --------------------------------------------------------------------------
   SHARED script. Loaded by every page (homepage + all 58 tools) with `defer`.

   Responsibilities:
     1. Work out the correct relative path back to the site root, so the same
        navbar markup works from / and from /tools/<slug>/.
     2. Own the category list — the single source of truth for category
        names, icons and counts.
     3. Inject the navbar and footer, so shared chrome is defined ONCE
        instead of being copy-pasted into 59 HTML files.
     4. Dark mode: apply, toggle, persist.
     5. Expose helpers (copy, download, toast, file reading, escaping) that
        every tool script can call instead of reimplementing.

   Everything hangs off one global: `MT`.

   Each page must provide:
     <html data-base="">                     ← "" at root, "../../" in tools/
     <header class="site-header" id="site-header"></header>
     <main class="site-main" id="main">…</main>
     <footer class="site-footer" id="site-footer"></footer>
   ========================================================================== */

/* global window, document, navigator, localStorage */

var MT = (function () {
  'use strict';

  /* ------------------------------------------------------------------------
     CONFIG
     ------------------------------------------------------------------------ */

  var SITE_NAME = 'MultiTool';
  var THEME_KEY = 'multitool-theme';

  /* The eight categories from the project spec, in spec order.
     `count` is the number of tools the spec assigns to each category.
     Anything that needs category metadata reads it from here — the footer
     today, the homepage sections in Phase 1, the filter chips in Phase 2. */
  var CATEGORIES = [
    { id: 'text-tools',      label: 'Text Tools',         short: 'Text',       icon: '✏️',  count: 10 },
    { id: 'generators',      label: 'Generators',         short: 'Generators', icon: '⚡',  count: 10 },
    { id: 'calculators',     label: 'Calculators',        short: 'Calculators',icon: '🧮',  count: 10 },
    { id: 'converters',      label: 'Converters',         short: 'Converters', icon: '🔄',  count: 7  },
    { id: 'image-tools',     label: 'Image Tools',        short: 'Image',      icon: '🖼️',  count: 4  },
    { id: 'pdf-tools',       label: 'PDF Tools',          short: 'PDF',        icon: '📄',  count: 2  },
    { id: 'developer-tools', label: 'Developer Tools',    short: 'Developer',  icon: '💻',  count: 10 },
    { id: 'fun-utility',     label: 'Fun / Utility Tools',short: 'Fun',        icon: '🎲',  count: 5  }
  ];

  var TOOL_COUNT = CATEGORIES.reduce(function (sum, c) { return sum + c.count; }, 0); // 58

  /* ------------------------------------------------------------------------
     PATH RESOLUTION
     The homepage sits at the site root; tool pages sit two levels down at
     tools/<slug>/. The navbar is identical on both, so links have to be
     rewritten per depth.
     ------------------------------------------------------------------------ */

  /**
   * Relative prefix from the current page back to the site root.
   * Prefers the explicit `data-base` on <html>; falls back to inspecting
   * the URL so a page that forgets the attribute still works.
   * @returns {string} "" at the root, "../" one level down, "../../" two.
   */
  function resolveBase() {
    var declared = document.documentElement.getAttribute('data-base');
    if (typeof declared === 'string') return declared;

    var parts = window.location.pathname.split('/');
    var toolsAt = parts.lastIndexOf('tools');
    if (toolsAt === -1) return '';

    // Directory segments after "tools" (a trailing "index.html" is not one).
    var depth = parts.slice(toolsAt + 1).filter(function (seg) {
      return seg !== '' && seg.indexOf('.') === -1;
    }).length;

    return new Array(depth + 2).join('../'); // depth+1 levels up
  }

  var BASE = resolveBase();

  /**
   * Turn a root-relative path into one that works from the current page.
   * @param {string} path e.g. "assets/css/style.css"
   * @returns {string}
   */
  function url(path) {
    return BASE + String(path).replace(/^\/+/, '');
  }

  /* ------------------------------------------------------------------------
     TINY DOM HELPERS
     ------------------------------------------------------------------------ */

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  /* ------------------------------------------------------------------------
     SAFE STORAGE
     localStorage throws in some privacy modes. Never let that break a tool.
     ------------------------------------------------------------------------ */

  var store = {
    get: function (key, fallback) {
      try {
        var v = localStorage.getItem(key);
        return v === null ? (fallback === undefined ? null : fallback) : v;
      } catch (e) {
        return fallback === undefined ? null : fallback;
      }
    },
    set: function (key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        return false;
      }
    },
    remove: function (key) {
      try {
        localStorage.removeItem(key);
      } catch (e) { /* ignore */ }
    }
  };

  /* ------------------------------------------------------------------------
     THEME
     A matching inline snippet in each page's <head> applies the saved theme
     before first paint, so there is no flash of the wrong theme. This code
     handles the toggle and persistence after load.
     ------------------------------------------------------------------------ */

  function prefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /** @returns {"light"|"dark"} the theme currently on <html> */
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme, persist) {
    var next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    if (persist) store.set(THEME_KEY, next);
    syncThemeButton();
    return next;
  }

  function toggleTheme() {
    return applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  }

  function syncThemeButton() {
    var btn = $('#theme-toggle');
    if (!btn) return;
    var isDark = currentTheme() === 'dark';
    var label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    var icon = $('.theme-toggle__icon', btn);
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  }

  function initTheme() {
    var saved = store.get(THEME_KEY);
    // No explicit choice yet → follow the OS, and keep following it.
    applyTheme(saved || (prefersDark() ? 'dark' : 'light'), false);

    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function (e) {
        if (!store.get(THEME_KEY)) applyTheme(e.matches ? 'dark' : 'light', false);
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* ------------------------------------------------------------------------
     SHARED CHROME — navbar + footer
     ------------------------------------------------------------------------ */

  var NAV_LINKS = [
    { href: 'index.html', label: 'Home', id: 'home' },
    { href: 'index.html#all-tools', label: 'All tools', id: 'all-tools' }
  ];

  function renderHeader() {
    var host = $('#site-header');
    if (!host) return;

    var onHomepage = BASE === '';

    var links = NAV_LINKS.map(function (link) {
      var current = onHomepage && link.id === 'home' ? ' is-current' : '';
      var aria = current ? ' aria-current="page"' : '';
      return '<a class="site-nav__link' + current + '" href="' + url(link.href) + '"' + aria + '>' +
        link.label + '</a>';
    }).join('');

    host.innerHTML =
      '<div class="container site-header__inner">' +
        '<a class="brand" href="' + url('index.html') + '">' +
          '<img class="brand__mark" src="' + url('assets/icons/favicon.svg') + '" alt="" width="28" height="28">' +
          '<span class="brand__text">Multi<span class="brand__accent">Tool</span></span>' +
        '</a>' +
        '<nav class="site-nav" id="site-nav" aria-label="Main">' + links + '</nav>' +
        '<div class="site-header__actions">' +
          '<button class="header-btn theme-toggle" id="theme-toggle" type="button" aria-pressed="false" aria-label="Switch to dark theme" title="Switch to dark theme">' +
            '<span class="theme-toggle__icon" aria-hidden="true">🌙</span>' +
          '</button>' +
          '<button class="header-btn nav-toggle" id="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu" title="Menu">' +
            '<span aria-hidden="true">☰</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    wireHeader();
    syncThemeButton();
  }

  function wireHeader() {
    var themeBtn = $('#theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () { toggleTheme(); });
    }

    var navBtn = $('#nav-toggle');
    var nav = $('#site-nav');
    if (!navBtn || !nav) return;

    function setNav(open) {
      nav.classList.toggle('is-open', open);
      navBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      navBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }

    navBtn.addEventListener('click', function () {
      setNav(!nav.classList.contains('is-open'));
    });

    // Escape closes it and returns focus to the button.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setNav(false);
        navBtn.focus();
      }
    });

    // Clicking outside closes it.
    document.addEventListener('click', function (e) {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(e.target) || navBtn.contains(e.target)) return;
      setNav(false);
    });

    // Growing past the breakpoint closes it, so it cannot get stuck open.
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) setNav(false);
    });
  }

  function renderFooter() {
    var host = $('#site-footer');
    if (!host) return;

    var catLinks = CATEGORIES.map(function (c) {
      return '<li><a href="' + url('index.html#cat-' + c.id) + '">' +
        '<span aria-hidden="true">' + c.icon + '</span>' + c.label +
        ' <span class="site-footer__count">' + c.count + '</span>' +
        '</a></li>';
    }).join('');

    host.innerHTML =
      '<div class="container">' +
        '<div class="site-footer__grid">' +
          '<div class="site-footer__about">' +
            '<a class="site-footer__brand" href="' + url('index.html') + '">' +
              '<img class="brand__mark" src="' + url('assets/icons/favicon.svg') + '" alt="" width="28" height="28">' +
              '<span>Multi<span style="color:var(--accent)">Tool</span></span>' +
            '</a>' +
            '<p>' + TOOL_COUNT + ' free tools that run entirely in your browser. ' +
            'Nothing you type or upload is sent to a server.</p>' +
          '</div>' +
          '<div class="site-footer__cats">' +
            '<h2 class="site-footer__heading">Categories</h2>' +
            '<ul class="site-footer__links">' + catLinks + '</ul>' +
          '</div>' +
        '</div>' +
        '<div class="site-footer__bottom">' +
          '<span>' + SITE_NAME + ' — ' + TOOL_COUNT + ' tools, all free.</span>' +
          '<span>Built with plain HTML, CSS and JavaScript. No tracking.</span>' +
        '</div>' +
      '</div>';
  }

  function renderSkipLink() {
    if ($('.skip-link') || !$('#main')) return;
    var a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#main';
    a.textContent = 'Skip to content';
    document.body.insertBefore(a, document.body.firstChild);
  }

  /* ------------------------------------------------------------------------
     TOASTS
     ------------------------------------------------------------------------ */

  function toastRegion() {
    var region = $('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      // Announced politely so a copy confirmation reaches screen readers.
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    return region;
  }

  /**
   * Show a short confirmation or error.
   * @param {string} message
   * @param {"info"|"success"|"error"} [type="info"]
   * @param {number} [duration=2600] ms before it fades
   */
  function toast(message, type, duration) {
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast--' + type : '');
    var icons = { success: '✅', error: '⚠️', info: 'ℹ️' };
    el.innerHTML = '<span aria-hidden="true">' + (icons[type] || icons.info) + '</span>' +
      '<span class="toast__text"></span>';
    // textContent, not innerHTML — the message may contain user input.
    $('.toast__text', el).textContent = message;

    toastRegion().appendChild(el);

    window.setTimeout(function () {
      el.classList.add('is-leaving');
      el.addEventListener('animationend', function () { el.remove(); }, { once: true });
      // Belt and braces if the animation is suppressed by reduced-motion.
      window.setTimeout(function () { if (el.parentNode) el.remove(); }, 400);
    }, duration || 2600);
  }

  /* ------------------------------------------------------------------------
     CLIPBOARD
     ------------------------------------------------------------------------ */

  /**
   * Copy text, with a fallback for non-secure contexts (opening a page
   * straight off the file system blocks the async clipboard API).
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  function copyText(text) {
    var value = String(text == null ? '' : text);

    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value).then(function () {
        return true;
      }, function () {
        return legacyCopy(value);
      });
    }
    return Promise.resolve(legacyCopy(value));
  }

  function legacyCopy(value) {
    var ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  /**
   * Copy and show the right toast either way. What most tools want.
   * @param {string} text
   * @param {string} [label="Copied to clipboard"]
   */
  function copyWithFeedback(text, label) {
    if (!String(text == null ? '' : text).length) {
      toast('Nothing to copy yet.', 'error');
      return Promise.resolve(false);
    }
    return copyText(text).then(function (ok) {
      if (ok) toast(label || 'Copied to clipboard', 'success');
      else toast('Copy failed. Select the text and press Ctrl+C instead.', 'error');
      return ok;
    });
  }

  /* ------------------------------------------------------------------------
     DOWNLOADS
     ------------------------------------------------------------------------ */

  /**
   * Save a Blob to the user's machine.
   * @param {Blob} blob
   * @param {string} filename
   */
  function downloadBlob(blob, filename) {
    var href = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = href;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give the browser a moment to start the download before revoking.
    window.setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
  }

  /**
   * Save a string as a text file.
   * @param {string} text
   * @param {string} filename
   * @param {string} [mime="text/plain;charset=utf-8"]
   */
  function downloadText(text, filename, mime) {
    downloadBlob(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }), filename);
  }

  /* ------------------------------------------------------------------------
     FILE READING (image and PDF tools)
     ------------------------------------------------------------------------ */

  function readFile(file, as) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () {
        reject(new Error('Could not read ' + (file && file.name ? file.name : 'that file') + '.'));
      };
      if (as === 'dataURL') reader.readAsDataURL(file);
      else if (as === 'arrayBuffer') reader.readAsArrayBuffer(file);
      else reader.readAsText(file);
    });
  }

  function readFileAsText(file) { return readFile(file, 'text'); }
  function readFileAsDataURL(file) { return readFile(file, 'dataURL'); }
  function readFileAsArrayBuffer(file) { return readFile(file, 'arrayBuffer'); }

  /* ------------------------------------------------------------------------
     FORMATTING AND UTILITY
     ------------------------------------------------------------------------ */

  /** Escape text destined for innerHTML. Prefer textContent where possible. */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 1234567 → "1,234,567" (respects the visitor's locale). */
  function formatNumber(n) {
    var num = Number(n);
    if (!isFinite(num)) return '0';
    try {
      return num.toLocaleString();
    } catch (e) {
      return String(num);
    }
  }

  /**
   * 1234567.5 -> "1,234,567.5" with at most `dp` decimals and trailing
   * zeros trimmed. 1250.00, 2 -> "1,250". Used by the money calculators
   * (loan, tip, discount) so a display format is defined once.
   * @param {number} n
   * @param {number} [dp=0] max decimal places
   * @returns {string}
   */
  function formatFixed(n, dp) {
    var places = dp === undefined ? 0 : dp;
    var factor = Math.pow(10, places);
    var r = Math.round(Number(n) * factor) / factor;
    var neg = r < 0;
    var a = Math.abs(r);
    var whole = Math.floor(a);
    var frac = Math.round((a - whole) * factor);

    var s = String(whole);
    var out = '';
    while (s.length > 3) {
      out = ',' + s.slice(-3) + out;
      s = s.slice(0, -3);
    }
    out = s + out;

    if (places > 0 && frac > 0) {
      var fr = String(frac);
      while (fr.length < places) fr = '0' + fr;
      fr = fr.replace(/0+$/, ''); // 0.50 -> 0.5
      if (fr) out += '.' + fr;
    }
    return (neg ? '-' : '') + out;
  }

  /** 1536 → "1.5 KB" */
  function formatBytes(bytes, decimals) {
    var b = Number(bytes);
    if (!isFinite(b) || b <= 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
    var d = decimals === undefined ? 1 : decimals;
    var value = b / Math.pow(1024, i);
    return (i === 0 ? value : value.toFixed(d)) + ' ' + units[i];
  }

  /** Wait until typing settles before running fn. */
  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments;
      var self = this;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { fn.apply(self, args); }, wait === undefined ? 180 : wait);
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value), min), max);
  }

  /** "Hello World!" → "hello-world" */
  function slugify(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function categoryById(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------------
     LIST HELPERS
     Shared because the text tools all sort lists of lines and all need the
     same two guarantees. Kept here rather than copied into each tool, per
     the project rule about not duplicating shared code.
     ------------------------------------------------------------------------ */

  /**
   * Sort that is stable on every engine. Array.prototype.sort was only
   * required to be stable from ES2019 onward, so items that compare equal
   * could otherwise change places. Carrying the original index and using it
   * as the final tie-break makes the guarantee ours.
   * @param {Array} list not modified
   * @param {function(*, *): number} cmp
   * @returns {Array} a new array
   */
  function stableSort(list, cmp) {
    var tagged = [];
    var i;
    for (i = 0; i < list.length; i++) tagged.push({ v: list[i], i: i });

    tagged.sort(function (a, b) {
      var r = cmp(a.v, b.v);
      return r === 0 ? a.i - b.i : r;
    });

    var out = [];
    for (i = 0; i < tagged.length; i++) out.push(tagged[i].v);
    return out;
  }

  /**
   * Compare two strings the way the reader's language sorts them, so
   * accented letters land where a dictionary would put them instead of
   * after "z". Returns 0 when the two should keep their existing order.
   * @param {string} a
   * @param {string} b
   * @param {boolean} [caseSensitive] default false
   * @returns {number} -1, 0 or 1
   */
  function compareText(a, b, caseSensitive) {
    var x = String(a);
    var y = String(b);
    if (!caseSensitive) { x = x.toLowerCase(); y = y.toLowerCase(); }

    if (x.localeCompare) {
      var r = x.localeCompare(y);
      return r === 0 ? 0 : (r < 0 ? -1 : 1);
    }
    if (x < y) return -1;
    if (x > y) return 1;
    return 0;
  }

  /* ------------------------------------------------------------------------
     BOOT
     ------------------------------------------------------------------------ */

  initTheme(); // before paint-sensitive work; the head snippet already ran

  ready(function () {
    renderHeader();
    renderFooter();
    renderSkipLink();
    document.documentElement.classList.add('mt-ready');
  });

  /* ------------------------------------------------------------------------
     PUBLIC API
     ------------------------------------------------------------------------ */

  return {
    SITE_NAME: SITE_NAME,
    CATEGORIES: CATEGORIES,
    TOOL_COUNT: TOOL_COUNT,
    BASE: BASE,

    url: url,
    $: $,
    $$: $$,
    ready: ready,
    store: store,

    currentTheme: currentTheme,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,

    toast: toast,
    copyText: copyText,
    copyWithFeedback: copyWithFeedback,
    downloadBlob: downloadBlob,
    downloadText: downloadText,

    readFileAsText: readFileAsText,
    readFileAsDataURL: readFileAsDataURL,
    readFileAsArrayBuffer: readFileAsArrayBuffer,

    escapeHtml: escapeHtml,
    formatNumber: formatNumber,
    formatFixed: formatFixed,
    formatBytes: formatBytes,
    debounce: debounce,
    clamp: clamp,
    slugify: slugify,
    categoryById: categoryById,

    stableSort: stableSort,
    compareText: compareText
  };
})();
