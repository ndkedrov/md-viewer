'use strict';

// Default-app handling for .md files on Windows.
// Windows 10/11 protect the user's choice, so an app cannot silently make
// itself the default. We detect whether the user confirmed MD Viewer and, if
// not, open the system "How do you want to open this file?" dialog.

const { app } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROG_ID = 'MDViewer.Markdown';
const CHOICE_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md\\UserChoice';

function supported() {
  // In development the executable is electron.exe, which must not be associated.
  if (!app.isPackaged && process.env.MDVIEWER_FORCE_ASSOC) return true; // dev: preview the prompt
  return process.platform === 'win32' && app.isPackaged;
}

function userChoice() {
  return new Promise((resolve) => {
    execFile('reg', ['query', CHOICE_KEY, '/v', 'ProgId'], { windowsHide: true }, (_err, out) => {
      const m = /ProgId\s+REG_SZ\s+(.+)/i.exec(out || '');
      resolve(m ? m[1].trim() : null);
    });
  });
}

async function status() {
  if (!supported()) return { supported: false, isDefault: false };
  const id = await userChoice();
  const isDefault = !!id && (id === PROG_ID || /MD Viewer\.exe$/i.test(id));
  return { supported: true, isDefault, current: id };
}

// The dialog needs a real .md file; a small sample in the profile folder is
// used when no document is open.
function sampleFile() {
  const p = path.join(app.getPath('userData'), 'MD Viewer.md');
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, '# MD Viewer\n\nMarkdown files now open in **MD Viewer**.\n');
  }
  return p;
}

function chooseDefault(filePath) {
  if (!supported()) return false;
  const target = filePath && fs.existsSync(filePath) ? filePath : sampleFile();
  const child = spawn('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', target], { detached: true, stdio: 'ignore' });
  child.unref();
  return true;
}

module.exports = { status, chooseDefault };
