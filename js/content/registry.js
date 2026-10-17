/* Content registry. Chapter and glossary files call DDIA.registerChapter / DDIA.registerGlossary.
   Loaded before any content file. */
(function (global) {
  'use strict';

  var chapters = {};
  var glossary = [];

  var DDIA = global.DDIA || {};

  DDIA.registerChapter = function (chapter) {
    if (!chapter || typeof chapter.number !== 'number') {
      throw new Error('registerChapter: chapter.number is required');
    }
    chapters[chapter.number] = chapter;
  };

  DDIA.registerGlossary = function (entries) {
    glossary = Array.isArray(entries) ? entries.slice() : [];
  };

  /** All registered chapters sorted by number. */
  DDIA.chapters = function () {
    return Object.keys(chapters)
      .map(Number)
      .sort(function (a, b) { return a - b; })
      .map(function (n) { return chapters[n]; });
  };

  DDIA.chapter = function (n) { return chapters[n] || null; };
  DDIA.glossary = function () { return glossary; };

  /* book.js fills this with parts, themes, plan, and fallback chapter titles. */
  DDIA.book = DDIA.book || {};

  global.DDIA = DDIA;
})(window);
