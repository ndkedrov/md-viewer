'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { render } = require('./markdown');
const store = require('./store');
const assoc = require('./assoc');

const MD_EXT = /\.(md|markdown|mdown|mkd|mdx|txt)$/i;
const CHROME = {
  dark: { color: '#0c0e14', symbolColor: '#c3c8d4' },
  light: { color: '#eceef3', symbolColor: '#3b4150' },
};
const BAR_HEIGHT = 42;
const IS_MAC = process.platform === 'darwin';
const IS_MAS = !!process.mas; // Mac App Store build: runs in the App Sandbox

// Separate profile for dev runs and screenshots, so they don't touch real settings.
if (!app.isPackaged && process.env.MDVIEWER_PROFILE) app.setPath('userData', process.env.MDVIEWER_PROFILE);

let win = null;
let rendererReady = false; // the renderer has asked for its settings and listens for files
let pendingFiles = [];
const watched = new Map(); // path -> listener

// ---------- single instance: a second launch hands its files to the first ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const files = filesFromArgv(argv);
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    if (files.length) win.webContents.send('open-files', files);
  });
}

function filesFromArgv(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2);
  return args
    .filter((a) => !a.startsWith('-'))
    .map((a) => path.resolve(a))
    .filter((p) => {
      try { return fs.statSync(p).isFile(); } catch { return false; }
    });
}

// ---------- window ----------

function effectiveTheme() {
  const t = store.get('theme', 'system');
  if (t === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return t;
}

function applyChrome() {
  if (!win) return;
  const c = CHROME[effectiveTheme()];
  try { win.setTitleBarOverlay({ ...c, height: BAR_HEIGHT }); } catch { /* not supported */ }
  win.setBackgroundColor(effectiveTheme() === 'dark' ? '#11141b' : '#ffffff');
}

function createWindow() {
  const bounds = store.get('bounds', { width: 1280, height: 860 });
  const theme = effectiveTheme();

  win = new BrowserWindow({
    ...bounds,
    minWidth: 520,
    minHeight: 360,
    show: false,
    title: 'MD Viewer',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
    backgroundColor: theme === 'dark' ? '#11141b' : '#ffffff',
    titleBarStyle: 'hidden',
    // macOS keeps its traffic lights on the left, centred in our tab bar.
    ...(IS_MAC
      ? { trafficLightPosition: { x: 16, y: 14 } }
      : { titleBarOverlay: { ...CHROME[theme], height: BAR_HEIGHT } }),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (store.get('maximized', false)) win.maximize();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // Dev helper for README screenshots: MDVIEWER_CAPTURE=out.png npm start -- files…
  if (!app.isPackaged && process.env.MDVIEWER_CAPTURE) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.MDVIEWER_CAPTURE_JS) {
        const out = await win.webContents.executeJavaScript(fs.readFileSync(process.env.MDVIEWER_CAPTURE_JS, 'utf8'));
        console.log('[capture-js]', JSON.stringify(out));
      }
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.MDVIEWER_CAPTURE, img.toPNG());
      app.quit();
    }, Number(process.env.MDVIEWER_CAPTURE_DELAY || 3000)));
  }

  // Documents may contain arbitrary links: never navigate the app window itself.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged) {
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error' || e.level === 'warning') console.log(`[renderer ${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
    });
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    });
  }

  const saveBounds = () => {
    if (!win || win.isDestroyed()) return;
    store.set('maximized', win.isMaximized());
    if (!win.isMaximized() && !win.isMinimized()) store.set('bounds', win.getBounds());
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('maximize', () => win.webContents.send('window-state', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('window-state', { maximized: false }));
  // Full screen hides the traffic lights, so the tab bar can use their space.
  win.on('enter-full-screen', () => win.webContents.send('window-state', { fullscreen: true }));
  win.on('leave-full-screen', () => win.webContents.send('window-state', { fullscreen: false }));
  win.webContents.on('did-start-loading', () => { rendererReady = false; });
  win.on('closed', () => {
    win = null;
    rendererReady = false;
    for (const p of [...watched.keys()]) unwatch(p);
  });
}

// ---------- file watching ----------

function watch(p) {
  if (watched.has(p)) return;
  // Polling survives editors that save by replacing the file.
  const listener = (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs || curr.size !== prev.size) {
      if (win) win.webContents.send('doc-changed', p);
    }
  };
  fs.watchFile(p, { interval: 700 }, listener);
  watched.set(p, listener);
}

function unwatch(p) {
  const l = watched.get(p);
  if (l) fs.unwatchFile(p, l);
  watched.delete(p);
}

// ---------- IPC ----------

ipcMain.handle('doc:load', async (_e, p) => {
  try {
    const src = await fs.promises.readFile(p, 'utf8');
    const stat = await fs.promises.stat(p);
    const out = render(src);
    watch(p);
    return {
      ok: true,
      path: p,
      name: path.basename(p),
      dir: path.dirname(p),
      dirUrl: pathToFileURL(path.dirname(p) + path.sep).href,
      dirAccess: canListDir(path.dirname(p)),
      size: stat.size,
      mtime: stat.mtimeMs,
      ...out,
    };
  } catch (err) {
    const denied = IS_MAS && (err.code === 'EPERM' || err.code === 'EACCES');
    return { ok: false, path: p, name: path.basename(p), error: err.message, denied };
  }
});

ipcMain.handle('doc:unwatch', (_e, p) => unwatch(p));

ipcMain.handle('dialog:open', async (_e, defaultPath) => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    defaultPath: defaultPath || undefined,
    securityScopedBookmarks: IS_MAS,
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
      { name: 'Text', extensions: ['txt'] },
      { name: '*', extensions: ['*'] },
    ],
  });
  if (res.canceled) return [];
  remember(res.filePaths, res.bookmarks);
  return res.filePaths;
});

// App Store build: a document's folder is only readable after the user picks
// it once, which lets relative images and links work.
ipcMain.handle('access:folder', async (_e, dir, message, buttonLabel) => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    defaultPath: dir || undefined,
    message: message || undefined,
    buttonLabel: buttonLabel || undefined,
    securityScopedBookmarks: IS_MAS,
  });
  if (res.canceled) return false;
  remember(res.filePaths, res.bookmarks);
  return true;
});

ipcMain.handle('path:resolve', (_e, base, rel) => {
  const target = path.resolve(base, decodeURIComponent(rel));
  let exists = false;
  let denied = false;
  try { exists = fs.statSync(target).isFile(); } catch (err) { denied = IS_MAS && (err.code === 'EPERM' || err.code === 'EACCES'); }
  return { path: target, exists, denied, isMarkdown: MD_EXT.test(target) };
});

ipcMain.handle('shell:external', (_e, url) => {
  if (/^(https?|mailto):/i.test(url)) return shell.openExternal(url);
});
ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));
ipcMain.handle('shell:reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('assoc:status', () => assoc.status());
ipcMain.handle('assoc:choose', (_e, p) => assoc.chooseDefault(p));
ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text)));

const isFile = (p) => {
  try { return fs.statSync(p).isFile(); } catch { return false; }
};

ipcMain.handle('settings:get', () => {
  const all = store.all();
  // Files deleted since the last run are dropped from the restored session.
  if (all.session && Array.isArray(all.session.files)) {
    all.session = { ...all.session, files: all.session.files.filter(isFile) };
  }
  rendererReady = true;
  delete all.bookmarks;
  return {
    ...all,
    effectiveTheme: effectiveTheme(),
    locale: app.getLocale(),
    version: app.getVersion(),
    platform: process.platform,
    mas: IS_MAS,
    pendingFiles: pendingFiles.splice(0),
  };
});

ipcMain.handle('settings:set', (_e, key, value) => {
  store.set(key, value);
  if (key === 'theme') {
    nativeTheme.themeSource = value;
    applyChrome();
    return effectiveTheme();
  }
});

// Native menus look right on Windows and cost nothing to build.
function popup(template) {
  return new Promise((resolve) => {
    let picked = null;
    const wrap = (items) =>
      items.map((it) => {
        if (it.submenu) return { ...it, submenu: wrap(it.submenu) };
        if (it.id) return { ...it, click: () => { picked = it.id; } };
        return it;
      });
    Menu.buildFromTemplate(wrap(template)).popup({ window: win, callback: () => setTimeout(() => resolve(picked), 0) });
  });
}

ipcMain.handle('menu:popup', (_e, template) => popup(template));

// ---------- macOS menu bar ----------
// The renderer owns the labels (they live in i18n.js) and sends the whole
// template; items with an id report back as commands, roles stay native.

function toAppMenu(items) {
  return items.map((it) => {
    const out = { ...it };
    if (it.submenu) out.submenu = toAppMenu(it.submenu);
    if (it.id) {
      const cmd = it.id;
      out.click = () => {
        if (win) win.webContents.send('command', cmd);
        else if (cmd === 'open') { createWindow(); pendingCommand = 'open'; }
        else createWindow();
      };
    }
    return out;
  });
}

let pendingCommand = null;

ipcMain.handle('menu:app', (_e, template) => {
  if (!IS_MAC) return;
  Menu.setApplicationMenu(Menu.buildFromTemplate(toAppMenu(template)));
  if (pendingCommand && win) { win.webContents.send('command', pendingCommand); pendingCommand = null; }
});

// ---------- sandbox access (App Store build) ----------

function canListDir(dir) {
  if (!IS_MAS) return true;
  try { fs.readdirSync(dir); return true; } catch { return false; }
}

const stopAccess = new Map(); // path -> stop function

function startAccess(p, bookmark) {
  if (stopAccess.has(p)) return;
  try { stopAccess.set(p, app.startAccessingSecurityScopedResource(bookmark)); } catch { /* stale bookmark */ }
}

function remember(paths, bookmarks) {
  if (!IS_MAS || !Array.isArray(bookmarks)) return;
  const all = { ...store.get('bookmarks', {}) };
  paths.forEach((p, i) => {
    if (!bookmarks[i]) return;
    all[p] = bookmarks[i];
    startAccess(p, bookmarks[i]);
  });
  // Keep the list bounded: the newest 200 grants are plenty for recent files and folders.
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete all[k];
  store.set('bookmarks', all);
}

function restoreAccess() {
  if (!IS_MAS) return;
  for (const [p, b] of Object.entries(store.get('bookmarks', {}))) startAccess(p, b);
}

nativeTheme.on('updated', () => {
  applyChrome();
  if (win) win.webContents.send('theme-changed', effectiveTheme());
});

// ---------- lifecycle ----------

// macOS hands over files from Finder (double click, drop on the Dock icon).
app.on('open-file', (e, p) => {
  e.preventDefault();
  if (win && rendererReady) {
    win.webContents.send('open-files', [p]);
    if (win.isMinimized()) win.restore();
    win.focus();
    return;
  }
  pendingFiles.push(p);
  if (!win && app.isReady()) createWindow();
});

app.whenReady().then(() => {
  // On macOS the renderer installs a localized menu bar right after it loads.
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = store.get('theme', 'system');
  restoreAccess();
  pendingFiles.push(...filesFromArgv(process.argv));
  createWindow();
});

// A Mac app stays alive without windows and reopens one from the Dock.
app.on('activate', () => {
  if (!win && app.isReady()) createWindow();
});

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});

app.on('will-quit', () => {
  for (const stop of stopAccess.values()) { try { stop(); } catch { /* already released */ } }
});
