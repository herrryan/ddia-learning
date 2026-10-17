/* Application shell: hash router, sidebar navigation, parallel notes dock, global search, theme toggle, toasts. */
var App = (function () {
  'use strict';

  var esc = Markup.esc;
  var root, navEl, crumbsEl, dockEl, pageTitleBase = document.title;
  var cleanup = null;
  var searchIndex = null;

  /* ---------------------------------------------------------------------- routing */
  function parseRoute(hash) {
    var h = (hash || '#/').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return { name: 'home' };
    if (parts[0] === 'chapter' && /^\d+$/.test(parts[1] || '')) {
      var n = Number(parts[1]);
      var tab = parts[2] || 'notes';
      if (tab === 'flashcards') return { name: 'flashcards', n: n };
      if (tab === 'quiz') return { name: 'quiz', n: n };
      return { name: 'chapter', n: n, section: parts[3] || null };
    }
    if (parts[0] === 'notes') return { name: 'notes' };
    if (parts[0] === 'glossary') return { name: 'glossary' };
    if (parts[0] === 'themes') return { name: 'themes' };
    if (parts[0] === 'plan') return { name: 'plan' };
    return { name: 'notfound' };
  }

  function viewFor(route) {
    switch (route.name) {
      case 'home': return Views.home();
      case 'chapter': return Views.chapter(route.n, route.section);
      case 'flashcards': return Views.flashcards(route.n);
      case 'quiz': return Views.quiz(route.n);
      case 'notes': return Views.notes();
      case 'glossary': return Views.glossary();
      case 'themes': return Views.themes();
      case 'plan': return Views.plan();
      default: return Views.notFound(location.hash);
    }
  }

  var current = null;

  /** Scroll with smooth behaviour temporarily disabled. */
  function jump(el) {
    var html = document.documentElement;
    html.style.scrollBehavior = 'auto';
    if (el) el.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
    requestAnimationFrame(function () { html.style.scrollBehavior = ''; });
  }
  function sectionEl(id) {
    return root.querySelector('#sec-' + CSS.escape(id)) || root.querySelector('#' + CSS.escape(id));
  }

  function render() {
    var hash = location.hash || '#/';
    // Home supports in-page anchors like #/#part-2
    var anchor = null;
    var m = /^#\/#(.+)$/.exec(hash);
    if (m) { anchor = m[1]; hash = '#/'; }

    var route = parseRoute(hash);

    // Same chapter notes, only the section changed: scroll, do not re-render.
    if (current && route.name === 'chapter' && current.name === 'chapter' && current.n === route.n && route.section) {
      var target = sectionEl(route.section);
      if (target) target.scrollIntoView({ block: 'start' });
      current = route;
      Store.setLastRoute(hash);
      closeNav(); closeSearch();
      return;
    }

    var view = viewFor(route);

    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { /* ignore */ } }
    cleanup = null;
    current = route;

    var pageMod = (route.name === 'home' || route.name === 'notes') ? ' page--wide'
      : (route.name === 'chapter' || route.name === 'flashcards' || route.name === 'quiz') ? ''
      : ' page--narrow';
    root.innerHTML = '<div class="page' + pageMod + '">' + view.html + '</div>';
    document.title = (view.title ? view.title + ' · ' : '') + pageTitleBase;
    renderCrumbs(view.crumbs || []);
    if (view.mount) cleanup = view.mount(root) || null;

    if (anchor) {
      var el = document.getElementById(anchor);
      requestAnimationFrame(function () { jump(el); });
    } else if (route.section) {
      var sec = sectionEl(route.section);
      requestAnimationFrame(function () { jump(sec); });
    } else {
      jump(null);
    }

    Store.setLastRoute(hash === '#/' ? null : hash);
    refreshNav();
    refreshNotesBadges();
    syncDockVisibility();
    closeNav();
    closeSearch();
  }

  function rerender() { current = null; render(); }

  /* ---------------------------------------------------------------------- navigation */
  function renderCrumbs(crumbs) {
    if (!crumbs.length) { crumbsEl.innerHTML = '<a href="#/">Home</a>'; return; }
    crumbsEl.innerHTML = '<a href="#/">Home</a>' + crumbs.map(function (c, i) {
      var last = i === crumbs.length - 1;
      return '<span class="sep">/</span>' + (c.href && !last ? '<a href="' + c.href + '">' + esc(c.label) + '</a>' : '<span class="current">' + esc(c.label) + '</span>');
    }).join('');
  }

  function buildNav() {
    var I = Views.icons;
    var notesCount = Store.notes().length;
    var html = '<div class="nav__group">' +
      navLink('#/', I.book, 'Home', 'nav-home') +
      '<a href="#/notes" id="nav-notes"><span class="icon">' + I.pen + '</span><span class="grow">My notes</span><span class="num" id="nav-notes-count">' + notesCount + '</span></a>' +
      navLink('#/plan', I.clock, 'Study plan', 'nav-plan') +
      navLink('#/themes', I.shuffle, 'Themes', 'nav-themes') +
      navLink('#/glossary', I.list, 'Glossary', 'nav-glossary') +
      '</div>';
    DDIA.book.parts.forEach(function (part) {
      html += '<div class="nav__group" style="--part-color: var(--p' + part.number + ')"><div class="nav__heading"><span class="dot"></span>Part ' + Views.roman(part.number) + ' · ' + esc(part.title) + '</div>';
      part.chapters.forEach(function (n) {
        var ch = DDIA.chapter(n);
        html += '<a href="' + Views.chapterHref(n) + '" id="nav-ch-' + n + '" data-chapter="' + n + '"' + (ch ? '' : ' aria-disabled="true" style="opacity:.5"') + '><span class="num">' + Views.pad(n) + '</span><span class="grow">' + esc(Views.chapterTitle(n)) + '</span><span class="status"></span></a>';
      });
      html += '</div>';
    });
    navEl.innerHTML = html;
  }
  function navLink(href, icon, label, id) {
    return '<a href="' + href + '" id="' + id + '"><span class="icon">' + icon + '</span>' + esc(label) + '</a>';
  }

  /** Update active state, status dots, and the sidebar progress bar without rebuilding the nav. */
  function refreshNav() {
    var hash = location.hash || '#/';
    var route = parseRoute(hash.replace(/^#\/#.*$/, '#/'));
    navEl.querySelectorAll('a').forEach(function (a) {
      var href = a.getAttribute('href');
      var active = false;
      if (route.name === 'home') active = href === '#/';
      else if (route.n) active = a.getAttribute('data-chapter') === String(route.n);
      else active = href === '#/' + route.name;
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      var n = a.getAttribute('data-chapter');
      if (n) {
        var dot = a.querySelector('.status');
        dot.className = 'status ' + Views.statusClass(DDIA.chapter(Number(n)));
      }
    });
    var chapters = DDIA.chapters();
    var p = Store.overallProgress(chapters);
    var studied = chapters.filter(function (c) { return Store.chapter(c.number).complete; }).length;
    document.getElementById('sidebar-progress').innerHTML =
      '<div class="label"><span>Overall progress</span><b>' + Math.round(p * 100) + '%</b></div>' +
      '<div class="progress"><span style="width:' + Math.round(p * 100) + '%"></span></div>' +
      '<div class="small muted mt-2">' + studied + ' of ' + chapters.length + ' chapters studied</div>';
  }

  function openNav() { document.getElementById('app').classList.add('nav-open'); }
  function closeNav() { document.getElementById('app').classList.remove('nav-open'); }

  /* ---------------------------------------------------------------------- parallel notes dock */
  function currentChapterNumber() {
    return current && current.n ? Number(current.n) : null;
  }

  function refreshNotesBadges() {
    var total = Store.notes().length;
    var topCount = document.getElementById('notes-dock-count');
    if (topCount) topCount.textContent = String(total);
    var navCount = document.getElementById('nav-notes-count');
    if (navCount) navCount.textContent = String(total);
    var homeBtn = document.getElementById('btn-home-notes');
    if (homeBtn) homeBtn.innerHTML = Views.icons.pen + ' My notes (' + total + ')';

    var chNum = currentChapterNumber();
    if (chNum) {
      var chBtn = document.getElementById('chapter-open-notes');
      if (chBtn) {
        var chCount = Store.notesForChapter(chNum).length;
        chBtn.innerHTML = Views.icons.pen + ' Parallel notes (' + chCount + ')';
      }
      if (root) {
        root.querySelectorAll('[data-section-note]').forEach(function (btn) {
          var sId = btn.getAttribute('data-section-note');
          var secNotes = Store.notesForSection(chNum, sId);
          var span = btn.querySelector('span');
          if (span) span.textContent = secNotes.length ? Markup.plural(secNotes.length, 'note') : 'Add note';
          btn.classList.toggle('has-notes', secNotes.length > 0);
        });
      }
    }
  }

  function syncDockVisibility() {
    var appEl = document.getElementById('app');
    var toggleBtn = document.getElementById('notes-dock-toggle');
    var pane = Store.notesPane();
    // On the full #/notes page, hide the side dock so the full multi-column workspace has the whole screen.
    var showDock = pane.open && (!current || current.name !== 'notes');
    appEl.classList.toggle('notes-open', showDock);
    appEl.classList.toggle('notes-split', showDock && !!pane.split);
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', String(showDock));
      toggleBtn.classList.toggle('is-active', showDock);
    }
    if (showDock) {
      renderNotesDock();
    }
  }

  function renderNotesDock(focusNoteId) {
    if (!dockEl) return;
    var I = Views.icons;
    var pane = Store.notesPane();
    var all = Store.notes();
    var chNum = currentChapterNumber();

    // If user opened the dock with zero notes, automatically create an initial note for them
    if (!all.length) {
      var initial = Store.createNote({
        title: chNum ? 'Ch. ' + chNum + ' · ' + Views.chapterTitle(chNum) : '',
        body: '',
        chapter: chNum
      });
      all = Store.notes();
      pane = Store.notesPane();
      focusNoteId = initial.id;
      refreshNotesBadges();
    }

    var slotCount = pane.split ? 2 : 1;
    var editorsHtml = [];
    for (var i = 0; i < slotCount; i++) {
      var nId = pane.activeIds[i];
      var nObj = nId ? Store.getNote(nId) : null;
      editorsHtml.push(Views.noteEditorCardHtml(nObj, i, all, { compact: true }));
    }

    var dockHeaderEl = dockEl.querySelector('#notes-dock-inner');
    var html =
      '<div class="notes-dock__inner" id="notes-dock-inner">' +
        '<header class="notes-dock__head">' +
          '<div class="notes-dock__title">' +
            I.pen +
            '<strong>Parallel Notes</strong>' +
            (chNum ? '<span class="chip chip--accent">Ch. ' + chNum + '</span>' : '') +
          '</div>' +
          '<div class="notes-dock__controls">' +
            '<button type="button" class="btn btn--soft btn--sm" id="dock-btn-new" title="Create a new note">' + I.plus + 'New</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" id="dock-btn-split" aria-pressed="' + (!!pane.split) + '" title="Toggle 2 parallel note editors">' + I.columns + (pane.split ? '2 parallel' : 'Split (2)') + '</button>' +
            '<a class="icon-btn icon-btn--sm" href="#/notes" id="dock-btn-expand" title="Open full 3-column notes workspace">' + I.expand + '</a>' +
            '<button type="button" class="icon-btn icon-btn--sm" id="dock-btn-close" aria-label="Close parallel notes pane" title="Close parallel notes (N)">' + I.x + '</button>' +
          '</div>' +
        '</header>' +
        '<div class="notes-dock__editors' + (pane.split ? ' is-split' : '') + '" id="notes-dock-editors">' +
          editorsHtml.join('') +
        '</div>' +
      '</div>';

    dockEl.innerHTML = html;
    dockHeaderEl = dockEl.querySelector('#notes-dock-inner');

    Views.wireNoteEditors(dockEl.querySelector('#notes-dock-editors'), currentChapterNumber, function (newFocusId) {
      renderNotesDock(newFocusId);
      refreshNotesBadges();
    });

    var btnNew = dockEl.querySelector('#dock-btn-new');
    if (btnNew) {
      btnNew.addEventListener('click', function () {
        var targetSlot = pane.split && pane.activeIds[0] && !pane.activeIds[1] ? 1 : 0;
        var created = Store.createNote({
          title: '',
          body: '',
          chapter: currentChapterNumber(),
          slotIndex: targetSlot
        });
        refreshNotesBadges();
        renderNotesDock(created.id);
      });
    }

    var btnSplit = dockEl.querySelector('#dock-btn-split');
    if (btnSplit) {
      btnSplit.addEventListener('click', function () {
        var nextSplit = !Store.notesPane().split;
        Store.setNotesPane({ split: nextSplit });
        if (nextSplit && Store.notes().length < 2) {
          Store.createNote({
            title: '',
            body: '',
            chapter: currentChapterNumber(),
            slotIndex: 1
          });
          refreshNotesBadges();
        }
        syncDockVisibility();
      });
    }

    var btnClose = dockEl.querySelector('#dock-btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', function () {
        toggleNotesDock(false);
      });
    }

    if (focusNoteId) {
      var titleEl = dockEl.querySelector('input[data-note-title="' + CSS.escape(focusNoteId) + '"]');
      var bodyEl = dockEl.querySelector('textarea[data-note-body="' + CSS.escape(focusNoteId) + '"]');
      var targetEl = (titleEl && !titleEl.value) ? titleEl : (bodyEl || titleEl);
      if (targetEl) {
        requestAnimationFrame(function () { targetEl.focus({ preventScroll: true }); });
      }
    }
  }

  function toggleNotesDock(forceOpen) {
    if (typeof forceOpen !== 'boolean' && current && current.name === 'notes') {
      var firstInput = root.querySelector('.note-title-input');
      if (firstInput) firstInput.focus();
      return;
    }
    var pane = Store.notesPane();
    var next = typeof forceOpen === 'boolean' ? forceOpen : !pane.open;
    Store.setNotesPane({ open: next });
    syncDockVisibility();
  }

  function openParallelNote(opts) {
    opts = opts || {};
    var targetNote = null;
    if (opts.noteId) {
      targetNote = Store.getNote(opts.noteId);
    } else if (opts.chapter && opts.sectionId) {
      var secList = Store.notesForSection(opts.chapter, opts.sectionId);
      if (secList.length) {
        targetNote = secList[0];
      } else {
        targetNote = Store.createNote({
          title: opts.sectionTitle || '',
          body: '',
          chapter: opts.chapter,
          sectionId: opts.sectionId,
          sectionTitle: opts.sectionTitle || null,
          slotIndex: 0
        });
      }
    } else if (opts.chapter) {
      var chList = Store.notesForChapter(opts.chapter);
      if (chList.length) {
        targetNote = chList[0];
      } else {
        targetNote = Store.createNote({
          title: 'Ch. ' + opts.chapter + ' · ' + Views.chapterTitle(opts.chapter),
          body: '',
          chapter: opts.chapter,
          slotIndex: 0
        });
      }
    }

    if (targetNote) {
      Store.activateNoteInSlot(targetNote.id, 0);
    }
    Store.setNotesPane({ open: true });
    refreshNotesBadges();
    syncDockVisibility();
    if (targetNote) {
      renderNotesDock(targetNote.id);
    }
  }

  /* ---------------------------------------------------------------------- theme */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('theme-toggle');
    btn.innerHTML = t === 'dark' ? Views.icons.bulb : svgMoon();
    btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    btn.title = btn.getAttribute('aria-label');
  }
  function svgMoon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>'; }
  function initTheme() {
    var t = Store.state.theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(t);
    document.getElementById('theme-toggle').addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      Store.setTheme(next);
      applyTheme(next);
    });
  }

  /* ---------------------------------------------------------------------- search */
  function buildSearchIndex() {
    var idx = [];
    DDIA.chapters().forEach(function (ch) {
      var where = 'Ch. ' + ch.number;
      idx.push({ type: 'Chapters', title: ch.number + '. ' + ch.title, text: ch.tagline, href: Views.chapterHref(ch.number), where: where });
      ch.sections.forEach(function (s) {
        idx.push({ type: 'Sections', title: s.title, text: s.body[0] || '', href: Views.chapterHref(ch.number, 'notes', s.id), where: where, extra: s.keyPoints.join(' ') });
      });
      ch.terms.forEach(function (t) {
        idx.push({ type: 'Key terms', title: t.term, text: t.definition, href: Views.chapterHref(ch.number, 'notes', 'terms'), where: where });
      });
    });
    DDIA.glossary().forEach(function (g) {
      idx.push({ type: 'Glossary', title: g.term, text: g.definition, href: '#/glossary', where: 'Glossary' });
    });
    DDIA.book.themes.forEach(function (t) {
      idx.push({ type: 'Themes', title: t.title, text: t.summary, href: '#/themes#theme-' + t.id, where: 'Themes' });
    });
    return idx;
  }

  function search(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) return [];
    if (!searchIndex) searchIndex = buildSearchIndex();
    var userNoteItems = Store.notes().map(function (n) {
      return {
        type: 'My notes',
        title: (n.title || '').trim() || 'Untitled note',
        text: n.body || '',
        href: '#/notes',
        noteId: n.id,
        where: n.chapter ? 'My notes · Ch. ' + n.chapter : 'My notes'
      };
    });
    var combined = userNoteItems.concat(searchIndex);
    var words = q.split(/\s+/);
    var scored = [];
    combined.forEach(function (e) {
      var title = e.title.toLowerCase(), text = (e.text || '').toLowerCase(), extra = (e.extra || '').toLowerCase();
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (title === w) score += 50;
        else if (title.indexOf(w) === 0) score += 20;
        else if (title.indexOf(w) !== -1) score += 12;
        else if (text.indexOf(w) !== -1) score += 4;
        else if (extra.indexOf(w) !== -1) score += 2;
        else { score = 0; break; }
      }
      if (score > 0) scored.push({ e: e, score: score + (e.type === 'My notes' ? 4 : e.type === 'Chapters' ? 3 : e.type === 'Glossary' ? 2 : 0) });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    var top = scored.slice(0, 14);
    var order = [], groups = {};
    top.forEach(function (s) {
      if (!groups[s.e.type]) { groups[s.e.type] = []; order.push(s.e.type); }
      groups[s.e.type].push(s.e);
    });
    var out = [];
    order.forEach(function (t) { out = out.concat(groups[t]); });
    return out;
  }

  var searchActive = -1;
  function renderSearch(q) {
    var panel = document.getElementById('search-panel');
    var results = search(q);
    searchActive = -1;
    if (q.trim().length < 2) { closeSearch(); return; }
    if (!results.length) { panel.innerHTML = '<div class="search-panel__empty">No matches for “' + esc(q) + '”.</div>'; panel.classList.add('is-open'); return; }
    var html = '', lastType = null;
    results.forEach(function (r, i) {
      if (r.type !== lastType) { html += '<div class="search-panel__group">' + r.type + '</div>'; lastType = r.type; }
      html += '<a class="search-result" data-i="' + i + '"' + (r.noteId ? ' data-note-id="' + esc(r.noteId) + '"' : '') + ' href="' + r.href + '"><span><b>' + Markup.highlight(esc(r.title), q) + '</b><small>' + Markup.highlight(esc(Markup.truncate(r.text, 110)), q) + '</small></span><span class="where">' + esc(r.where) + '</span></a>';
    });
    panel.innerHTML = html;
    panel.classList.add('is-open');
  }
  function closeSearch() {
    var panel = document.getElementById('search-panel');
    if (panel) { panel.classList.remove('is-open'); }
  }
  function initSearch() {
    var input = document.getElementById('search-input');
    var panel = document.getElementById('search-panel');
    var timer = null;
    var narrow = window.matchMedia('(max-width: 760px)');
    function placeholder() { input.placeholder = narrow.matches ? 'Search…' : 'Search notes, terms, glossary…'; }
    placeholder();
    if (narrow.addEventListener) narrow.addEventListener('change', placeholder);
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { renderSearch(input.value); }, 80); });
    input.addEventListener('focus', function () { if (input.value.trim().length >= 2) renderSearch(input.value); });
    input.addEventListener('keydown', function (e) {
      var items = panel.querySelectorAll('.search-result');
      if (e.key === 'Escape') { input.value = ''; closeSearch(); input.blur(); return; }
      if (!items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        searchActive = (searchActive + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (it, i) { it.classList.toggle('is-active', i === searchActive); });
        items[searchActive].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        var target = items[searchActive >= 0 ? searchActive : 0];
        if (target) {
          var nId = target.getAttribute('data-note-id');
          if (nId) Store.activateNoteInSlot(nId, 0);
          location.hash = target.getAttribute('href');
          input.value = ''; closeSearch(); input.blur();
        }
      }
    });
    panel.addEventListener('click', function (e) {
      var a = e.target.closest('a.search-result');
      if (a) {
        var nId = a.getAttribute('data-note-id');
        if (nId) Store.activateNoteInSlot(nId, 0);
        input.value = ''; closeSearch();
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search')) closeSearch();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); input.focus(); input.select(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); input.select(); }
      if (e.key.toLowerCase() === 'n' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleNotesDock();
      }
    });
  }

  /* ---------------------------------------------------------------------- toast */
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-visible'); }, 2200);
  }

  /* ---------------------------------------------------------------------- init */
  function init() {
    root = document.getElementById('view');
    navEl = document.getElementById('nav');
    crumbsEl = document.getElementById('crumbs');
    dockEl = document.getElementById('notes-dock');

    buildNav();
    initTheme();
    initSearch();

    document.getElementById('menu-btn').addEventListener('click', openNav);
    document.getElementById('backdrop').addEventListener('click', closeNav);
    document.getElementById('notes-dock-toggle').addEventListener('click', function () { toggleNotesDock(); });
    navEl.addEventListener('click', function (e) { if (e.target.closest('a')) closeNav(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNav(); });

    // Anchors that re-click the current hash should still re-run the scroll logic.
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#/"]');
      if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); render(); }
    });

    window.addEventListener('hashchange', render);
    render();
  }

  return {
    init: init,
    rerender: rerender,
    refreshNav: refreshNav,
    refreshNotesBadges: refreshNotesBadges,
    toggleNotesDock: toggleNotesDock,
    openParallelNote: openParallelNote,
    toast: toast
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
