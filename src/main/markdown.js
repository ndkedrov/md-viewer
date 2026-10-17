'use strict';

// Markdown → HTML. Runs in the main process so the renderer stays sandboxed
// and never needs Node access.

const MarkdownIt = require('markdown-it');
const anchorPkg = require('markdown-it-anchor');
const taskLists = require('markdown-it-task-lists');
const footnote = require('markdown-it-footnote');
const { full: emoji } = require('markdown-it-emoji');
const hljs = require('highlight.js');

const anchor = anchorPkg.default || anchorPkg;

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Keeps Cyrillic and other letters readable in heading ids.
function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function highlight(code, lang) {
  const name = (lang || '').trim().split(/\s+/)[0].toLowerCase();
  if (name === 'mermaid') {
    return `<pre class="mermaid-src">${escapeHtml(code)}</pre>`;
  }
  let body;
  if (name && hljs.getLanguage(name)) {
    body = hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
  } else {
    body = escapeHtml(code);
  }
  return `<pre class="code-block" data-lang="${escapeHtml(name)}"><code class="hljs">${body}</code></pre>`;
}

const md = new MarkdownIt({ html: true, linkify: true, typographer: true, highlight })
  .use(anchor, {
    slugify,
    level: [1, 2, 3, 4, 5, 6],
    permalink: anchor.permalink.linkInsideHeader({
      symbol: '#',
      placement: 'before',
      class: 'heading-anchor',
      ariaHidden: true,
    }),
  })
  .use(taskLists, { enabled: false, label: true })
  .use(footnote)
  .use(emoji);

// Wide tables scroll inside their own box instead of stretching the page.
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';

// Plain "key: value" front matter is shown as a small card above the document.
function splitFrontMatter(src) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { meta: null, body: src };
  const meta = [];
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w.-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) meta.push([kv[1], kv[2].replace(/^["']|["']$/g, '')]);
  }
  return { meta: meta.length ? meta : null, body: src.slice(m[0].length) };
}

function countWords(text) {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~\[\]()!|-]/g, ' ');
  const words = plain.match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu);
  return words ? words.length : 0;
}

function render(src) {
  const { meta, body } = splitFrontMatter(src);
  let html = md.render(body);
  if (meta) {
    const rows = meta
      .map(([k, v]) => `<div class="fm-row"><span class="fm-key">${escapeHtml(k)}</span><span class="fm-val">${escapeHtml(v)}</span></div>`)
      .join('');
    html = `<div class="front-matter">${rows}</div>` + html;
  }
  const words = countWords(body);
  return { html, words, minutes: Math.max(1, Math.round(words / 220)) };
}

module.exports = { render };
