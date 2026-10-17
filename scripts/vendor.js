'use strict';

// Copies the single self-contained Mermaid bundle next to the renderer, so the
// installer ships 5 MB instead of the whole 120 MB mermaid package.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const from = path.join(root, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
const to = path.join(root, 'src', 'renderer', 'vendor', 'mermaid.min.js');

fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
console.log('vendor: mermaid.min.js copied');
