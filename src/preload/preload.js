'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => {
  const fn = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('api', {
  load: (p) => ipcRenderer.invoke('doc:load', p),
  unwatch: (p) => ipcRenderer.invoke('doc:unwatch', p),
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  resolvePath: (base, rel) => ipcRenderer.invoke('path:resolve', base, rel),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  reveal: (p) => ipcRenderer.invoke('shell:reveal', p),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (k, v) => ipcRenderer.invoke('settings:set', k, v),
  menu: (template) => ipcRenderer.invoke('menu:popup', template),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onOpenFiles: on('open-files'),
  onDocChanged: on('doc-changed'),
  onThemeChanged: on('theme-changed'),
  onWindowState: on('window-state'),
});
