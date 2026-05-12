const { contextBridge, ipcRenderer, clipboard } = require('electron');

/**
 * 监听主进程事件并返回取消监听函数。
 */
function on(channel, callback) {
  const listener = (event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('nexusSsh', {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion')
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    close: () => ipcRenderer.invoke('window:close'),
    openProfileWindow: (profileId) => ipcRenderer.invoke('window:openProfileWindow', { profileId }),
    onState: (callback) => on('window:state', callback)
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    save: (profile) => ipcRenderer.invoke('profiles:save', profile),
    remove: (profileId) => ipcRenderer.invoke('profiles:remove', profileId),
    test: (profile) => ipcRenderer.invoke('profiles:test', profile),
    import: () => ipcRenderer.invoke('profiles:import'),
    export: (options) => ipcRenderer.invoke('profiles:export', options),
    getStoreInfo: () => ipcRenderer.invoke('profiles:getStoreInfo'),
    getSecrets: (profileId) => ipcRenderer.invoke('profiles:getSecrets', profileId),
    chooseStoreDirectory: () => ipcRenderer.invoke('profiles:chooseStoreDirectory')
  },
  dialog: {
    pickPrivateKey: () => ipcRenderer.invoke('dialog:pickPrivateKey')
  },
  ssh: {
    connect: (profileId) => ipcRenderer.invoke('ssh:connect', profileId),
    write: (sessionId, data) => ipcRenderer.invoke('ssh:write', { sessionId, data }),
    resize: (sessionId, cols, rows) => ipcRenderer.invoke('ssh:resize', { sessionId, cols, rows }),
    sendCommand: (sessionId, command) => ipcRenderer.invoke('ssh:sendCommand', { sessionId, command }),
    setPathSync: (sessionId, enabled) => ipcRenderer.invoke('ssh:setPathSync', { sessionId, enabled }),
    getServerStatus: (sessionId) => ipcRenderer.invoke('ssh:getServerStatus', sessionId),
    disconnect: (sessionId) => ipcRenderer.invoke('ssh:disconnect', sessionId),
    onData: (callback) => on('ssh:data', callback),
    onStatus: (callback) => on('ssh:status', callback),
    onCwd: (callback) => on('ssh:cwd', callback)
  },
  sftp: {
    list: (sessionId, remotePath) => ipcRenderer.invoke('sftp:list', { sessionId, remotePath }),
    stat: (sessionId, remotePath) => ipcRenderer.invoke('sftp:stat', { sessionId, remotePath }),
    upload: (sessionId, remoteDirectory) => ipcRenderer.invoke('sftp:upload', { sessionId, remoteDirectory }),
    uploadPaths: (sessionId, localPaths, remoteDirectory) => ipcRenderer.invoke('sftp:uploadPaths', { sessionId, localPaths, remoteDirectory }),
    download: (sessionId, remotePath) => ipcRenderer.invoke('sftp:download', { sessionId, remotePath }),
    downloadMany: (sessionId, remotePaths) => ipcRenderer.invoke('sftp:downloadMany', { sessionId, remotePaths }),
    readFile: (sessionId, remotePath, options) => ipcRenderer.invoke('sftp:readFile', { sessionId, remotePath, options }),
    writeFile: (sessionId, remotePath, content) => ipcRenderer.invoke('sftp:writeFile', { sessionId, remotePath, content }),
    createFile: (sessionId, remotePath) => ipcRenderer.invoke('sftp:createFile', { sessionId, remotePath }),
    mkdir: (sessionId, remotePath) => ipcRenderer.invoke('sftp:mkdir', { sessionId, remotePath }),
    rename: (sessionId, oldPath, newPath) => ipcRenderer.invoke('sftp:rename', { sessionId, oldPath, newPath }),
    chmod: (sessionId, remotePath, mode) => ipcRenderer.invoke('sftp:chmod', { sessionId, remotePath, mode }),
    delete: (sessionId, remotePath, isDirectory) => ipcRenderer.invoke('sftp:delete', { sessionId, remotePath, isDirectory })
  },
  clipboard: {
    readText: () => clipboard.readText(),
    writeText: (text) => clipboard.writeText(text || '')
  },
  ui: {
    onNewProfile: (callback) => on('ui:newProfile', callback),
    onImportProfiles: (callback) => on('ui:importProfiles', callback),
    onExportProfiles: (callback) => on('ui:exportProfiles', callback),
    onFocusTerminal: (callback) => on('ui:focusTerminal', callback),
    onRefreshFiles: (callback) => on('ui:refreshFiles', callback),
    onTogglePathSync: (callback) => on('ui:togglePathSync', callback),
    onToggleCommandHints: (callback) => on('ui:toggleCommandHints', callback),
    onToggleLeftDrawer: (callback) => on('ui:toggleLeftDrawer', callback),
    onToggleRightDrawer: (callback) => on('ui:toggleRightDrawer', callback),
    onToggleTheme: (callback) => on('ui:toggleTheme', callback),
    onOpenSettings: (callback) => on('ui:openSettings', callback),
    onCopyTerminal: (callback) => on('ui:copyTerminal', callback),
    onPasteTerminal: (callback) => on('ui:pasteTerminal', callback),
    onClearTerminal: (callback) => on('ui:clearTerminal', callback)
  }
});
