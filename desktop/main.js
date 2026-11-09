'use strict';
// 망자의 왕관 데스크톱 앱: 게임 폴더(game/)의 index.html을 창 하나로 띄운다.
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

const GAME_INDEX = path.join(__dirname, 'game', 'index.html');

// 두 번 실행하면 저장 파일이 서로 덮어쓰므로 창 하나만 연다
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('io.github.kts4u1.crownofthedead');
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}

function createWindow() {
  // 메뉴를 없애서 Ctrl+R(새로고침) 같은 단축키로 진행이 날아가지 않게 함
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: '망자의 왕관',
    backgroundColor: '#0b0807',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(GAME_INDEX);

  // F11 · Alt+Enter: 전체 화면
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });

  // 바깥 링크(저작자 표시 등)는 기본 브라우저로 연다
  const openOutside = url => { if (/^https?:\/\//.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) { e.preventDefault(); openOutside(url); }
  });

  // 창을 닫을 때 진행 상황을 저장하고 디스크에 기록한 뒤 닫는다
  let closing = false;
  win.on('close', e => {
    if (closing) return;
    closing = true;
    e.preventDefault();
    const save = win.webContents.executeJavaScript('try { Game.save(); true } catch (e) { false }');
    const timeout = new Promise(res => setTimeout(res, 1500));
    Promise.race([save, timeout]).catch(() => {}).finally(() => {
      try { session.defaultSession.flushStorageData(); } catch (err) { /* 무시 */ }
      win.destroy();
    });
  });
}
