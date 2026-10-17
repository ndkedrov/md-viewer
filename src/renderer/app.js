'use strict';

/* global I18N, mermaid */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ZOOMS = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2];
const MAX_RECENT = 12;
const GITHUB = 'https://github.com/ndkedrov/md-viewer';

const S = {
  tabs: [],
  active: null,
  closed: [],
  recent: [],
  lang: 'en',
  langPref: 'auto',
  locale: 'en',
  themePref: 'system',
  theme: 'dark',
  zoom: 1,
  width: 'normal',
  outline: true,
};

let nextId = 1;
let mermaidLoad = null;
let mermaidSeq = 0;

// ---------- i18n ----------

function t(key, ...args) {
  const v = (I18N[S.lang] && I18N[S.lang][key]) ?? I18N.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

function applyI18n() {
  document.documentElement.lang = S.lang;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  $$('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}

function resolveLang() {
  S.lang = S.langPref === 'auto' ? (S.locale.toLowerCase().startsWith('uk') ? 'uk' : 'en') : S.langPref;
}

// ---------- helpers ----------

const ICON = {
  doc: '<svg viewBox="0 0 16 16"><path d="M4 1.75h5.2L12.5 5v8.25a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1Z"/><path d="M9 1.9V5.3h3.3"/><path d="M5.3 11V8.2l1.35 1.5L8 8.2V11M9.6 9.6l1.05 1.15 1.05-1.15M10.65 10.7V8.2"/></svg>',
  close: '<svg viewBox="0 0 16 16"><path d="m4.75 4.75 6.5 6.5m0-6.5-6.5 6.5"/></svg>',
  copy: '<svg viewBox="0 0 16 16"><rect x="5.25" y="5.25" width="8" height="8" rx="1.6"/><path d="M10.75 5.25V3.6a1.35 1.35 0 0 0-1.35-1.35H3.6A1.35 1.35 0 0 0 2.25 3.6v5.8c0 .75.6 1.35 1.35 1.35h1.65"/></svg>',
  check: '<svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3.5 2.8 19.5h18.4L12 3.5Z"/><path d="M12 10v4.2M12 17.2v.1"/></svg>',
};

const ALERTS = {
  note: { en: 'Note', uk: 'Примітка', icon: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.25"/><path d="M8 7.2v4M8 4.8v.1"/></svg>' },
  tip: { en: 'Tip', uk: 'Порада', icon: '<svg viewBox="0 0 16 16"><path d="M5.8 11.5h4.4M6.4 13.75h3.2M8 1.75a4.25 4.25 0 0 0-2.5 7.7c.4.3.6.7.6 1.2v.85h3.8v-.85c0-.5.2-.9.6-1.2A4.25 4.25 0 0 0 8 1.75Z"/></svg>' },
  important: { en: 'Important', uk: 'Важливо', icon: '<svg viewBox="0 0 16 16"><path d="M2.25 3.4c0-.65.5-1.15 1.15-1.15h9.2c.65 0 1.15.5 1.15 1.15v6.7c0 .65-.5 1.15-1.15 1.15H7.4l-3 2.5v-2.5h-1c-.65 0-1.15-.5-1.15-1.15Z"/><path d="M8 4.8v2.9M8 9.3v.1"/></svg>' },
  warning: { en: 'Warning', uk: 'Попередження', icon: '<svg viewBox="0 0 16 16"><path d="M8 2.2 1.75 13.25h12.5L8 2.2Z"/><path d="M8 6.6v3.2M8 11.6v.1"/></svg>' },
  caution: { en: 'Caution', uk: 'Обережно', icon: '<svg viewBox="0 0 16 16"><path d="M5.4 1.75h5.2l3.65 3.65v5.2l-3.65 3.65H5.4L1.75 10.6V5.4Z"/><path d="M8 4.9v3.6M8 10.7v.1"/></svg>' },
};

function baseName(p) {
  return p.split(/[\\/]/).pop();
}

function parentName(p) {
  const parts = p.split(/[\\/]/);
  return parts.length > 1 ? parts[parts.length - 2] : '';
}

function activeTab() {
  return S.tabs.find((x) => x.id === S.active) || null;
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function saveSession() {
  api.setSetting('session', {
    files: S.tabs.map((x) => x.path),
    active: activeTab() ? activeTab().path : null,
  });
}

function addRecent(p) {
  S.recent = [p, ...S.recent.filter((x) => x.toLowerCase() !== p.toLowerCase())].slice(0, MAX_RECENT);
  api.setSetting('recent', S.recent);
}

// ---------- opening & closing ----------

async function openFiles(paths, { activate = true } = {}) {
  let last = null;
  for (const p of paths) last = openFile(p, false) || last;
  if (activate && last) activateTab(last.id);
  renderTabs();
  saveSession();
}

function openFile(p, activate = true) {
  const existing = S.tabs.find((x) => x.path.toLowerCase() === p.toLowerCase());
  if (existing) {
    if (activate) activateTab(existing.id);
    return existing;
  }
  const tab = {
    id: nextId++,
    path: p,
    name: baseName(p),
    pane: document.createElement('div'),
    article: document.createElement('article'),
    data: null,
    scroll: 0,
    unseen: false,
  };
  tab.pane.className = 'pane';
  tab.pane.hidden = true;
  tab.article.className = 'doc';
  tab.pane.appendChild(tab.article);
  tab.pane.addEventListener('click', (e) => onDocClick(e, tab));
  tab.pane.addEventListener('scroll', () => onPaneScroll(tab), { passive: true });
  $('#viewer').appendChild(tab.pane);
  S.tabs.push(tab);
  addRecent(p);
  loadTab(tab);
  if (activate) activateTab(tab.id);
  return tab;
}

async function loadTab(tab, { fromWatch = false } = {}) {
  const data = await api.load(tab.path);
  if (!S.tabs.includes(tab)) return;
  const keep = tab.pane.scrollTop;
  tab.data = data;
  if (data.ok) renderDoc(tab, data);
  else renderError(tab, data);
  if (fromWatch) {
    tab.pane.scrollTop = keep;
    if (tab.id !== S.active) tab.unseen = true;
    else flashUpdated();
  }
  renderTabs();
  if (tab.id === S.active) {
    updateStatus();
    buildOutline();
    if (!$('#findbar').hidden) findRun($('#find-input').value, true);
  }
}

function closeTab(id) {
  const i = S.tabs.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [tab] = S.tabs.splice(i, 1);
  tab.pane.remove();
  api.unwatch(tab.path);
  S.closed.push(tab.path);
  if (S.closed.length > 30) S.closed.shift();
  if (S.active === id) {
    const next = S.tabs[i] || S.tabs[i - 1];
    S.active = null;
    if (next) activateTab(next.id);
    else showWelcome();
  }
  renderTabs();
  saveSession();
}

function closeMany(ids) {
  ids.forEach((id) => closeTab(id));
}

function reopenClosed() {
  const p = S.closed.pop();
  if (p) openFiles([p]);
}

function activateTab(id) {
  const prev = activeTab();
  if (prev && prev.id !== id) {
    prev.scroll = prev.pane.scrollTop;
    prev.pane.hidden = true;
  }
  const tab = S.tabs.find((x) => x.id === id);
  if (!tab) return;
  S.active = id;
  tab.unseen = false;
  $('#welcome').hidden = true;
  document.body.classList.remove('empty');
  tab.pane.hidden = false;
  tab.pane.scrollTop = tab.scroll;
  document.title = `${tab.name} — MD Viewer`;
  renderTabs();
  updateStatus();
  buildOutline();
  if (!$('#findbar').hidden) findRun($('#find-input').value);
  saveSession();
}

function showWelcome() {
  document.body.classList.add('empty');
  $('#welcome').hidden = false;
  document.title = 'MD Viewer';
  renderRecent();
  updateStatus();
  buildOutline();
  closeFind();
}

function cycleTab(dir) {
  if (S.tabs.length < 2) return;
  const i = S.tabs.findIndex((x) => x.id === S.active);
  const n = S.tabs[(i + dir + S.tabs.length) % S.tabs.length];
  activateTab(n.id);
}

// ---------- tab strip ----------

let dragId = null;

function renderTabs() {
  const strip = $('#tabs');
  const counts = {};
  S.tabs.forEach((x) => { const k = x.name.toLowerCase(); counts[k] = (counts[k] || 0) + 1; });

  strip.replaceChildren(...S.tabs.map((tab) => {
    const el = document.createElement('div');
    el.className = 'tab';
    el.dataset.id = tab.id;
    el.draggable = true;
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', String(tab.id === S.active));
    el.title = tab.path;
    if (tab.id === S.active) el.classList.add('active');
    if (tab.unseen) el.classList.add('unseen');
    if (tab.data && !tab.data.ok) el.classList.add('error');
    if (!tab.data) el.classList.add('loading');

    const hint = counts[tab.name.toLowerCase()] > 1 ? `<span class="tab-hint">${escapeText(parentName(tab.path))}</span>` : '';
    el.innerHTML = `<span class="tab-icon">${ICON.doc}</span>`
      + `<span class="tab-label"><span class="tab-name">${escapeText(tab.name)}</span>${hint}</span>`
      + '<span class="tab-dot"></span>'
      + `<button class="tab-close" title="${escapeText(t('closeTab'))}" tabindex="-1">${ICON.close}</button>`;

    el.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !e.target.closest('.tab-close')) activateTab(tab.id);
      if (e.button === 1) e.preventDefault();
    });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(tab.id); });
    el.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.id); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); tabMenu(tab); });

    el.addEventListener('dragstart', (e) => {
      dragId = tab.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-mdviewer-tab', String(tab.id));
      requestAnimationFrame(() => el.classList.add('dragging'));
    });
    el.addEventListener('dragend', () => {
      dragId = null;
      $$('.tab').forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after'));
    });
    el.addEventListener('dragover', (e) => {
      if (dragId === null || dragId === tab.id) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      el.classList.toggle('drop-after', after);
      el.classList.toggle('drop-before', !after);
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', (e) => {
      if (dragId === null) return;
      e.preventDefault();
      e.stopPropagation();
      const after = el.classList.contains('drop-after');
      const from = S.tabs.findIndex((x) => x.id === dragId);
      const [moved] = S.tabs.splice(from, 1);
      let to = S.tabs.findIndex((x) => x.id === tab.id);
      if (after) to += 1;
      S.tabs.splice(to, 0, moved);
      dragId = null;
      renderTabs();
      saveSession();
    });
    return el;
  }));

  const act = strip.querySelector('.tab.active');
  if (act) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- document rendering ----------

function sanitize(root) {
  root.querySelectorAll('script, style, iframe, object, embed, frame, frameset, base, meta, link, form, applet').forEach((n) => n.remove());
  root.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n === 'formaction' || n === 'srcdoc') el.removeAttribute(a.name);
      else if (/^(href|src|xlink:href|action|poster|background)$/.test(n) && /^\s*(javascript|vbscript|data:text\/html)/i.test(a.value)) {
        el.removeAttribute(a.name);
      }
    }
  });
}

function toFileUrl(src, dirUrl) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) && !/^[a-z]:[\\/]/i.test(src)) return src; // already a URL
  if (/^[a-z]:[\\/]/i.test(src)) return 'file:///' + src.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^([a-z])%3A/i, '$1:');
  if (src.startsWith('//')) return 'https:' + src;
  try { return new URL(src, dirUrl).href; } catch { return src; }
}

function renderDoc(tab, data) {
  const tpl = document.createElement('template');
  tpl.innerHTML = data.html; // inert: nothing loads before we clean it
  const frag = tpl.content;
  sanitize(frag);

  frag.querySelectorAll('img[src], video[src], audio[src], source[src]').forEach((el) => {
    el.setAttribute('src', toFileUrl(el.getAttribute('src'), data.dirUrl));
  });
  frag.querySelectorAll('img').forEach((img) => {
    img.loading = 'lazy';
    img.decoding = 'async';
  });

  enhanceCode(frag);
  enhanceAlerts(frag);
  enhanceTasks(frag);
  const diagrams = enhanceMermaid(frag);

  tab.article.replaceChildren(frag);
  if (diagrams.length) renderMermaid(diagrams);
}

function renderError(tab, data) {
  tab.article.innerHTML = `<div class="doc-error">${ICON.warn}<h2>${escapeText(t('loadError'))}</h2>`
    + `<code>${escapeText(data.path)}</code><p>${escapeText(data.error || '')}</p></div>`;
}

function enhanceCode(root) {
  root.querySelectorAll('pre.code-block').forEach((pre) => {
    const frame = document.createElement('div');
    frame.className = 'code-frame';
    const head = document.createElement('div');
    head.className = 'code-head';
    head.innerHTML = `<span class="code-lang">${escapeText(pre.dataset.lang || 'text')}</span>`
      + `<button class="code-copy" title="${escapeText(t('copy'))}">${ICON.copy}<span>${escapeText(t('copy'))}</span></button>`;
    pre.replaceWith(frame);
    frame.append(head, pre);
  });
}

function enhanceAlerts(root) {
  root.querySelectorAll('blockquote').forEach((bq) => {
    const p = bq.firstElementChild;
    if (!p || p.tagName !== 'P' || !p.firstChild || p.firstChild.nodeType !== Node.TEXT_NODE) return;
    const m = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec(p.firstChild.data);
    if (!m) return;
    const kind = m[1].toLowerCase();
    p.firstChild.data = p.firstChild.data.slice(m[0].length);
    if (p.firstChild.nextSibling && p.firstChild.nextSibling.nodeName === 'BR' && !p.firstChild.data.trim()) p.firstChild.nextSibling.remove();
    if (!p.textContent.trim() && !p.querySelector('img')) p.remove();
    const a = ALERTS[kind];
    const title = document.createElement('div');
    title.className = 'alert-title';
    title.innerHTML = `${a.icon}<span>${a[S.lang] || a.en}</span>`;
    bq.classList.add('alert', `alert-${kind}`);
    bq.prepend(title);
  });
}

function enhanceTasks(root) {
  root.querySelectorAll('li.task-list-item').forEach((li) => {
    const box = li.querySelector('input[type="checkbox"]');
    if (box && box.checked) li.classList.add('done');
  });
}

function enhanceMermaid(root) {
  return [...root.querySelectorAll('pre.mermaid-src')].map((pre) => {
    const box = document.createElement('div');
    box.className = 'mermaid-box loading';
    box.dataset.src = pre.textContent;
    pre.replaceWith(box);
    return box;
  });
}

function loadMermaid() {
  if (!mermaidLoad) {
    mermaidLoad = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/mermaid.min.js';
      s.onload = () => resolve(window.mermaid);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return mermaidLoad;
}

async function renderMermaid(boxes) {
  try {
    const m = await loadMermaid();
    const dark = S.theme === 'dark';
    m.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: getComputedStyle(document.body).fontFamily,
      themeVariables: dark
        ? {
          darkMode: true,
          background: '#171b25',
          primaryColor: '#232842',
          primaryBorderColor: '#8d7dff',
          primaryTextColor: '#eef0f6',
          secondaryColor: '#1d2a3d',
          secondaryBorderColor: '#4ea5ff',
          tertiaryColor: '#1b1f2c',
          tertiaryBorderColor: '#3a4157',
          lineColor: '#7d88a6',
          textColor: '#d5dae4',
          edgeLabelBackground: '#171b25',
          clusterBkg: '#141823',
          clusterBorder: '#2c3346',
          noteBkgColor: '#2a2440',
          noteTextColor: '#eef0f6',
          noteBorderColor: '#8d7dff',
        }
        : {
          background: '#f6f7fa',
          primaryColor: '#efebff',
          primaryBorderColor: '#6a52f5',
          primaryTextColor: '#1b1f2b',
          secondaryColor: '#e6f0ff',
          secondaryBorderColor: '#2f7cf0',
          tertiaryColor: '#ffffff',
          tertiaryBorderColor: '#d5d9e3',
          lineColor: '#8a93a5',
          textColor: '#2a303c',
          edgeLabelBackground: '#f6f7fa',
          clusterBkg: '#ffffff',
          clusterBorder: '#d5d9e3',
          noteBkgColor: '#fff6d8',
          noteTextColor: '#1b1f2b',
          noteBorderColor: '#e0b030',
        },
    });
    for (const box of boxes) {
      try {
        const { svg } = await m.render(`mmd-${++mermaidSeq}`, box.dataset.src);
        box.innerHTML = svg;
        box.classList.remove('loading', 'failed');
      } catch (err) {
        box.classList.remove('loading');
        box.classList.add('failed');
        box.innerHTML = `<pre>${escapeText(box.dataset.src)}</pre><div class="mermaid-err">${escapeText(String(err.message || err).split('\n')[0])}</div>`;
      }
    }
  } catch {
    boxes.forEach((b) => { b.classList.remove('loading'); b.innerHTML = `<pre>${escapeText(b.dataset.src)}</pre>`; });
  }
}

function rerenderAllMermaid() {
  const boxes = $$('.mermaid-box');
  if (boxes.length) renderMermaid(boxes);
}

// ---------- links & clicks inside documents ----------

async function onDocClick(e, tab) {
  const copyBtn = e.target.closest('.code-copy');
  if (copyBtn) {
    const code = copyBtn.closest('.code-frame').querySelector('code');
    await api.copy(code.innerText);
    copyBtn.classList.add('done');
    copyBtn.innerHTML = `${ICON.check}<span>${escapeText(t('copied'))}</span>`;
    setTimeout(() => {
      copyBtn.classList.remove('done');
      copyBtn.innerHTML = `${ICON.copy}<span>${escapeText(t('copy'))}</span>`;
    }, 1400);
    return;
  }

  const a = e.target.closest('a[href]');
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute('href').trim();
  if (!href) return;

  if (href.startsWith('#')) {
    scrollToId(tab, safeDecode(href.slice(1)));
    return;
  }
  if (/^(https?|mailto):/i.test(href)) {
    api.openExternal(href);
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^file:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return;

  let target = href;
  if (/^file:/i.test(href)) target = safeDecode(new URL(href).pathname.replace(/^\/([a-z]:)/i, '$1'));
  const [rel, hash] = target.split('#');
  if (!tab.data || !tab.data.dir) return;
  const info = await api.resolvePath(tab.data.dir, rel);
  if (!info.exists) {
    toast(`${t('notFound')}: ${baseName(info.path)}`);
    return;
  }
  if (info.isMarkdown) {
    const opened = openFile(info.path, true);
    renderTabs();
    saveSession();
    if (hash) waitForLoad(opened).then(() => scrollToId(opened, safeDecode(hash)));
  } else {
    api.openPath(info.path);
  }
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function waitForLoad(tab) {
  return new Promise((resolve) => {
    const tick = () => (tab.data ? resolve() : setTimeout(tick, 40));
    tick();
  });
}

function scrollToId(tab, id) {
  const el = tab.article.querySelector(`[id="${CSS.escape(id)}"]`) || tab.article.querySelector(`[name="${CSS.escape(id)}"]`);
  if (!el) return;
  const top = el.getBoundingClientRect().top - tab.pane.getBoundingClientRect().top + tab.pane.scrollTop - 18;
  tab.pane.scrollTo({ top, behavior: 'smooth' });
  el.classList.remove('target-flash');
  void el.offsetWidth;
  el.classList.add('target-flash');
}

// ---------- outline ----------

let outlineItems = [];

function buildOutline() {
  const list = $('#outline-list');
  const tab = activeTab();
  outlineItems = [];
  if (!tab || !tab.data || !tab.data.ok) {
    list.replaceChildren();
    return;
  }
  const heads = $$('h1, h2, h3, h4', tab.article).filter((h) => h.id);
  if (!heads.length) {
    list.innerHTML = `<div class="outline-empty">${escapeText(t('noHeadings'))}</div>`;
    return;
  }
  const minLevel = Math.min(...heads.map((h) => +h.tagName[1]));
  list.replaceChildren(...heads.map((h) => {
    const a = document.createElement('a');
    a.className = `ol-item lvl-${+h.tagName[1] - minLevel}`;
    a.textContent = h.textContent.replace(/^#\s*/, '').trim();
    a.title = a.textContent;
    a.addEventListener('click', () => scrollToId(tab, h.id));
    outlineItems.push({ h, a });
    return a;
  }));
  spy(tab);
}

let spyFrame = 0;
function onPaneScroll(tab) {
  if (tab.id !== S.active || spyFrame) return;
  spyFrame = requestAnimationFrame(() => {
    spyFrame = 0;
    spy(tab);
  });
}

function spy(tab) {
  if (!outlineItems.length) return;
  const top = tab.pane.getBoundingClientRect().top + 90;
  let current = outlineItems[0];
  for (const it of outlineItems) {
    if (it.h.getBoundingClientRect().top <= top) current = it;
    else break;
  }
  if (tab.pane.scrollTop + tab.pane.clientHeight >= tab.pane.scrollHeight - 4) current = outlineItems[outlineItems.length - 1];
  outlineItems.forEach((it) => it.a.classList.toggle('current', it === current));
  const list = $('#outline-list');
  const r = current.a.getBoundingClientRect();
  const lr = list.getBoundingClientRect();
  if (r.top < lr.top + 8 || r.bottom > lr.bottom - 8) {
    list.scrollTop += r.top - lr.top - lr.height / 2;
  }
}

function setOutline(on) {
  S.outline = on;
  document.body.classList.toggle('no-outline', !on);
  $('#btn-outline').classList.toggle('on', on);
  api.setSetting('outline', on);
}

// ---------- status bar ----------

let updatedTimer = null;

function updateStatus() {
  const tab = activeTab();
  const ok = tab && tab.data && tab.data.ok;
  $('#sb-path').textContent = tab ? tab.path : '';
  $('#sb-path').title = tab ? tab.path : '';
  $('#sb-words').textContent = ok ? t('words', tab.data.words) : '';
  $('#sb-time').textContent = ok ? t('minutes', tab.data.minutes) : '';
  $('#sb-zoom').textContent = `${Math.round(S.zoom * 100)}%`;
}

function flashUpdated() {
  const el = $('#sb-updated');
  const now = new Date();
  el.textContent = `● ${t('updated')} ${now.toLocaleTimeString(S.lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  el.hidden = false;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
  clearTimeout(updatedTimer);
  updatedTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

// ---------- zoom, width, theme ----------

function setZoom(z) {
  S.zoom = Math.min(2, Math.max(0.8, z));
  document.documentElement.style.setProperty('--zoom', S.zoom);
  updateStatus();
  api.setSetting('zoom', S.zoom);
}

function stepZoom(dir) {
  let i = ZOOMS.findIndex((z) => z >= S.zoom - 0.001);
  if (i < 0) i = ZOOMS.length - 1;
  if (dir > 0 && ZOOMS[i] <= S.zoom + 0.001) i += 1;
  if (dir < 0) i -= 1;
  setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i))]);
}

function setWidth(w) {
  S.width = w;
  document.documentElement.dataset.width = w;
  api.setSetting('width', w);
}

function applyTheme(theme) {
  const changed = S.theme !== theme;
  S.theme = theme;
  document.documentElement.dataset.theme = theme;
  if (changed) rerenderAllMermaid();
}

async function setThemePref(pref) {
  S.themePref = pref;
  const eff = await api.setSetting('theme', pref);
  applyTheme(eff);
}

// ---------- find ----------

const F = { ranges: [], idx: -1 };
const hasHighlights = typeof CSS !== 'undefined' && CSS.highlights;

function openFind() {
  if (!activeTab()) return;
  const bar = $('#findbar');
  bar.hidden = false;
  const input = $('#find-input');
  const sel = window.getSelection().toString().trim();
  if (sel && sel.length < 120 && !sel.includes('\n')) input.value = sel;
  input.focus();
  input.select();
  findRun(input.value);
}

function closeFind() {
  $('#findbar').hidden = true;
  if (hasHighlights) {
    CSS.highlights.delete('find');
    CSS.highlights.delete('find-current');
  }
  F.ranges = [];
  F.idx = -1;
}

function findRun(query, keepIndex = false) {
  const prevIdx = F.idx;
  F.ranges = [];
  F.idx = -1;
  if (hasHighlights) {
    CSS.highlights.delete('find');
    CSS.highlights.delete('find-current');
  }
  const tab = activeTab();
  const q = query.toLocaleLowerCase();
  if (tab && q) {
    const walker = document.createTreeWalker(tab.article, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('.heading-anchor, .code-head, .mermaid-box svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (walker.nextNode() && F.ranges.length < 5000) {
      const node = walker.currentNode;
      const text = node.data.toLocaleLowerCase();
      let i = text.indexOf(q);
      while (i !== -1) {
        const r = new Range();
        r.setStart(node, i);
        r.setEnd(node, i + q.length);
        F.ranges.push(r);
        i = text.indexOf(q, i + q.length);
      }
    }
  }
  if (F.ranges.length && hasHighlights) CSS.highlights.set('find', new Highlight(...F.ranges));
  if (F.ranges.length) findGo(keepIndex && prevIdx >= 0 ? Math.min(prevIdx, F.ranges.length - 1) : firstVisibleHit(tab), !keepIndex);
  else updateFindCount();
  $('#findbar').classList.toggle('miss', !!q && !F.ranges.length);
}

function firstVisibleHit(tab) {
  const top = tab.pane.getBoundingClientRect().top;
  const i = F.ranges.findIndex((r) => r.getBoundingClientRect().top >= top);
  return i < 0 ? 0 : i;
}

function findGo(i, scroll = true) {
  if (!F.ranges.length) return;
  F.idx = (i + F.ranges.length) % F.ranges.length;
  const r = F.ranges[F.idx];
  if (hasHighlights) CSS.highlights.set('find-current', new Highlight(r));
  const tab = activeTab();
  if (scroll && tab) {
    const rect = r.getBoundingClientRect();
    const pr = tab.pane.getBoundingClientRect();
    if (rect.top < pr.top + 60 || rect.bottom > pr.bottom - 40) {
      tab.pane.scrollTo({ top: tab.pane.scrollTop + rect.top - pr.top - pr.height / 3, behavior: 'smooth' });
    }
  }
  updateFindCount();
}

function updateFindCount() {
  $('#find-count').textContent = F.ranges.length ? `${F.idx + 1} / ${F.ranges.length}` : ($('#find-input').value ? '0' : '');
}

// ---------- menus ----------

async function tabMenu(tab) {
  const i = S.tabs.indexOf(tab);
  const id = await api.menu([
    { id: 'close', label: t('mClose'), accelerator: 'Ctrl+W' },
    { id: 'others', label: t('mCloseOthers'), enabled: S.tabs.length > 1 },
    { id: 'right', label: t('mCloseRight'), enabled: i < S.tabs.length - 1 },
    { id: 'all', label: t('mCloseAll') },
    { type: 'separator' },
    { id: 'reload', label: t('mReload'), accelerator: 'F5' },
    { id: 'copy', label: t('mCopyPath') },
    { id: 'reveal', label: t('mReveal') },
    { id: 'default', label: t('mOpenWith') },
  ]);
  if (id === 'close') closeTab(tab.id);
  if (id === 'others') closeMany(S.tabs.filter((x) => x !== tab).map((x) => x.id));
  if (id === 'right') closeMany(S.tabs.slice(i + 1).map((x) => x.id));
  if (id === 'all') closeMany(S.tabs.map((x) => x.id));
  if (id === 'reload') loadTab(tab);
  if (id === 'copy') { api.copy(tab.path); toast(t('pathCopied')); }
  if (id === 'reveal') api.reveal(tab.path);
  if (id === 'default') api.openPath(tab.path);
}

async function mainMenu() {
  const radio = (id, label, checked) => ({ id, label, type: 'radio', checked });
  const id = await api.menu([
    { id: 'open', label: t('mOpen'), accelerator: 'Ctrl+O' },
    { id: 'reopen', label: t('mReopen'), accelerator: 'Ctrl+Shift+T', enabled: S.closed.length > 0 },
    { type: 'separator' },
    { id: 'find', label: t('mFind'), accelerator: 'Ctrl+F', enabled: !!activeTab() },
    { id: 'print', label: t('mPrint'), accelerator: 'Ctrl+P', enabled: !!activeTab() },
    { type: 'separator' },
    {
      label: t('mTheme'),
      submenu: [
        radio('theme:system', t('mSystem'), S.themePref === 'system'),
        radio('theme:light', t('mLight'), S.themePref === 'light'),
        radio('theme:dark', t('mDark'), S.themePref === 'dark'),
      ],
    },
    {
      label: t('mWidth'),
      submenu: [
        radio('width:narrow', t('mNarrow'), S.width === 'narrow'),
        radio('width:normal', t('mNormal'), S.width === 'normal'),
        radio('width:wide', t('mWide'), S.width === 'wide'),
        radio('width:full', t('mFull'), S.width === 'full'),
      ],
    },
    {
      label: t('mLanguage'),
      submenu: [
        radio('lang:auto', t('mAuto'), S.langPref === 'auto'),
        radio('lang:en', 'English', S.langPref === 'en'),
        radio('lang:uk', 'Українська', S.langPref === 'uk'),
      ],
    },
    { type: 'separator' },
    { id: 'zin', label: t('mZoomIn'), accelerator: 'Ctrl+=' },
    { id: 'zout', label: t('mZoomOut'), accelerator: 'Ctrl+-' },
    { id: 'zreset', label: t('mZoomReset'), accelerator: 'Ctrl+0' },
    { type: 'separator' },
    { id: 'clear', label: t('mClearRecent'), enabled: S.recent.length > 0 },
    { id: 'about', label: `${t('mAbout')}  ·  v${S.version}` },
  ]);
  if (!id) return;
  const [k, v] = id.split(':');
  if (k === 'open') openDialog();
  if (k === 'reopen') reopenClosed();
  if (k === 'find') openFind();
  if (k === 'print') window.print();
  if (k === 'theme') setThemePref(v);
  if (k === 'width') setWidth(v);
  if (k === 'lang') setLang(v);
  if (k === 'zin') stepZoom(1);
  if (k === 'zout') stepZoom(-1);
  if (k === 'zreset') setZoom(1);
  if (k === 'clear') { S.recent = []; api.setSetting('recent', []); renderRecent(); }
  if (k === 'about') api.openExternal(GITHUB);
}

function setLang(pref) {
  S.langPref = pref;
  api.setSetting('lang', pref);
  resolveLang();
  applyI18n();
  renderTabs();
  renderRecent();
  updateStatus();
  S.tabs.forEach((x) => x.data && loadTab(x)); // alert titles and copy buttons are localized
}

async function openDialog() {
  const files = await api.openDialog();
  if (files.length) openFiles(files);
}

// ---------- welcome: recent files ----------

function renderRecent() {
  const list = $('#recent-list');
  $('#recent').hidden = !S.recent.length;
  list.replaceChildren(...S.recent.map((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="r-icon">${ICON.doc}</span>`
      + `<span class="r-text"><span class="r-name">${escapeText(baseName(p))}</span><span class="r-path">${escapeText(p.slice(0, p.length - baseName(p).length - 1))}</span></span>`
      + `<button class="r-remove" title="${escapeText(t('remove'))}">${ICON.close}</button>`;
    li.addEventListener('click', (e) => {
      if (e.target.closest('.r-remove')) {
        S.recent = S.recent.filter((x) => x !== p);
        api.setSetting('recent', S.recent);
        renderRecent();
        return;
      }
      openFiles([p]);
    });
    return li;
  }));
}

// ---------- drag & drop files ----------

function setupDrop() {
  let depth = 0;
  const overlay = $('#drop-overlay');
  const isFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!isFiles(e)) return;
    depth += 1;
    overlay.classList.add('show');
  });
  window.addEventListener('dragleave', (e) => {
    if (!isFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) overlay.classList.remove('show');
  });
  window.addEventListener('dragover', (e) => {
    if (isFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  });
  window.addEventListener('drop', (e) => {
    if (!isFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.classList.remove('show');
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    if (paths.length) openFiles(paths);
  });
}

// ---------- keyboard ----------

function setupKeys() {
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const inFind = e.target === $('#find-input');

    if (inFind) {
      if (e.key === 'Enter') { e.preventDefault(); findGo(F.idx + (e.shiftKey ? -1 : 1)); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeFind(); return; }
    }

    if (ctrl && e.code === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); return; }
    if (ctrl && e.code === 'PageDown') { e.preventDefault(); cycleTab(1); return; }
    if (ctrl && e.code === 'PageUp') { e.preventDefault(); cycleTab(-1); return; }
    if (ctrl && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      const n = +e.code.slice(5);
      const tab = n === 9 ? S.tabs[S.tabs.length - 1] : S.tabs[n - 1];
      if (tab) activateTab(tab.id);
      return;
    }
    if (ctrl && e.shiftKey && e.code === 'KeyT') { e.preventDefault(); reopenClosed(); return; }
    if (ctrl && !e.shiftKey && e.code === 'KeyO') { e.preventDefault(); openDialog(); return; }
    if (ctrl && (e.code === 'KeyW' || e.code === 'F4')) { e.preventDefault(); if (S.active) closeTab(S.active); return; }
    if (ctrl && e.code === 'KeyF') { e.preventDefault(); openFind(); return; }
    if (e.code === 'F3') { e.preventDefault(); if ($('#findbar').hidden) openFind(); else findGo(F.idx + (e.shiftKey ? -1 : 1)); return; }
    if (ctrl && e.code === 'KeyB') { e.preventDefault(); setOutline(!S.outline); return; }
    if (ctrl && e.code === 'KeyP') { e.preventDefault(); if (activeTab()) window.print(); return; }
    if ((ctrl && e.code === 'KeyR') || e.code === 'F5') { e.preventDefault(); if (activeTab()) loadTab(activeTab()); return; }
    if (ctrl && (e.code === 'Equal' || e.code === 'NumpadAdd')) { e.preventDefault(); stepZoom(1); return; }
    if (ctrl && (e.code === 'Minus' || e.code === 'NumpadSubtract')) { e.preventDefault(); stepZoom(-1); return; }
    if (ctrl && (e.code === 'Digit0' || e.code === 'Numpad0')) { e.preventDefault(); setZoom(1); return; }
    if (e.key === 'Escape' && !$('#findbar').hidden) { closeFind(); }
  });

  document.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    stepZoom(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
}

// ---------- boot ----------

async function boot() {
  const st = await api.getSettings();
  S.locale = st.locale || 'en';
  S.langPref = st.lang || 'auto';
  S.themePref = st.theme || 'system';
  S.version = st.version;
  S.recent = Array.isArray(st.recent) ? st.recent : [];
  resolveLang();
  applyTheme(st.effectiveTheme);
  setZoom(typeof st.zoom === 'number' ? st.zoom : 1);
  setWidth(st.width || 'normal');
  setOutline(st.outline !== false);
  applyI18n();

  $('#btn-open').addEventListener('click', openDialog);
  $('#welcome-open').addEventListener('click', openDialog);
  $('#btn-outline').addEventListener('click', () => setOutline(!S.outline));
  $('#btn-theme').addEventListener('click', () => setThemePref(S.theme === 'dark' ? 'light' : 'dark'));
  $('#btn-menu').addEventListener('click', mainMenu);
  $('#sb-zoom').addEventListener('click', () => setZoom(1));
  $('#sb-path').addEventListener('click', () => { const tab = activeTab(); if (tab) { api.copy(tab.path); toast(t('pathCopied')); } });
  $('#find-input').addEventListener('input', debounce((e) => findRun(e.target.value), 110));
  $('#find-next').addEventListener('click', () => findGo(F.idx + 1));
  $('#find-prev').addEventListener('click', () => findGo(F.idx - 1));
  $('#find-close').addEventListener('click', closeFind);
  $('#tabs').addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.currentTarget.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });
  $('#tabs').addEventListener('dblclick', (e) => { if (e.target === e.currentTarget) openDialog(); });

  setupDrop();
  setupKeys();

  api.onOpenFiles((files) => openFiles(files));
  api.onDocChanged((p) => {
    const tab = S.tabs.find((x) => x.path === p);
    if (tab) loadTab(tab, { fromWatch: true });
  });
  api.onThemeChanged((theme) => applyTheme(theme));

  const session = st.session && Array.isArray(st.session.files) ? st.session : { files: [] };
  if (session.files.length) {
    await openFiles(session.files, { activate: false });
    const act = S.tabs.find((x) => x.path === session.active) || S.tabs[0];
    if (act) activateTab(act.id);
  }
  if (st.pendingFiles && st.pendingFiles.length) await openFiles(st.pendingFiles);
  if (!S.tabs.length) showWelcome();
  document.body.classList.add('ready');
}

function debounce(fn, ms) {
  let h = null;
  return (...args) => { clearTimeout(h); h = setTimeout(() => fn(...args), ms); };
}

boot();
