// Safe bridge between the renderer and the main process
const { contextBridge, ipcRenderer } = require('electron');
const ALLOWED = ['state', 'character', 'say', 'ask', 'ask-close', 'lang'];

contextBridge.exposeInMainWorld('pet', {
  on: (channel, fn) => { if (ALLOWED.includes(channel)) ipcRenderer.on(channel, (_e, data) => fn(data)); },
  ready: () => ipcRenderer.send('ready'),
  setIgnore: (ignore) => ipcRenderer.send('ignore', ignore),
  hide: () => ipcRenderer.send('hide'),
  choose: (data) => ipcRenderer.send('choose', data),
  typing: () => ipcRenderer.send('typing'),
  focusInput: () => ipcRenderer.send('focus-input'),
  drag: (on) => ipcRenderer.send('drag', on),
});
