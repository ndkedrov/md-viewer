'use strict';

// Rasterises the SVG icons into PNG + multi-size ICO files for the build,
// and on macOS also into ICNS files (via iconutil).
// Run with: npm run icon

const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

const jobs = [
  { svg: path.join(root, 'src/renderer/assets/icon.svg'), ico: 'build/icon.ico', png: ['build/icon.png', 'src/renderer/assets/icon.png'] },
  { svg: path.join(root, 'build/file.svg'), ico: 'build/file.ico', png: [] },
];

// macOS icons follow Apple's grid (build/icon-mac.svg has the padding and shadow).
const ICNS = [
  { svg: path.join(root, 'build/icon-mac.svg'), icns: 'build/icon.icns' },
  { svg: path.join(root, 'build/file.svg'), icns: 'build/file.icns' },
];
const ICONSET = [16, 32, 128, 256, 512]; // each also at @2x

async function buildIcns(win, job) {
  const svg = fs.readFileSync(job.svg, 'utf8');
  const sizes = [...new Set(ICONSET.flatMap((s) => [s, s * 2]))];
  const imgs = await rasterise(win, svg, sizes);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdv-')) + '/icon.iconset';
  fs.mkdirSync(dir);
  for (const s of ICONSET) {
    fs.writeFileSync(path.join(dir, `icon_${s}x${s}.png`), imgs[s]);
    fs.writeFileSync(path.join(dir, `icon_${s}x${s}@2x.png`), imgs[s * 2]);
  }
  execFileSync('iconutil', ['-c', 'icns', dir, '-o', path.join(root, job.icns)]);
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  console.log('wrote', job.icns);
}

async function rasterise(win, svgText, sizes) {
  const b64 = Buffer.from(svgText).toString('base64');
  const js = `(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,${b64}';
    await img.decode();
    const out = {};
    for (const s of ${JSON.stringify(sizes)}) {
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, s, s);
      out[s] = c.toDataURL('image/png').split(',')[1];
    }
    return out;
  })()`;
  const out = await win.webContents.executeJavaScript(js);
  const res = {};
  for (const [s, data] of Object.entries(out)) res[s] = Buffer.from(data, 'base64');
  return res;
}

// ICO with PNG-compressed entries (supported since Windows Vista).
function buildIco(images) {
  const sizes = Object.keys(images).map(Number).sort((a, b) => a - b);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + dir.length;
  sizes.forEach((s, i) => {
    const png = images[s];
    const o = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, o);
    dir.writeUInt8(s >= 256 ? 0 : s, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...sizes.map((s) => images[s])]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');
  for (const job of jobs) {
    const svg = fs.readFileSync(job.svg, 'utf8');
    const imgs = await rasterise(win, svg, [...SIZES, 512]);
    const big = imgs[512];
    delete imgs[512];
    fs.writeFileSync(path.join(root, job.ico), buildIco(imgs));
    for (const p of job.png) fs.writeFileSync(path.join(root, p), big);
    console.log('wrote', job.ico, ...job.png);
  }
  if (process.platform === 'darwin') {
    for (const job of ICNS) await buildIcns(win, job);
  }
  app.quit();
});
