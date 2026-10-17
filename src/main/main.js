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

// Separate profile for dev runs and screenshots, so they don't touch real settings.
if (!app.isPackaged && process.env.MDVIEWER_PROFILE) app.setPath('userData', process.env.MDVIEWER_PROFILE);

let win = null;
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
    titleBarOverlay: { ...CHROME[theme], height: BAR_HEIGHT },
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
  win.on('closed', () => {
    win = null;
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
      size: stat.size,
      mtime: stat.mtimeMs,
      ...out,
    };
  } catch (err) {
    return { ok: false, path: p, name: path.basename(p), error: err.message };
  }
});

ipcMain.handle('doc:unwatch', (_e, p) => unwatch(p));

ipcMain.handle('dialog:open', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
      { name: 'Text', extensions: ['txt'] },
      { name: '*', extensions: ['*'] },
    ],
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('path:resolve', (_e, base, rel) => {
  const target = path.resolve(base, decodeURIComponent(rel));
  let exists = false;
  try { exists = fs.statSync(target).isFile(); } catch { /* missing */ }
  return { path: target, exists, isMarkdown: MD_EXT.test(target) };
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
  return {
    ...all,
    effectiveTheme: effectiveTheme(),
    locale: app.getLocale(),
    version: app.getVersion(),
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

nativeTheme.on('updated', () => {
  applyChrome();
  if (win) win.webContents.send('theme-changed', effectiveTheme());
});

// ---------- lifecycle ----------

app.on('open-file', (e, p) => {
  e.preventDefault();
  if (win) win.webContents.send('open-files', [p]);
  else pendingFiles.push(p);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = store.get('theme', 'system');
  pendingFiles.push(...filesFromArgv(process.argv));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
