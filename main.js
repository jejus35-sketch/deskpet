// DeskPet main process
// - Shows the pet in a transparent always-on-top window that follows the cursor
// - Groups new Desktop files into folders by arrival time (files saved in a burst go together)
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, Notification, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const STRINGS = require('./renderer/i18n.js');

// ───────── Settings ─────────
const WIN_W = 260;
const WIN_H = 330;
const STOP_DISTANCE = 130;   // stop and sit within this distance of the cursor
const SPEED = 9;             // pixels per tick (~30fps)
const SLEEP_AFTER_MS = 8000; // doze after the cursor is idle this long
const ASK_TIMEOUT_MS = 20000;// no answer in the bubble → dated folder
// Never touched: shortcuts, temp/partial downloads, system files, and blank files made via Desktop → New ('새 …' / 'New …')
const SKIP_EXT = /\.(lnk|url|ini|tmp|temp|crdownload|part|partial|download|opdownload)$/i;
const SKIP_NAME = /^(~\$|\.|desktop\.ini$|thumbs\.db$|새 |new )/i;

const defaults = {
  character: 'cat',      // 'cat' | 'dog' | 'catSoft' | 'dogSoft'
  follow: true,          // follow the cursor
  paused: false,         // pause tidying
  language: 'auto',      // 'auto' | 'ko' | 'en'
  gapMinutes: 20,        // a file after this much quiet starts a new batch
  openAtLogin: false,
  lastFolder: null,
  lastTime: 0,
  x: null,
  y: null,
};

if (!app.requestSingleInstanceLock()) app.quit();

const configPath = () => path.join(app.getPath('userData'), 'config.json');
let cfg = { ...defaults };
function loadConfig() {
  try { cfg = { ...defaults, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) }; } catch { cfg = { ...defaults }; }
  if (!['cat', 'dog', 'catSoft', 'dogSoft'].includes(cfg.character)) cfg.character = 'cat';
}
function saveConfig() {
  try { fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2)); } catch (e) { console.error('Failed to save settings', e); }
}

// Language: 'auto' picks Korean if Windows is Korean, otherwise English
function lang() {
  if (cfg.language === 'ko' || cfg.language === 'en') return cfg.language;
  const sys = (app.getPreferredSystemLanguages()[0] || app.getLocale() || 'en').toLowerCase();
  return sys.startsWith('ko') ? 'ko' : 'en';
}
const T = () => STRINGS[lang()];

let win = null;
let tray = null;
let desktopDir = '';

// ───────── Window ─────────
function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  const x = Number.isFinite(cfg.x) ? cfg.x : wa.x + wa.width - WIN_W - 40;
  const y = Number.isFinite(cfg.y) ? cfg.y : wa.y + wa.height - WIN_H;
  pos = { x, y };

  win = new BrowserWindow({
    width: WIN_W, height: WIN_H, x, y,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    skipTaskbar: true, focusable: false, alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      spellcheck: false, // no spellchecker (avoids dictionary downloads)
    },
  });
  // block navigation and new windows
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true }); // clicks on empty areas pass through
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// ───────── Movement ─────────
let pos = { x: 0, y: 0 };
let lastCursor = { x: 0, y: 0 };
let lastMoveAt = Date.now();
let current = { state: '', facing: 1 };
let dragging = false;
let dragOffset = { x: 0, y: 0 };
let talkUntil = 0;
let asking = false;

// Window positions must be int32. Math.round(-0.4) is -0, which Electron rejects, so normalize with |0
function toInt(n) { return Number.isFinite(n) ? Math.round(n) | 0 : 0; }
function moveWindow(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  try { win.setPosition(toInt(x), toInt(y)); } catch (e) { console.error('Failed to move window', e); }
}

function setState(state, facing) {
  if (state === current.state && facing === current.facing) return;
  current = { state, facing };
  send('state', current);
}

function tick() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const now = Date.now();
  const c = screen.getCursorScreenPoint();
  if (c.x !== lastCursor.x || c.y !== lastCursor.y) { lastCursor = c; lastMoveAt = now; }
  const idle = now - lastMoveAt;
  const talking = asking || now < talkUntil;

  if (dragging) {
    pos = { x: c.x - dragOffset.x, y: c.y - dragOffset.y };
    moveWindow(pos.x, pos.y);
    return setState(talking ? 'talk' : 'sit', current.facing);
  }

  // distance from the pet's feet to the cursor
  const fx = pos.x + WIN_W / 2;
  const fy = pos.y + WIN_H - 30;
  const dx = c.x - fx;
  const dy = c.y - fy;
  const dist = Math.hypot(dx, dy);
  const facing = dx >= 0 ? 1 : -1;

  if (talking) return setState('talk', current.facing);

  if (cfg.follow && dist > STOP_DISTANCE) {
    const step = Math.min(SPEED, dist - STOP_DISTANCE);
    let nx = pos.x + (dx / dist) * step;
    let ny = pos.y + (dy / dist) * step;
    const wa = screen.getDisplayNearestPoint(c).workArea;
    nx = Math.max(wa.x - 40, Math.min(nx, wa.x + wa.width - WIN_W + 40));
    ny = Math.max(wa.y - 80, Math.min(ny, wa.y + wa.height - WIN_H + 10));
    pos = { x: nx, y: ny };
    moveWindow(nx, ny);
    return setState('run', facing);
  }

  setState(idle > SLEEP_AFTER_MS ? 'sleep' : 'sit', current.facing);
}

// ───────── Desktop tidying ─────────
const inFlight = new Set();
let pending = [];
let askTimer = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// wait until the file is fully written (same size twice in a row)
async function waitUntilWritten(file) {
  let prev = -1;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    let st;
    try { st = fs.statSync(file); } catch { return false; }
    if (!st.isFile()) return false;
    if (st.size > 0 && st.size === prev) return true;
    prev = st.size;
  }
  return false;
}

function watchDesktop() {
  desktopDir = app.getPath('desktop');
  try {
    fs.watch(desktopDir, (_event, name) => {
      if (!name || name.includes(path.sep)) return;
      if (cfg.paused) return;
      if (SKIP_EXT.test(name) || SKIP_NAME.test(name)) return;
      if (inFlight.has(name)) return;
      inFlight.add(name);
      waitUntilWritten(path.join(desktopDir, name)).then((ok) => {
        inFlight.delete(name);
        if (ok) onNewFile(name);
      });
    });
  } catch (e) {
    console.error('Failed to watch Desktop', e);
  }
}

function pad(n) { return String(n).padStart(2, '0'); }

// Unnamed batches: Sorted_10-04_1, Sorted_10-04_2 ... (정리_… in Korean)
function nextDatedName() {
  const d = new Date();
  const prefix = `${T().folderPrefix}_${pad(d.getMonth() + 1)}-${pad(d.getDate())}_`;
  let max = 0;
  for (const entry of fs.readdirSync(desktopDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(prefix)) {
      const n = parseInt(entry.name.slice(prefix.length), 10);
      if (n > max) max = n;
    }
  }
  return prefix + (max + 1);
}
function createDatedFolder() {
  const folder = path.join(desktopDir, nextDatedName());
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

// Named batches: reuse an existing folder with the same name
function cleanName(raw) {
  return String(raw || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/, '').trim().slice(0, 60);
}
function namedFolder(raw) {
  const name = cleanName(raw);
  if (!name) return createDatedFolder();
  const folder = path.join(desktopDir, name);
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

function uniqueTarget(folder, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let target = path.join(folder, name);
  for (let i = 2; fs.existsSync(target); i++) target = path.join(folder, `${base} (${i})${ext}`);
  return target;
}

function moveInto(folder, names) {
  let moved = 0;
  for (const name of names) {
    const src = path.join(desktopDir, name);
    if (!fs.existsSync(src)) continue;
    try { fs.renameSync(src, uniqueTarget(folder, name)); moved++; } catch (e) { console.error('Failed to move', name, e); }
  }
  cfg.lastFolder = folder;
  cfg.lastTime = Date.now();
  saveConfig();
  return moved;
}

function say(text, ms = 2600) {
  talkUntil = Date.now() + ms;
  send('say', { text, ms });
}

function report(folder, count, isNew) {
  const name = path.basename(folder);
  const text = isNew ? T().doneNew(name) : T().doneAdd(name, count);
  if (win && win.isVisible()) say(text);
  else if (Notification.isSupported()) new Notification({ title: 'DeskPet', body: text, silent: true }).show();
}

function onNewFile(name) {
  if (asking) { // already asking → same batch
    pending.push(name);
    send('ask', { count: pending.length, last: lastFolderName(), fallback: nextDatedName() });
    return;
  }
  const hasLast = !!lastFolderName();
  const withinGap = Date.now() - cfg.lastTime < cfg.gapMinutes * 60000;

  if (hasLast && withinGap) return report(cfg.lastFolder, moveInto(cfg.lastFolder, [name]), false);

  if (!win || !win.isVisible()) { // pet hidden → dated folder without asking
    const folder = createDatedFolder();
    moveInto(folder, [name]);
    return report(folder, 1, true);
  }

  // New batch → ask for a name (temporarily allow focus for typing)
  asking = true;
  pending = [name];
  win.setFocusable(true);
  send('ask', { count: 1, last: lastFolderName(), fallback: nextDatedName() });
  armAskTimer();
}

function lastFolderName() {
  return cfg.lastFolder && fs.existsSync(cfg.lastFolder) ? path.basename(cfg.lastFolder) : null;
}

function armAskTimer() {
  clearTimeout(askTimer);
  askTimer = setTimeout(() => decide({ choice: 'name', name: '' }), ASK_TIMEOUT_MS);
}

// choice: 'name' (blank → dated folder) | 'last' (previous folder)
function decide({ choice, name }) {
  if (!asking) return;
  clearTimeout(askTimer);
  asking = false;
  const useLast = choice === 'last' && !!lastFolderName();
  const folder = useLast ? cfg.lastFolder : namedFolder(name);
  const count = moveInto(folder, pending);
  pending = [];
  send('ask-close');
  if (win && !win.isDestroyed()) { win.blur(); win.setFocusable(false); }
  report(folder, count, !useLast);
}

// ───────── Tray menu ─────────
const CHARACTERS = ['cat', 'dog', 'catSoft', 'dogSoft'];
function petName() { return cfg.character.startsWith('dog') ? T().petDog : T().petCat; }

function setVisible(show) {
  if (!win) return;
  if (show) { win.showInactive(); current = { state: '', facing: 1 }; } else { win.hide(); }
  buildMenu();
}

function buildMenu() {
  const t = T();
  const visible = win && win.isVisible();
  const menu = Menu.buildFromTemplate([
    { label: visible ? t.hide(petName()) : t.show(petName()), click: () => setVisible(!visible) },
    { type: 'separator' },
    { label: t.character, submenu: [
      ...CHARACTERS.map((c) => ({ label: t[c], type: 'radio', checked: cfg.character === c, click: () => setCharacter(c) })),
    ] },
    { label: t.follow, type: 'checkbox', checked: cfg.follow, click: (i) => { cfg.follow = i.checked; saveConfig(); } },
    { type: 'separator' },
    { label: t.pause, type: 'checkbox', checked: cfg.paused, click: (i) => { cfg.paused = i.checked; saveConfig(); } },
    { label: t.gap, submenu: [10, 20, 30, 60].map((m) => ({
      label: t.minutes(m), type: 'radio', checked: cfg.gapMinutes === m, click: () => { cfg.gapMinutes = m; saveConfig(); },
    })) },
    { label: t.openLast, enabled: !!(cfg.lastFolder && fs.existsSync(cfg.lastFolder)), click: () => shell.openPath(cfg.lastFolder) },
    { type: 'separator' },
    { label: t.language, submenu: [
      { label: t.langAuto, type: 'radio', checked: cfg.language === 'auto', click: () => setLanguage('auto') },
      { label: '한국어', type: 'radio', checked: cfg.language === 'ko', click: () => setLanguage('ko') },
      { label: 'English', type: 'radio', checked: cfg.language === 'en', click: () => setLanguage('en') },
    ] },
    { label: t.autostart, type: 'checkbox', checked: cfg.openAtLogin, click: (i) => {
      cfg.openAtLogin = i.checked; saveConfig();
      app.setLoginItemSettings({ openAtLogin: i.checked, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath });
    } },
    { label: t.quit, click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`DeskPet - ${petName()}`);
}

function setLanguage(l) {
  cfg.language = l;
  saveConfig();
  send('lang', lang());
  if (asking) send('ask', { count: pending.length, last: lastFolderName(), fallback: nextDatedName() });
  buildMenu();
}

function setCharacter(c) {
  cfg.character = c;
  saveConfig();
  send('character', c);
  buildMenu();
}

// ───────── IPC ─────────
ipcMain.on('ready', () => {
  send('lang', lang());
  send('character', cfg.character);
  current = { state: '', facing: 1 };
});
ipcMain.on('ignore', (_e, ignore) => win && win.setIgnoreMouseEvents(!!ignore, { forward: true }));
ipcMain.on('hide', () => setVisible(false));
ipcMain.on('choose', (_e, data) => decide({ choice: data && data.choice === 'last' ? 'last' : 'name', name: data && data.name }));
ipcMain.on('typing', () => { if (asking) armAskTimer(); }); // keep waiting while the user types
ipcMain.on('focus-input', () => { if (asking && win) { win.setFocusable(true); win.focus(); } });
ipcMain.on('drag', (_e, on) => {
  if (on) {
    const c = screen.getCursorScreenPoint();
    dragOffset = { x: c.x - pos.x, y: c.y - pos.y };
    dragging = true;
  } else {
    dragging = false;
    lastMoveAt = Date.now();
  }
});

// ───────── Privacy: block all network access ─────────
// The app only loads local files (file://). Every other request is cancelled.
function blockNetwork() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const local = details.url.startsWith('file:') || details.url.startsWith('devtools:') || details.url.startsWith('data:');
    if (!local) console.warn('Blocked network request:', details.url);
    callback({ cancel: !local });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false)); // deny camera, mic, location, etc.
  // Spellcheck dictionaries are downloaded outside the request filter above, so turn the feature off entirely
  // and point any download at a local path that does not exist.
  try {
    session.defaultSession.setSpellCheckerEnabled(false);
    session.defaultSession.setSpellCheckerDictionaryDownloadURL('file:///nonexistent/');
  } catch (e) { console.error('spellcheck lockdown', e); }
}

// Chromium background services (component updates, metrics, safe-browsing lists) - off before the app starts
for (const sw of ['disable-background-networking', 'disable-component-update', 'disable-domain-reliability', 'no-pings', 'disable-sync'])
  app.commandLine.appendSwitch(sw);
app.commandLine.appendSwitch('disable-features', 'SpellCheck,OptimizationHints,MediaRouter,DialMediaRouteProvider,AutofillServerCommunication,CertificateTransparencyComponentUpdater');

app.whenReady().then(() => {
  blockNetwork();
  loadConfig();
  createWindow();
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
  tray.on('click', () => setVisible(!win.isVisible()));
  buildMenu();
  watchDesktop();
  lastCursor = screen.getCursorScreenPoint();
  setInterval(() => { try { tick(); } catch (e) { console.error('tick error', e); } }, 33);
});

app.on('second-instance', () => setVisible(true));
app.on('before-quit', () => { cfg.x = toInt(pos.x); cfg.y = toInt(pos.y); saveConfig(); });
app.on('window-all-closed', (e) => e.preventDefault());
