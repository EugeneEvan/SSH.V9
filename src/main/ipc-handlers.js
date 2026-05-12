const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow } = require('electron');

/**
 * 注册主进程 IPC 处理器。
 */
function registerIpcHandlers(context) {
  const { app, ipcMain, dialog, shell, profileStore, sessionManager, sftpService, createProfileWindow } = context;

  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('window:minimize', (event) => {
    getWindowFromEvent(event)?.minimize();
  });

  ipcMain.handle('window:maximize', (event) => {
    const targetWindow = getWindowFromEvent(event);
    if (!targetWindow) {
      return { maximized: false };
    }

    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize();
    } else {
      targetWindow.maximize();
    }

    return { maximized: targetWindow.isMaximized() };
  });

  ipcMain.handle('window:isMaximized', (event) => {
    const targetWindow = getWindowFromEvent(event);
    return targetWindow ? targetWindow.isMaximized() : false;
  });

  ipcMain.handle('window:close', (event) => {
    getWindowFromEvent(event)?.close();
  });

  ipcMain.handle('window:openProfileWindow', (event, payload) => {
    if (!payload?.profileId) {
      throw new Error('缺少连接标识');
    }

    const window = createProfileWindow(payload.profileId);
    return { windowId: window.id };
  });

  ipcMain.handle('profiles:list', () => profileStore.listProfiles());

  ipcMain.handle('profiles:save', (event, profile) => profileStore.saveProfile(profile));

  ipcMain.handle('profiles:remove', (event, profileId) => profileStore.removeProfile(profileId));

  ipcMain.handle('profiles:test', async (event, input) => {
    const profile = profileStore.getProfileForTest(input || {});
    return sessionManager.testConnection(profile);
  });

  ipcMain.handle('profiles:import', async () => importProfiles(dialog, profileStore));

  ipcMain.handle('profiles:export', async (event, options) => exportProfiles(dialog, profileStore, options));

  ipcMain.handle('profiles:getStoreInfo', () => profileStore.getStoreInfo());

  ipcMain.handle('profiles:getSecrets', (event, profileId) => profileStore.getProfileSecrets(profileId));

  ipcMain.handle('profiles:chooseStoreDirectory', async () => chooseStoreDirectory(dialog, profileStore));

  ipcMain.handle('dialog:pickPrivateKey', async () => pickPrivateKey(dialog));

  ipcMain.handle('ssh:connect', async (event, profileId) => {
    const profile = profileStore.getProfileForConnect(profileId);
    const result = await sessionManager.createSession(profile, event.sender);
    profileStore.markConnected(profileId);
    return result;
  });

  ipcMain.handle('ssh:write', (event, payload) => sessionManager.write(payload.sessionId, payload.data));

  ipcMain.handle('ssh:resize', (event, payload) => sessionManager.resize(payload.sessionId, payload.cols, payload.rows));

  ipcMain.handle('ssh:sendCommand', (event, payload) => sessionManager.sendCommand(payload.sessionId, payload.command));

  ipcMain.handle('ssh:setPathSync', (event, payload) => sessionManager.setPathSync(payload.sessionId, payload.enabled));

  ipcMain.handle('ssh:getServerStatus', (event, sessionId) => sessionManager.getServerStatus(sessionId));

  ipcMain.handle('ssh:disconnect', (event, sessionId) => sessionManager.disconnect(sessionId));

  ipcMain.handle('sftp:list', async (event, payload) => sftpService.listDirectory(payload.sessionId, payload.remotePath));

  ipcMain.handle('sftp:stat', async (event, payload) => sftpService.statEntry(payload.sessionId, payload.remotePath));

  ipcMain.handle('sftp:upload', async (event, payload) => uploadFiles(dialog, sftpService, payload));

  ipcMain.handle('sftp:uploadPaths', async (event, payload) => {
    const localPaths = Array.isArray(payload?.localPaths) ? payload.localPaths : [];
    return sftpService.uploadFiles(payload.sessionId, localPaths, payload.remoteDirectory);
  });

  ipcMain.handle('sftp:download', async (event, payload) => downloadFile(dialog, sftpService, payload));

  ipcMain.handle('sftp:downloadMany', async (event, payload) => downloadMany(dialog, sftpService, payload));

  ipcMain.handle('sftp:readFile', (event, payload) => sftpService.readTextFile(payload.sessionId, payload.remotePath, payload.options));

  ipcMain.handle('sftp:writeFile', (event, payload) => sftpService.writeTextFile(payload.sessionId, payload.remotePath, payload.content));

  ipcMain.handle('sftp:createFile', (event, payload) => sftpService.createFile(payload.sessionId, payload.remotePath));

  ipcMain.handle('sftp:mkdir', (event, payload) => sftpService.makeDirectory(payload.sessionId, payload.remotePath));

  ipcMain.handle('sftp:rename', (event, payload) => sftpService.renameEntry(payload.sessionId, payload.oldPath, payload.newPath));

  ipcMain.handle('sftp:chmod', (event, payload) => sftpService.changeMode(payload.sessionId, payload.remotePath, payload.mode));

  ipcMain.handle('sftp:delete', (event, payload) => sftpService.deleteEntry(payload.sessionId, payload.remotePath, payload.isDirectory));

  ipcMain.handle('shell:showItemInFolder', (event, localPath) => {
    if (localPath && fs.existsSync(localPath)) {
      shell.showItemInFolder(localPath);
    }
  });
}

/**
 * 根据 IPC 事件获取发送方窗口。
 */
function getWindowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

/**
 * 从本地 JSON 文件导入连接配置。
 */
async function importProfiles(dialog, profileStore) {
  const result = await dialog.showOpenDialog({
    title: '导入连接配置',
    filters: [{ name: 'SSH Profile', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const raw = fs.readFileSync(result.filePaths[0], 'utf8');
  return profileStore.importProfiles(raw);
}

/**
 * 导出连接配置到本地 JSON 文件。
 */
async function exportProfiles(dialog, profileStore, options = {}) {
  const result = await dialog.showSaveDialog({
    title: '导出连接配置',
    defaultPath: 'ssh-profiles.json',
    filters: [{ name: 'SSH Profile', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const json = profileStore.exportProfiles(options);
  fs.writeFileSync(result.filePath, json, 'utf8');
  return { canceled: false, filePath: result.filePath };
}

/**
 * 选择新的配置保存目录并复制现有配置。
 */
async function chooseStoreDirectory(dialog, profileStore) {
  const result = await dialog.showOpenDialog({
    title: '选择连接信息保存位置',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, storeInfo: profileStore.getStoreInfo() };
  }

  const storeInfo = profileStore.setStoreDirectory(result.filePaths[0]);
  return { canceled: false, storeInfo };
}

/**
 * 选择本地私钥文件路径。
 */
async function pickPrivateKey(dialog) {
  const result = await dialog.showOpenDialog({
    title: '选择私钥文件',
    properties: ['openFile'],
    filters: [
      { name: 'Private Key', extensions: ['pem', 'key', 'ppk', '*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return '';
  }

  return result.filePaths[0];
}

/**
 * 通过文件对话框上传本地文件。
 */
async function uploadFiles(dialog, sftpService, payload) {
  const result = await dialog.showOpenDialog({
    title: '上传文件',
    properties: ['openFile', 'openDirectory', 'multiSelections']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, uploaded: [] };
  }

  return sftpService.uploadFiles(payload.sessionId, result.filePaths, payload.remoteDirectory);
}

/**
 * 通过文件对话框下载远程文件。
 */
async function downloadFile(dialog, sftpService, payload) {
  const stat = await sftpService.statEntry(payload.sessionId, payload.remotePath);
  if (stat.isDirectory) {
    const directoryResult = await dialog.showOpenDialog({
      title: '选择下载目录',
      properties: ['openDirectory', 'createDirectory']
    });

    if (directoryResult.canceled || directoryResult.filePaths.length === 0) {
      return { canceled: true };
    }

    return sftpService.downloadEntry(
      payload.sessionId,
      payload.remotePath,
      path.join(directoryResult.filePaths[0], path.basename(payload.remotePath || 'download'))
    );
  }

  const defaultName = path.basename(payload.remotePath || 'download.bin');
  const result = await dialog.showSaveDialog({
    title: '下载文件',
    defaultPath: defaultName
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  return sftpService.downloadEntry(payload.sessionId, payload.remotePath, result.filePath);
}

/**
 * 批量下载远程文件和目录到本地目录。
 */
async function downloadMany(dialog, sftpService, payload) {
  const remotePaths = Array.isArray(payload?.remotePaths) ? payload.remotePaths.filter(Boolean) : [];
  if (remotePaths.length === 0) {
    return { canceled: true, downloaded: [] };
  }

  const result = await dialog.showOpenDialog({
    title: '选择下载目录',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, downloaded: [] };
  }

  return sftpService.downloadEntries(payload.sessionId, remotePaths, result.filePaths[0]);
}

module.exports = { registerIpcHandlers };
