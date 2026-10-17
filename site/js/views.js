/* View functions. Each returns { title, crumbs, html, mount? } where mount(root) wires interactivity
   and may return a cleanup function. Views read content via DDIA and progress/notes via Store. */
var Views = (function () {
  'use strict';

  var esc = Markup.esc;
  var inline = Markup.inline;
  var paras = Markup.paras;
  var plural = Markup.plural;

  /* ---------------------------------------------------------------------- icons */
  function svg(body) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  var I = {
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
    book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    cards: svg('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>'),
    quiz: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
    list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    left: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
    right: svg('<path d="M5 12h14M12 5l7 7-7 7"/>'),
    shuffle: svg('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/>'),
    bulb: svg('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>'),
    alert: svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    flask: svg('<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    refresh: svg('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'),
    search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    trash: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    pin: svg('<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'),
    columns: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>'),
    download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    expand: svg('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>')
  };

  /* ---------------------------------------------------------------------- helpers */
  function partOf(n) {
    var parts = DDIA.book.parts;
    for (var i = 0; i < parts.length; i++) { if (parts[i].chapters.indexOf(n) !== -1) return parts[i]; }
    return null;
  }
  function roman(n) { return ['', 'I', 'II', 'III'][n] || String(n); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function chapterTitle(n) { var ch = DDIA.chapter(n); return ch ? ch.title : (DDIA.book.chapterTitles[n] || 'Chapter ' + n); }
  function chapterHref(n, tab, section) {
    return '#/chapter/' + n + (tab ? '/' + tab : '') + (section ? '/' + section : '');
  }
  function pct(x) { return Math.round(x * 100); }
  function statusClass(ch) {
    if (!ch) return '';
    if (Store.chapter(ch.number).complete) return 'is-done';
    return Store.chapterProgress(ch) > 0 ? 'is-partial' : '';
  }
  function partChip(part) {
    return '<span class="chip chip--p' + part.number + '">Part ' + roman(part.number) + ' · ' + esc(part.title) + '</span>';
  }
  function ring(p, label) {
    var r = 52, c = 2 * Math.PI * r;
    return '<div class="ring" role="img" aria-label="' + pct(p) + ' percent ' + esc(label) + '">' +
      '<svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="' + r + '"/>' +
      '<circle class="bar" cx="60" cy="60" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p)).toFixed(1) + '"/></svg>' +
      '<div class="ring__label"><b>' + pct(p) + '%</b><small>' + esc(label) + '</small></div></div>';
  }
  function progressBar(p, mod) {
    return '<div class="progress ' + (mod || '') + '"><span style="width:' + pct(p) + '%"></span></div>';
  }
  function calloutHtml(c) {
    var icon = c.kind === 'pitfall' ? I.alert : c.kind === 'example' ? I.flask : I.bulb;
    var label = c.kind === 'pitfall' ? 'Pitfall' : c.kind === 'example' ? 'Example' : 'Insight';
    return '<aside class="callout callout--' + esc(c.kind) + '">' + icon + '<div><div class="callout__kind">' + label + '</div>' + inline(c.text) + '</div></aside>';
  }
  function tableHtml(t) {
    return '<div class="table-wrap"><table><caption>' + inline(t.caption) + '</caption><thead><tr>' +
      t.columns.map(function (c) { return '<th scope="col">' + inline(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      t.rows.map(function (r) { return '<tr>' + r.map(function (cell) { return '<td>' + inline(cell) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  }
  function emptyChapter(n) {
    return '<div class="notice">The notes for Chapter ' + n + ' (' + esc(chapterTitle(n)) + ') did not load. Confirm that <code>js/content/ch' + pad(n) + '.js</code> exists and is referenced in <code>index.html</code>.</div>';
  }

  /* ---------------------------------------------------------------------- note editor helpers */
  function formatNoteTime(ts) {
    if (!ts) return '';
    var diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diff < 10) return 'Saved just now';
    if (diff < 60) return 'Saved ' + diff + 's ago';
    if (diff < 3600) return 'Saved ' + Math.floor(diff / 60) + 'm ago';
    var d = new Date(ts);
    return 'Saved ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function countWords(s) {
    var t = (s || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function renderNoteBodyHtml(text) {
    var raw = (text || '').trim();
    if (!raw) return '<p class="muted small">Nothing written yet. Switch to Write mode to add notes.</p>';
    var blocks = raw.split(/\n{2,}/);
    return blocks.map(function (block) {
      var lines = block.split('\n');
      var allBullets = lines.every(function (l) { return /^\s*[-*]\s+/.test(l); });
      if (allBullets) {
        return '<ul>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*[-*]\s+/, '')) + '</li>'; }).join('') + '</ul>';
      }
      return '<p>' + lines.map(function (l) { return inline(l); }).join('<br>') + '</p>';
    }).join('');
  }

  function chapterOptionsHtml(selectedChapter) {
    var sel = selectedChapter ? Number(selectedChapter) : null;
    var html = '<option value=""' + (!sel ? ' selected' : '') + '>General (all chapters)</option>';
    for (var i = 1; i <= 12; i++) {
      html += '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>Ch. ' + i + ' · ' + esc(chapterTitle(i)) + '</option>';
    }
    return html;
  }

  function noteEditorCardHtml(note, slotIdx, allNotes, opts) {
    opts = opts || {};
    if (!note) {
      return '<div class="card note-editor note-editor--empty" data-slot="' + slotIdx + '">' +
        '<div class="note-editor__empty-inner">' +
          '<span class="eyebrow">Parallel Slot ' + (slotIdx + 1) + '</span>' +
          '<h3>No note open in this slot</h3>' +
          '<p class="muted small">Create a fresh note or pick an existing note to edit side by side.</p>' +
          '<div class="row mt-2" style="justify-content:center">' +
            '<button type="button" class="btn btn--sm" data-slot-new="' + slotIdx + '">' + I.plus + ' Create note in Slot ' + (slotIdx + 1) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    var words = countWords(note.body);
    var selectOptions = allNotes.map(function (n) {
      var prefix = n.pinned ? '★ ' : '';
      var chTag = n.chapter ? '[Ch.' + n.chapter + '] ' : '';
      var label = prefix + chTag + (n.title.trim() || 'Untitled note');
      return '<option value="' + esc(n.id) + '"' + (n.id === note.id ? ' selected' : '') + '>' + esc(Markup.truncate(label, 48)) + '</option>';
    }).join('');

    return '<div class="card note-editor" data-note-card="' + esc(note.id) + '" data-slot="' + slotIdx + '">' +
      '<div class="note-editor__top">' +
        '<div class="note-editor__slot">' +
          '<span class="note-slot-pill">Slot ' + (slotIdx + 1) + '</span>' +
          '<select class="note-switcher" data-slot-select="' + slotIdx + '" aria-label="Switch note in slot ' + (slotIdx + 1) + '">' + selectOptions + '</select>' +
        '</div>' +
        '<div class="note-editor__actions">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-slot-new="' + slotIdx + '" title="New note in Slot ' + (slotIdx + 1) + '">' + I.plus + 'New</button>' +
          '<button type="button" class="icon-btn icon-btn--sm' + (note.pinned ? ' is-active' : '') + '" data-note-pin="' + esc(note.id) + '" aria-pressed="' + (!!note.pinned) + '" title="' + (note.pinned ? 'Unpin note' : 'Pin note to top') + '">' + I.pin + '</button>' +
          '<button type="button" class="icon-btn icon-btn--sm" data-note-delete="' + esc(note.id) + '" title="Delete note">' + I.trash + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="note-editor__context">' +
        '<select class="note-chapter-select" data-note-chapter="' + esc(note.id) + '" aria-label="Linked chapter">' +
          chapterOptionsHtml(note.chapter) +
        '</select>' +
        (note.chapter && note.sectionId
          ? '<a class="chip chip--link note-section-chip" href="' + chapterHref(note.chapter, 'notes', note.sectionId) + '" title="Jump to section">§ ' + esc(Markup.truncate(note.sectionTitle || note.sectionId, 28)) + '</a>'
          : (note.chapter ? '<a class="chip chip--link note-section-chip" href="' + chapterHref(note.chapter) + '">Go to Ch. ' + note.chapter + '</a>' : '')) +
        '<button type="button" class="btn btn--ghost btn--sm right" data-note-preview-toggle="' + esc(note.id) + '" aria-pressed="false">Preview</button>' +
      '</div>' +
      '<input type="text" class="note-title-input" data-note-title="' + esc(note.id) + '" value="' + esc(note.title) + '" placeholder="Note title (e.g., Leaderless quorum edge cases)…" aria-label="Note title">' +
      '<textarea class="note-body-input" data-note-body="' + esc(note.id) + '" placeholder="Write your note in parallel… Supports **bold**, `code`, and bullet lists (- item)." aria-label="Note body">' + esc(note.body) + '</textarea>' +
      '<div class="note-body-preview" data-note-preview-box="' + esc(note.id) + '" hidden>' + renderNoteBodyHtml(note.body) + '</div>' +
      '<div class="note-editor__foot">' +
        '<span data-note-words="' + esc(note.id) + '">' + plural(words, 'word') + '</span>' +
        '<span data-note-saved="' + esc(note.id) + '">' + esc(formatNoteTime(note.updatedAt)) + '</span>' +
      '</div>' +
    '</div>';
  }

  function wireNoteEditors(container, contextChapter, onRefresh) {
    container.addEventListener('input', function (e) {
      var t = e.target;
      if (!t) return;
      var noteId = t.getAttribute('data-note-title') || t.getAttribute('data-note-body');
      if (!noteId) return;
      if (t.hasAttribute('data-note-title')) {
        Store.updateNote(noteId, { title: t.value });
      } else {
        Store.updateNote(noteId, { body: t.value });
        var wEl = container.querySelector('[data-note-words="' + CSS.escape(noteId) + '"]');
        if (wEl) wEl.textContent = plural(countWords(t.value), 'word');
        var pBox = container.querySelector('[data-note-preview-box="' + CSS.escape(noteId) + '"]');
        if (pBox && !pBox.hidden) pBox.innerHTML = renderNoteBodyHtml(t.value);
      }
      var sEl = container.querySelector('[data-note-saved="' + CSS.escape(noteId) + '"]');
      if (sEl) sEl.textContent = 'Saved just now';
      // Update switcher option label live without full re-render
      var note = Store.getNote(noteId);
      if (note) {
        container.querySelectorAll('.note-switcher option[value="' + CSS.escape(noteId) + '"]').forEach(function (opt) {
          var prefix = note.pinned ? '★ ' : '';
          var chTag = note.chapter ? '[Ch.' + note.chapter + '] ' : '';
          opt.textContent = Markup.truncate(prefix + chTag + (note.title.trim() || 'Untitled note'), 48);
        });
      }
      if (window.App && App.refreshNotesBadges) App.refreshNotesBadges();
    });

    container.addEventListener('change', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.hasAttribute('data-slot-select')) {
        var slotIdx = Number(t.getAttribute('data-slot-select'));
        Store.activateNoteInSlot(t.value, slotIdx);
        if (onRefresh) onRefresh();
      } else if (t.hasAttribute('data-note-chapter')) {
        var id = t.getAttribute('data-note-chapter');
        Store.updateNote(id, { chapter: t.value ? Number(t.value) : null, sectionId: null, sectionTitle: null });
        if (window.App && App.refreshNotesBadges) App.refreshNotesBadges();
        if (onRefresh) onRefresh();
      }
    });

    container.addEventListener('click', function (e) {
      var btnNew = e.target.closest('[data-slot-new]');
      if (btnNew) {
        var slot = Number(btnNew.getAttribute('data-slot-new'));
        var created = Store.createNote({
          title: '',
          body: '',
          chapter: contextChapter ? contextChapter() : null,
          slotIndex: slot
        });
        if (window.App && App.refreshNotesBadges) App.refreshNotesBadges();
        if (onRefresh) onRefresh(created.id);
        return;
      }

      var btnPin = e.target.closest('[data-note-pin]');
      if (btnPin) {
        var pinId = btnPin.getAttribute('data-note-pin');
        var cur = Store.getNote(pinId);
        if (cur) {
          Store.updateNote(pinId, { pinned: !cur.pinned });
          if (onRefresh) onRefresh();
        }
        return;
      }

      var btnDel = e.target.closest('[data-note-delete]');
      if (btnDel) {
        var delId = btnDel.getAttribute('data-note-delete');
        var target = Store.getNote(delId);
        if (!target) return;
        var hasContent = (target.title && target.title.trim()) || (target.body && target.body.trim());
        if (!hasContent || confirm('Delete note "' + (target.title.trim() || 'Untitled note') + '"?')) {
          Store.deleteNote(delId);
          if (window.App && App.refreshNotesBadges) App.refreshNotesBadges();
          if (onRefresh) onRefresh();
          if (window.App && App.toast) App.toast('Note deleted');
        }
        return;
      }

      var btnPrev = e.target.closest('[data-note-preview-toggle]');
      if (btnPrev) {
        var pId = btnPrev.getAttribute('data-note-preview-toggle');
        var ta = container.querySelector('textarea[data-note-body="' + CSS.escape(pId) + '"]');
        var box = container.querySelector('[data-note-preview-box="' + CSS.escape(pId) + '"]');
        var noteObj = Store.getNote(pId);
        if (ta && box && noteObj) {
          var showingPreview = !box.hidden;
          if (showingPreview) {
            box.hidden = true;
            ta.hidden = false;
            btnPrev.setAttribute('aria-pressed', 'false');
            btnPrev.textContent = 'Preview';
          } else {
            box.innerHTML = renderNoteBodyHtml(noteObj.body);
            box.hidden = false;
            ta.hidden = true;
            btnPrev.setAttribute('aria-pressed', 'true');
            btnPrev.textContent = 'Write';
          }
        }
      }
    });
  }

  function exportNotesMarkdown() {
    var list = Store.notes();
    if (!list.length) {
      if (window.App && App.toast) App.toast('No notes to export yet');
      return;
    }
    var lines = ['# DDIA Personal Study Notes', '', 'Exported from DDIA Study Guide.', ''];
    list.forEach(function (n) {
      var title = (n.title || '').trim() || 'Untitled Note';
      var meta = [];
      if (n.chapter) meta.push('Chapter ' + n.chapter + ': ' + chapterTitle(n.chapter));
      if (n.sectionTitle) meta.push('Section: ' + n.sectionTitle);
      if (n.pinned) meta.push('Pinned');
      lines.push('## ' + title);
      if (meta.length) lines.push('*' + meta.join(' · ') + '*');
      lines.push('');
      lines.push((n.body || '').trim() || '_(empty)_');
      lines.push('');
      lines.push('---');
      lines.push('');
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ddia-study-notes.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (window.App && App.toast) App.toast('Exported ' + plural(list.length, 'note') + ' as Markdown');
  }

  /* ---------------------------------------------------------------------- home */
  function home() {
    var book = DDIA.book;
    var chapters = DDIA.chapters();
    var totalCards = 0, totalQuiz = 0, knownCards = 0, studied = 0;
    chapters.forEach(function (ch) {
      totalCards += ch.flashcards.length; totalQuiz += ch.quiz.length;
      knownCards += Store.cardsKnown(ch.number, ch.flashcards).known;
      if (Store.chapter(ch.number).complete) studied++;
    });
    var overall = Store.overallProgress(chapters);
    var userNotesCount = Store.notes().length;

    // Continue target: last visited chapter, else first unfinished.
    var last = Store.state.lastRoute || '';
    var m = /^#\/chapter\/(\d+)/.exec(last);
    var target = m ? Number(m[1]) : null;
    if (!target || !DDIA.chapter(target)) {
      target = 1;
      for (var i = 0; i < chapters.length; i++) { if (!Store.chapter(chapters[i].number).complete) { target = chapters[i].number; break; } }
    }
    var targetLabel = (m ? 'Continue' : 'Start') + ' · Chapter ' + target + ': ' + chapterTitle(target);

    var html = '' +
      '<section class="hero">' +
        '<div>' +
          '<div class="eyebrow">Study guide · ' + esc(book.publisher) + '</div>' +
          '<h1>' + esc(book.title) + '</h1>' +
          '<p class="lede">A chapter-by-chapter companion to ' + esc(book.author) + '\u2019s book: original notes that explain each idea, a parallel note-taking workspace, flashcards for recall, quizzes for self-testing, and a glossary. Progress is saved in this browser.</p>' +
          '<div class="actions">' +
            '<a class="btn" id="btn-continue" href="' + chapterHref(target) + '">' + esc(targetLabel) + ' ' + I.right + '</a>' +
            '<a class="btn btn--soft" id="btn-home-notes" href="#/notes">' + I.pen + ' My notes (' + userNotesCount + ')</a>' +
            '<a class="btn btn--ghost" id="btn-plan" href="#/plan">7-week study plan</a>' +
          '</div>' +
        '</div>' +
        '<div class="card hero__panel">' +
          ring(overall, 'complete') +
          '<div class="stats">' +
            '<div class="stat"><b>' + studied + '<span style="font-size:1rem;color:var(--ink-3)">/' + chapters.length + '</span></b><span>chapters studied</span></div>' +
            '<div class="stat"><b>' + knownCards + '<span style="font-size:1rem;color:var(--ink-3)">/' + totalCards + '</span></b><span>cards mastered</span></div>' +
            '<div class="stat"><b>' + totalQuiz + '</b><span>quiz questions</span></div>' +
            '<div class="stat"><b>' + DDIA.glossary().length + '</b><span>glossary terms</span></div>' +
          '</div>' +
        '</div>' +
      '</section>';

    book.parts.forEach(function (part) {
      html += '<section class="part" id="part-' + part.number + '" style="--part-color: var(--p' + part.number + ')">' +
        '<div class="part__head">' +
          '<div class="eyebrow eyebrow--p' + part.number + '">Part ' + roman(part.number) + '</div>' +
          '<h2>' + esc(part.title) + '</h2>' +
          '<p class="question">' + esc(part.question) + '</p>' +
          '<p>' + esc(part.summary) + '</p>' +
        '</div>' +
        '<div class="chapter-grid">';
      part.chapters.forEach(function (n) {
        var ch = DDIA.chapter(n);
        if (!ch) {
          html += '<div class="card chapter-card is-missing"><span class="num">' + pad(n) + '</span><h3>' + esc(chapterTitle(n)) + '</h3><p>Notes not loaded.</p></div>';
          return;
        }
        var p = Store.chapterProgress(ch);
        var done = Store.chapter(n).complete;
        html += '<a class="card card--hover chapter-card" id="chapter-card-' + n + '" href="' + chapterHref(n) + '">' +
          (done ? '<span class="chip chip--ok done-badge">' + I.check + ' Studied</span>' : '') +
          '<span class="num">' + pad(n) + '</span>' +
          '<h3>' + esc(ch.title) + '</h3>' +
          '<p>' + esc(ch.tagline) + '</p>' +
          '<div class="meta"><span>' + I.clock + esc(ch.studyMinutes) + ' min</span><span>' + I.cards + ch.flashcards.length + ' cards</span><span>' + I.quiz + ch.quiz.length + ' questions</span></div>' +
          progressBar(p, 'progress--thin progress--p' + part.number) +
        '</a>';
      });
      html += '</div></section>';
    });

    html += '<section class="howto"><div class="eyebrow">How to use this guide</div><h2 class="mt-2">A loop that works for each chapter</h2>' +
      '<div class="steps">' +
        '<div class="card step"><span class="n">STEP 1</span><b>Read & take parallel notes</b><p>Press <span class="kbd">N</span> or click <b>Add note</b> on any section to open the parallel notes pane right beside the chapter.</p></div>' +
        '<div class="card step"><span class="n">STEP 2</span><b>Drill the flashcards</b><p>Flip each card before you read the answer. Mark it <em>Got it</em> or <em>Still learning</em>; the deck remembers.</p></div>' +
        '<div class="card step"><span class="n">STEP 3</span><b>Take the quiz</b><p>Every question explains the right answer and why the distractors fail. Your best score is kept.</p></div>' +
        '<div class="card step"><span class="n">STEP 4</span><b>Write the review answers</b><p>Answer the open questions in your own words in the text boxes. Writing exposes the gaps that recognition hides.</p></div>' +
      '</div></section>' +
      '<div class="settings"><span>Progress, personal notes, quiz scores, and written answers are stored only in this browser\u2019s local storage.</span>' +
      '<button class="btn btn--ghost btn--sm" id="btn-reset" data-action="reset-progress">Reset all progress</button></div>';

    return { title: 'Home', crumbs: [], html: html, mount: function (root) {
      root.querySelector('#btn-reset').addEventListener('click', function () {
        if (confirm('Reset all progress, personal notes, quiz scores, flashcard marks, and written answers? This cannot be undone.')) {
          Store.resetAll();
          App.rerender();
          App.toast('Progress reset');
        }
      });
    } };
  }

  /* ---------------------------------------------------------------------- chapter shell */
  function chapterShell(ch, tab, inner) {
    var part = partOf(ch.number);
    var done = Store.chapter(ch.number).complete;
    var chNotesCount = Store.notesForChapter(ch.number).length;
    var tabs = [
      { id: 'notes', label: 'Notes', icon: I.book, count: ch.sections.length + ' sections' },
      { id: 'flashcards', label: 'Flashcards', icon: I.cards, count: ch.flashcards.length },
      { id: 'quiz', label: 'Quiz', icon: I.quiz, count: ch.quiz.length }
    ];
    return '' +
      '<header class="chapter-head">' +
        '<div class="crumbs">' + partChip(part) + '<span class="chip">Chapter ' + ch.number + '</span></div>' +
        '<h1>' + esc(ch.title) + '</h1>' +
        '<p class="tagline">' + esc(ch.tagline) + '</p>' +
        '<div class="row">' +
          '<div class="meta"><span>' + I.clock + ' ' + ch.studyMinutes + ' min study</span><span>' + I.list + ' ' + plural(ch.sections.length, 'section') + '</span><span>' + I.cards + ' ' + plural(ch.flashcards.length, 'card') + '</span><span>' + I.quiz + ' ' + plural(ch.quiz.length, 'question') + '</span></div>' +
          '<div class="row">' +
            '<button type="button" class="btn btn--soft btn--sm" id="chapter-open-notes" data-open-chapter-notes="' + ch.number + '">' + I.pen + ' Parallel notes (' + chNotesCount + ')</button>' +
            '<button class="btn btn--ghost btn--sm complete-toggle" id="toggle-complete" data-action="toggle-complete" aria-pressed="' + done + '"><span class="box">' + I.check + '</span>' + (done ? 'Studied' : 'Mark as studied') + '</button>' +
          '</div>' +
        '</div>' +
      '</header>' +
      '<nav class="tabs" aria-label="Chapter views">' + tabs.map(function (t) {
        return '<a id="tab-' + t.id + '" href="' + chapterHref(ch.number, t.id) + '"' + (t.id === tab ? ' aria-current="page"' : '') + '>' + t.icon + t.label + '<span class="count">' + t.count + '</span></a>';
      }).join('') + '</nav>' +
      inner;
  }
  function mountShell(root, ch) {
    var btn = root.querySelector('#toggle-complete');
    btn.addEventListener('click', function () {
      var now = !Store.chapter(ch.number).complete;
      Store.setComplete(ch.number, now);
      btn.setAttribute('aria-pressed', String(now));
      btn.lastChild.textContent = now ? 'Studied' : 'Mark as studied';
      App.refreshNav();
      App.toast(now ? 'Chapter ' + ch.number + ' marked as studied' : 'Chapter ' + ch.number + ' marked as not studied');
    });
    var noteBtn = root.querySelector('#chapter-open-notes');
    if (noteBtn) {
      noteBtn.addEventListener('click', function () {
        App.openParallelNote({ chapter: ch.number });
      });
    }
  }
  function pager(n) {
    var prev = DDIA.chapter(n - 1), next = DDIA.chapter(n + 1);
    return '<nav class="pager" aria-label="Chapter navigation">' +
      (prev ? '<a class="card card--hover prev" href="' + chapterHref(prev.number) + '"><span class="dir">\u2190 Previous</span><span class="ttl">' + prev.number + '. ' + esc(prev.title) + '</span></a>' : '<span></span>') +
      (next ? '<a class="card card--hover next" href="' + chapterHref(next.number) + '"><span class="dir">Next \u2192</span><span class="ttl">' + next.number + '. ' + esc(next.title) + '</span></a>' : '<span></span>') +
      '</nav>';
  }
  function crumbsFor(ch, tabLabel) {
    var part = partOf(ch.number);
    var c = [{ label: 'Part ' + roman(part.number), href: '#/#part-' + part.number }, { label: 'Ch. ' + ch.number + ' ' + ch.title, href: chapterHref(ch.number) }];
    if (tabLabel) c.push({ label: tabLabel });
    return c;
  }

  /* ---------------------------------------------------------------------- chapter notes */
  function chapter(n, sectionId) {
    var ch = DDIA.chapter(n);
    if (!ch) return { title: 'Chapter ' + n, crumbs: [], html: emptyChapter(n) };

    var toc = [{ id: 'overview', title: 'Overview' }, { id: 'big-ideas', title: 'Big ideas' }];
    var sectionsHtml = ch.sections.map(function (s) {
      toc.push({ id: 'sec-' + s.id, title: s.title });
      var secNotes = Store.notesForSection(n, s.id);
      var noteBtnLabel = secNotes.length ? plural(secNotes.length, 'note') : 'Add note';
      return '<section class="section" id="sec-' + esc(s.id) + '">' +
        '<div class="section__head">' +
          '<h2><a class="anchor" href="' + chapterHref(n, 'notes', s.id) + '">' + esc(s.title) + '</a></h2>' +
          '<button type="button" class="btn btn--ghost btn--sm section__note-btn' + (secNotes.length ? ' has-notes' : '') + '" data-section-note="' + esc(s.id) + '" data-section-title="' + esc(s.title) + '" title="Take a note in parallel for this section">' +
            I.pen + '<span>' + esc(noteBtnLabel) + '</span>' +
          '</button>' +
        '</div>' +
        paras(s.body) +
        (s.table ? tableHtml(s.table) : '') +
        '<ul class="keypoints">' + Markup.items(s.keyPoints) + '</ul>' +
        (s.callout ? calloutHtml(s.callout) : '') +
        (s.systems && s.systems.length ? '<div class="systems"><span class="lbl">Systems</span>' + s.systems.map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('') + '</div>' : '') +
        '</section>';
    }).join('');
    toc.push({ id: 'terms', title: 'Key terms' }, { id: 'pitfalls', title: 'Pitfalls' }, { id: 'connections', title: 'Connections' }, { id: 'review', title: 'Review questions' });

    var answers = Store.chapter(n).answers;
    var inner = '' +
      '<section class="block mt-3 section" id="overview"><h2>Overview</h2><div class="overview">' + paras(ch.overview) + '</div></section>' +
      '<section class="block section" id="big-ideas"><h2>Big ideas</h2><ol class="ideas">' + ch.bigIdeas.map(function (b) { return '<li><span>' + inline(b) + '</span></li>'; }).join('') + '</ol></section>' +
      '<div class="block">' + sectionsHtml + '</div>' +
      '<section class="block section" id="terms"><h2>Key terms</h2><dl class="terms">' + ch.terms.map(function (t) { return '<div><dt>' + esc(t.term) + '</dt><dd>' + inline(t.definition) + '</dd></div>'; }).join('') + '</dl></section>' +
      '<section class="block section" id="pitfalls"><h2>Pitfalls and misconceptions</h2><ul class="pitfalls">' + ch.pitfalls.map(function (p) { return '<li>' + I.alert + '<span>' + inline(p) + '</span></li>'; }).join('') + '</ul></section>' +
      '<section class="block section" id="connections"><h2>Connections to other chapters</h2><div class="connections">' + ch.connections.map(function (c) {
        return '<a class="card card--hover connection" href="' + chapterHref(c.chapter) + '"><div class="to">Chapter ' + c.chapter + '</div><b>' + esc(chapterTitle(c.chapter)) + '</b><p>' + inline(c.note) + '</p></a>';
      }).join('') + '</div></section>' +
      '<section class="block section" id="review"><div class="block__head"><h2>Review questions</h2><span class="meta">Your answers are saved as you type</span></div><ol class="review">' + ch.reviewQuestions.map(function (q, i) {
        return '<li class="card"><div class="q"><span>' + inline(q) + '</span></div><textarea class="answer" id="answer-' + n + '-' + i + '" data-answer="' + i + '" placeholder="Write your answer in your own words…" aria-label="Your answer to review question ' + (i + 1) + '">' + esc(answers[i] || '') + '</textarea></li>';
      }).join('') + '</ol></section>' +
      pager(n);

    var html = '<div class="chapter-layout"><article>' + chapterShell(ch, 'notes', inner) + '</article>' +
      '<aside class="toc" aria-label="On this page"><div class="toc__title">On this page</div><ol>' + toc.map(function (t) {
        return '<li><a href="' + chapterHref(n, 'notes', t.id.replace(/^sec-/, '')) + '" data-toc="' + t.id + '">' + esc(t.title) + '</a></li>';
      }).join('') + '</ol></aside></div>';

    return { title: 'Ch. ' + n + ' · ' + ch.title, crumbs: crumbsFor(ch), html: html, mount: function (root) {
      mountShell(root, ch);

      // Section-level parallel note trigger
      root.addEventListener('click', function (e) {
        var secBtn = e.target.closest('[data-section-note]');
        if (!secBtn) return;
        var sId = secBtn.getAttribute('data-section-note');
        var sTitle = secBtn.getAttribute('data-section-title');
        App.openParallelNote({ chapter: n, sectionId: sId, sectionTitle: sTitle });
      });

      // Persist review answers (debounced).
      var timer = null;
      root.addEventListener('input', function (e) {
        var ta = e.target.closest && e.target.closest('textarea[data-answer]');
        if (!ta) return;
        clearTimeout(timer);
        timer = setTimeout(function () { Store.setAnswer(n, Number(ta.getAttribute('data-answer')), ta.value); }, 300);
      });

      // Scroll spy for the TOC.
      var links = {};
      root.querySelectorAll('.toc a[data-toc]').forEach(function (a) { links[a.getAttribute('data-toc')] = a; });
      var targets = Array.prototype.slice.call(root.querySelectorAll('.section[id]'));
      var active = null;
      function setActive(id) {
        if (active === id) return;
        if (active && links[active]) links[active].classList.remove('is-active');
        active = id;
        if (links[id]) links[id].classList.add('is-active');
      }
      function onScroll() {
        var line = window.innerHeight * 0.3, best = null;
        for (var i = 0; i < targets.length; i++) {
          if (targets[i].getBoundingClientRect().top <= line) best = targets[i].id; else break;
        }
        setActive(best || (targets[0] && targets[0].id));
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      return function () { window.removeEventListener('scroll', onScroll); clearTimeout(timer); };
    } };
  }

  /* ---------------------------------------------------------------------- flashcards */
  function flashcards(n) {
    var ch = DDIA.chapter(n);
    if (!ch) return { title: 'Chapter ' + n, crumbs: [], html: emptyChapter(n) };

    var inner = '<div class="deck mt-4" id="deck"></div>';
    var html = '<article>' + chapterShell(ch, 'flashcards', inner) + '</article>';

    return { title: 'Ch. ' + n + ' · Flashcards', crumbs: crumbsFor(ch, 'Flashcards'), html: html, mount: function (root) {
      mountShell(root, ch);
      var deck = root.querySelector('#deck');
      var cards = ch.flashcards.map(function (c, i) { return { i: i, key: Markup.key(c.front), front: c.front, back: c.back }; });
      var state = { filter: 'all', shuffled: false, order: cards.map(function (c) { return c.i; }), pos: 0, flipped: false };

      function statusOf(c) { return Store.chapter(n).cards[c.key] || null; }
      function visible() {
        var list = state.order.map(function (i) { return cards[i]; });
        return state.filter === 'learning' ? list.filter(function (c) { return statusOf(c) !== 'known'; }) : list;
      }
      function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
        return arr;
      }

      function render() {
        var list = visible();
        var known = Store.cardsKnown(n, ch.flashcards);
        if (state.pos >= list.length) state.pos = Math.max(0, list.length - 1);
        var card = list[state.pos];
        var st = card ? statusOf(card) : null;

        var bar = '<div class="deck__bar">' +
          '<div class="left">' +
            '<div class="seg" role="group" aria-label="Filter cards">' +
              '<button type="button" data-filter="all" aria-pressed="' + (state.filter === 'all') + '">All (' + cards.length + ')</button>' +
              '<button type="button" data-filter="learning" aria-pressed="' + (state.filter === 'learning') + '">Still learning (' + (cards.length - known.known) + ')</button>' +
            '</div>' +
            '<button type="button" class="btn btn--ghost btn--sm" id="btn-shuffle" aria-pressed="' + state.shuffled + '">' + I.shuffle + (state.shuffled ? 'Shuffled' : 'Shuffle') + '</button>' +
          '</div>' +
          '<div class="row"><span class="deck__count">' + (list.length ? (state.pos + 1) + ' / ' + list.length : '0 / 0') + '</span>' +
          '<button type="button" class="btn btn--ghost btn--sm" id="btn-reset-cards" title="Forget all marks for this chapter">' + I.refresh + 'Reset</button></div>' +
          '</div>' +
          '<div class="mt-2">' + progressBar(known.total ? known.known / known.total : 0, 'progress--ok') + '<div class="small muted mt-2">' + known.known + ' of ' + known.total + ' cards marked as known</div></div>';

        if (!card) {
          deck.innerHTML = bar + '<div class="card deck__done mt-3"><h3>Every card is marked as known</h3><p class="muted">Switch the filter to <b>All</b> to review the full deck, or reset the marks to start over.</p>' +
            '<div class="row mt-3" style="justify-content:center"><button type="button" class="btn" data-filter="all">Review all cards</button><a class="btn btn--ghost" href="' + chapterHref(n, 'quiz') + '">Take the quiz ' + I.right + '</a></div></div>';
          wire();
          return;
        }

        deck.innerHTML = bar +
          '<div class="flashcard mt-3' + (state.flipped ? ' is-flipped' : '') + '" id="flashcard" tabindex="0" role="button" aria-pressed="' + state.flipped + '" aria-label="Flashcard: press to flip">' +
            '<div class="flashcard__inner">' +
              '<div class="flashcard__face flashcard__face--front"><div class="flashcard__label"><span>Question · ' + (card.i + 1) + '</span>' + statusLabel(st) + '</div><div class="flashcard__text">' + inline(card.front) + '</div><div class="flashcard__hint">Click or press Space to reveal</div></div>' +
              '<div class="flashcard__face flashcard__face--back" aria-hidden="' + !state.flipped + '"><div class="flashcard__label"><span>Answer</span>' + statusLabel(st) + '</div><div class="flashcard__text">' + inline(card.back) + '</div><div class="flashcard__hint">How well did you know this?</div></div>' +
            '</div>' +
          '</div>' +
          '<div class="deck__actions">' +
            '<button type="button" class="icon-btn nav-prev" id="btn-prev" aria-label="Previous card"' + (state.pos === 0 ? ' disabled' : '') + '>' + I.left + '</button>' +
            '<button type="button" class="btn btn--warn" id="btn-learning">Still learning</button>' +
            '<button type="button" class="btn btn--ok" id="btn-known">' + I.check + 'Got it</button>' +
            '<button type="button" class="icon-btn nav-next" id="btn-next" aria-label="Next card"' + (state.pos >= list.length - 1 ? ' disabled' : '') + '>' + I.right + '</button>' +
          '</div>' +
          '<div class="deck__keys"><span><span class="kbd">Space</span> flip</span><span><span class="kbd">\u2190</span><span class="kbd">\u2192</span> navigate</span><span><span class="kbd">1</span> still learning</span><span><span class="kbd">2</span> got it</span></div>';
        wire();
      }
      function statusLabel(st) {
        if (st === 'known') return '<span class="status" style="color:var(--ok)">Known</span>';
        if (st === 'learning') return '<span class="status" style="color:var(--warn)">Learning</span>';
        return '<span class="status">New</span>';
      }
      function go(delta) {
        var len = visible().length;
        var next = state.pos + delta;
        if (next < 0 || next >= len) return;
        state.pos = next; state.flipped = false; render();
      }
      function grade(status) {
        var list = visible();
        var card = list[state.pos];
        if (!card) return;
        Store.setCard(n, card.key, status);
        App.refreshNav();
        state.flipped = false;
        if (state.filter === 'learning' && status === 'known') {
          // card leaves the filtered list; keep position (next card slides in)
        } else if (state.pos < list.length - 1) {
          state.pos++;
        }
        render();
      }
      function wire() {
        deck.querySelectorAll('[data-filter]').forEach(function (b) {
          b.addEventListener('click', function () { state.filter = b.getAttribute('data-filter'); state.pos = 0; state.flipped = false; render(); });
        });
        var sh = deck.querySelector('#btn-shuffle');
        if (sh) sh.addEventListener('click', function () {
          state.shuffled = !state.shuffled;
          state.order = cards.map(function (c) { return c.i; });
          if (state.shuffled) shuffle(state.order);
          state.pos = 0; state.flipped = false; render();
        });
        var rs = deck.querySelector('#btn-reset-cards');
        if (rs) rs.addEventListener('click', function () {
          if (confirm('Forget all flashcard marks for this chapter?')) { Store.resetCards(n); App.refreshNav(); state.pos = 0; state.flipped = false; render(); }
        });
        var fc = deck.querySelector('#flashcard');
        if (fc) {
          fc.addEventListener('click', flip);
          fc.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); flip(); } });
        }
        var b;
        if ((b = deck.querySelector('#btn-prev'))) b.addEventListener('click', function () { go(-1); });
        if ((b = deck.querySelector('#btn-next'))) b.addEventListener('click', function () { go(1); });
        if ((b = deck.querySelector('#btn-learning'))) b.addEventListener('click', function () { grade('learning'); });
        if ((b = deck.querySelector('#btn-known'))) b.addEventListener('click', function () { grade('known'); });
      }
      function flip() {
        state.flipped = !state.flipped;
        var fc = deck.querySelector('#flashcard');
        if (!fc) return;
        fc.classList.toggle('is-flipped', state.flipped);
        fc.setAttribute('aria-pressed', String(state.flipped));
        var back = fc.querySelector('.flashcard__face--back');
        if (back) back.setAttribute('aria-hidden', String(!state.flipped));
      }
      function onKey(e) {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        switch (e.key) {
          case ' ': e.preventDefault(); flip(); break;
          case 'ArrowLeft': go(-1); break;
          case 'ArrowRight': go(1); break;
          case '1': grade('learning'); break;
          case '2': grade('known'); break;
        }
      }
      document.addEventListener('keydown', onKey);
      render();
      return function () { document.removeEventListener('keydown', onKey); };
    } };
  }

  /* ---------------------------------------------------------------------- quiz */
  function quiz(n) {
    var ch = DDIA.chapter(n);
    if (!ch) return { title: 'Chapter ' + n, crumbs: [], html: emptyChapter(n) };

    var html = '<article>' + chapterShell(ch, 'quiz', '<div class="quiz mt-4" id="quiz"></div>') + '</article>';
    var letters = ['A', 'B', 'C', 'D'];

    return { title: 'Ch. ' + n + ' · Quiz', crumbs: crumbsFor(ch, 'Quiz'), html: html, mount: function (root) {
      mountShell(root, ch);
      var box = root.querySelector('#quiz');
      var qs = ch.quiz;
      var state = { idx: 0, picked: [], done: false };

      function score() { return state.picked.filter(function (p, i) { return p === qs[i].answer; }).length; }

      function render() {
        var best = Store.chapter(n).quiz;
        if (state.done) return renderResult(best);
        var q = qs[state.idx];
        var picked = state.picked[state.idx];
        var answered = picked !== undefined;
        box.innerHTML =
          '<div class="quiz__bar"><span>Question <b>' + (state.idx + 1) + '</b> of ' + qs.length + '</span>' +
          '<span>Score so far: <b>' + score() + '</b>' + (best ? ' · Best: <b>' + best.best + '/' + best.total + '</b>' : '') + '</span></div>' +
          progressBar(state.idx / qs.length) +
          '<div class="card quiz__q mt-3">' +
            '<h3>' + inline(q.question) + '</h3>' +
            '<div class="choices" role="group" aria-label="Answer choices">' + q.choices.map(function (c, i) {
              var cls = 'choice';
              if (answered) {
                if (i === q.answer) cls += ' is-correct';
                else if (i === picked) cls += ' is-wrong';
                else cls += ' is-dim';
              }
              return '<button type="button" class="' + cls + '" data-choice="' + i + '"' + (answered ? ' disabled' : '') + '><span class="letter">' + letters[i] + '</span><span>' + inline(c) + '</span><span class="mark">' + (answered && i === q.answer ? I.check : answered && i === picked ? I.x : '') + '</span></button>';
            }).join('') + '</div>' +
            (answered ? '<div class="quiz__feedback ' + (picked === q.answer ? 'is-right' : 'is-wrong') + '" role="status"><div class="verdict">' + (picked === q.answer ? I.check + 'Correct' : I.x + 'Not quite — the answer is ' + letters[q.answer]) + '</div><p>' + inline(q.explanation) + '</p></div>' : '') +
            '<div class="quiz__foot"><span class="small muted">' + (answered ? '' : 'Pick one answer. Press ' + letters.map(function (l) { return '<span class="kbd">' + l + '</span>'; }).join(' ') + ' to answer.') + '</span>' +
            (answered ? '<button type="button" class="btn" id="btn-next-q">' + (state.idx === qs.length - 1 ? 'See results' : 'Next question') + ' ' + I.right + '</button>' : '') + '</div>' +
          '</div>';
        box.querySelectorAll('[data-choice]').forEach(function (b) { b.addEventListener('click', function () { pick(Number(b.getAttribute('data-choice'))); }); });
        var nx = box.querySelector('#btn-next-q');
        if (nx) { nx.addEventListener('click', next); nx.focus({ preventScroll: true }); }
      }
      function pick(i) {
        if (state.picked[state.idx] !== undefined) return;
        state.picked[state.idx] = i;
        render();
      }
      function next() {
        if (state.idx === qs.length - 1) {
          state.done = true;
          Store.recordQuiz(n, score(), qs.length);
          App.refreshNav();
        } else { state.idx++; }
        render();
      }
      function renderResult(best) {
        var s = score(), p = s / qs.length;
        var verdict = p === 1 ? 'Perfect. You own this chapter.' : p >= 0.8 ? 'Strong. Review the missed questions below and move on.' : p >= 0.5 ? 'Solid start. Re-read the sections behind the missed questions.' : 'Worth another pass through the notes before retaking.';
        var missed = qs.map(function (q, i) { return { q: q, i: i, picked: state.picked[i] }; }).filter(function (x) { return x.picked !== x.q.answer; });
        box.innerHTML =
          '<div class="card quiz__result">' +
            '<div class="eyebrow">Chapter ' + n + ' quiz</div>' +
            '<div class="score">' + s + '<small>/' + qs.length + '</small></div>' +
            '<p>' + esc(verdict) + (best ? ' Best score: ' + best.best + '/' + best.total + ' over ' + plural(best.attempts, 'attempt') + '.' : '') + '</p>' +
            '<div class="row mt-3" style="justify-content:center"><button type="button" class="btn" id="btn-retake">' + I.refresh + 'Retake quiz</button><a class="btn btn--ghost" href="' + chapterHref(n) + '">Back to notes</a>' + (DDIA.chapter(n + 1) ? '<a class="btn btn--ghost" href="' + chapterHref(n + 1) + '">Next chapter ' + I.right + '</a>' : '') + '</div>' +
            (missed.length ? '<div class="missed"><div class="eyebrow" style="text-align:left">Missed questions</div>' + missed.map(function (x) {
              return '<div class="card"><b>' + (x.i + 1) + '. ' + inline(x.q.question) + '</b><div class="a">You chose ' + letters[x.picked] + '. Correct: <em>' + letters[x.q.answer] + ' — ' + inline(x.q.choices[x.q.answer]) + '</em></div><div class="a mt-2">' + inline(x.q.explanation) + '</div></div>';
            }).join('') + '</div>' : '') +
          '</div>';
        box.querySelector('#btn-retake').addEventListener('click', function () { state = { idx: 0, picked: [], done: false }; render(); window.scrollTo({ top: 0 }); });
      }
      function onKey(e) {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (e.metaKey || e.ctrlKey || e.altKey || state.done) return;
        var k = e.key.toUpperCase();
        var i = letters.indexOf(k);
        if (i !== -1) { pick(i); return; }
        if ((e.key === 'Enter' || e.key === ' ') && state.picked[state.idx] !== undefined) { e.preventDefault(); next(); }
      }
      document.addEventListener('keydown', onKey);
      render();
      return function () { document.removeEventListener('keydown', onKey); };
    } };
  }

  /* ---------------------------------------------------------------------- personal notes workspace (#/notes) */
  function notes() {
    var html = '<div class="notes-page" id="notes-page">' +
      '<div class="notes-page__head">' +
        '<div>' +
          '<div class="eyebrow">Personal Notebook</div>' +
          '<h1 class="mt-2">My Notes · Parallel Workspace</h1>' +
          '<p class="lede muted mt-2">Draft, compare, and synthesize multiple study notes side by side. You can also press <span class="kbd">N</span> on any page to dock parallel notes right beside a chapter.</p>' +
        '</div>' +
        '<div class="notes-page__controls" id="notes-page-controls"></div>' +
      '</div>' +
      '<section class="notes-parallel-section mt-3" aria-label="Parallel note editors">' +
        '<div id="notes-parallel-workspace"></div>' +
      '</section>' +
      '<section class="notes-library mt-4" aria-label="All saved notes">' +
        '<div class="notes-library__bar">' +
          '<h2>All Saved Notes <span class="muted small" id="notes-library-count"></span></h2>' +
          '<div class="notes-library__filters">' +
            '<div class="glossary__search">' + I.search + '<input type="search" id="notes-filter-query" placeholder="Search your notes…" aria-label="Search your notes" autocomplete="off"></div>' +
            '<select class="note-chapter-select" id="notes-filter-chapter" aria-label="Filter notes by chapter">' +
              '<option value="all">All chapters</option>' +
              '<option value="general">General (no chapter)</option>' +
              [1,2,3,4,5,6,7,8,9,10,11,12].map(function (c) { return '<option value="' + c + '">Ch. ' + c + ' · ' + esc(chapterTitle(c)) + '</option>'; }).join('') +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="notes-library__grid mt-3" id="notes-library-grid"></div>' +
      '</section>' +
    '</div>';

    return {
      title: 'My Notes',
      crumbs: [{ label: 'My Notes' }],
      html: html,
      mount: function (root) {
        var pageEl = root.querySelector('#notes-page');
        var controlsEl = root.querySelector('#notes-page-controls');
        var workspaceEl = root.querySelector('#notes-parallel-workspace');
        var libGridEl = root.querySelector('#notes-library-grid');
        var libCountEl = root.querySelector('#notes-library-count');
        var queryInput = root.querySelector('#notes-filter-query');
        var chapSelect = root.querySelector('#notes-filter-chapter');

        // Ensure at least one note exists if user opens the workspace and wants to start writing immediately
        function renderControls() {
          var pane = Store.notesPane();
          var all = Store.notes();
          controlsEl.innerHTML =
            '<div class="row">' +
              '<button type="button" class="btn" id="notes-btn-create">' + I.plus + 'New note</button>' +
              '<button type="button" class="btn btn--soft" id="notes-btn-create-parallel">' + I.columns + 'New note in parallel</button>' +
              '<div class="seg" role="group" aria-label="Number of parallel editor columns">' +
                [1, 2, 3].map(function (cnt) {
                  return '<button type="button" data-set-slots="' + cnt + '" aria-pressed="' + (pane.slots === cnt) + '">' + cnt + (cnt === 1 ? ' column' : ' parallel') + '</button>';
                }).join('') +
              '</div>' +
              (all.length ? '<button type="button" class="btn btn--ghost" id="notes-btn-export">' + I.download + 'Export .md</button>' : '') +
            '</div>';
        }

        function renderWorkspace(focusNoteId) {
          var pane = Store.notesPane();
          var all = Store.notes();
          var slots = pane.slots || 2;
          var cols = [];
          for (var i = 0; i < slots; i++) {
            var noteId = pane.activeIds[i];
            var noteObj = noteId ? Store.getNote(noteId) : null;
            cols.push(noteEditorCardHtml(noteObj, i, all));
          }
          workspaceEl.innerHTML = '<div class="notes-parallel-grid notes-parallel-grid--' + slots + '">' + cols.join('') + '</div>';
          if (focusNoteId) {
            var input = workspaceEl.querySelector('input[data-note-title="' + CSS.escape(focusNoteId) + '"]');
            if (input) input.focus();
          }
        }

        function renderLibrary() {
          var all = Store.notes();
          var pane = Store.notesPane();
          var q = (queryInput.value || '').trim().toLowerCase();
          var chFilter = chapSelect.value;

          var filtered = all.filter(function (n) {
            if (chFilter === 'general' && n.chapter !== null) return false;
            if (chFilter !== 'all' && chFilter !== 'general' && Number(n.chapter) !== Number(chFilter)) return false;
            if (q && ((n.title || '') + ' ' + (n.body || '') + ' ' + (n.sectionTitle || '')).toLowerCase().indexOf(q) === -1) return false;
            return true;
          });

          libCountEl.textContent = '(' + filtered.length + ' of ' + all.length + ')';

          if (!filtered.length) {
            libGridEl.innerHTML = '<div class="card empty"><h3>' + (all.length ? 'No notes match your filter' : 'Your notebook is empty') + '</h3>' +
              '<p class="muted small mt-2">' + (all.length ? 'Try clearing the search box or switching the chapter filter.' : 'Click "New note" above or press N while reading any chapter to create notes in parallel.') + '</p></div>';
            return;
          }

          libGridEl.innerHTML = filtered.map(function (n) {
            var activeSlot = pane.activeIds.indexOf(n.id);
            var title = (n.title || '').trim() || 'Untitled note';
            var snippet = (n.body || '').trim() || 'No content yet…';
            return '<article class="card note-lib-card' + (activeSlot !== -1 ? ' is-open' : '') + '" data-lib-note="' + esc(n.id) + '">' +
              '<div class="note-lib-card__head">' +
                '<div class="chips">' +
                  (n.pinned ? '<span class="chip chip--warn">★ Pinned</span>' : '') +
                  (n.chapter ? '<a class="chip chip--link" href="' + chapterHref(n.chapter, 'notes', n.sectionId) + '">Ch. ' + n.chapter + (n.sectionTitle ? ' · ' + esc(Markup.truncate(n.sectionTitle, 22)) : '') + '</a>' : '<span class="chip">General</span>') +
                  (activeSlot !== -1 && activeSlot < pane.slots ? '<span class="chip chip--accent">Open in Slot ' + (activeSlot + 1) + '</span>' : '') +
                '</div>' +
                '<span class="small muted">' + esc(formatNoteTime(n.updatedAt)) + '</span>' +
              '</div>' +
              '<h3>' + Markup.highlight(esc(title), q) + '</h3>' +
              '<p class="note-lib-card__body">' + Markup.highlight(esc(Markup.truncate(snippet, 180)), q) + '</p>' +
              '<div class="note-lib-card__foot">' +
                '<button type="button" class="btn btn--ghost btn--sm" data-open-slot0="' + esc(n.id) + '">Open in Slot 1</button>' +
                '<button type="button" class="btn btn--soft btn--sm" data-open-parallel="' + esc(n.id) + '">' + I.columns + 'Open in parallel</button>' +
                '<button type="button" class="icon-btn icon-btn--sm right" data-note-delete="' + esc(n.id) + '" title="Delete note">' + I.trash + '</button>' +
              '</div>' +
            '</article>';
          }).join('');
        }

        function refreshAll(focusId) {
          renderControls();
          renderWorkspace(focusId);
          renderLibrary();
          if (window.App && App.refreshNotesBadges) App.refreshNotesBadges();
        }

        wireNoteEditors(workspaceEl, function () {
          var v = chapSelect.value;
          return v !== 'all' && v !== 'general' ? Number(v) : null;
        }, refreshAll);

        pageEl.addEventListener('click', function (e) {
          var setSlots = e.target.closest('[data-set-slots]');
          if (setSlots) {
            Store.setNotesPane({ slots: Number(setSlots.getAttribute('data-set-slots')) });
            refreshAll();
            return;
          }
          if (e.target.closest('#notes-btn-create')) {
            var chVal = chapSelect.value;
            var created = Store.createNote({
              chapter: chVal !== 'all' && chVal !== 'general' ? Number(chVal) : null,
              slotIndex: 0
            });
            refreshAll(created.id);
            return;
          }
          if (e.target.closest('#notes-btn-create-parallel')) {
            var pane = Store.notesPane();
            var nextSlots = Math.min(3, Math.max(2, (pane.activeIds.length || 0) + 1));
            Store.setNotesPane({ slots: nextSlots });
            var targetSlot = Math.min(nextSlots - 1, pane.activeIds.length);
            var chVal2 = chapSelect.value;
            var created2 = Store.createNote({
              chapter: chVal2 !== 'all' && chVal2 !== 'general' ? Number(chVal2) : null,
              slotIndex: targetSlot
            });
            refreshAll(created2.id);
            return;
          }
          if (e.target.closest('#notes-btn-export')) {
            exportNotesMarkdown();
            return;
          }
          var open0 = e.target.closest('[data-open-slot0]');
          if (open0) {
            Store.activateNoteInSlot(open0.getAttribute('data-open-slot0'), 0);
            refreshAll();
            workspaceEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
          }
          var openPar = e.target.closest('[data-open-parallel]');
          if (openPar) {
            var id = openPar.getAttribute('data-open-parallel');
            var p = Store.notesPane();
            var slotToUse = p.slots < 2 ? 1 : (p.activeIds.length >= p.slots ? p.slots - 1 : p.activeIds.length);
            if (p.slots < 2) Store.setNotesPane({ slots: 2 });
            Store.activateNoteInSlot(id, slotToUse);
            refreshAll();
            workspaceEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
          }
          var libDel = e.target.closest('.notes-library [data-note-delete]');
          if (libDel) {
            var delId = libDel.getAttribute('data-note-delete');
            var target = Store.getNote(delId);
            if (target && confirm('Delete note "' + (target.title.trim() || 'Untitled note') + '"?')) {
              Store.deleteNote(delId);
              refreshAll();
              if (window.App && App.toast) App.toast('Note deleted');
            }
          }
        });

        queryInput.addEventListener('input', renderLibrary);
        chapSelect.addEventListener('change', renderLibrary);

        refreshAll();
      }
    };
  }

  /* ---------------------------------------------------------------------- glossary */
  function glossary() {
    var entries = DDIA.glossary().slice().sort(function (a, b) { return a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }); });
    var html = '<div class="page--narrow"><div class="eyebrow">Reference</div><h1 class="mt-2">Glossary</h1>' +
      '<p class="lede muted mt-2">' + entries.length + ' terms, each linked to the chapters where the concept matters most.</p>' +
      '<div class="glossary__bar"><div class="glossary__search">' + I.search + '<input type="search" id="glossary-filter" placeholder="Filter terms and definitions…" aria-label="Filter glossary" autocomplete="off"></div><nav class="alpha" id="alpha" aria-label="Jump to letter"></nav></div>' +
      '<div id="glossary-list"></div></div>';

    return { title: 'Glossary', crumbs: [{ label: 'Glossary' }], html: html, mount: function (root) {
      var input = root.querySelector('#glossary-filter');
      var list = root.querySelector('#glossary-list');
      var alpha = root.querySelector('#alpha');

      function render(q) {
        q = (q || '').trim().toLowerCase();
        var shown = q ? entries.filter(function (e) { return (e.term + ' ' + e.definition).toLowerCase().indexOf(q) !== -1; }) : entries;
        var byLetter = {};
        shown.forEach(function (e) { var L = e.term[0].toUpperCase(); (byLetter[L] = byLetter[L] || []).push(e); });
        var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        alpha.innerHTML = letters.map(function (L) { return '<a href="#/glossary" data-letter="' + L + '" class="' + (byLetter[L] ? '' : 'is-empty') + '">' + L + '</a>'; }).join('');
        if (!shown.length) { list.innerHTML = '<div class="empty">No terms match “' + esc(q) + '”.</div>'; return; }
        list.innerHTML = Object.keys(byLetter).sort().map(function (L) {
          return '<h2 class="glossary__letter" id="letter-' + L + '">' + L + '</h2><dl class="gloss">' + byLetter[L].map(function (e) {
            return '<div class="card gloss__item"><dt>' + Markup.highlight(esc(e.term), q) + '</dt><div class="chips">' + e.chapters.map(function (c) {
              return '<a class="chip chip--link" href="' + chapterHref(c) + '" title="' + esc(chapterTitle(c)) + '">Ch. ' + c + '</a>';
            }).join('') + '</div><dd>' + Markup.highlight(inline(e.definition), q) + '</dd></div>';
          }).join('') + '</dl>';
        }).join('');
      }
      render('');
      input.addEventListener('input', function () { render(input.value); });
      alpha.addEventListener('click', function (e) {
        var a = e.target.closest('a[data-letter]');
        if (!a) return;
        e.preventDefault();
        var el = root.querySelector('#letter-' + a.getAttribute('data-letter'));
        if (el) el.scrollIntoView({ block: 'start' });
      });
      setTimeout(function () { if (window.innerWidth > 1023) input.focus(); }, 50);
    } };
  }

  /* ---------------------------------------------------------------------- themes */
  function themes() {
    var html = '<div class="page--narrow"><div class="eyebrow">Big picture</div><h1 class="mt-2">Themes that run through the book</h1>' +
      '<p class="lede muted mt-2">The chapters are a sequence, but the ideas form a web. Use these threads to connect what you learned in one chapter to the places it reappears.</p>' +
      '<div class="themes">' + DDIA.book.themes.map(function (t) {
        return '<section class="card theme" id="theme-' + esc(t.id) + '"><div class="theme__head"><h2>' + esc(t.title) + '</h2></div><p>' + esc(t.summary) + '</p><ul class="threads">' + t.threads.map(function (th) {
          return '<li><a href="' + chapterHref(th.chapter) + '" title="' + esc(chapterTitle(th.chapter)) + '">Ch. ' + th.chapter + '</a><span>' + esc(th.text) + '</span></li>';
        }).join('') + '</ul></section>';
      }).join('') + '</div></div>';
    return { title: 'Themes', crumbs: [{ label: 'Themes' }], html: html };
  }

  /* ---------------------------------------------------------------------- plan */
  function plan() {
    var html = '<div class="page--narrow"><div class="eyebrow">Pacing</div><h1 class="mt-2">A seven-week study plan</h1>' +
      '<p class="lede muted mt-2">About two to four hours per week. Dense chapters get a week of their own. Each week ends with the flashcards and quiz for its chapters, plus the review questions written out.</p>' +
      '<div class="plan">' + DDIA.book.plan.map(function (w) {
        return '<section class="card week" id="week-' + w.week + '"><div class="week__n">Week<b>' + w.week + '</b></div><div>' +
          '<h3>' + esc(w.title) + '</h3><p class="focus">' + esc(w.focus) + '</p>' +
          '<ul class="goals">' + w.goals.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>' +
          '<div class="chaps">' + w.chapters.map(function (c) {
            var ch = DDIA.chapter(c);
            return '<a href="' + chapterHref(c) + '"><span class="num">' + pad(c) + '</span>' + esc(chapterTitle(c)) + '<span class="status ' + statusClass(ch) + '"></span></a>';
          }).join('') + '</div>' +
          '</div></section>';
      }).join('') + '</div></div>';
    return { title: 'Study plan', crumbs: [{ label: 'Study plan' }], html: html };
  }

  function notFound(route) {
    return { title: 'Not found', crumbs: [], html: '<div class="page--narrow"><h1>Page not found</h1><p class="muted mt-2">No page matches <code>' + esc(route) + '</code>.</p><p class="mt-3"><a class="btn" href="#/">Back to home</a></p></div>' };
  }

  return {
    home: home, chapter: chapter, flashcards: flashcards, quiz: quiz, notes: notes, glossary: glossary, themes: themes, plan: plan, notFound: notFound,
    partOf: partOf, chapterTitle: chapterTitle, chapterHref: chapterHref, statusClass: statusClass, roman: roman, pad: pad, icons: I,
    noteEditorCardHtml: noteEditorCardHtml, wireNoteEditors: wireNoteEditors, exportNotesMarkdown: exportNotesMarkdown
  };
})();
