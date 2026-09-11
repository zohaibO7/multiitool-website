/* ==========================================================================
   MultiTool — assets/js/main.js
   --------------------------------------------------------------------------
   HOMEPAGE / TOOL DIRECTORY script. Loaded only by the root index.html —
   tool pages do not need it.

   Responsibilities:
     • live search across name, keywords and category label
     • category filtering via chips
     • sorting (by category, name A→Z, name Z→A)
     • highlighting the matched run inside card titles and descriptions
     • keyboard navigation from the search box into the grid
     • reflecting search / category / sort in the URL so a filtered view is
       shareable and bookmarkable
     • result count and empty state

   It reads the tool cards already present in the HTML rather than building
   them, so every tool is a real crawlable link that works with JavaScript
   switched off. Everything here is a progressive enhancement on top.

   Expected markup (see index.html):

     <input id="tool-search">
     <button class="search__clear" hidden>
     <select id="tool-sort">                     default | az | za
     <button class="chip" data-filter="all|<category-id>" aria-pressed>
     <section data-category-section="<category-id>" id="cat-<category-id>">
       <div class="tool-grid">
         <a class="tool-card" data-tool
            data-name="Word Counter"
            data-category="text-tools"
            data-keywords="count words characters">
           <h3 class="tool-card__title">   <- highlight target
           <span class="tool-card__desc">  <- highlight target
     <section id="flat-results" hidden>          sort-by-name container
       <div class="tool-grid" id="flat-grid">
       <span id="flat-count">
     <p id="result-count" role="status" aria-live="polite">
     <div id="no-results" hidden>
       <button id="reset-filters">

   Every hook is optional. If a page is missing them, this script degrades or
   exits quietly instead of throwing.
   ========================================================================== */

/* global window, document, MT */

(function () {
  'use strict';

  if (typeof MT === 'undefined') {
    // common.js failed to load — check the <script> path in index.html.
    return;
  }

  var SORT_KEY = 'multitool-sort';
  var VALID_SORTS = ['default', 'az', 'za'];

  // Array + indexOf rather than an object lookup: `VALID_SORTS['constructor']`
  // on a plain object would inherit a truthy value from Object.prototype and
  // let a hand-edited ?sort= through.
  function isValidSort(mode) {
    return VALID_SORTS.indexOf(mode) !== -1;
  }

  MT.ready(function () {
    var searchInput = MT.$('#tool-search');
    var cards = MT.$$('[data-tool]');

    // No grid on this page? Nothing to do.
    if (!cards.length) return;

    var clearBtn = MT.$('.search__clear');
    var sortSelect = MT.$('#tool-sort');
    var chips = MT.$$('[data-filter]');
    var sections = MT.$$('[data-category-section]');
    var countEl = MT.$('#result-count');
    var emptyEl = MT.$('#no-results');
    var resetBtn = MT.$('#reset-filters');
    var flatSection = MT.$('#flat-results');
    var flatGrid = MT.$('#flat-grid');
    var flatCount = MT.$('#flat-count');

    var TOTAL = cards.length;
    var activeCategory = 'all';
    var activeSort = 'default';

    // Tracks what is currently rendered so we only touch the DOM on a real
    // change. apply() runs on every keystroke; relayout must not.
    var currentLayout = null;
    var lastPainted = null;

    /* --------------------------------------------------------------------
       1. INDEX
       Built once, so a keystroke only compares strings. Also caches the
       original text and home position of every card, which is what lets
       highlighting and sorting be undone exactly.
       -------------------------------------------------------------------- */
    var index = cards.map(function (card, i) {
      var name = card.getAttribute('data-name') || '';
      var category = card.getAttribute('data-category') || '';
      var keywords = card.getAttribute('data-keywords') || '';
      var meta = MT.categoryById(category);
      var titleEl = MT.$('.tool-card__title', card);
      var descEl = MT.$('.tool-card__desc', card);

      return {
        el: card,
        name: name,
        category: category,

        // One lowercase haystack: tool name + keywords + category label.
        haystack: (name + ' ' + keywords + ' ' + (meta ? meta.label : ''))
          .toLowerCase()
          .replace(/\s+/g, ' '),

        // Highlight targets, plus their pristine text so we can restore it.
        titleEl: titleEl,
        descEl: descEl,
        titleText: titleEl ? titleEl.textContent : '',
        descText: descEl ? descEl.textContent : '',

        // Where this card lives when sorting is "By category".
        homeGrid: card.parentNode,
        homeIndex: i
      };
    });

    /* --------------------------------------------------------------------
       2. MATCH HIGHLIGHTING
       -------------------------------------------------------------------- */

    function reEscape(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /* Wraps each matched run in <mark>.

       Every slice of the original text is passed through MT.escapeHtml before
       being concatenated, and the only unescaped characters added are the
       literal <mark> tags. Escaping per-slice (rather than escaping the whole
       string first and then running the regex over it) matters: escaping
       first would turn "&" into "&amp;", and a search for "amp" would then
       match inside the entity and produce broken markup. */
    function highlight(text, terms) {
      if (!terms.length) return MT.escapeHtml(text);

      // Longest term first, so overlapping terms cannot truncate each other.
      var pattern = terms.slice()
        .sort(function (a, b) { return b.length - a.length; })
        .map(reEscape)
        .join('|');

      var re = new RegExp(pattern, 'gi');
      var out = '';
      var last = 0;
      var m;

      while ((m = re.exec(text)) !== null) {
        if (m[0] === '') { re.lastIndex++; continue; } // zero-length guard
        out += MT.escapeHtml(text.slice(last, m.index));
        out += '<mark>' + MT.escapeHtml(m[0]) + '</mark>';
        last = m.index + m[0].length;
      }

      return out + MT.escapeHtml(text.slice(last));
    }

    // queryKey is the joined term list; repainting is skipped when unchanged.
    function paintHighlights(terms, queryKey) {
      if (queryKey === lastPainted) return;
      lastPainted = queryKey;

      index.forEach(function (entry) {
        if (!terms.length) {
          // textContent, not innerHTML — cheaper and drops the <mark> nodes.
          if (entry.titleEl) entry.titleEl.textContent = entry.titleText;
          if (entry.descEl) entry.descEl.textContent = entry.descText;
          return;
        }
        if (entry.titleEl) entry.titleEl.innerHTML = highlight(entry.titleText, terms);
        if (entry.descEl) entry.descEl.innerHTML = highlight(entry.descText, terms);
      });
    }

    /* --------------------------------------------------------------------
       3. LAYOUT
       "By category" keeps the eight sections. Sorting by name dissolves that
       grouping, so all 58 cards move into one flat grid and the sections are
       hidden. Switching back returns every card to its original section in
       its original order.
       -------------------------------------------------------------------- */
    function layout(mode) {
      // Resolve to what will actually be rendered before recording it. If the
      // flat grid is missing from the HTML we fall back to category order, and
      // currentLayout has to say 'default' or apply() would hide all eight
      // sections and leave a blank page.
      var effective = (mode === 'default' || !flatGrid) ? 'default' : mode;
      if (effective === currentLayout) return;
      currentLayout = effective;

      if (effective === 'default') {
        index.slice()
          .sort(function (a, b) { return a.homeIndex - b.homeIndex; })
          .forEach(function (entry) { entry.homeGrid.appendChild(entry.el); });
        if (flatSection) flatSection.hidden = true;
        return;
      }

      var dir = effective === 'za' ? -1 : 1;
      index.slice()
        .sort(function (a, b) {
          return dir * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        })
        .forEach(function (entry) { flatGrid.appendChild(entry.el); });

      if (flatSection) flatSection.hidden = false;
    }

    /* --------------------------------------------------------------------
       4. FILTER + RENDER
       -------------------------------------------------------------------- */

    function matches(entry, terms) {
      if (activeCategory !== 'all' && entry.category !== activeCategory) return false;
      // Every term must appear somewhere — so "qr code" and "code qr" agree.
      for (var i = 0; i < terms.length; i++) {
        if (entry.haystack.indexOf(terms[i]) === -1) return false;
      }
      return true;
    }

    function apply() {
      var query = (searchInput ? searchInput.value : '').trim().toLowerCase();
      var terms = query ? query.split(/\s+/) : [];
      var visible = 0;

      layout(activeSort);

      index.forEach(function (entry) {
        var show = matches(entry, terms);
        entry.el.hidden = !show;
        if (show) visible++;
      });

      if (currentLayout === 'default') {
        // Hide a category heading once all of its cards are filtered out.
        sections.forEach(function (section) {
          var anyVisible = MT.$$('[data-tool]', section).some(function (card) {
            return !card.hidden;
          });
          section.hidden = !anyVisible;
        });
      } else {
        // Sorted by name: the category sections are empty shells right now.
        sections.forEach(function (section) { section.hidden = true; });
        if (flatSection) flatSection.hidden = visible === 0;
        if (flatCount) {
          flatCount.textContent = visible + (visible === 1 ? ' tool' : ' tools');
        }
      }

      paintHighlights(terms, terms.join(' '));

      if (clearBtn) clearBtn.hidden = query.length === 0;
      if (emptyEl) emptyEl.hidden = visible !== 0;
      updateCount(visible, query);
      syncUrl(query);
    }

    function updateCount(visible, query) {
      if (!countEl) return;

      if (!query && activeCategory === 'all') {
        countEl.textContent = 'Showing all ' + TOTAL + ' tools';
        return;
      }

      if (visible === 0) {
        countEl.textContent = 'No tools match';
        return;
      }

      var noun = visible === 1 ? 'tool' : 'tools';
      var verb = visible === 1 ? 'matches' : 'match';
      var open = '“';
      var close = '”';

      if (query && activeCategory !== 'all') {
        var meta = MT.categoryById(activeCategory);
        countEl.textContent = visible + ' ' + noun + ' in ' +
          (meta ? meta.label : activeCategory) + ' ' + verb + ' ' + open + query + close;
      } else if (query) {
        countEl.textContent = visible + ' ' + noun + ' ' + verb + ' ' +
          open + query + close;
      } else {
        var m = MT.categoryById(activeCategory);
        countEl.textContent = 'Showing ' + visible + ' ' + noun + ' in ' +
          (m ? m.label : activeCategory);
      }
    }

    /* --------------------------------------------------------------------
       5. URL STATE
       Written with replaceState so typing does not stack up dozens of
       history entries. The URL stays shareable and bookmarkable; the back
       button leaves the page rather than stepping back through filters,
       which is the less surprising of the two behaviours.
       -------------------------------------------------------------------- */
    function syncUrl(query) {
      if (!window.history || !window.history.replaceState) return;

      var params = [];
      if (query) params.push('q=' + encodeURIComponent(query));
      if (activeCategory !== 'all') params.push('cat=' + encodeURIComponent(activeCategory));
      if (activeSort !== 'default') params.push('sort=' + encodeURIComponent(activeSort));

      var next = window.location.pathname + (params.length ? '?' + params.join('&') : '');

      // Compare against the current URL minus the hash, so we do not write on
      // every keystroke when nothing actually changed.
      var current = window.location.pathname + window.location.search;
      if (next === current) return;

      try {
        window.history.replaceState(null, '', next);
      } catch (e) {
        /* file:// in some browsers rejects replaceState — filtering still
           works, only the URL will not follow. */
      }
    }

    function readParam(name) {
      var re = new RegExp('[?&]' + name + '=([^&]*)');
      var m = re.exec(window.location.search);
      if (!m) return null;
      try {
        return decodeURIComponent(m[1].replace(/\+/g, ' '));
      } catch (e) {
        return null;
      }
    }

    /* --------------------------------------------------------------------
       6. STATE SETTERS
       -------------------------------------------------------------------- */

    function setCategory(id) {
      activeCategory = id;
      chips.forEach(function (chip) {
        var on = chip.getAttribute('data-filter') === id;
        chip.classList.toggle('is-active', on);
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      apply();
    }

    function setSort(mode, persist) {
      activeSort = isValidSort(mode) ? mode : 'default';
      if (sortSelect && sortSelect.value !== activeSort) sortSelect.value = activeSort;
      if (persist) MT.store.set(SORT_KEY, activeSort);
      apply();
    }

    function reset(focusSearch) {
      if (searchInput) searchInput.value = '';
      setCategory('all');
      if (focusSearch && searchInput) searchInput.focus();
    }

    /* --------------------------------------------------------------------
       7. KEYBOARD NAVIGATION
       The grid is treated as a one-dimensional list. Column count changes
       with the viewport under `auto-fit`, so true 2D arrow movement would be
       unpredictable; next/previous is honest and works at every width.
       -------------------------------------------------------------------- */

    function visibleCards() {
      return index
        .filter(function (entry) { return !entry.el.hidden; })
        .map(function (entry) { return entry.el; });
    }

    // Visual order, which differs from index order once sorted by name.
    function orderedVisibleCards() {
      if (currentLayout === 'default' || !flatGrid) return visibleCards();
      return MT.$$('[data-tool]', flatGrid).filter(function (el) {
        return !el.hidden;
      });
    }

    function focusCardAt(list, i) {
      if (!list.length) return;
      var target = list[Math.max(0, Math.min(i, list.length - 1))];
      if (target) target.focus();
    }

    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && searchInput.value) {
          e.preventDefault();
          searchInput.value = '';
          apply();
          return;
        }

        if (e.key === 'Enter') {
          var first = orderedVisibleCards()[0];
          if (first) {
            e.preventDefault();
            // .href (the property) is already absolute. The raw attribute is
            // relative and would resolve against the current ?q=... URL.
            window.location.href = first.href;
          }
          return;
        }

        if (e.key === 'ArrowDown') {
          var list = orderedVisibleCards();
          if (list.length) {
            e.preventDefault();
            list[0].focus();
          }
        }
      });
    }

    // Arrow keys move between cards; Escape returns to the search box.
    document.addEventListener('keydown', function (e) {
      var active = document.activeElement;
      if (!active || !active.hasAttribute || !active.hasAttribute('data-tool')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      var list = orderedVisibleCards();
      var at = list.indexOf(active);
      if (at === -1) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          focusCardAt(list, at + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          if (at === 0) {
            if (searchInput) searchInput.focus();
          } else {
            focusCardAt(list, at - 1);
          }
          break;
        case 'Home':
          e.preventDefault();
          focusCardAt(list, 0);
          break;
        case 'End':
          e.preventDefault();
          focusCardAt(list, list.length - 1);
          break;
        case 'Escape':
          e.preventDefault();
          if (searchInput) searchInput.focus();
          break;
        default:
          break;
      }
    });

    // Press "/" anywhere to jump to the search box.
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.activeElement && document.activeElement.isContentEditable) return;
      if (!searchInput) return;
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    });

    /* --------------------------------------------------------------------
       8. WIRING
       -------------------------------------------------------------------- */

    if (searchInput) {
      // Debounced for typing; 'search' fires on the native clear gesture.
      searchInput.addEventListener('input', MT.debounce(apply, 120));
      searchInput.addEventListener('search', apply);
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (searchInput) searchInput.value = '';
        apply();
        if (searchInput) searchInput.focus();
      });
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        setCategory(chip.getAttribute('data-filter'));
      });
    });

    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        setSort(sortSelect.value, true);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () { reset(true); });
    }

    /* --------------------------------------------------------------------
       9. DEEP LINKS AND FIRST RENDER

       Three ways in, in order of precedence:
         ?q= / ?cat= / ?sort=   the shareable form this script writes
         #cat-<id>              what the injected footer links to
         nothing                show everything

       The hash form also has to work when the hash changes without a reload,
       which happens when a footer link is clicked from the homepage itself.
       -------------------------------------------------------------------- */

    function categoryFromHash() {
      var raw = window.location.hash || '';
      if (raw.indexOf('#cat-') !== 0) return null;
      var id = raw.slice(5);
      return MT.categoryById(id) ? id : null;
    }

    function scrollToCategory(id, smooth) {
      var section = MT.$('#cat-' + id);
      if (!section || section.hidden) return;
      var reduce = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      try {
        section.scrollIntoView({
          behavior: (smooth && !reduce) ? 'smooth' : 'auto',
          block: 'start'
        });
      } catch (e) {
        section.scrollIntoView(); // older Safari: no options object
      }
    }

    window.addEventListener('hashchange', function () {
      var id = categoryFromHash();
      if (id) {
        // A category link resets sorting, otherwise the section it points at
        // would be hidden and the scroll would go nowhere.
        if (activeSort !== 'default') setSort('default', true);
        setCategory(id);
        scrollToCategory(id, true);
        return;
      }
      // "#all-tools" or anything else: drop a stale filter so the visitor is
      // not left staring at a subset with no visible reason why.
      if (activeCategory !== 'all') setCategory('all');
    });

    // ---- initial state ------------------------------------------------
    var storedSort = MT.store.get(SORT_KEY, 'default');
    var urlSort = readParam('sort');
    var urlCat = readParam('cat');
    var urlQuery = readParam('q');
    var hashCat = categoryFromHash();

    // A ?sort= in the URL wins over the remembered preference, so a shared
    // link shows what the sender saw.
    activeSort = isValidSort(urlSort) ? urlSort
      : (isValidSort(storedSort) ? storedSort : 'default');

    /* A #cat- deep link has to win over a remembered name sort. Sorting by
       name hides all eight category sections, so without this a visitor who
       once chose "Name: A to Z" would click a footer category link — the
       normal way in from all 58 tool pages, a full page load, so the
       hashchange handler above never runs — and land on the hero with no
       Generators heading anywhere on the page. An explicit ?sort= is still
       honoured, since that is someone deliberately sharing a sorted view. */
    if (!urlCat && hashCat && !isValidSort(urlSort)) activeSort = 'default';

    if (sortSelect) sortSelect.value = activeSort;

    if (urlQuery && searchInput) searchInput.value = urlQuery;

    var startCategory = 'all';
    if (urlCat && MT.categoryById(urlCat)) startCategory = urlCat;
    else if (hashCat) startCategory = hashCat;

    // setCategory calls apply(), which does the first render.
    setCategory(startCategory);

    // Only scroll for the hash form; a ?cat= link should land at the top.
    if (!urlCat && hashCat) scrollToCategory(hashCat, false);
  });
})();
