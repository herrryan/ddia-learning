/* Progress & personal notes store backed by localStorage. Single JSON document, saved on every mutation.
   Shape: {
     theme,
     lastRoute,
     chapters: { [n]: { complete, cards: {key: 'known'|'learning'}, quiz: {best,last,attempts,total}|null, answers: {i: text} } },
     userNotes: [ { id, title, body, chapter, sectionId, sectionTitle, pinned, createdAt, updatedAt } ],
     notesPane: { open, split, slots, activeIds: [], filterChapter }
   } */
var Store = (function () {
  'use strict';

  var KEY = 'ddia-study-guide.v1';

  var SEED_NOTES = [
    {
      id: 'note-seed-cots-discovery',
      title: 'COTS Optimization: Discovery Questions Checklist',
      body: [
        'Use these discovery questions to evaluate a Commercial Off-The-Shelf (COTS) system before proposing infrastructure changes.',
        '',
        '1. BASELINE LOAD PARAMETERS & TAIL LATENCY (Ch. 1)',
        '- What is the current ratio of database reads to writes at peak load?',
        '  -> If read queries exceed 80% of total traffic, prioritize read replicas and caching layers.',
        '- What are the p50, p95, and p99 response times across key workflows?',
        '  -> If p99 latency diverges sharply from p50, inspect the database for lock contention or slow queries.',
        '- How many concurrent database connections does the COTS application open at peak traffic?',
        '  -> If connection counts exceed CPU core limits, deploy a connection pooler to prevent context-switch overhead.',
        '- Do specific heavy requests block fast requests in the application queue?',
        '  -> If slow requests cause head-of-line blocking, isolate heavy workloads onto dedicated worker nodes.',
        '',
        '2. DATABASE ENGINE, SCHEMA & VENDOR SUPPORT (Ch. 3)',
        '- Does the vendor support agreement permit administrators to add secondary or covering indexes?',
        '  -> If the contract permits index additions, create covering indexes to serve frequent queries from memory.',
        '- Do vendor upgrade scripts drop custom indexes or materialized views during patch installations?',
        '  -> If upgrades overwrite custom objects, script index recreation as a mandatory post-upgrade step.',
        '- Can administrators enable the database slow-query log and inspect execution plans (EXPLAIN)?',
        '  -> If you can access execution plans, identify full table scans and unindexed filter columns first.',
        '- What is the total size of the active working set compared to available server RAM?',
        '  -> If the active working set fits in RAM, scale memory vertically to eliminate disk reads.',
        '- Does the database store data files and transaction logs on local NVMe drives or network storage?',
        '  -> If storage latency limits write throughput, migrate the database volumes to high-IOPS NVMe drives.',
        '',
        '3. REPLICATION LAG, TRANSACTIONS & PROXY ROUTING (Ch. 5 & Ch. 7)',
        '- Does the COTS application wrap read-only SELECT queries inside explicit BEGIN...COMMIT transactions?',
        '  -> If the application wraps reads in transactions, verify whether the proxy can route transactional reads to followers.',
        '- Does the application rely on session-level state such as temporary tables, prepared statements, or advisory locks?',
        '  -> If the application uses session variables, configure the proxy in session-pool mode instead of transaction-pool mode.',
        '- Does the application immediately read records that the same user just wrote?',
        '  -> If workflows require read-after-write consistency, configure the proxy to pin the user session to the leader briefly.',
        '- What maximum replication lag can downstream business workflows tolerate without data anomalies?',
        '  -> If replication lag exceeds tolerance thresholds, configure the proxy to route queries to synchronous or low-lag followers.',
        '',
        '4. REPORTING OFFLOAD & CHANGE DATA CAPTURE (Ch. 6 & Ch. 11)',
        '- Do business intelligence tools, batch exports, or audit reports query the primary database directly?',
        '  -> If reporting tools query the leader, redirect those report connections to a dedicated read replica immediately.',
        '- Can administrators enable row-level binary logs (binlog) or logical Write-Ahead Logs (WAL) on the primary database?',
        '  -> If the database supports logical replication logs, deploy Debezium to stream changes without application code modifications.',
        '- Do external systems poll the COTS database tables on a schedule to detect record updates?',
        '  -> If external integrations poll the database, replace scheduled poll queries with a CDC event stream.',
        '- Can custom search portals or dashboards read from a derived Elasticsearch or Redis view instead of the COTS database?',
        '  -> If external portals allow custom endpoints, populate a derived data store from the CDC log.',
        '',
        '5. HTTP EDGE CACHING, RATE LIMITING & ROLLBACK SAFETY (Ch. 1)',
        '- Which HTTP GET endpoints return static assets or public catalog data that changes infrequently?',
        '  -> If endpoints return shared read-only responses, cache those responses at an NGINX or CDN edge layer.',
        '- Does the COTS application authenticate users via cookies, JWT headers, or server-side sessions?',
        '  -> If responses depend on user identity, configure the reverse proxy to bypass the cache for authenticated headers.',
        '- Do traffic spikes or automated scrapers overwhelm the application web tier during peak hours?',
        '  -> If traffic bursts saturate the web tier, enforce rate limits and request queues at the API gateway.',
        '- Does a non-production staging environment exist to replay production traffic and test failback procedures?',
        '  -> If a staging environment exists, benchmark proxy routing and DNS failback before you cut over production traffic.'
      ].join('\n'),
      chapter: 1,
      sectionId: 'scalability',
      sectionTitle: 'Scalability',
      pinned: true,
      createdAt: 1759737600000,
      updatedAt: 1759737600000
    },
    {
      id: 'note-seed-cots-architecture',
      title: 'COTS Optimization: 4-Layer Architecture Strategy',
      body: [
        'When application source code cannot be modified, optimize performance at four external infrastructure layers:',
        '',
        'LAYER 1: DATABASE STORAGE & INDEX TUNING (Ch. 3)',
        '- Add secondary and covering indexes so the query planner reads index pages in memory instead of scanning full tables.',
        '- Scale server RAM so the active B-Tree working set stays in the OS page cache and database buffer pool.',
        '- Move Write-Ahead Logs (WAL) and data volumes onto local NVMe SSDs to reduce fsync latency.',
        '',
        'LAYER 2: TRANSPARENT DATABASE PROXIES (Ch. 5 & Ch. 7)',
        '- Deploy ProxySQL (MySQL) or PgBouncer / Pgpool-II (PostgreSQL) between the COTS application and the database.',
        '- Multiplex thousands of application connections over a small pool of backend database connections.',
        '- Route writes to the leader and split read-only SELECT queries across follower replicas.',
        '- Pin user sessions to the leader briefly after a write to preserve read-after-write consistency.',
        '',
        'LAYER 3: CHANGE DATA CAPTURE (CDC) & DERIVED VIEWS (Ch. 11)',
        '- Stream committed row changes from the database WAL or binlog via Debezium and Kafka.',
        '- Offload analytical queries, BI dashboards, and batch exports to a separate OLAP warehouse or read replica.',
        '- Populate Elasticsearch or Redis derived views for custom portals without querying the primary OLTP database.',
        '',
        'LAYER 4: HTTP EDGE CACHING & GATEWAY PROTECTION (Ch. 1 & Ch. 6)',
        '- Place NGINX, Varnish, or a CDN in front of the COTS web tier to cache public HTTP GET responses.',
        '- Apply rate limits and connection queues at the reverse proxy to prevent head-of-line blocking.',
        '- Use transparent sharding middleware (Vitess or Citus) if write throughput exceeds a single leader node.'
      ].join('\n'),
      chapter: 1,
      sectionId: 'scalability',
      sectionTitle: 'Scalability',
      pinned: true,
      createdAt: 1759737590000,
      updatedAt: 1759737590000
    }
  ];

  var state = load();

  function defaults() {
    return {
      theme: null,
      lastRoute: null,
      chapters: {},
      userNotes: [],
      seededNotes: [],
      notesPane: { open: false, split: false, slots: 2, activeIds: [], filterChapter: 'all' }
    };
  }

  function ensureShape(s) {
    if (!s || typeof s !== 'object') s = defaults();
    if (!s.chapters || typeof s.chapters !== 'object') s.chapters = {};
    if (!Array.isArray(s.userNotes)) s.userNotes = [];
    if (!Array.isArray(s.seededNotes)) s.seededNotes = [];
    SEED_NOTES.forEach(function (seed) {
      var exists = s.userNotes.some(function (n) { return n && n.id === seed.id; });
      if (!exists && s.seededNotes.indexOf(seed.id) === -1) {
        s.userNotes.push({
          id: seed.id,
          title: seed.title,
          body: seed.body,
          chapter: seed.chapter,
          sectionId: seed.sectionId,
          sectionTitle: seed.sectionTitle,
          pinned: seed.pinned,
          createdAt: seed.createdAt,
          updatedAt: seed.updatedAt
        });
        s.seededNotes.push(seed.id);
      } else if (exists && s.seededNotes.indexOf(seed.id) === -1) {
        s.seededNotes.push(seed.id);
      }
    });
    if (!s.notesPane || typeof s.notesPane !== 'object') {
      s.notesPane = { open: false, split: false, slots: 2, activeIds: [], filterChapter: 'all' };
    } else {
      s.notesPane.open = !!s.notesPane.open;
      s.notesPane.split = !!s.notesPane.split;
      s.notesPane.slots = [1, 2, 3].indexOf(s.notesPane.slots) !== -1 ? s.notesPane.slots : 2;
      if (!Array.isArray(s.notesPane.activeIds)) s.notesPane.activeIds = [];
      if (!s.notesPane.filterChapter) s.notesPane.filterChapter = 'all';
    }
    return s;
  }

  function load() {
    var s = null;
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') s = ensureShape(parsed);
    } catch (e) { /* corrupted or unavailable storage: start fresh */ }
    if (!s) s = ensureShape(defaults());
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    return s;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode or quota: ignore */ }
  }

  function chapter(n) {
    var c = state.chapters[n];
    if (!c) { c = state.chapters[n] = { complete: false, cards: {}, quiz: null, answers: {} }; }
    if (!c.cards) c.cards = {};
    if (!c.answers) c.answers = {};
    return c;
  }

  /** Fraction of a chapter's flashcards marked as known. */
  function cardsKnown(n, cards) {
    if (!cards || !cards.length) return { known: 0, total: 0 };
    var st = chapter(n).cards;
    var known = 0;
    cards.forEach(function (card) { if (st[Markup.key(card.front)] === 'known') known++; });
    return { known: known, total: cards.length };
  }

  /** Weighted chapter progress in [0,1]: notes 40%, flashcards 30%, quiz 30%. */
  function chapterProgress(ch) {
    if (!ch) return 0;
    var c = chapter(ch.number);
    var notes = c.complete ? 1 : 0;
    var k = cardsKnown(ch.number, ch.flashcards);
    var cards = k.total ? k.known / k.total : 0;
    var quiz = c.quiz && c.quiz.total ? c.quiz.best / c.quiz.total : 0;
    return Math.min(1, notes * 0.4 + cards * 0.3 + quiz * 0.3);
  }

  function overallProgress(chapters) {
    if (!chapters.length) return 0;
    var sum = 0;
    chapters.forEach(function (ch) { sum += chapterProgress(ch); });
    return sum / chapters.length;
  }

  /* ---------------------------------------------------------------------- user notes */
  function sortNotes(list) {
    return list.slice().sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function notes() {
    return sortNotes(state.userNotes);
  }

  function notesForChapter(n) {
    var num = Number(n);
    return sortNotes(state.userNotes.filter(function (note) { return Number(note.chapter) === num; }));
  }

  function notesForSection(n, sectionId) {
    var num = Number(n);
    return sortNotes(state.userNotes.filter(function (note) {
      return Number(note.chapter) === num && note.sectionId === sectionId;
    }));
  }

  function getNote(id) {
    for (var i = 0; i < state.userNotes.length; i++) {
      if (state.userNotes[i].id === id) return state.userNotes[i];
    }
    return null;
  }

  function cleanActiveIds() {
    var valid = state.notesPane.activeIds.filter(function (id) { return !!getNote(id); });
    var seen = {};
    valid = valid.filter(function (id) {
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    });
    if (!valid.length && state.userNotes.length) {
      var sorted = notes();
      for (var i = 0; i < Math.min(sorted.length, 3); i++) valid.push(sorted[i].id);
    }
    state.notesPane.activeIds = valid;
    return valid;
  }

  function createNote(opts) {
    opts = opts || {};
    var now = Date.now();
    var id = 'note-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    var ch = opts.chapter !== undefined && opts.chapter !== null && opts.chapter !== '' ? Number(opts.chapter) : null;
    var note = {
      id: id,
      title: typeof opts.title === 'string' ? opts.title : '',
      body: typeof opts.body === 'string' ? opts.body : '',
      chapter: ch && !isNaN(ch) ? ch : null,
      sectionId: opts.sectionId || null,
      sectionTitle: opts.sectionTitle || null,
      pinned: !!opts.pinned,
      createdAt: now,
      updatedAt: now
    };
    state.userNotes.unshift(note);
    var slotIndex = typeof opts.slotIndex === 'number' ? opts.slotIndex : 0;
    cleanActiveIds();
    if (slotIndex > 0) {
      state.notesPane.activeIds[slotIndex] = note.id;
    } else {
      state.notesPane.activeIds = [note.id].concat(state.notesPane.activeIds.filter(function (x) { return x !== note.id; })).slice(0, 3);
    }
    save();
    return note;
  }

  function updateNote(id, patch) {
    var note = getNote(id);
    if (!note || !patch) return null;
    if (patch.title !== undefined) note.title = String(patch.title);
    if (patch.body !== undefined) note.body = String(patch.body);
    if (patch.chapter !== undefined) {
      var ch = patch.chapter !== null && patch.chapter !== '' ? Number(patch.chapter) : null;
      note.chapter = ch && !isNaN(ch) ? ch : null;
      if (patch.sectionId === undefined && note.chapter !== ch) {
        note.sectionId = null;
        note.sectionTitle = null;
      }
    }
    if (patch.sectionId !== undefined) note.sectionId = patch.sectionId || null;
    if (patch.sectionTitle !== undefined) note.sectionTitle = patch.sectionTitle || null;
    if (patch.pinned !== undefined) note.pinned = !!patch.pinned;
    note.updatedAt = Date.now();
    save();
    return note;
  }

  function deleteNote(id) {
    state.userNotes = state.userNotes.filter(function (n) { return n.id !== id; });
    state.notesPane.activeIds = state.notesPane.activeIds.filter(function (x) { return x !== id; });
    cleanActiveIds();
    save();
  }

  function setNotesPane(patch) {
    if (!patch) return state.notesPane;
    if (patch.open !== undefined) state.notesPane.open = !!patch.open;
    if (patch.split !== undefined) state.notesPane.split = !!patch.split;
    if (patch.slots !== undefined && [1, 2, 3].indexOf(Number(patch.slots)) !== -1) state.notesPane.slots = Number(patch.slots);
    if (patch.filterChapter !== undefined) state.notesPane.filterChapter = String(patch.filterChapter);
    if (Array.isArray(patch.activeIds)) state.notesPane.activeIds = patch.activeIds.slice(0, 3);
    cleanActiveIds();
    save();
    return state.notesPane;
  }

  function activateNoteInSlot(id, slotIndex) {
    if (!getNote(id)) return;
    cleanActiveIds();
    var ids = state.notesPane.activeIds.slice();
    var existingIdx = ids.indexOf(id);
    if (typeof slotIndex === 'number' && slotIndex >= 0) {
      if (existingIdx !== -1 && existingIdx !== slotIndex) {
        ids[existingIdx] = ids[slotIndex] || null;
      }
      ids[slotIndex] = id;
    } else {
      ids = [id].concat(ids.filter(function (x) { return x !== id; }));
    }
    state.notesPane.activeIds = ids.filter(Boolean).slice(0, 3);
    save();
  }

  return {
    get state() { return state; },
    chapter: chapter,
    cardsKnown: cardsKnown,
    chapterProgress: chapterProgress,
    overallProgress: overallProgress,

    setComplete: function (n, v) { chapter(n).complete = !!v; save(); },
    setCard: function (n, key, status) { chapter(n).cards[key] = status; save(); },
    resetCards: function (n) { chapter(n).cards = {}; save(); },
    recordQuiz: function (n, score, total) {
      var q = chapter(n).quiz || { best: 0, last: 0, attempts: 0, total: total };
      q.attempts += 1; q.last = score; q.total = total; q.best = Math.max(q.best, score);
      chapter(n).quiz = q; save();
    },
    setAnswer: function (n, i, text) { chapter(n).answers[i] = text; save(); },
    setTheme: function (t) { state.theme = t; save(); },
    setLastRoute: function (r) { state.lastRoute = r; save(); },
    resetAll: function () { state = ensureShape(defaults()); save(); },

    notes: notes,
    notesForChapter: notesForChapter,
    notesForSection: notesForSection,
    getNote: getNote,
    createNote: createNote,
    updateNote: updateNote,
    deleteNote: deleteNote,
    notesPane: function () { cleanActiveIds(); return state.notesPane; },
    setNotesPane: setNotesPane,
    activateNoteInSlot: activateNoteInSlot
  };
})();
