/* Text helpers: HTML escaping, the two inline markers allowed in content (**bold**, `code`), and small utilities. */
var Markup = (function () {
  'use strict';

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  /** Escape, then render `code` and **bold**. Content files may use only these two markers. */
  function inline(s) {
    var out = esc(s);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return out;
  }

  function paras(arr, cls) {
    return (arr || []).map(function (p) {
      return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + inline(p) + '</p>';
    }).join('');
  }

  function items(arr) {
    return (arr || []).map(function (p) { return '<li>' + inline(p) + '</li>'; }).join('');
  }

  /** Stable short key for a string (djb2); used to track flashcard mastery independent of card order. */
  function key(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(36);
  }

  /** Highlight a query inside already-escaped text. */
  function highlight(escapedText, query) {
    if (!query) return escapedText;
    var q = esc(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escapedText.replace(new RegExp('(' + q + ')', 'ig'), '<mark>$1</mark>');
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : (many || one + 's'));
  }

  return { esc: esc, inline: inline, paras: paras, items: items, key: key, highlight: highlight, truncate: truncate, plural: plural };
})();
