'use strict';

// Tiny JSON settings file in the user data folder.

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

let data = null;
let timer = null;

function file() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(file(), 'utf8').replace(/^﻿/, '')); } catch { data = {}; }
  return data;
}

function flush() {
  clearTimeout(timer);
  timer = null;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(data, null, 2));
  } catch { /* settings are best effort */ }
}

function get(key, fallback) {
  const v = load()[key];
  return v === undefined ? fallback : v;
}

function set(key, value) {
  load()[key] = value;
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}

function all() {
  return { ...load() };
}

app.on('before-quit', () => { if (timer) flush(); });

module.exports = { get, set, all };
