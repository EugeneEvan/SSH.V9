const path = require('node:path');
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const { ProfileStore } = require('./profile-store');
const { TerminalSessionManager } = require('./terminal-session-manager');
const { SftpService } = require('./sftp-service');
const { registerIpcHandlers } = require('./ipc-handlers');

const windows = new Set();
let profileStore = null;
let sessionManager = null;
let sftpService = null;
let ipcRegistered = false;

/**
 * 创建应用窗口并按需携带启动连接参数。
 */
function createWindow(options = {}) {
  const window = new BrowserWindow({
    width: options.width || 1440,
    height: options.height || 900,
    minWidth: 1060,
    minHeight: 680,
    title: 'SSH',
    backgroundColor: '#f1f3f4',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'app-icon.png'),
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  windows.add(window);
  window.setMenuBarVisibility(false);
  bindWindowStateEvents(window);

  window.once('ready-to-show', () => {
    window.show();
    sendWindowState(window);
  });

  window.on('closed', () => {
    windows.delete(window);
  });

  const query = new URLSearchParams();
  if (options.profileId) {
    query.set('profileId', options.profileId);
    query.set('connect', '1');
  }

  const filePath = path.join(__dirname, '..', 'renderer', 'index.html');
  const hash = query.toString() ? `#${query.toString()}` : '';
  window.loadFile(filePath, { hash });
  return window;
}

/**
 * 绑定窗口最大化状态变化并通知渲染进程。
 */
function bindWindowStateEvents(window) {
  window.on('maximize', () => sendWindowState(window));
  window.on('unmaximize', () => sendWindowState(window));
  window.on('restore', () => sendWindowState(window));
  window.on('enter-full-screen', () => sendWindowState(window));
  window.on('leave-full-screen', () => sendWindowState(window));
}

/**
 * 向渲染进程发送当前窗口状态。
 */
function sendWindowState(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send('window:state', {
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen()
  });
}

/**
 * 初始化配置仓库、终端会话管理器和 SFTP 服务。
 */
function bootstrapServices() {
  profileStore = new ProfileStore(app);
  sessionManager = new TerminalSessionManager();
  sftpService = new SftpService(sessionManager);

  if (!ipcRegistered) {
    registerIpcHandlers({
      app,
      ipcMain,
      dialog,
      shell,
      profileStore,
      sessionManager,
      sftpService,
      createProfileWindow: (profileId) => createWindow({ profileId })
    });
    ipcRegistered = true;
  }

  buildApplicationMenu();
}

/**
 * 创建隐藏的应用菜单以保留系统级快捷键。
 */
function buildApplicationMenu() {
  const template = [
    {
      label: 'Setting',
      submenu: [
        { label: '新建连接', accelerator: 'Ctrl+N', click: (_, focusedWindow) => focusedWindow?.webContents.send('ui:newProfile') },
        { label: '打开设置', accelerator: 'Ctrl+,', click: (_, focusedWindow) => focusedWindow?.webContents.send('ui:openSettings') },
        { type: 'separator' },
        { label: '切换连接面板', accelerator: 'Ctrl+B', click: (_, focusedWindow) => focusedWindow?.webContents.send('ui:toggleLeftDrawer') },
        { label: '切换 SFTP 面板', accelerator: 'Ctrl+Shift+B', click: (_, focusedWindow) => focusedWindow?.webContents.send('ui:toggleRightDrawer') },
        { label: '刷新 SFTP', accelerator: 'F5', click: (_, focusedWindow) => focusedWindow?.webContents.send('ui:refreshFiles') },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * 绑定应用生命周期并启动主窗口。
 */
function registerApplicationLifecycle() {
  app.whenReady().then(() => {
    bootstrapServices();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    if (sessionManager) {
      sessionManager.disconnectAll();
    }
  });
}

registerApplicationLifecycle();
