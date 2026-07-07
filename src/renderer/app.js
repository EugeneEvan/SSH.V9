const SETTINGS_STORAGE_KEY = 'ssh.settings.v9';

const defaultSettings = {
  theme: 'light',
  leftDrawerOpen: false,
  rightDrawerOpen: true,
  pathSync: true,
  commandHints: true,
  fileFollow: true,
  terminalFontSize: 14,
  showConnectionDetails: false,
  latencyRefreshSeconds: 60,
  leftDrawerWidth: 260,
  rightDrawerWidth: 520,
  mouseBackAction: 'none',
  mouseForwardAction: 'none',
  shortcuts: {
    copy: 'Ctrl+Shift+C',
    paste: 'Ctrl+Shift+V',
    clear: 'Ctrl+Shift+L',
    search: 'Ctrl+F'
  }
};

const state = {
  profiles: [],
  selectedProfileId: '',
  tabs: [],
  activeTabId: '',
  settings: { ...defaultSettings },
  storeInfo: null,
  contextEntryPath: '',
  contextTabId: '',
  resizeState: null,
  editingFilePath: '',
  editingFileEntry: null,
  editingFileOriginalContent: '',
  editingFileEditable: false,
  editingFileDirty: false,
  unsavedResolver: null,
  durationTimer: null,
  fileMenuOpen: false,
  serverStatusVisible: false,
  serverStatusTimer: null,
  latencyRefreshTimer: null,
  latencyRefreshRunning: false,
  recordingShortcutAction: '',
  profileContextId: '',
  profileMasked: false,
  profileLatencies: {},
  sftpSort: { key: 'name', direction: 'asc' },
  terminalSearch: { query: '', matches: [], index: -1 }
};

const commandCatalog = [
  { command: 'pwd', description: '显示当前远程目录', kind: '命令' },
  { command: 'ls -lah', description: '查看目录详情', kind: '命令' },
  { command: 'ls -ltr', description: '按时间倒序查看文件', kind: '命令' },
  { command: 'cd /var/www/html', description: '进入站点目录', kind: '路径' },
  { command: 'df -h', description: '查看磁盘空间', kind: '命令' },
  { command: 'du -sh *', description: '统计当前目录大小', kind: '命令' },
  { command: 'free -h', description: '查看内存使用', kind: '命令' },
  { command: 'top', description: '查看进程资源占用', kind: '命令' },
  { command: 'htop', description: '打开增强进程监控', kind: '命令' },
  { command: 'systemctl status nginx', description: '查看 nginx 状态', kind: '服务' },
  { command: 'systemctl restart nginx', description: '重启 nginx', kind: '服务' },
  { command: 'journalctl -u nginx -n 200', description: '查看 nginx 服务日志', kind: '日志' },
  { command: 'tail -f /var/log/nginx/error.log', description: '实时查看 nginx 错误日志', kind: '日志' },
  { command: 'tail -n 200 ', description: '查看文件末尾 200 行', kind: '日志' },
  { command: 'docker ps', description: '显示运行中的容器', kind: 'Docker' },
  { command: 'docker ps -a', description: '显示所有容器', kind: 'Docker' },
  { command: 'docker logs -f ', description: '持续查看容器日志', kind: 'Docker' },
  { command: 'docker compose ps', description: '查看 compose 服务', kind: 'Docker' },
  { command: 'git status', description: '查看 Git 状态', kind: 'Git' },
  { command: 'find . -name "*.log"', description: '查找日志文件', kind: '查找' },
  { command: 'find . -type f -name ', description: '按文件名查找文件', kind: '查找' },
  { command: 'grep -R "keyword" .', description: '递归搜索关键字', kind: '查找' },
  { command: 'grep -Rni "keyword" .', description: '递归搜索并显示行号', kind: '查找' },
  { command: 'chmod +x ', description: '添加执行权限', kind: '权限' },
  { command: 'curl -I https://example.com', description: '检查 HTTP 响应头', kind: '网络' }
];

const commandOptionCatalog = [
  { pattern: /^ls(?:\s+-[\w-]*)?$/i, command: 'ls -l', description: '长格式列表', kind: '参数' },
  { pattern: /^ls(?:\s+-[\w-]*)?$/i, command: 'ls -la', description: '包含隐藏文件', kind: '参数' },
  { pattern: /^ls(?:\s+-[\w-]*)?$/i, command: 'ls -lah', description: '隐藏文件 + 易读大小', kind: '参数' },
  { pattern: /^ls(?:\s+-[\w-]*)?$/i, command: 'ls -ltr', description: '按时间倒序排列', kind: '参数' },
  { pattern: /^grep(?:\s+-[\w-]*)?$/i, command: 'grep -R', description: '递归搜索目录', kind: '参数' },
  { pattern: /^grep(?:\s+-[\w-]*)?$/i, command: 'grep -Rni', description: '递归 + 忽略大小写 + 行号', kind: '参数' },
  { pattern: /^find\b.*(?:\s+-[\w-]*)?$/i, command: 'find . -type f', description: '只查找文件', kind: '参数' },
  { pattern: /^find\b.*(?:\s+-[\w-]*)?$/i, command: 'find . -type d', description: '只查找目录', kind: '参数' },
  { pattern: /^du(?:\s+-[\w-]*)?$/i, command: 'du -sh *', description: '汇总当前目录大小', kind: '参数' },
  { pattern: /^df(?:\s+-[\w-]*)?$/i, command: 'df -h', description: '易读单位显示磁盘', kind: '参数' },
  { pattern: /^docker\s+ps(?:\s+-[\w-]*)?$/i, command: 'docker ps -a', description: '显示所有容器', kind: '参数' },
  { pattern: /^docker\s+logs(?:\s+-[\w-]*)?$/i, command: 'docker logs -f ', description: '持续输出日志', kind: '参数' },
  { pattern: /^journalctl(?:\s+-[\w-]*)?$/i, command: 'journalctl -xe', description: '查看最近错误日志', kind: '参数' },
  { pattern: /^journalctl\b.*(?:\s+-[\w-]*)?$/i, command: 'journalctl -u nginx -n 200', description: '查看服务最近日志', kind: '参数' },
  { pattern: /^tail(?:\s+-[\w-]*)?$/i, command: 'tail -f ', description: '实时跟随文件输出', kind: '参数' },
  { pattern: /^tail(?:\s+-[\w-]*)?$/i, command: 'tail -n 200 ', description: '查看末尾 200 行', kind: '参数' },
  { pattern: /^curl(?:\s+-[\w-]*)?$/i, command: 'curl -I ', description: '只请求响应头', kind: '参数' },
  { pattern: /^tar(?:\s+-[\w-]*)?$/i, command: 'tar -czf archive.tar.gz ', description: '打包并 gzip 压缩', kind: '参数' },
  { pattern: /^tar(?:\s+-[\w-]*)?$/i, command: 'tar -xzf archive.tar.gz', description: '解压 gzip 包', kind: '参数' }
];

const elements = {};

document.addEventListener('DOMContentLoaded', initializeApplication);

/**
 * 初始化应用界面、配置、连接列表和主进程事件。
 */
async function initializeApplication() {
  cacheElements();
  setupDrawerToolbarLayout();
  loadApplicationSettings();
  applyApplicationSettings(false);
  bindUiEvents();
  bindMainProcessEvents();
  await loadStoreInfo();
  await loadProfiles();
  refreshProfileLatencies({ silent: true });
  resetLatencyRefreshTimer();
  renderWorkspaceState();
  renderTabs();
  renderActiveSession();
  updateWindowControlState(await window.nexusSsh.window.isMaximized());
  await openStartupProfileIfNeeded();
}

/**
 * 缓存页面中需要频繁访问的 DOM 元素。
 */
function cacheElements() {
  const ids = [
    'windowShell', 'mainLayout', 'connectionDrawer', 'settingsButton', 'fileMenuButton',
    'fileMenu', 'fileMenuNewProfileButton', 'fileMenuImportButton', 'fileMenuExportButton', 'minimizeWindowButton', 'maximizeWindowButton', 'closeWindowButton',
    'leftDrawerToolbarButton', 'rightDrawerToolbarButton', 'serverStatusToolbarButton', 'leftResizeHandle', 'rightResizeHandle',
    'leftDrawerEdgeButton', 'rightDrawerEdgeButton', 'connectionSearchToggleButton', 'connectionSearchBox',
    'collapseRightDrawerButton', 'connectionSearchInput', 'welcomeSearchInput', 'welcomeListTitle',
    'welcomeRefreshProfilesButton', 'welcomeMaskProfilesButton', 'welcomeNewProfileButton',
    'profileGroups', 'welcomeProfileList', 'tabsContainer', 'newTabButton', 'welcomeView', 'sessionView',
    'terminalWrap', 'terminalStack', 'currentPathLabel', 'inlineCommandHint', 'sftpDrawer', 'sftpHostLabel',
    'serverStatusPanel', 'serverStatusContent', 'serverStatusUpdatedText',
    'uploadButton', 'downloadButton', 'refreshFilesButton', 'sftpSearchInput', 'pathSyncSwitch', 'commandHintSwitch', 'fileFollowSwitch',
    'breadcrumbList', 'fileTableWrap', 'fileTableBody', 'sftpContextMenu', 'tabContextMenu', 'tabDuplicateButton',
    'tabOpenWindowButton', 'tabServerStatusButton', 'tabCloseButton', 'tabCloseOthersButton', 'tabCloseLeftButton', 'tabCloseRightButton', 'tabCloseAllButton',
    'contextRefreshButton', 'contextUploadButton', 'contextDownloadButton', 'contextNewFileButton', 'contextNewFolderButton', 'contextRenameButton',
    'contextChmodButton', 'contextDeleteButton', 'connectionStatusDot', 'connectionStatusText', 'connectionEndpoint',
    'latencyText', 'shellText', 'sessionDurationText', 'noticeHost', 'profileModal', 'profileForm', 'profileModalTitle',
    'closeProfileModalButton', 'profileIdInput', 'profileNameInput', 'profileGroupInput', 'profileHostInput',
    'profilePortInput', 'profileUsernameInput', 'profileAuthTypeInput', 'authPasswordButton', 'authKeyButton', 'profileTimeoutInput',
    'profileKeepaliveInput', 'profileRemotePathInput', 'profileStartupCommandInput', 'profileTagsInput', 'profileColorInput', 'profileColorGroup',
    'passwordAuthPanel', 'profilePasswordInput', 'keyAuthPanel', 'profilePrivateKeyInput', 'pickPrivateKeyButton',
    'profilePassphraseInput', 'togglePasswordButton', 'togglePassphraseButton', 'profilePathSyncInput', 'profileTestResult', 'deleteProfileButton', 'testProfileButton',
    'cancelProfileButton', 'saveProfileButton', 'exportModal', 'exportForm', 'closeExportModalButton',
    'exportSelectAllInput', 'exportSecretsInput', 'exportProfileList', 'cancelExportButton', 'confirmExportButton',
    'settingsModal', 'settingsForm', 'closeSettingsModalButton', 'settingsThemeSelect', 'settingsThemeDarkButton', 'settingsThemeLightButton', 'settingsFontSizeInput',
    'defaultStorePathInput', 'currentStorePathInput', 'changeStorePathButton', 'settingsLeftDrawerInput',
    'settingsRightDrawerInput', 'settingsPathSyncInput', 'settingsCommandHintInput', 'settingsFileFollowInput',
    'settingsShowConnectionDetailInput', 'copyShortcutButton', 'pasteShortcutButton', 'clearShortcutButton', 'searchShortcutButton',
    'mouseBackActionGroup', 'mouseForwardActionGroup', 'cancelSettingsButton',
    'saveSettingsButton', 'fileEditorModal', 'fileEditorName', 'fileEditorPath', 'fileEditorMeta', 'fileEditorHighlight', 'fileEditorTextarea',
    'fileEditorMessage', 'closeFileEditorButton', 'saveRemoteFileButton', 'reloadRemoteFileButton',
    'downloadPreviewFileButton', 'unsavedModal', 'unsavedCancelButton', 'unsavedDiscardButton', 'unsavedSaveButton',
    'profileContextMenu', 'profileContextOpenButton', 'profileContextCloseButton', 'profileContextCloseAllButton', 'profileContextCopyHostButton',
    'profileContextEditButton', 'profileContextCopyButton', 'profileContextRenameButton', 'profileContextDeleteButton',
    'terminalContextMenu', 'terminalContextCopyButton', 'terminalContextPasteButton', 'terminalContextClearButton', 'terminalContextSearchButton',
    'terminalSearchPanel', 'terminalSearchInput', 'terminalSearchPrevButton', 'terminalSearchNextButton', 'terminalSearchCloseButton', 'terminalSearchCount'
  ];

  ids.forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function setupDrawerToolbarLayout() {
  const toolbar = elements.connectionDrawer?.querySelector('.drawer-toolbar');
  const actions = toolbar?.querySelector('.drawer-actions');
  if (!toolbar || !actions || !elements.connectionSearchBox) {
    return;
  }

  if (elements.connectionSearchBox.parentElement !== toolbar) {
    toolbar.insertBefore(elements.connectionSearchBox, actions);
  }
  elements.connectionSearchBox.classList.remove('collapsed');
  elements.connectionSearchToggleButton?.setAttribute('tabindex', '-1');
}

/**
 * 绑定所有渲染进程界面事件。
 */
function bindUiEvents() {
  elements.minimizeWindowButton.addEventListener('click', () => window.nexusSsh.window.minimize());
  elements.maximizeWindowButton.addEventListener('click', toggleMaximizeWindow);
  elements.closeWindowButton.addEventListener('click', () => window.nexusSsh.window.close());
  elements.settingsButton.addEventListener('click', openSettingsModal);
  elements.fileMenuButton.addEventListener('click', toggleFileMenu);
  elements.fileMenuNewProfileButton.addEventListener('click', () => runFileMenuAction(() => openProfileModal()));
  elements.fileMenuImportButton.addEventListener('click', () => runFileMenuAction(importProfiles));
  elements.fileMenuExportButton.addEventListener('click', () => runFileMenuAction(openExportModal));
  elements.leftDrawerToolbarButton.addEventListener('click', showWelcomeWorkspace);
  elements.rightDrawerToolbarButton.addEventListener('click', toggleRightDrawer);
  elements.leftDrawerEdgeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleLeftDrawer();
  });
  elements.leftDrawerEdgeButton.addEventListener('mousedown', (event) => event.stopPropagation());
  elements.rightDrawerEdgeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleRightDrawer();
  });
  elements.rightDrawerEdgeButton.addEventListener('mousedown', (event) => event.stopPropagation());
  elements.connectionSearchToggleButton.addEventListener('click', toggleConnectionSearch);
  elements.serverStatusToolbarButton.addEventListener('click', toggleServerStatusPanel);
  elements.collapseRightDrawerButton.addEventListener('click', () => setRightDrawerOpen(false));
  elements.newTabButton.addEventListener('click', () => openProfileModal());
  elements.welcomeNewProfileButton.addEventListener('click', () => openProfileModal());
  elements.welcomeRefreshProfilesButton.addEventListener('click', refreshProfilesAndLatency);
  elements.welcomeMaskProfilesButton.addEventListener('click', toggleProfileMask);
  elements.connectionSearchInput.addEventListener('input', renderProfiles);
  elements.welcomeSearchInput.addEventListener('input', renderProfiles);
  elements.uploadButton.addEventListener('click', uploadFiles);
  elements.downloadButton.addEventListener('click', downloadSelectedFile);
  elements.refreshFilesButton.addEventListener('click', refreshFileList);
  elements.sftpSearchInput.addEventListener('input', handleSftpSearchInput);
  elements.pathSyncSwitch.addEventListener('change', togglePathSync);
  elements.commandHintSwitch.addEventListener('change', toggleCommandHints);
  elements.fileFollowSwitch.addEventListener('change', toggleFileFollow);
  elements.fileTableWrap.addEventListener('contextmenu', openSftpContextMenu);
  elements.fileTableWrap.querySelector('thead')?.addEventListener('click', handleFileSortClick);
  elements.fileTableWrap.addEventListener('dragover', handleSftpDragOver);
  elements.fileTableWrap.addEventListener('drop', handleSftpDrop);
  elements.contextRefreshButton.addEventListener('click', () => runContextAction(refreshFileList));
  elements.contextUploadButton.addEventListener('click', () => runContextAction(uploadFiles));
  elements.contextDownloadButton.addEventListener('click', () => runContextAction(downloadSelectedFile));
  elements.contextNewFileButton.addEventListener('click', () => runContextAction(createRemoteFile));
  elements.contextNewFolderButton.addEventListener('click', () => runContextAction(createRemoteDirectory));
  elements.contextRenameButton.addEventListener('click', () => runContextAction(renameSelectedFile));
  elements.contextChmodButton.addEventListener('click', () => runContextAction(chmodSelectedFile));
  elements.contextDeleteButton.addEventListener('click', () => runContextAction(deleteSelectedFile));
  elements.tabDuplicateButton.addEventListener('click', () => runTabContextAction(duplicateTab));
  elements.tabOpenWindowButton.addEventListener('click', () => runTabContextAction(openTabInNewWindow));
  elements.tabServerStatusButton.addEventListener('click', () => runTabContextAction(openTabServerStatus));
  elements.tabCloseButton.addEventListener('click', () => runTabContextAction(closeTab));
  elements.tabCloseOthersButton.addEventListener('click', () => runTabContextAction(closeOtherTabs));
  elements.tabCloseLeftButton.addEventListener('click', () => runTabContextAction(closeTabsToLeft));
  elements.tabCloseRightButton.addEventListener('click', () => runTabContextAction(closeTabsToRight));
  elements.tabCloseAllButton.addEventListener('click', () => runTabContextAction(closeAllTabs));
  elements.profileForm.addEventListener('submit', saveProfileFromForm);
  elements.closeProfileModalButton.addEventListener('click', closeProfileModal);
  elements.cancelProfileButton.addEventListener('click', closeProfileModal);
  elements.authPasswordButton.addEventListener('click', () => setAuthTypeValue('password'));
  elements.authKeyButton.addEventListener('click', () => setAuthTypeValue('key'));
  elements.pickPrivateKeyButton.addEventListener('click', pickPrivateKey);
  elements.togglePasswordButton.addEventListener('click', () => toggleSecretInput(elements.profilePasswordInput, elements.togglePasswordButton));
  elements.togglePassphraseButton.addEventListener('click', () => toggleSecretInput(elements.profilePassphraseInput, elements.togglePassphraseButton));
  elements.profileColorGroup.addEventListener('click', handleProfileColorClick);
  elements.deleteProfileButton.addEventListener('click', removeCurrentProfile);
  elements.testProfileButton.addEventListener('click', testProfileFromModal);
  elements.exportForm.addEventListener('submit', confirmExportProfiles);
  elements.closeExportModalButton.addEventListener('click', closeExportModal);
  elements.cancelExportButton.addEventListener('click', closeExportModal);
  elements.exportSelectAllInput.addEventListener('change', toggleExportSelection);
  elements.settingsThemeDarkButton.addEventListener('click', () => setSettingsThemeValue('dark'));
  elements.settingsThemeLightButton.addEventListener('click', () => setSettingsThemeValue('light'));
  elements.settingsForm.addEventListener('submit', saveSettingsFromForm);
  elements.closeSettingsModalButton.addEventListener('click', closeSettingsModal);
  elements.cancelSettingsButton.addEventListener('click', closeSettingsModal);
  elements.changeStorePathButton.addEventListener('click', changeStoreDirectory);
  elements.copyShortcutButton.addEventListener('click', () => startShortcutRecording('copy'));
  elements.pasteShortcutButton.addEventListener('click', () => startShortcutRecording('paste'));
  elements.clearShortcutButton.addEventListener('click', () => startShortcutRecording('clear'));
  elements.searchShortcutButton?.addEventListener('click', () => startShortcutRecording('search'));
  elements.terminalWrap.addEventListener('contextmenu', openTerminalContextMenu);
  elements.terminalContextCopyButton.addEventListener('click', () => runTerminalContextAction(copySelectionToClipboard));
  elements.terminalContextPasteButton.addEventListener('click', () => runTerminalContextAction(pasteClipboardToTerminal));
  elements.terminalContextClearButton.addEventListener('click', () => runTerminalContextAction(clearActiveTerminal));
  elements.terminalContextSearchButton.addEventListener('click', () => runTerminalContextAction(openTerminalSearchPlaceholder));
  elements.terminalSearchInput?.addEventListener('input', updateTerminalSearch);
  elements.terminalSearchInput?.addEventListener('keydown', handleTerminalSearchKeydown);
  elements.terminalSearchPrevButton?.addEventListener('click', () => showAdjacentTerminalSearchMatch(-1));
  elements.terminalSearchNextButton?.addEventListener('click', () => showAdjacentTerminalSearchMatch(1));
  elements.terminalSearchCloseButton?.addEventListener('click', closeTerminalSearch);
  elements.profileContextOpenButton.addEventListener('click', () => runProfileContextAction(openProfileFromContext));
  elements.profileContextCloseButton.addEventListener('click', () => runProfileContextAction(closeProfileSessionsFromContext));
  elements.profileContextCloseAllButton.addEventListener('click', () => runProfileContextAction(closeAllTabs));
  elements.profileContextCopyHostButton.addEventListener('click', () => runProfileContextAction(copyProfileHostFromContext));
  elements.profileContextEditButton.addEventListener('click', () => runProfileContextAction(editProfileFromContext));
  elements.profileContextCopyButton.addEventListener('click', () => runProfileContextAction(copyProfileFromContext));
  elements.profileContextRenameButton.addEventListener('click', () => runProfileContextAction(renameProfileFromContext));
  elements.profileContextDeleteButton.addEventListener('click', () => runProfileContextAction(deleteProfileFromContext));
  elements.mouseBackActionGroup.addEventListener('click', handleMouseActionGroupClick);
  elements.mouseForwardActionGroup.addEventListener('click', handleMouseActionGroupClick);
  elements.closeFileEditorButton.addEventListener('click', closeFileEditorModal);
  elements.saveRemoteFileButton.addEventListener('click', () => saveRemoteFileFromEditor(true));
  elements.reloadRemoteFileButton.addEventListener('click', reloadRemoteFileInEditor);
  elements.downloadPreviewFileButton.addEventListener('click', downloadEditingFile);
  elements.fileEditorTextarea.addEventListener('input', markEditingFileDirty);
  elements.fileEditorTextarea.addEventListener('scroll', syncEditorHighlightScroll);
  elements.unsavedCancelButton.addEventListener('click', () => resolveUnsavedAction('cancel'));
  elements.unsavedDiscardButton.addEventListener('click', () => resolveUnsavedAction('discard'));
  elements.unsavedSaveButton.addEventListener('click', () => resolveUnsavedAction('save'));
  document.addEventListener('keydown', handleGlobalKeydown, true);
  document.addEventListener('click', hideContextMenus);
  window.addEventListener('mouseup', handleMouseShortcut);
  window.addEventListener('auxclick', handleMouseShortcut);
  window.addEventListener('resize', () => setTimeout(fitActiveTerminal, 30));
  bindDrawerResizeEvents();
}


/**
 * 绑定来自主进程的 SSH、菜单和窗口状态事件。
 */
function bindMainProcessEvents() {
  window.nexusSsh.ssh.onData(handleTerminalData);
  window.nexusSsh.ssh.onStatus(handleConnectionStatus);
  window.nexusSsh.ssh.onCwd(handleCurrentPath);
  window.nexusSsh.window.onState((payload) => updateWindowControlState(payload?.maximized === true));
  window.nexusSsh.ui.onNewProfile(() => openProfileModal());
  window.nexusSsh.ui.onImportProfiles(importProfiles);
  window.nexusSsh.ui.onExportProfiles(openExportModal);
  window.nexusSsh.ui.onRefreshFiles(refreshFileList);
  window.nexusSsh.ui.onToggleLeftDrawer(toggleLeftDrawer);
  window.nexusSsh.ui.onToggleRightDrawer(toggleRightDrawer);
  window.nexusSsh.ui.onToggleTheme(toggleTheme);
  window.nexusSsh.ui.onOpenSettings(openSettingsModal);
  window.nexusSsh.ui.onCopyTerminal(copySelectionToClipboard);
  window.nexusSsh.ui.onPasteTerminal(pasteClipboardToTerminal);
  window.nexusSsh.ui.onClearTerminal(clearActiveTerminal);
}

/**
 * 加载本地软件配置。
 */
function loadApplicationSettings() {
  try {
    const currentRaw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const raw = currentRaw || localStorage.getItem('ssh.settings.v8') || localStorage.getItem('ssh.settings.v7') || localStorage.getItem('ssh.settings.v6') || localStorage.getItem('ssh.settings.v5') || localStorage.getItem('nexus-ssh.settings.v4') || '{}';
    const parsed = JSON.parse(raw);
    if (!currentRaw) {
      parsed.theme = 'light';
      parsed.pathSync = true;
      if (parsed.mouseBackAction === 'parentPath') {
        parsed.mouseBackAction = 'sftpBack';
      }
      if (parsed.mouseForwardAction === 'terminalPath') {
        parsed.mouseForwardAction = 'sftpForward';
      }
    }
    state.settings = { ...defaultSettings, ...parsed, shortcuts: { ...defaultSettings.shortcuts, ...(parsed.shortcuts || {}) } };
  } catch (error) {
    state.settings = { ...defaultSettings };
  }

  state.settings.theme = normalizeTheme(state.settings.theme);
  state.settings.mouseBackAction = normalizeMouseAction(state.settings.mouseBackAction);
  state.settings.mouseForwardAction = normalizeMouseAction(state.settings.mouseForwardAction);
  state.settings.shortcuts = normalizeShortcutSettings(state.settings.shortcuts);
  updateShortcutStatusText();
  state.settings.leftDrawerWidth = normalizeNumber(state.settings.leftDrawerWidth, 260, 220, 420);
  state.settings.rightDrawerWidth = normalizeNumber(state.settings.rightDrawerWidth, 520, 360, 760);
  state.settings.latencyRefreshSeconds = normalizeNumber(state.settings.latencyRefreshSeconds, 60, 15, 600);
  state.settings.showConnectionDetails = state.settings.showConnectionDetails === true;
}

/**
 * 保存软件配置到本地存储。
 */
function saveApplicationSettings() {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
}

/**
 * 应用软件配置到界面和终端实例。
 */
function applyApplicationSettings(shouldFitTerminal = true) {
  document.documentElement.dataset.theme = state.settings.theme;
  syncTerminalLineHeightStyle();
  applyDrawerLayout();
  elements.pathSyncSwitch.checked = state.settings.pathSync !== false;
  elements.commandHintSwitch.checked = state.settings.commandHints !== false;
  elements.fileFollowSwitch.checked = state.settings.fileFollow !== false;

  state.tabs.forEach((tab) => {
    if (tab.terminal) {
      tab.terminal.options.theme = getTerminalTheme(state.settings.theme);
      tab.terminal.options.fontSize = state.settings.terminalFontSize;
    }
  });

  if (shouldFitTerminal) {
    setTimeout(fitActiveTerminal, 60);
  }
}

function syncTerminalLineHeightStyle() {
  const fontSize = normalizeNumber(state.settings.terminalFontSize, 14, 12, 20);
  document.documentElement.style.setProperty('--terminal-line-height', `${Math.round(fontSize * 1.28)}px`);
}

/**
 * 只应用左右抽屉布局状态，不改动终端会话和 SFTP 数据。
 */
function applyDrawerLayout() {
  elements.mainLayout.style.setProperty('--left-drawer-width', `${state.settings.leftDrawerWidth}px`);
  elements.sessionView.style.setProperty('--right-drawer-width', `${state.settings.rightDrawerWidth}px`);
  elements.mainLayout.classList.toggle('left-collapsed', state.settings.leftDrawerOpen !== true);
  elements.sessionView.classList.toggle('right-collapsed', state.settings.rightDrawerOpen === false);
  if (elements.leftDrawerEdgeButton) {
    elements.leftDrawerEdgeButton.textContent = state.settings.leftDrawerOpen === true ? '‹' : '›';
  }
  if (elements.rightDrawerEdgeButton) {
    elements.rightDrawerEdgeButton.textContent = state.settings.rightDrawerOpen === false ? '‹' : '›';
  }
}

/**
 * 更新底部快捷键文本。
 */
function updateShortcutStatusText() {
  const shortcutElement = document.querySelector('[data-shortcut-status]');
  if (shortcutElement) {
    shortcutElement.textContent = `${state.settings.shortcuts.copy} / ${state.settings.shortcuts.paste} / ${state.settings.shortcuts.clear} / ${state.settings.shortcuts.search}`;
  }
}

/**
 * 标准化主题名称。
 */
function normalizeTheme(theme) {
  if (theme === 'light' || theme === 'mac-light' || theme === 'idea-light') {
    return 'light';
  }

  return 'dark';
}

/**
 * 标准化鼠标侧键动作。
 */
function normalizeMouseAction(action) {
  const allowed = ['none', 'parentPath', 'terminalPath', 'previousTab', 'nextTab', 'toggleSftp', 'sftpBack', 'sftpForward'];
  return allowed.includes(action) ? action : 'none';
}

/**
 * 标准化终端快捷键配置。
 */
function normalizeShortcutSettings(shortcuts) {
  return {
    copy: normalizeShortcutText(shortcuts?.copy || defaultSettings.shortcuts.copy) || defaultSettings.shortcuts.copy,
    paste: normalizeShortcutText(shortcuts?.paste || defaultSettings.shortcuts.paste) || defaultSettings.shortcuts.paste,
    clear: normalizeShortcutText(shortcuts?.clear || defaultSettings.shortcuts.clear) || defaultSettings.shortcuts.clear,
    search: normalizeShortcutText(shortcuts?.search || defaultSettings.shortcuts.search) || defaultSettings.shortcuts.search
  };
}

/**
 * 根据当前主题返回终端配色。
 */
function getTerminalTheme(theme) {
  if (normalizeTheme(theme) === 'light') {
    return {
      background: 'rgba(255, 255, 255, 0)',
      foreground: '#172033',
      cursor: '#1f2937',
      cursorAccent: '#ffffff',
      selectionBackground: '#c7ddff',
      black: '#172033',
      red: '#dc2626',
      green: '#059669',
      yellow: '#b45309',
      blue: '#2563eb',
      magenta: '#7c3aed',
      cyan: '#0284c7',
      white: '#f8fafc',
      brightBlack: '#64748b',
      brightRed: '#ef4444',
      brightGreen: '#10b981',
      brightYellow: '#f59e0b',
      brightBlue: '#38bdf8',
      brightMagenta: '#a78bfa',
      brightCyan: '#22d3ee',
      brightWhite: '#ffffff'
    };
  }

  return {
    background: 'rgba(13, 17, 23, 0)',
    foreground: '#e5edf6',
    cursor: '#38bdf8',
    cursorAccent: '#0d1117',
    selectionBackground: '#1e3a5f',
    black: '#111827',
    red: '#f87171',
    green: '#34d399',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e5edf6',
    brightBlack: '#7d8aa0',
    brightRed: '#fb7185',
    brightGreen: '#6ee7b7',
    brightYellow: '#facc15',
    brightBlue: '#38bdf8',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff'
  };
}

/**
 * 加载连接配置保存位置信息。
 */
async function loadStoreInfo() {
  state.storeInfo = await window.nexusSsh.profiles.getStoreInfo();
  renderStoreInfo();
}

/**
 * 在设置弹窗中渲染连接配置保存位置。
 */
function renderStoreInfo() {
  if (!state.storeInfo) {
    return;
  }

  elements.defaultStorePathInput.value = state.storeInfo.defaultDirectory || '';
  elements.currentStorePathInput.value = state.storeInfo.currentDirectory || '';
}

/**
 * 加载本地连接配置列表。
 */
async function loadProfiles() {
  state.profiles = await window.nexusSsh.profiles.list();
  pruneProfileLatencyCache();
  if (!state.selectedProfileId && state.profiles.length > 0) {
    state.selectedProfileId = state.profiles[0].id;
  }
  renderProfiles();
}

async function refreshProfilesAndLatency() {
  await loadProfiles();
  await refreshProfileLatencies({ silent: false });
}

/**
 * 渲染连接列表和启动页连接卡片。
 */
function renderProfiles() {
  renderProfileList(elements.profileGroups, elements.connectionSearchInput.value, false);
  renderProfileList(elements.welcomeProfileList, elements.welcomeSearchInput.value, true);
  if (elements.welcomeListTitle) {
    elements.welcomeListTitle.textContent = `列表（${state.profiles.length}）`;
  }
}

/**
 * 向指定容器渲染连接配置列表。
 */
function renderProfileList(container, keyword, large) {
  const profiles = getFilteredProfiles(keyword);
  container.innerHTML = '';

  if (profiles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-cell';
    empty.textContent = state.profiles.length === 0 ? '暂无连接配置' : '没有匹配的连接';
    container.appendChild(empty);
    return;
  }

  if (large) {
    container.appendChild(buildProfileListHeader());
  }

  profiles.forEach((profile) => {
    container.appendChild(buildProfileItem(profile, large));
  });
}

function buildProfileListHeader() {
  const header = document.createElement('div');
  header.className = 'profile-list-header profile-row';
  [
    ['名称', 'name'],
    ['延迟', 'latency'],
    ['IP:PORT', 'endpoint'],
    ['USER', 'user'],
    ['创建时间', 'created'],
    ['备注', 'remark']
  ].forEach(([label, className]) => {
    const cell = document.createElement('span');
    cell.className = `profile-cell ${className}`;
    cell.textContent = label;
    header.appendChild(cell);
  });
  return header;
}

/**
 * 返回搜索后的连接配置列表。
 */
function getFilteredProfiles(keyword) {
  const normalized = String(keyword || '').trim().toLowerCase();
  return [...state.profiles]
    .filter((profile) => matchesProfileFilter(profile, normalized))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

/**
 * 判断连接配置是否匹配搜索关键字。
 */
function matchesProfileFilter(profile, keyword) {
  if (!keyword) {
    return true;
  }

  const source = [
    profile.name,
    profile.group,
    profile.host,
    profile.port,
    profile.username,
    profile.remoteStartPath,
    profile.remark,
    ...(profile.tags || [])
  ].join(' ').toLowerCase();

  return source.includes(keyword);
}

/**
 * 构建连接列表中的单个连接条目。
 */
function buildProfileItem(profile, large) {
  const item = document.createElement('div');
  item.className = `${large ? 'welcome-profile-item' : 'profile-item'}${profile.id === state.selectedProfileId ? ' active' : ''}`;
  item.role = 'button';
  item.tabIndex = 0;
  item.dataset.profileId = profile.id;

  const main = document.createElement('span');
  main.className = 'profile-main compact';

  const dot = document.createElement('span');
  dot.className = `level-dot ${normalizeProfileColor(profile.color)}`;

  const name = document.createElement('span');
  name.className = 'profile-name';
  name.textContent = profile.name;
  main.append(dot, name);

  if (large) {
    item.classList.add('profile-row');
    appendProfileCell(item, main, 'name');
    appendProfileCell(item, buildLatencyBadge(profile), 'latency');
    appendProfileCell(item, document.createTextNode(formatEndpoint(profile)), 'endpoint');
    appendProfileCell(item, document.createTextNode(formatMaskedValue(profile.username || '-', 'user')), 'user');
    appendProfileCell(item, document.createTextNode(formatTime(profile.createdAt)), 'created');
    appendProfileCell(item, document.createTextNode(profile.remark || (profile.tags || []).join(', ') || '-'), 'remark');
  } else {
    item.appendChild(main);
  }

  if (!large && state.settings.showConnectionDetails === true) {
    const meta = document.createElement('span');
    meta.className = 'profile-meta';
    meta.textContent = `${formatMaskedValue(profile.username, 'user')}@${formatMaskedValue(profile.host, 'host')}:${profile.port}`;
    main.appendChild(meta);
  }

  item.addEventListener('click', () => selectProfile(profile.id));
  item.addEventListener('dblclick', () => openProfileTab(profile.id));
  item.addEventListener('contextmenu', (event) => openProfileContextMenu(event, profile.id));
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      openProfileTab(profile.id);
    }
  });

  return item;
}

function appendProfileCell(row, content, className) {
  const cell = document.createElement('span');
  cell.className = `profile-cell ${className}`;
  if (content instanceof Node) {
    cell.appendChild(content);
  } else {
    cell.textContent = String(content || '');
  }
  row.appendChild(cell);
}

function buildLatencyBadge(profile) {
  const badge = document.createElement('span');
  const tab = state.tabs.find((item) => item.profileId === profile.id);
  const latency = Number.parseInt(tab?.latency, 10);
  if (Number.isFinite(latency)) {
    const level = getLatencyLevel(latency);
    badge.className = `latency-badge ${level}`;
    badge.textContent = `${latency}ms`;
    return badge;
  }
  const cached = state.profileLatencies?.[profile.id];
  const cachedLatency = Number.parseInt(cached?.latency, 10);
  if (Number.isFinite(cachedLatency)) {
    const level = getLatencyLevel(cachedLatency);
    badge.className = `latency-badge ${level}`;
    badge.textContent = `${cachedLatency}ms`;
    badge.title = cached.checkedAt ? `最后检测 ${formatTime(cached.checkedAt)}` : '';
    return badge;
  }
  if (cached?.status === 'checking') {
    badge.className = 'latency-badge checking';
    badge.textContent = '检测中';
    return badge;
  }
  if (cached?.status === 'error') {
    badge.className = 'latency-badge bad';
    badge.textContent = '不可用';
    badge.title = cached.message || '';
    return badge;
  }
  if (tab?.connectionStatus === 'connected') {
    badge.className = 'latency-badge good';
    badge.textContent = '在线';
    return badge;
  }
  if (tab?.connectionStatus === 'error' || tab?.connectionStatus === 'closed') {
    badge.className = 'latency-badge bad';
    badge.textContent = '不可用';
    return badge;
  }
  badge.className = 'latency-badge unknown';
  badge.textContent = '未测';
  return badge;
}

function getLatencyLevel(latency) {
  if (latency < 120) {
    return 'good';
  }
  if (latency < 300) {
    return 'warn';
  }
  return 'bad';
}

function getTabLatencyText(tab) {
  const tabLatency = Number.parseInt(tab?.latency, 10);
  if (Number.isFinite(tabLatency)) {
    return `${tabLatency}ms`;
  }

  const cached = state.profileLatencies?.[tab?.profileId];
  const cachedLatency = Number.parseInt(cached?.latency, 10);
  if (Number.isFinite(cachedLatency)) {
    return `${cachedLatency}ms`;
  }
  if (cached?.status === 'checking') {
    return '检测中';
  }
  if (cached?.status === 'error') {
    return '不可用';
  }
  return '--';
}

function pruneProfileLatencyCache() {
  const ids = new Set((state.profiles || []).map((profile) => profile.id));
  Object.keys(state.profileLatencies || {}).forEach((profileId) => {
    if (!ids.has(profileId)) {
      delete state.profileLatencies[profileId];
    }
  });
}

function resetLatencyRefreshTimer() {
  if (state.latencyRefreshTimer) {
    window.clearInterval(state.latencyRefreshTimer);
    state.latencyRefreshTimer = null;
  }

  const seconds = normalizeNumber(state.settings.latencyRefreshSeconds, 60, 15, 600);
  state.settings.latencyRefreshSeconds = seconds;
  state.latencyRefreshTimer = window.setInterval(() => {
    refreshProfileLatencies({ silent: true });
  }, seconds * 1000);
}

async function refreshProfileLatencies(options = {}) {
  if (state.latencyRefreshRunning) {
    return;
  }

  const profiles = Array.isArray(state.profiles) ? [...state.profiles] : [];
  if (profiles.length === 0) {
    return;
  }

  state.latencyRefreshRunning = true;
  const silent = options.silent === true;
  const checkedAt = Date.now();
  profiles.forEach((profile) => {
    state.profileLatencies[profile.id] = {
      ...(state.profileLatencies[profile.id] || {}),
      status: 'checking',
      checkedAt
    };
  });
  if (!silent) {
    renderProfiles();
    renderActiveSession();
  }

  try {
    const concurrency = 3;
    for (let index = 0; index < profiles.length; index += concurrency) {
      const batch = profiles.slice(index, index + concurrency);
      await Promise.all(batch.map((profile) => refreshSingleProfileLatency(profile)));
      renderProfiles();
      renderActiveSession();
    }
  } finally {
    state.latencyRefreshRunning = false;
    renderProfiles();
    renderActiveSession();
  }
}

async function refreshSingleProfileLatency(profile) {
  try {
    const result = await window.nexusSsh.profiles.test(profile);
    const latency = Number.parseInt(result?.latency, 10);
    const success = result?.success === true;
    state.profileLatencies[profile.id] = {
      status: success ? 'ok' : 'error',
      latency: success && Number.isFinite(latency) ? latency : null,
      sftp: result?.sftp === true,
      message: result?.message || '',
      checkedAt: Date.now()
    };

    if (success && Number.isFinite(latency)) {
      state.tabs
        .filter((tab) => tab.profileId === profile.id)
        .forEach((tab) => {
          tab.latency = `${latency}ms`;
        });
    }
  } catch (error) {
    state.profileLatencies[profile.id] = {
      status: 'error',
      latency: null,
      sftp: false,
      message: error.message || '连接检测失败',
      checkedAt: Date.now()
    };
  }
}

function formatEndpoint(profile) {
  return `${formatMaskedValue(profile.host, 'host')}:${profile.port || 22}`;
}

function formatMaskedValue(value, type) {
  const text = String(value || '-');
  if (!state.profileMasked) {
    return text;
  }
  if (type === 'host') {
    return text.replace(/\d(?=\d{1,3}(?:\.|$))/g, '*');
  }
  if (text.length <= 2) {
    return '*'.repeat(text.length || 1);
  }
  return `${text.slice(0, 1)}***${text.slice(-1)}`;
}

function normalizeProfileColor(color) {
  return ['default', 'gray', 'green', 'red', 'blue', 'amber', 'purple', 'cyan', 'orange', 'lime', 'pink'].includes(color)
    ? color
    : 'default';
}

/**
 * 选择连接配置但不自动连接。
 */
function selectProfile(profileId) {
  state.selectedProfileId = profileId;
  renderProfiles();
}

/**
 * 根据连接标识打开新会话标签。
 */
async function openProfileTab(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) {
    showNotice('连接配置不存在。', 'error');
    return;
  }

  const tab = createTabRecord(profile);
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  renderWorkspaceState();
  renderTabs();
  createTerminalForTab(tab);
  activateTab(tab.id);
  await waitForStableLayout();
  fitTerminal(tab);
  await connectTab(tab);
}

/**
 * 创建会话标签状态对象。
 */
function createTabRecord(profile) {
  const startPath = getProfileStartPath(profile);

  return {
    id: crypto.randomUUID(),
    profileId: profile.id,
    profileName: profile.name,
    title: buildTabTitle(profile.name),
    profile,
    sessionId: '',
    terminal: null,
    fitAddon: null,
    terminalElement: null,
    currentPath: startPath,
    previousPath: '',
    terminalPath: startPath,
    previousTerminalPath: '',
    pathHistory: [startPath],
    pathHistoryIndex: 0,
    pathSync: state.settings.pathSync !== false || state.settings.fileFollow !== false,
    commandHints: state.settings.commandHints !== false,
    commandBuffer: '',
    inlineSuggestion: null,
    inlineSuggestions: [],
    fileFollow: state.settings.fileFollow !== false,
    fileEntries: [],
    fileListPath: '',
    fileListError: '',
    fileListLoading: false,
    fileListRequestId: 0,
    fileRefreshTimer: null,
    pathSyncTimer: null,
    pathSyncRequestId: 0,
    selectedFilePath: '',
    selectedFilePaths: [],
    selectedFileIsDirectory: false,
    connectionStatus: 'new',
    statusText: '未连接',
    latency: '--',
    sessionStartAt: null,
    serverStatus: null,
    serverStatusHistory: { cpu: [], memory: [], disk: [] },
    serverStatusLoading: false
  };
}

/**
 * 基于当前已打开标签生成同名递增标题。
 */
function buildTabTitle(profileName) {
  const sameCount = state.tabs.filter((tab) => tab.profileName === profileName).length;
  return sameCount === 0 ? profileName : `${profileName} (${sameCount + 1})`;
}


/**
 * 等待浏览器完成一次布局刷新。
 */
function waitForStableLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

/**
 * 为标签创建独立 xterm 终端实例。
 */
function createTerminalForTab(tab) {
  const TerminalClass = window.Terminal;
  const FitAddonClass = window.FitAddon?.FitAddon;

  if (!TerminalClass || !FitAddonClass) {
    showNotice('终端组件加载失败，请确认依赖已安装。', 'error');
    return;
  }

  const terminalElement = document.createElement('div');
  terminalElement.className = 'terminal-instance hidden';
  terminalElement.dataset.tabId = tab.id;
  elements.terminalStack.appendChild(terminalElement);

  const terminal = new TerminalClass({
    fontFamily: '"JetBrains Mono", "Cascadia Mono", Consolas, "Microsoft YaHei UI", monospace',
    fontSize: state.settings.terminalFontSize,
    lineHeight: 1.28,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 20000,
    convertEol: false,
    allowTransparency: true,
    drawBoldTextInBrightColors: true,
    fontWeight: 500,
    fontWeightBold: 700,
    minimumContrastRatio: 4.5,
    theme: getTerminalTheme(state.settings.theme)
  });

  const fitAddon = new FitAddonClass();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalElement);
  terminal.options.theme = getTerminalTheme(state.settings.theme);
  terminal.onData((data) => handleTerminalInput(tab.id, data));
  terminal.attachCustomKeyEventHandler((event) => handleTerminalCustomKey(tab.id, event));

  tab.terminal = terminal;
  tab.fitAddon = fitAddon;
  tab.terminalElement = terminalElement;
  setTimeout(() => fitTerminal(tab), 30);
}

/**
 * 激活指定标签并刷新终端与 SFTP 面板。
 */
function activateTab(tabId) {
  state.activeTabId = tabId;
  state.tabs.forEach((tab) => {
    tab.terminalElement?.classList.toggle('hidden', tab.id !== tabId);
  });
  renderWorkspaceState();
  renderTabs();
  renderActiveSession();
  const activeTab = getActiveTab();
  renderFileList(activeTab?.fileEntries || []);
  if (shouldRefreshFileList(activeTab)) {
    queueRefreshFileList(activeTab, { immediate: true, showError: false });
  }
  if (state.serverStatusVisible) {
    refreshServerStatus();
  }
  setTimeout(fitActiveTerminal, 30);
}

/**
 * 渲染顶部标签栏。
 */
function renderTabs() {
  elements.tabsContainer.innerHTML = '';

  state.tabs.forEach((tab) => {
    const tabButton = document.createElement('button');
    tabButton.type = 'button';
    tabButton.className = `tab${tab.id === state.activeTabId ? ' active' : ''}`;
    tabButton.draggable = true;
    tabButton.title = '右键可复制标签或打开为新窗口';

    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = tab.title;

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = '关闭标签';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });

    tabButton.appendChild(name);
    tabButton.appendChild(close);
    tabButton.addEventListener('click', () => activateTab(tab.id));
    tabButton.addEventListener('contextmenu', (event) => openTabContextMenu(event, tab.id));
    tabButton.addEventListener('dragend', (event) => handleTabDragEnd(event, tab.id));
    elements.tabsContainer.appendChild(tabButton);
  });
}

/**
 * 处理标签拖出窗口边缘后的新窗口打开。
 */
function handleTabDragEnd(event, tabId) {
  const outsideTop = event.clientY > 0 && event.clientY < 44;
  const outsideLeft = event.clientX > 0 && event.clientX < 12;
  const outsideRight = event.clientX > window.innerWidth - 12;

  if (outsideTop || outsideLeft || outsideRight) {
    detachTab(tabId);
  }
}

/**
 * 将标签对应连接打开到独立窗口。
 */
async function detachTab(tabId) {
  await openTabInNewWindow(tabId);
}

/**
 * 使用同一连接配置复制为一个新的独立会话标签。
 */
async function duplicateTab(tabId) {
  const tab = findTab(tabId);
  if (!tab) {
    return;
  }

  await openProfileTab(tab.profileId);
}

/**
 * 使用同一连接配置打开新的独立窗口，不影响原标签会话。
 */
async function openTabInNewWindow(tabId) {
  const tab = findTab(tabId);
  if (!tab) {
    return;
  }

  try {
    await window.nexusSsh.window.openProfileWindow(tab.profileId);
  } catch (error) {
    showNotice(`打开独立窗口失败：${error.message}`, 'error');
  }
}

async function openTabServerStatus(tabId) {
  const tab = findTab(tabId);
  if (!tab) {
    return;
  }

  if (state.activeTabId !== tabId) {
    activateTab(tabId);
  }
  if (state.settings.rightDrawerOpen === false) {
    await setRightDrawerOpen(true);
  }

  state.serverStatusVisible = true;
  elements.serverStatusPanel.classList.remove('hidden');
  elements.serverStatusToolbarButton?.classList.add('active');
  await refreshServerStatus();
  startServerStatusTimer();
}

/**
 * 关闭标签并断开对应 SSH 会话。
 */
async function closeTab(tabId, shouldRender = true) {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) {
    return;
  }

  const [tab] = state.tabs.splice(index, 1);
  if (tab.fileRefreshTimer) {
    window.clearTimeout(tab.fileRefreshTimer);
  }
  if (tab.sessionId) {
    try {
      await window.nexusSsh.ssh.disconnect(tab.sessionId);
    } catch (error) {
      showNotice(`断开会话失败：${error.message}`, 'error');
    }
  }

  tab.terminalElement?.remove();

  if (state.activeTabId === tabId) {
    const nextTab = state.tabs[index] || state.tabs[index - 1] || state.tabs[0] || null;
    state.activeTabId = nextTab?.id || '';
  }

  if (state.tabs.length === 0) {
    stopServerStatusTimer();
    state.serverStatusVisible = false;
    elements.serverStatusPanel.classList.add('hidden');
    elements.serverStatusToolbarButton.classList.remove('active');
  }

  if (shouldRender) {
    renderWorkspaceState();
    renderTabs();
    renderActiveSession();
    renderFileList(getActiveTab()?.fileEntries || []);
  }
}

async function closeTabsByIds(tabIds) {
  const uniqueIds = [...new Set((tabIds || []).filter(Boolean))];
  for (const tabId of uniqueIds) {
    await closeTab(tabId, false);
  }
  renderWorkspaceState();
  renderTabs();
  renderActiveSession();
  renderFileList(getActiveTab()?.fileEntries || []);
}

async function closeAllTabs() {
  await closeTabsByIds(state.tabs.map((tab) => tab.id));
}

async function closeOtherTabs(tabId) {
  await closeTabsByIds(state.tabs.filter((tab) => tab.id !== tabId).map((tab) => tab.id));
}

async function closeTabsToLeft(tabId) {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index <= 0) {
    return;
  }
  await closeTabsByIds(state.tabs.slice(0, index).map((tab) => tab.id));
}

async function closeTabsToRight(tabId) {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0 || index >= state.tabs.length - 1) {
    return;
  }
  await closeTabsByIds(state.tabs.slice(index + 1).map((tab) => tab.id));
}

/**
 * 发起指定标签的 SSH 连接。
 */
async function connectTab(tab) {
  if (!tab.terminal) {
    return;
  }

  try {
    tab.connectionStatus = 'connecting';
    tab.statusText = '正在连接';
    tab.terminal.clear();
    tab.terminal.writeln(`正在连接 ${tab.profile.username}@${tab.profile.host}:${tab.profile.port} ...`);
    renderActiveSession();

    const result = await window.nexusSsh.ssh.connect(tab.profileId);
    tab.sessionId = result.sessionId;
    tab.connectionStatus = 'connected';
    tab.statusText = '已连接';
    tab.sessionStartAt = Date.now();
    const latency = Number.parseInt(result.latency, 10);
    if (Number.isFinite(latency)) {
      tab.latency = `${latency}ms`;
      state.profileLatencies[tab.profileId] = {
        status: 'ok',
        latency,
        sftp: true,
        message: '',
        checkedAt: Date.now()
      };
    }

    if (tab.pathSync || tab.fileFollow) {
      tab.pathSync = true;
      await window.nexusSsh.ssh.setPathSync(tab.sessionId, true);
    }

    await loadProfiles();
    startDurationTimer();
    renderActiveSession();
    await refreshFileList({ tabId: tab.id, showError: false });
    tab.terminal.focus();
    setTimeout(() => fitTerminal(tab), 80);
    setTimeout(() => fitTerminal(tab), 240);
  } catch (error) {
    tab.connectionStatus = 'error';
    tab.statusText = '连接失败';
    tab.sessionId = '';
    tab.terminal.writeln(`\r\n连接失败：${error.message}`);
    renderActiveSession();
    showNotice(`连接失败：${error.message}`, 'error');
  }
}

/**
 * 渲染当前是否处于会话工作区。
 */
function renderWorkspaceState() {
  document.querySelector('.workspace').classList.toggle('has-session', Boolean(getActiveTab()));
}

function showWelcomeWorkspace() {
  state.activeTabId = '';
  state.tabs.forEach((tab) => tab.terminalElement?.classList.add('hidden'));
  renderWorkspaceState();
  renderTabs();
  renderActiveSession();
  renderFileList([]);
}

/**
 * 渲染当前活动会话的路径、状态和 SFTP 信息。
 */
function renderActiveSession() {
  const tab = getActiveTab();

  if (!tab) {
    elements.currentPathLabel.textContent = '/';
    elements.sftpHostLabel.textContent = '未连接';
    elements.connectionStatusText.textContent = '未连接';
    elements.connectionEndpoint.textContent = '-';
    elements.connectionStatusDot.className = 'status-dot neutral';
    elements.latencyText.textContent = '--';
    elements.sessionDurationText.textContent = '00:00:00';
    renderServerStatusPanel(null);
    updateSftpButtons();
    return;
  }

  elements.currentPathLabel.textContent = tab.terminalPath || tab.currentPath || '/';
  elements.sftpHostLabel.textContent = tab.profile.host;
  elements.connectionStatusText.textContent = tab.statusText || '未连接';
  elements.connectionEndpoint.textContent = `${tab.profile.host}:${tab.profile.port}`;
  elements.connectionStatusDot.className = `status-dot ${statusClass(tab.connectionStatus)}`;
  elements.latencyText.textContent = getTabLatencyText(tab);
  elements.pathSyncSwitch.checked = tab.pathSync !== false || tab.fileFollow !== false;
  elements.commandHintSwitch.checked = tab.commandHints !== false;
  elements.fileFollowSwitch.checked = tab.fileFollow !== false;
  renderBreadcrumbs(tab.currentPath || '/');
  updateDurationText();
  renderServerStatusPanel(tab.serverStatus);
  updateSftpButtons();
}

/**
 * 返回连接状态对应的 CSS 类名。
 */
function statusClass(status) {
  if (status === 'connected') {
    return 'connected';
  }

  if (status === 'connecting') {
    return 'connecting';
  }

  if (status === 'error') {
    return 'error';
  }

  return 'neutral';
}

/**
 * 处理终端输入并转发给当前会话。
 */
function handleTerminalInput(tabId, data) {
  const tab = findTab(tabId);
  if (!tab) {
    return;
  }

  trackCommandInput(tab, data);

  if (tab.sessionId) {
    window.nexusSsh.ssh.write(tab.sessionId, data);
  }
}

/**
 * 处理 SSH 输出数据并写入对应标签终端。
 */
function handleTerminalData(payload) {
  const tab = findTabBySession(payload?.sessionId);
  if (!tab || !tab.terminal) {
    return;
  }

  tab.terminal.write(payload.data);
}

/**
 * 处理 SSH 会话状态变化。
 */
function handleConnectionStatus(payload) {
  const tab = findTabBySession(payload?.sessionId);
  if (!tab) {
    return;
  }

  if (payload.status === 'connected') {
    tab.connectionStatus = 'connected';
    tab.statusText = '已连接';
  } else if (payload.status === 'connecting') {
    tab.connectionStatus = 'connecting';
    tab.statusText = '正在连接';
  } else if (payload.status === 'closed') {
    tab.connectionStatus = 'closed';
    tab.statusText = '已断开';
    tab.sessionId = '';
    tab.fileListLoading = false;
    tab.fileListError = '';
  } else if (payload.status === 'error') {
    tab.connectionStatus = 'error';
    tab.statusText = '连接异常';
    showNotice(payload.message || '连接异常', 'error');
  }

  if (tab.id === state.activeTabId) {
    renderActiveSession();
    renderFileList(tab.fileEntries || []);
  }
  renderProfiles();
}

/**
 * 处理远程当前路径变化并按需刷新 SFTP。
 */
function handleCurrentPath(payload) {
  const tab = findTabBySession(payload?.sessionId);
  if (!tab) {
    return;
  }

  const nextPath = normalizeRemotePath(payload.path || '/');
  const terminalPathChanged = normalizeRemotePath(tab.terminalPath || '/') !== nextPath;

  if (terminalPathChanged) {
    tab.previousTerminalPath = tab.terminalPath || '';
    tab.terminalPath = nextPath;
    tab.pathSyncRequestId = (tab.pathSyncRequestId || 0) + 1;
  }

  const sftpPathChanged = tab.fileFollow !== false
    && terminalPathChanged
    && normalizeRemotePath(tab.currentPath || '/') !== nextPath;
  if (sftpPathChanged) {
    tab.previousPath = tab.currentPath || '/';
    tab.currentPath = nextPath;
    recordSftpHistory(tab, nextPath);
  }

  if (tab.id === state.activeTabId) {
    renderActiveSession();
    if (tab.fileFollow && (sftpPathChanged || shouldRefreshFileList(tab))) {
      queueRefreshFileList(tab, { showError: false });
    }
  }
}

/**
 * 跟踪当前命令输入内容用于 Tab 补全。
 */
function trackCommandInput(tab, data) {
  if (typeof data !== 'string') {
    return;
  }

  for (const char of data) {
    if (char === '\r' || char === '\n') {
      const submittedCommand = tab.commandBuffer.trim();
      tab.commandBuffer = '';
      tab.inlineSuggestion = null;
      tab.inlineSuggestions = [];
      handleSubmittedCommand(tab, submittedCommand);
    } else if (char === '\x03') {
      tab.commandBuffer = '';
      tab.inlineSuggestion = null;
      tab.inlineSuggestions = [];
    } else if (char === '\x15') {
      tab.commandBuffer = '';
      tab.inlineSuggestion = null;
      tab.inlineSuggestions = [];
    } else if (char === '\x7f') {
      tab.commandBuffer = tab.commandBuffer.slice(0, -1);
    } else if (isPrintableText(char)) {
      tab.commandBuffer += char;
    }
  }

  tab.inlineSuggestions = tab.commandHints ? getCommandSuggestions(tab.commandBuffer, tab) : [];
  tab.inlineSuggestion = tab.inlineSuggestions[0] || null;
  if (tab.id === state.activeTabId) {
    updateInlineCommandHint(tab);
  }
}

/**
 * 处理用户提交的终端命令并同步可解析的目录变化。
 */
function handleSubmittedCommand(tab, command) {
  if (tab?.pathSync && command) {
    tab.pathSyncRequestId = (tab.pathSyncRequestId || 0) + 1;
  }
}

/**
 * 返回连接用户的常见默认家目录。
 */
function getProfileHomePath(profile) {
  const username = profile?.username || '';
  return username === 'root' ? '/root' : `/home/${username || 'user'}`;
}

/**
 * 返回 SFTP 首次展示路径；未显式配置时跟随常见登录家目录。
 */
function getProfileStartPath(profile) {
  const configured = String(profile?.remoteStartPath || '').trim();
  if (configured && configured !== '/') {
    return normalizeRemotePath(configured);
  }

  return getProfileHomePath(profile);
}

/**
 * 将解析得到的终端目录同步到 SFTP 面板。
 */
async function syncTerminalPathToSftp(tab, remotePath) {
  const activeTab = findTab(tab.id);
  if (!activeTab) {
    return;
  }

  const normalized = normalizeRemotePath(remotePath);
  if (normalizeRemotePath(activeTab.terminalPath || '/') !== normalized) {
    activeTab.previousTerminalPath = activeTab.terminalPath || '';
    activeTab.terminalPath = normalized;
  }

  if (activeTab.fileFollow !== false) {
    const sftpPathChanged = normalizeRemotePath(activeTab.currentPath || '/') !== normalized;
    if (sftpPathChanged) {
      activeTab.previousPath = activeTab.currentPath || '/';
      activeTab.currentPath = normalized;
      recordSftpHistory(activeTab, normalized);
    }

    if (sftpPathChanged || shouldRefreshFileList(activeTab)) {
      await refreshFileList({ tabId: activeTab.id, showError: false });
    }
  }

  if (activeTab.id === state.activeTabId) {
    renderActiveSession();
  }
}

/**
 * 校验远程路径存在且为目录后再同步到 SFTP。
 */
/**
 * 判断输入文本是否可作为命令内容。
 */
function isPrintableText(data) {
  if (!data || data.includes('\x1b')) {
    return false;
  }

  return Array.from(data).every((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code !== 127;
  });
}

/**
 * 刷新终端内的轻量命令提示。
 */
function updateInlineCommandHint(tab) {
  if (!elements.inlineCommandHint) {
    return;
  }

  const suggestions = tab?.inlineSuggestions?.length
    ? tab.inlineSuggestions
    : (tab?.inlineSuggestion ? [tab.inlineSuggestion] : []);

  if (!suggestions.length || !tab.commandBuffer || tab.commandBuffer.trim() === suggestions[0].command) {
    elements.inlineCommandHint.classList.add('hidden');
    elements.inlineCommandHint.textContent = '';
    return;
  }

  elements.inlineCommandHint.textContent = '';

  const key = document.createElement('span');
  key.className = 'hint-key';
  key.textContent = 'Tab';
  elements.inlineCommandHint.appendChild(key);

  suggestions.slice(0, 4).forEach((suggestion) => {
    const chip = document.createElement('span');
    chip.className = 'hint-chip';

    const kind = document.createElement('span');
    kind.className = 'hint-chip-kind';
    kind.textContent = suggestion.kind || '提示';

    const command = document.createElement('span');
    command.className = 'hint-chip-command';
    command.textContent = suggestion.command;

    const description = document.createElement('span');
    description.className = 'hint-chip-desc';
    description.textContent = suggestion.description || '';

    chip.append(kind, command, description);
    elements.inlineCommandHint.appendChild(chip);
  });

  elements.inlineCommandHint.classList.remove('hidden');
}

/**
 * 处理终端快捷键。
 */
function handleTerminalCustomKey(tabId, event) {
  const tab = findTab(tabId);
  if (!tab) {
    return true;
  }

  if (matchesShortcut(event, state.settings.shortcuts.copy)) {
    if (tab.terminal?.hasSelection?.()) {
      copySelectionToClipboard();
      return false;
    }
    return true;
  }

  if (matchesShortcut(event, state.settings.shortcuts.paste)) {
    pasteClipboardToTerminal();
    return false;
  }

  if (matchesShortcut(event, state.settings.shortcuts.clear)) {
    clearActiveTerminal();
    return false;
  }

  if (matchesShortcut(event, state.settings.shortcuts.search)) {
    openTerminalSearchPlaceholder();
    return false;
  }

  if (event.key === 'Tab') {
    handleTerminalTabCompletion(tab);
    return false;
  }

  return true;
}

function handleTerminalTabCompletion(tab = getActiveTab()) {
  if (!tab) {
    return;
  }

  if (tab.commandHints && tab.inlineSuggestion) {
    replaceCurrentCommand(tab, tab.inlineSuggestion.command);
    return;
  }

  if (tab.sessionId) {
    window.nexusSsh.ssh.write(tab.sessionId, '\t');
  }

  tab.terminal?.focus?.();
}

/**
 * 返回匹配当前输入的命令提示。
 */
function getCommandSuggestions(keyword, tab) {
  const input = String(keyword || '');
  const normalized = input.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  const suggestions = uniqueCommandSuggestions([
    ...getDirectoryCommandSuggestions(input, tab),
    ...getOptionCommandSuggestions(normalized),
    ...getCatalogCommandSuggestions(normalized)
  ]);
  const nonExactSuggestions = suggestions.filter((item) => item.command.toLowerCase() !== normalized);

  return (nonExactSuggestions.length ? nonExactSuggestions : suggestions).slice(0, 6);
}

function getCatalogCommandSuggestions(normalized) {
  return commandCatalog
    .filter((item) => item.command.toLowerCase().startsWith(normalized) || item.command.toLowerCase().includes(normalized))
    .sort((left, right) => {
      const leftStarts = left.command.toLowerCase().startsWith(normalized) ? 0 : 1;
      const rightStarts = right.command.toLowerCase().startsWith(normalized) ? 0 : 1;
      return leftStarts - rightStarts || left.command.length - right.command.length;
    });
}

function getOptionCommandSuggestions(normalized) {
  if (!normalized.includes(' ') && !normalized.endsWith('-')) {
    return [];
  }

  return commandOptionCatalog
    .filter((item) => item.pattern.test(normalized) && item.command.toLowerCase().startsWith(normalized));
}

function getDirectoryCommandSuggestions(input, tab) {
  const match = input.match(/^\s*(cd|pushd)(?:\s+(.*))?$/i);
  if (!match || !tab) {
    return [];
  }

  const commandName = match[1];
  const rawFragment = match[2] ?? '';
  const fragment = unquoteShellFragment(rawFragment.trim());
  const directPrefix = fragment.replace(/^\.\//, '');
  const suggestions = [];

  if (!directPrefix.includes('/') && isFileListForTerminalPath(tab)) {
    const basePrefix = fragment.startsWith('./') ? './' : '';
    const lowerPrefix = directPrefix.toLowerCase();
    const childDirectories = (tab.fileEntries || [])
      .filter((entry) => entry.isDirectory && entry.name && entry.name !== '.' && entry.name !== '..')
      .filter((entry) => !lowerPrefix || entry.name.toLowerCase().startsWith(lowerPrefix))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));

    childDirectories.slice(0, 5).forEach((entry) => {
      const childPath = `${basePrefix}${entry.name}/`;
      suggestions.push({
        command: `${commandName} ${formatShellPath(childPath)}`,
        description: `进入 ${entry.name}`,
        kind: '目录'
      });
    });
  }

  return [
    ...suggestions,
    ...getCommonPathSuggestions(commandName, fragment, tab)
  ];
}

function getCommonPathSuggestions(commandName, fragment, tab) {
  const lowerFragment = fragment.toLowerCase();
  const profileHome = getProfileHomePath(tab.profile || {});
  const paths = [
    '~',
    profileHome,
    '/root',
    '/home',
    '/var/www',
    '/var/log',
    '/etc',
    '/tmp',
    '/opt',
    '/usr/local'
  ];

  return [...new Set(paths)]
    .filter((path) => path && (!fragment || path.toLowerCase().startsWith(lowerFragment)))
    .slice(0, 4)
    .map((path) => ({
      command: `${commandName} ${formatShellPath(path)}`,
      description: `进入 ${path}`,
      kind: '路径'
    }));
}

function isFileListForTerminalPath(tab) {
  const listedPath = normalizeRemotePath(tab.fileListPath || tab.currentPath || '/');
  const terminalPath = normalizeRemotePath(tab.terminalPath || tab.currentPath || '/');
  return listedPath === terminalPath && Array.isArray(tab.fileEntries) && tab.fileEntries.length > 0;
}

function unquoteShellFragment(value) {
  return String(value || '').replace(/^(['"])(.*)\1$/, '$2');
}

function formatShellPath(path) {
  const value = String(path || '');
  if (!value || /^[A-Za-z0-9_./~:@%+=,-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function uniqueCommandSuggestions(suggestions) {
  const seen = new Set();
  return suggestions.filter((suggestion) => {
    if (!suggestion?.command || seen.has(suggestion.command)) {
      return false;
    }
    seen.add(suggestion.command);
    return true;
  });
}

/**
 * 使用 control-u 替换当前命令行内容。
 */
function replaceCurrentCommand(tab, command) {
  const current = tab.commandBuffer || '';
  const payload = command.startsWith(current) ? command.slice(current.length) : `\x15${command}`;
  if (tab.sessionId && payload) {
    window.nexusSsh.ssh.write(tab.sessionId, payload);
  }
  tab.commandBuffer = command;
  tab.inlineSuggestion = null;
  tab.inlineSuggestions = [];
  if (tab.id === state.activeTabId) {
    updateInlineCommandHint(tab);
  }
}

/**
 * 复制当前终端选中文本。
 */
function copySelectionToClipboard() {
  const tab = getActiveTab();
  const selection = tab?.terminal?.getSelection() || '';

  if (!selection) {
    return;
  }

  window.nexusSsh.clipboard.writeText(selection);
}

/**
 * 将剪贴板内容粘贴到当前终端。
 */
function pasteClipboardToTerminal() {
  const tab = getActiveTab();
  const text = window.nexusSsh.clipboard.readText();

  if (!tab || !text) {
    return;
  }

  if (tab.terminal && typeof tab.terminal.paste === 'function') {
    tab.terminal.paste(text);
  } else if (tab.sessionId) {
    window.nexusSsh.ssh.write(tab.sessionId, text);
  }
}

/**
 * 清空当前活动终端。
 */
function clearActiveTerminal() {
  getActiveTab()?.terminal?.clear();
}

/**
 * 调整当前终端尺寸。
 */
function fitActiveTerminal() {
  const tab = getActiveTab();
  if (tab) {
    fitTerminal(tab);
  }
}

/**
 * 调整指定标签终端尺寸。
 */
function fitTerminal(tab) {
  if (!tab.fitAddon || !tab.terminal) {
    return;
  }

  const bounds = tab.terminalElement?.getBoundingClientRect();
  if (!bounds || bounds.width < 120 || bounds.height < 80) {
    return;
  }

  try {
    tab.fitAddon.fit();
    tab.terminal.refresh(0, Math.max(0, tab.terminal.rows - 1));
  } catch (error) {
    return;
  }

  if (tab.sessionId) {
    const { cols, rows } = tab.terminal;
    if (cols > 0 && rows > 0) {
      window.nexusSsh.ssh.resize(tab.sessionId, cols, rows);
    }
  }
}

/**
 * 切换当前会话路径同步。
 */
async function togglePathSync() {
  const tab = getActiveTab();
  state.settings.pathSync = elements.pathSyncSwitch.checked;
  saveApplicationSettings();

  if (!tab) {
    return;
  }

  tab.pathSync = elements.pathSyncSwitch.checked;
  if (tab.sessionId) {
    try {
      await window.nexusSsh.ssh.setPathSync(tab.sessionId, tab.pathSync);
    } catch (error) {
      showNotice(`路径同步切换失败：${error.message}`, 'error');
    }
  }
}

/**
 * 切换当前会话命令提示。
 */
function toggleCommandHints() {
  const tab = getActiveTab();
  state.settings.commandHints = elements.commandHintSwitch.checked;
  saveApplicationSettings();

  if (tab) {
    tab.commandHints = elements.commandHintSwitch.checked;
    if (!tab.commandHints) {
      tab.inlineSuggestion = null;
      tab.inlineSuggestions = [];
      updateInlineCommandHint(tab);
    }
  }
}

/**
 * 切换 SFTP 路径跟随。
 */
async function toggleFileFollow() {
  const tab = getActiveTab();
  state.settings.fileFollow = elements.fileFollowSwitch.checked;
  if (state.settings.fileFollow) {
    state.settings.pathSync = true;
    elements.pathSyncSwitch.checked = true;
  }
  saveApplicationSettings();

  if (!tab) {
    return;
  }

  tab.fileFollow = elements.fileFollowSwitch.checked;
  if (tab.fileFollow) {
    tab.pathSync = true;
    if (tab.sessionId) {
      try {
        await window.nexusSsh.ssh.setPathSync(tab.sessionId, true);
      } catch (error) {
        showNotice(`路径同步开启失败：${error.message}`, 'error');
      }
    }
    await syncTerminalPathToSftp(tab, tab.terminalPath || tab.currentPath || '/');
  }
}

/**
 * 切换服务器状态面板。
 */
async function toggleServerStatusPanel() {
  state.serverStatusVisible = !state.serverStatusVisible;
  elements.serverStatusPanel.classList.toggle('hidden', !state.serverStatusVisible);
  elements.serverStatusToolbarButton.classList.toggle('active', state.serverStatusVisible);

  if (state.serverStatusVisible) {
    await refreshServerStatus();
    startServerStatusTimer();
  } else {
    stopServerStatusTimer();
  }
}

/**
 * 启动服务器状态定时刷新。
 */
function startServerStatusTimer() {
  stopServerStatusTimer();
  state.serverStatusTimer = window.setInterval(refreshServerStatus, 2000);
}

/**
 * 停止服务器状态定时刷新。
 */
function stopServerStatusTimer() {
  if (state.serverStatusTimer) {
    window.clearInterval(state.serverStatusTimer);
    state.serverStatusTimer = null;
  }
}

/**
 * 读取当前服务器状态并刷新面板。
 */
async function refreshServerStatus() {
  const tab = getActiveTab();
  if (!tab?.sessionId || !state.serverStatusVisible) {
    renderServerStatusPanel(null);
    return;
  }

  try {
    tab.serverStatusLoading = true;
    renderServerStatusPanel(tab.serverStatus, true);
    tab.serverStatus = await window.nexusSsh.ssh.getServerStatus(tab.sessionId);
    updateServerStatusHistory(tab, tab.serverStatus);
    renderServerStatusPanel(tab.serverStatus, false);
  } catch (error) {
    renderServerStatusError(error.message);
  } finally {
    tab.serverStatusLoading = false;
  }
}

/**
 * 渲染服务器状态面板。
 */
function renderServerStatusPanel(status, loading = false) {
  if (!elements.serverStatusPanel || !state.serverStatusVisible) {
    return;
  }

  if (!status) {
    elements.serverStatusUpdatedText.textContent = loading ? '读取中' : '未读取';
    elements.serverStatusContent.innerHTML = '<div class="server-status-empty">连接后点击“状态”读取服务器运行信息。</div>';
    return;
  }

  elements.serverStatusUpdatedText.textContent = loading ? '刷新中' : formatTime(status.sampledAt);
  elements.serverStatusContent.innerHTML = '';
  const tab = getActiveTab();
  elements.serverStatusContent.appendChild(buildStatusCard('CPU', `${status.cpuUsagePercent}%`, `Load ${status.loadAverage || '--'}`, tab?.serverStatusHistory?.cpu));
  elements.serverStatusContent.appendChild(buildStatusCard('内存', `${status.memory?.usedPercent || '--'}%`, `${formatMegabytes(status.memory?.usedMb)} / ${formatMegabytes(status.memory?.totalMb)}`, tab?.serverStatusHistory?.memory));
  elements.serverStatusContent.appendChild(buildStatusCard('磁盘', status.disk?.usedPercent || '--', `${status.disk?.used || '--'} / ${status.disk?.total || '--'}`, tab?.serverStatusHistory?.disk));
  elements.serverStatusContent.appendChild(buildStatusCard('进程', `${status.processes?.length || 0}`, (status.processes || []).join(' | ') || '无可展示进程', []));
}

/**
 * 更新服务器状态历史采样。
 */
function updateServerStatusHistory(tab, status) {
  if (!tab || !status) {
    return;
  }

  if (!tab.serverStatusHistory) {
    tab.serverStatusHistory = { cpu: [], memory: [], disk: [] };
  }

  pushStatusSample(tab.serverStatusHistory.cpu, Number.parseFloat(status.cpuUsagePercent));
  pushStatusSample(tab.serverStatusHistory.memory, Number.parseFloat(status.memory?.usedPercent));
  pushStatusSample(tab.serverStatusHistory.disk, Number.parseFloat(String(status.disk?.usedPercent || '').replace('%', '')));
}

/**
 * 向服务器状态采样数组追加数值。
 */
function pushStatusSample(series, value) {
  if (!Number.isFinite(value)) {
    return;
  }
  series.push(Math.max(0, Math.min(100, value)));
  if (series.length > 28) {
    series.shift();
  }
}

/**
 * 构建资源曲线图。
 */
function buildSparkline(series) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'status-sparkline');
  svg.setAttribute('viewBox', '0 0 120 28');
  svg.setAttribute('preserveAspectRatio', 'none');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const points = series.map((value, index) => {
    const x = series.length === 1 ? 0 : (index / (series.length - 1)) * 120;
    const y = 26 - (value / 100) * 24;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  path.setAttribute('d', points);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/**
 * 渲染服务器状态错误。
 */
function renderServerStatusError(message) {
  elements.serverStatusUpdatedText.textContent = '读取失败';
  elements.serverStatusContent.innerHTML = `<div class="server-status-empty error">${escapeHtml(message || '服务器状态读取失败')}</div>`;
}

/**
 * 构建服务器状态卡片。
 */
function buildStatusCard(title, value, detail, series = []) {
  const card = document.createElement('div');
  card.className = 'server-status-card';

  const titleElement = document.createElement('span');
  titleElement.className = 'server-status-card-title';
  titleElement.textContent = title;

  const valueElement = document.createElement('strong');
  valueElement.textContent = value;

  const detailElement = document.createElement('small');
  detailElement.textContent = detail;

  card.appendChild(titleElement);
  card.appendChild(valueElement);
  card.appendChild(detailElement);
  if (Array.isArray(series) && series.length > 1) {
    card.appendChild(buildSparkline(series));
  }
  return card;
}

/**
 * 格式化 MB 数值。
 */
function formatMegabytes(value) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} GB`;
  }

  return `${Math.round(value)} MB`;
}

/**
 * 转义 HTML 文本。
 */
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

/**
 * 刷新当前活动标签的远程目录列表。
 */
async function refreshFileList(options = {}) {
  const tab = options.tabId ? findTab(options.tabId) : getActiveTab();
  const isActive = tab?.id === state.activeTabId;

  if (!tab || !tab.sessionId) {
    if (!options.tabId || isActive) {
      renderFileList([]);
    }
    return false;
  }

  const sessionId = tab.sessionId;
  const remotePath = normalizeRemotePath(options.remotePath || tab.currentPath || '/');
  const requestId = (tab.fileListRequestId || 0) + 1;
  tab.fileListRequestId = requestId;
  tab.fileListLoading = true;
  tab.fileListError = '';

  if (isActive) {
    renderFileLoading(remotePath);
  }

  try {
    const entries = await window.nexusSsh.sftp.list(sessionId, remotePath);
    const currentTab = findTab(tab.id);
    if (!canApplyFileListResult(currentTab, sessionId, requestId, remotePath)) {
      settleStaleFileListRequest(currentTab, requestId);
      return false;
    }

    const selectedPath = currentTab.selectedFilePath;
    const selectedPaths = new Set(currentTab.selectedFilePaths?.length ? currentTab.selectedFilePaths : [selectedPath].filter(Boolean));
    currentTab.fileEntries = entries;
    currentTab.fileListPath = remotePath;
    currentTab.fileListError = '';
    currentTab.fileListLoading = false;

    const preservedSelection = options.preserveSelection !== false
      ? entries.filter((entry) => selectedPaths.has(entry.path)).map((entry) => entry.path)
      : [];

    if (preservedSelection.length > 0) {
      currentTab.selectedFilePaths = preservedSelection;
      currentTab.selectedFilePath = preservedSelection[preservedSelection.length - 1];
      currentTab.selectedFileIsDirectory = entries.find((entry) => entry.path === currentTab.selectedFilePath)?.isDirectory === true;
    } else {
      currentTab.selectedFilePaths = [];
      currentTab.selectedFilePath = '';
      currentTab.selectedFileIsDirectory = false;
    }

    if (currentTab.id === state.activeTabId) {
      renderFileList(currentTab.fileEntries);
    }
    return true;
  } catch (error) {
    const currentTab = findTab(tab.id);
    if (!canApplyFileListResult(currentTab, sessionId, requestId, remotePath)) {
      settleStaleFileListRequest(currentTab, requestId);
      return false;
    }

    currentTab.fileEntries = [];
    currentTab.fileListPath = remotePath;
    currentTab.fileListError = error.message || '读取远程目录失败';
    currentTab.fileListLoading = false;
    currentTab.selectedFilePaths = [];
    currentTab.selectedFilePath = '';
    currentTab.selectedFileIsDirectory = false;

    if (currentTab.id === state.activeTabId) {
      renderFileList([]);
    }

    if (options.showError !== false && currentTab.id === state.activeTabId) {
      showNotice(`读取远程目录失败：${error.message}`, 'error');
    }
    return false;
  }
}

/**
 * 判断异步 SFTP 刷新结果是否仍属于当前标签和路径。
 */
function canApplyFileListResult(tab, sessionId, requestId, remotePath) {
  return Boolean(tab)
    && tab.sessionId === sessionId
    && tab.fileListRequestId === requestId
    && normalizeRemotePath(tab.currentPath || '/') === remotePath;
}

/**
 * 异步刷新已过期时释放加载状态，等待下一次路径刷新接管。
 */
function settleStaleFileListRequest(tab, requestId) {
  if (tab && tab.fileListRequestId === requestId) {
    tab.fileListLoading = false;
  }
}

/**
 * 判断当前文件列表是否需要重新读取。
 */
function shouldRefreshFileList(tab) {
  if (!tab?.sessionId || tab.fileFollow === false || tab.fileListLoading) {
    return false;
  }

  if (!tab.fileListPath) {
    return true;
  }

  return normalizeRemotePath(tab.fileListPath) !== normalizeRemotePath(tab.currentPath || '/');
}

/**
 * 合并短时间内多次路径变化触发的 SFTP 刷新。
 */
function queueRefreshFileList(tab, options = {}) {
  if (!tab?.sessionId) {
    return;
  }

  if (tab.fileRefreshTimer) {
    window.clearTimeout(tab.fileRefreshTimer);
  }

  const delay = options.immediate ? 0 : 140;
  tab.fileRefreshTimer = window.setTimeout(() => {
    tab.fileRefreshTimer = null;
    refreshFileList({ ...options, tabId: tab.id });
  }, delay);
}

/**
 * 渲染文件列表加载状态。
 */
function renderFileLoading(remotePath = '') {
  const pathText = remotePath ? `：${escapeHtml(remotePath)}` : '';
  elements.fileTableBody.innerHTML = `<tr><td colspan="4" class="empty-cell">正在读取远程目录${pathText}...</td></tr>`;
}

/**
 * 渲染 SFTP 文件列表。
 */
function renderFileList(entries) {
  const tab = getActiveTab();
  elements.fileTableBody.innerHTML = '';

  if (!tab || !tab.sessionId) {
    elements.fileTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">连接后显示远程目录</td></tr>';
    updateSftpButtons();
    return;
  }

  if (tab.fileListLoading) {
    renderFileLoading(tab.currentPath || '/');
    updateSftpButtons();
    return;
  }

  if (tab.fileListError) {
    elements.fileTableBody.innerHTML = `<tr><td colspan="4" class="empty-cell">读取失败：${escapeHtml(tab.fileListError)}</td></tr>`;
    updateSftpButtons();
    return;
  }

  if (shouldRefreshFileList(tab)) {
    elements.fileTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">正在同步远程目录...</td></tr>';
    queueRefreshFileList(tab, { showError: false });
    updateSftpButtons();
    return;
  }

  if (!entries || entries.length === 0) {
    elements.fileTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">当前目录为空</td></tr>';
    updateSftpButtons();
    return;
  }

  const filteredEntries = getFilteredFileEntries(entries);
  if (filteredEntries.length === 0) {
    elements.fileTableBody.innerHTML = `<tr><td colspan="4" class="empty-cell">没有匹配“${escapeHtml(getSftpSearchQuery())}”的文件</td></tr>`;
    updateSftpButtons();
    return;
  }

  getSortedFileEntries(filteredEntries).forEach((entry) => elements.fileTableBody.appendChild(buildFileRow(entry)));
  updateSftpButtons();
}

function handleSftpSearchInput() {
  const tab = getActiveTab();
  if (tab) {
    const visiblePaths = new Set(getFilteredFileEntries(tab.fileEntries).map((entry) => entry.path));
    tab.selectedFilePaths = (tab.selectedFilePaths || []).filter((path) => visiblePaths.has(path));
    tab.selectedFilePath = tab.selectedFilePaths[tab.selectedFilePaths.length - 1] || '';
    tab.selectedFileIsDirectory = tab.fileEntries.find((entry) => entry.path === tab.selectedFilePath)?.isDirectory === true;
  }
  renderFileList(tab?.fileEntries || []);
}

function getFilteredFileEntries(entries) {
  const query = getSftpSearchQuery();
  if (!query) {
    return entries || [];
  }
  return (entries || []).filter((entry) => matchesFileSearch(entry, query));
}

function getSftpSearchQuery() {
  return String(elements.sftpSearchInput?.value || '').trim().toLowerCase();
}

function matchesFileSearch(entry, query) {
  const source = [
    entry.name,
    entry.path,
    entry.permissions,
    entry.isDirectory ? 'dir directory folder 文件夹 目录' : 'file 文件',
    formatFileSize(entry.size)
  ].join(' ').toLowerCase();
  return source.includes(query);
}

function getSortedFileEntries(entries) {
  const key = state.sftpSort?.key || 'name';
  const direction = state.sftpSort?.direction === 'desc' ? -1 : 1;
  return [...(entries || [])].sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) {
      return left.isDirectory ? -1 : 1;
    }
    let result = 0;
    if (key === 'size') {
      result = (Number(left.size) || 0) - (Number(right.size) || 0);
    } else if (key === 'time' || key === 'modifiedAt') {
      result = (Number(left.modifiedAt) || 0) - (Number(right.modifiedAt) || 0);
    } else {
      result = String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hans-CN', { numeric: true });
    }
    return result * direction;
  });
}

function handleFileSortClick(event) {
  const header = event.target.closest('[data-sort-key]');
  if (!header) {
    return;
  }
  const key = header.dataset.sortKey || 'name';
  const current = state.sftpSort || { key: 'name', direction: 'asc' };
  state.sftpSort = {
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
  };
  renderFileList(getActiveTab()?.fileEntries || []);
}

function handleSftpDragOver(event) {
  if (!getActiveTab()?.sessionId) {
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

async function handleSftpDrop(event) {
  const tab = getActiveTab();
  if (!tab?.sessionId) {
    return;
  }
  event.preventDefault();
  const localPaths = Array.from(event.dataTransfer?.files || [])
    .map((file) => file.path)
    .filter(Boolean);
  if (localPaths.length === 0) {
    return;
  }
  try {
    const result = await window.nexusSsh.sftp.uploadPaths(tab.sessionId, localPaths, tab.currentPath || '/');
    showNotice(`已上传 ${result.uploaded?.length || 0} 个文件。`, 'success');
    await refreshFileList();
  } catch (error) {
    showNotice(`拖拽上传失败：${error.message}`, 'error');
  }
}

/**
 * 构建 SFTP 文件列表行。
 */
function buildFileRow(entry) {
  const tab = getActiveTab();
  const row = document.createElement('tr');
  const selectedPaths = tab?.selectedFilePaths?.length ? tab.selectedFilePaths : [tab?.selectedFilePath].filter(Boolean);
  row.className = selectedPaths.includes(entry.path) ? 'selected' : '';

  const nameCell = document.createElement('td');
  const nameWrap = document.createElement('div');
  nameWrap.className = 'file-name-cell';

  const icon = document.createElement('span');
  icon.className = `file-icon${entry.isDirectory ? ' folder' : ''}`;
  icon.textContent = getFileIcon(entry);

  const name = document.createElement('span');
  name.className = 'file-name';
  name.textContent = entry.name;
  name.title = entry.isDirectory ? '双击进入文件夹' : '双击打开编辑';

  nameWrap.appendChild(icon);
  nameWrap.appendChild(name);
  nameCell.appendChild(nameWrap);

  const sizeCell = document.createElement('td');
  sizeCell.textContent = entry.isDirectory ? '—' : formatFileSize(entry.size);

  const timeCell = document.createElement('td');
  timeCell.textContent = formatTime(entry.modifiedAt);

  const permissionCell = document.createElement('td');
  permissionCell.textContent = entry.permissions || '—';

  row.appendChild(nameCell);
  row.appendChild(sizeCell);
  row.appendChild(timeCell);
  row.appendChild(permissionCell);
  row.addEventListener('click', (event) => selectFileEntry(entry, event));
  row.addEventListener('dblclick', () => openEntry(entry));
  row.addEventListener('contextmenu', (event) => {
    const paths = tab?.selectedFilePaths || [];
    if (!paths.includes(entry.path)) {
      selectFileEntry(entry, event);
    }
    openSftpContextMenu(event);
  });

  return row;
}

/**
 * 选择文件列表项。
 */
function selectFileEntry(entry, event) {
  const tab = getActiveTab();
  if (!tab) {
    return;
  }

  const multiKey = event?.ctrlKey || event?.metaKey;
  const nextSelection = Array.isArray(tab.selectedFilePaths) ? [...tab.selectedFilePaths] : [];
  if (multiKey) {
    const index = nextSelection.indexOf(entry.path);
    if (index >= 0) {
      nextSelection.splice(index, 1);
    } else {
      nextSelection.push(entry.path);
    }
  } else {
    nextSelection.splice(0, nextSelection.length, entry.path);
  }

  tab.selectedFilePaths = nextSelection;
  tab.selectedFilePath = nextSelection[nextSelection.length - 1] || '';
  tab.selectedFileIsDirectory = entry.isDirectory;
  renderFileList(tab.fileEntries);
}

/**
 * 双击文件项时进入目录或打开文件编辑器。
 */
async function openEntry(entry) {
  if (entry.isDirectory) {
    await openRemoteDirectory(entry.path);
  } else {
    await previewEntry(entry);
  }
}

/**
 * 打开远程目录，仅更新 SFTP 面板路径。
 */
async function openRemoteDirectory(remotePath, options = {}) {
  const tab = getActiveTab();
  if (!tab) {
    return;
  }

  const normalized = normalizeRemotePath(remotePath);
  tab.previousPath = tab.currentPath || '/';
  tab.currentPath = normalized;
  tab.fileListError = '';
  if (options.recordHistory !== false) {
    recordSftpHistory(tab, normalized);
  }
  renderActiveSession();

  await refreshFileList({ tabId: tab.id, preserveSelection: false });
}

/**
 * 打开当前目录的上级路径。
 */
function openParentPath() {
  const tab = getActiveTab();
  if (!tab) {
    return;
  }

  openRemoteDirectory(getParentRemotePath(tab.currentPath));
}

/**
 * 打开终端当前路径。
 */
function openCurrentTerminalPath() {
  const tab = getActiveTab();
  if (tab) {
    openRemoteDirectory(tab.terminalPath || tab.currentPath || '/');
  }
}

/**
 * 记录 SFTP 路径历史，供鼠标侧键后退和前进使用。
 */
function recordSftpHistory(tab, remotePath) {
  const normalized = normalizeRemotePath(remotePath);
  const current = tab.pathHistory?.[tab.pathHistoryIndex];
  if (current === normalized) {
    return;
  }

  const history = Array.isArray(tab.pathHistory) ? tab.pathHistory.slice(0, tab.pathHistoryIndex + 1) : [];
  history.push(normalized);
  tab.pathHistory = history.slice(-80);
  tab.pathHistoryIndex = tab.pathHistory.length - 1;
}

/**
 * 按历史记录切换 SFTP 目录。
 */
async function navigateSftpHistory(offset) {
  const tab = getActiveTab();
  if (!tab || !Array.isArray(tab.pathHistory)) {
    return;
  }

  const nextIndex = tab.pathHistoryIndex + offset;
  if (nextIndex < 0 || nextIndex >= tab.pathHistory.length) {
    return;
  }

  tab.pathHistoryIndex = nextIndex;
  await openRemoteDirectory(tab.pathHistory[nextIndex], { recordHistory: false });
}

/**
 * 上传本地文件到当前远程目录。
 */
async function uploadFiles() {
  const tab = getActiveTab();
  if (!tab?.sessionId) {
    showNotice('请先打开 SSH 会话。', 'error');
    return;
  }

  try {
    const result = await window.nexusSsh.sftp.upload(tab.sessionId, tab.currentPath || '/');
    if (!result.canceled) {
      showNotice(`已上传 ${result.uploaded.length} 个文件。`, 'success');
      await refreshFileList();
    }
  } catch (error) {
    showNotice(`上传失败：${error.message}`, 'error');
  }
}

/**
 * 下载当前选中的远程文件。
 */
async function downloadSelectedFile() {
  const entries = getSelectedFileEntries();
  if (entries.length === 0) {
    showNotice('请先选择一个文件。', 'error');
    return;
  }

  if (entries.length === 1) {
    await downloadEntry(entries[0]);
    return;
  }

  const tab = getActiveTab();
  if (!tab?.sessionId) {
    return;
  }

  try {
    const result = await window.nexusSsh.sftp.downloadMany(tab.sessionId, entries.map((entry) => entry.path));
    if (!result.canceled) {
      showNotice(`已下载 ${result.downloaded?.length || entries.length} 个条目。`, 'success');
    }
  } catch (error) {
    showNotice(`批量下载失败：${error.message}`, 'error');
  }
}

/**
 * 下载指定远程文件。
 */
async function downloadEntry(entry) {
  const tab = getActiveTab();
  if (!tab?.sessionId) {
    return;
  }

  try {
    const result = await window.nexusSsh.sftp.download(tab.sessionId, entry.path);
    if (!result.canceled) {
      showNotice(entry.isDirectory ? '文件夹已下载。' : '文件已下载。', 'success');
    }
  } catch (error) {
    showNotice(`下载失败：${error.message}`, 'error');
  }
}

/**
 * 读取远程文件并打开编辑器。
 */
async function previewEntry(entry) {
  const tab = getActiveTab();
  if (!tab?.sessionId) {
    showNotice('请先打开 SSH 会话。', 'error');
    return;
  }

  if (state.editingFileDirty) {
    const action = await requestUnsavedAction();
    if (action === 'cancel') {
      return;
    }
    if (action === 'save') {
      const saved = await saveRemoteFileFromEditor(false);
      if (!saved) {
        return;
      }
    }
  }

  try {
    showFileEditorLoading(entry);
    const result = await window.nexusSsh.sftp.readFile(tab.sessionId, entry.path, { maxBytes: 1024 * 1024 * 2 });
    openFileEditorWithContent(entry, result);
  } catch (error) {
    showNotice(`文件打开失败：${error.message}`, 'error');
  }
}

/**
 * 打开文件编辑弹窗并填充远程内容。
 */
function openFileEditorWithContent(entry, result) {
  state.editingFilePath = result.path || entry.path;
  state.editingFileEntry = entry;
  state.editingFileOriginalContent = result.content || '';
  state.editingFileEditable = result.editable === true;
  state.editingFileDirty = false;

  elements.fileEditorName.textContent = entry.name;
  elements.fileEditorPath.textContent = state.editingFilePath;
  elements.fileEditorMeta.textContent = `${formatFileSize(result.size || entry.size || 0)} · 权限 ${result.permissions || entry.permissions || '—'} · ${result.editable ? '可编辑文本' : '只读'}`;
  elements.fileEditorTextarea.value = result.content || '';
  elements.fileEditorTextarea.readOnly = !state.editingFileEditable;
  applyEditorSyntaxMode(entry.name, result.content || '');
  elements.fileEditorMessage.textContent = result.message || '文件已读取。';
  elements.saveRemoteFileButton.disabled = !state.editingFileEditable;
  elements.reloadRemoteFileButton.disabled = false;
  elements.downloadPreviewFileButton.disabled = false;

  if (!elements.fileEditorModal.open) {
    elements.fileEditorModal.showModal();
  }
}

/**
 * 显示文件读取中状态。
 */
function showFileEditorLoading(entry) {
  state.editingFilePath = entry.path;
  state.editingFileEntry = entry;
  state.editingFileOriginalContent = '';
  state.editingFileEditable = false;
  state.editingFileDirty = false;
  elements.fileEditorName.textContent = entry.name;
  elements.fileEditorPath.textContent = entry.path;
  elements.fileEditorMeta.textContent = '正在读取远程文件...';
  elements.fileEditorTextarea.value = '';
  elements.fileEditorTextarea.readOnly = true;
  applyEditorSyntaxMode(entry.name, '');
  elements.fileEditorMessage.textContent = '读取中';
  elements.saveRemoteFileButton.disabled = true;
  elements.reloadRemoteFileButton.disabled = true;
  elements.downloadPreviewFileButton.disabled = true;

  if (!elements.fileEditorModal.open) {
    elements.fileEditorModal.showModal();
  }
}

/**
 * 关闭文件编辑器并在存在修改时提示处理方式。
 */
async function closeFileEditorModal() {
  if (state.editingFileDirty) {
    const action = await requestUnsavedAction();
    if (action === 'cancel') {
      return;
    }
    if (action === 'save') {
      const saved = await saveRemoteFileFromEditor(false);
      if (!saved) {
        return;
      }
    }
  }

  resetFileEditorState();
  if (elements.fileEditorModal.open) {
    elements.fileEditorModal.close();
  }
}

/**
 * 标记文件编辑内容是否存在修改。
 */
function markEditingFileDirty() {
  if (!state.editingFileEditable) {
    return;
  }

  state.editingFileDirty = elements.fileEditorTextarea.value !== state.editingFileOriginalContent;
  updateEditorHighlight(elements.fileEditorTextarea.value);
  elements.fileEditorMessage.textContent = state.editingFileDirty ? '文件已修改，保存后会写回远程服务器。' : '没有未保存修改。';
}

/**
 * 保存当前编辑器内容到远程文件。
 */
async function saveRemoteFileFromEditor(showSuccessNotice) {
  const tab = getActiveTab();
  if (!tab?.sessionId || !state.editingFilePath || !state.editingFileEditable) {
    return false;
  }

  try {
    elements.saveRemoteFileButton.disabled = true;
    const result = await window.nexusSsh.sftp.writeFile(tab.sessionId, state.editingFilePath, elements.fileEditorTextarea.value);
    state.editingFileOriginalContent = elements.fileEditorTextarea.value;
    state.editingFileDirty = false;
    elements.fileEditorMeta.textContent = `${formatFileSize(result.size)} · 权限 ${result.permissions || '—'} · 已保存`;
    elements.fileEditorMessage.textContent = '保存成功。';
    await refreshFileList();
    if (showSuccessNotice) {
      showNotice('远程文件已保存。', 'success');
    }
    return true;
  } catch (error) {
    showNotice(`保存远程文件失败：${error.message}`, 'error');
    elements.fileEditorMessage.textContent = `保存失败：${error.message}`;
    return false;
  } finally {
    elements.saveRemoteFileButton.disabled = !state.editingFileEditable;
  }
}

/**
 * 重新读取当前正在编辑的远程文件。
 */
async function reloadRemoteFileInEditor() {
  if (!state.editingFileEntry) {
    return;
  }

  if (state.editingFileDirty) {
    const action = await requestUnsavedAction();
    if (action === 'cancel') {
      return;
    }
    if (action === 'save') {
      const saved = await saveRemoteFileFromEditor(false);
      if (!saved) {
        return;
      }
    }
  }

  await previewEntry(state.editingFileEntry);
}

/**
 * 下载当前正在编辑的远程文件。
 */
async function downloadEditingFile() {
  if (state.editingFileEntry) {
    await downloadEntry(state.editingFileEntry);
  }
}

/**
 * 应用远程文件编辑器的语法模式。
 */
function applyEditorSyntaxMode(fileName, content) {
  const mode = detectSyntaxMode(fileName);
  elements.fileEditorTextarea.dataset.syntax = mode;
  elements.fileEditorHighlight.dataset.syntax = mode;
  updateEditorHighlight(content);
}

/**
 * 更新编辑器语法高亮层。
 */
function updateEditorHighlight(content) {
  if (!elements.fileEditorHighlight) {
    return;
  }

  const mode = elements.fileEditorTextarea.dataset.syntax || 'plain';
  elements.fileEditorHighlight.innerHTML = highlightEditorContent(String(content || ''), mode);
}

/**
 * 同步语法高亮层和编辑区滚动位置。
 */
function syncEditorHighlightScroll() {
  if (!elements.fileEditorHighlight || !elements.fileEditorTextarea) {
    return;
  }
  elements.fileEditorHighlight.scrollTop = elements.fileEditorTextarea.scrollTop;
  elements.fileEditorHighlight.scrollLeft = elements.fileEditorTextarea.scrollLeft;
}

/**
 * 根据文件名识别基础语法模式。
 */
function detectSyntaxMode(fileName) {
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'yaml';
  if (name.includes('nginx') || name.endsWith('.conf') || name.endsWith('.cfg') || name.endsWith('.ini')) return 'conf';
  if (name.endsWith('.js') || name.endsWith('.ts')) return 'js';
  if (name.endsWith('.sh') || name.endsWith('.bash')) return 'shell';
  return 'plain';
}

/**
 * 为常见配置文件生成轻量语法高亮 HTML。
 */
function highlightEditorContent(content, mode) {
  const escaped = escapeHtml(content) + (content.endsWith('\n') ? '' : '\n');
  if (mode === 'json') {
    return escaped
      .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="tok-key">$1</span>$2')
      .replace(/(:\s*)(&quot;[^&]*?&quot;)/g, '$1<span class="tok-string">$2</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="tok-bool">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
  }

  if (mode === 'yaml' || mode === 'conf') {
    return escaped
      .replace(/(^|\n)(\s*)([#;].*)/g, '$1$2<span class="tok-comment">$3</span>')
      .replace(/(^|\n)(\s*)([A-Za-z0-9_.-]+)(\s*[:=])/g, '$1$2<span class="tok-key">$3</span>$4')
      .replace(/(\s)(on|off|true|false|null|yes|no)(\s|$)/gi, '$1<span class="tok-bool">$2</span>$3')
      .replace(/\b(\d+(?:\.\d+)?)([kKmMgG]?|ms|s)?\b/g, '<span class="tok-number">$1$2</span>');
  }

  if (mode === 'js' || mode === 'shell') {
    return escaped
      .replace(/(^|\n)(\s*)(#.*|\/\/.*)/g, '$1$2<span class="tok-comment">$3</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|export|sudo|systemctl|docker|grep|awk|sed)\b/g, '<span class="tok-keyword">$1</span>')
      .replace(/(&quot;[^&]*?&quot;|'[^']*?')/g, '<span class="tok-string">$1</span>');
  }

  return escaped;
}

/**
 * 重置文件编辑器状态。
 */
function resetFileEditorState() {
  state.editingFilePath = '';
  state.editingFileEntry = null;
  state.editingFileOriginalContent = '';
  state.editingFileEditable = false;
  state.editingFileDirty = false;
  if (elements.fileEditorHighlight) {
    elements.fileEditorHighlight.textContent = '';
  }
}

/**
 * 请求用户处理未保存文件。
 */
function requestUnsavedAction() {
  if (!elements.unsavedModal.open) {
    elements.unsavedModal.showModal();
  }

  return new Promise((resolve) => {
    state.unsavedResolver = resolve;
  });
}

/**
 * 解析未保存文件确认动作。
 */
function resolveUnsavedAction(action) {
  if (elements.unsavedModal.open) {
    elements.unsavedModal.close();
  }

  if (state.unsavedResolver) {
    const resolver = state.unsavedResolver;
    state.unsavedResolver = null;
    resolver(action);
  }
}

/**
 * 在当前远程目录创建空白文件。
 */
async function createRemoteFile() {
  const tab = getActiveTab();
  if (!tab?.sessionId) {
    showNotice('请先打开 SSH 会话。', 'error');
    return;
  }

  const name = window.prompt('请输入文件名称', 'new-file.txt');
  if (!name) {
    return;
  }

  try {
    const targetPath = joinRemotePath(tab.currentPath, name);
    await window.nexusSsh.sftp.createFile(tab.sessionId, targetPath);
    await refreshFileList();
    const entry = tab.fileEntries.find((item) => item.path === targetPath);
    if (entry) {
      await previewEntry(entry);
    }
    showNotice('文件已创建。', 'success');
  } catch (error) {
    showNotice(`创建文件失败：${error.message}`, 'error');
  }
}

/**
 * 在当前远程目录创建文件夹。
 */
async function createRemoteDirectory() {
  const tab = getActiveTab();
  if (!tab?.sessionId) {
    showNotice('请先打开 SSH 会话。', 'error');
    return;
  }

  const name = window.prompt('请输入文件夹名称', 'new-folder');
  if (!name) {
    return;
  }

  try {
    await window.nexusSsh.sftp.mkdir(tab.sessionId, joinRemotePath(tab.currentPath, name));
    await refreshFileList();
    showNotice('文件夹已创建。', 'success');
  } catch (error) {
    showNotice(`创建文件夹失败：${error.message}`, 'error');
  }
}

/**
 * 重命名当前选中文件或目录。
 */
function renameSelectedFile() {
  const entry = getSelectedFileEntry();
  if (!entry) {
    showNotice('请先选择一个文件或目录。', 'error');
    return;
  }

  renameEntry(entry);
}

/**
 * 重命名远程文件或目录。
 */
async function renameEntry(entry) {
  const tab = getActiveTab();
  const nextName = window.prompt('请输入新名称', entry.name);
  if (!tab?.sessionId || !nextName || nextName === entry.name) {
    return;
  }

  try {
    const nextPath = joinRemotePath(getParentRemotePath(entry.path), nextName);
    await window.nexusSsh.sftp.rename(tab.sessionId, entry.path, nextPath);
    await refreshFileList();
    showNotice('已重命名。', 'success');
  } catch (error) {
    showNotice(`重命名失败：${error.message}`, 'error');
  }
}

/**
 * 修改当前选中文件或目录权限。
 */
function chmodSelectedFile() {
  const entry = getSelectedFileEntry();
  if (!entry) {
    showNotice('请先选择一个文件或目录。', 'error');
    return;
  }

  chmodEntry(entry);
}

/**
 * 修改远程文件或目录权限。
 */
async function chmodEntry(entry) {
  const tab = getActiveTab();
  const mode = window.prompt('请输入权限，例如 644 或 755', entry.permissions || '644');
  if (!tab?.sessionId || !mode) {
    return;
  }

  try {
    await window.nexusSsh.sftp.chmod(tab.sessionId, entry.path, mode);
    await refreshFileList();
    showNotice('权限已修改。', 'success');
  } catch (error) {
    showNotice(`权限修改失败：${error.message}`, 'error');
  }
}

/**
 * 删除当前选中文件或目录。
 */
function deleteSelectedFile() {
  const entry = getSelectedFileEntry();
  if (!entry) {
    showNotice('请先选择一个文件或目录。', 'error');
    return;
  }

  deleteEntry(entry);
}

/**
 * 删除远程文件或空目录。
 */
async function deleteEntry(entry) {
  const tab = getActiveTab();
  if (!tab?.sessionId) {
    return;
  }

  const confirmed = window.confirm(`确认删除 ${entry.name} 吗？`);
  if (!confirmed) {
    return;
  }

  try {
    await window.nexusSsh.sftp.delete(tab.sessionId, entry.path, entry.isDirectory);
    await refreshFileList();
    showNotice('已删除。', 'success');
  } catch (error) {
    showNotice(`删除失败：${error.message}`, 'error');
  }
}

/**
 * 获取当前选中的文件项。
 */
function getSelectedFileEntry() {
  const tab = getActiveTab();
  if (!tab) {
    return null;
  }

  return tab.fileEntries.find((item) => item.path === tab.selectedFilePath) || null;
}

function getSelectedFileEntries() {
  const tab = getActiveTab();
  if (!tab) {
    return [];
  }
  const paths = new Set(tab.selectedFilePaths?.length ? tab.selectedFilePaths : [tab.selectedFilePath].filter(Boolean));
  return tab.fileEntries.filter((item) => paths.has(item.path));
}

/**
 * 根据当前状态更新 SFTP 按钮。
 */
function updateSftpButtons() {
  const tab = getActiveTab();
  const selectedEntries = getSelectedFileEntries();
  const hasSession = Boolean(tab?.sessionId);
  elements.sftpSearchInput.disabled = !hasSession;
  elements.uploadButton.disabled = !hasSession;
  elements.refreshFilesButton.disabled = !hasSession;
  elements.downloadButton.disabled = !hasSession || tab?.fileListLoading || selectedEntries.length === 0;
  elements.serverStatusToolbarButton.disabled = !hasSession;
}

/**
 * 渲染远程路径面包屑。
 */
function renderBreadcrumbs(remotePath) {
  const parts = buildBreadcrumbParts(remotePath);
  elements.breadcrumbList.innerHTML = '';

  parts.forEach((part, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'breadcrumb-item';
    button.textContent = part.label;
    button.title = part.path;
    button.addEventListener('click', () => openRemoteDirectory(part.path));
    elements.breadcrumbList.appendChild(button);

    if (index < parts.length - 1) {
      const separator = document.createElement('span');
      separator.className = 'breadcrumb-separator';
      separator.textContent = '/';
      elements.breadcrumbList.appendChild(separator);
    }
  });
}

/**
 * 根据路径构建面包屑数据。
 */
function buildBreadcrumbParts(remotePath) {
  const normalized = normalizeRemotePath(remotePath);
  const names = normalized.split('/').filter(Boolean);
  const parts = [{ label: '/', path: '/' }];
  let current = '';

  names.forEach((name) => {
    current = `${current}/${name}`;
    parts.push({ label: name, path: current });
  });

  return parts;
}

/**
 * 打开 SFTP 右键菜单。
 */
function openSftpContextMenu(event) {
  event.preventDefault();
  event.stopPropagation();
  const tab = getActiveTab();
  const hasSession = Boolean(tab?.sessionId);
  const selectedEntry = getSelectedFileEntry();
  const selectedEntries = getSelectedFileEntries();
  hideFileMenu();
  hideTabContextMenu();
  hideProfileContextMenu();
  hideTerminalContextMenu();
  elements.contextRefreshButton.disabled = !hasSession || tab?.fileListLoading;
  elements.contextUploadButton.disabled = !hasSession;
  elements.contextDownloadButton.disabled = !hasSession || tab?.fileListLoading || selectedEntries.length === 0;
  elements.contextNewFileButton.disabled = !hasSession;
  elements.contextNewFolderButton.disabled = !hasSession;
  elements.contextRenameButton.disabled = !hasSession || !selectedEntry;
  elements.contextChmodButton.disabled = !hasSession || !selectedEntry;
  elements.contextDeleteButton.disabled = !hasSession || !selectedEntry;
  elements.sftpContextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 170)}px`;
  elements.sftpContextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 210)}px`;
  elements.sftpContextMenu.classList.remove('hidden');
}

/**
 * 隐藏 SFTP 右键菜单。
 */
function hideSftpContextMenu() {
  elements.sftpContextMenu.classList.add('hidden');
}


/**
 * 打开标签右键菜单。
 */
function openTabContextMenu(event, tabId) {
  event.preventDefault();
  event.stopPropagation();
  state.contextTabId = tabId;
  const tab = findTab(tabId);
  const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  hideFileMenu();
  hideSftpContextMenu();
  hideProfileContextMenu();
  hideTerminalContextMenu();
  elements.tabServerStatusButton.disabled = !tab?.sessionId;
  elements.tabCloseOthersButton.disabled = state.tabs.length <= 1;
  elements.tabCloseLeftButton.disabled = tabIndex <= 0;
  elements.tabCloseRightButton.disabled = tabIndex < 0 || tabIndex >= state.tabs.length - 1;
  elements.tabCloseAllButton.disabled = state.tabs.length === 0;
  elements.tabContextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
  elements.tabContextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 160)}px`;
  elements.tabContextMenu.classList.remove('hidden');
}

/**
 * 隐藏标签右键菜单。
 */
function hideTabContextMenu() {
  elements.tabContextMenu.classList.add('hidden');
}

/**
 * 隐藏所有右键菜单。
 */
function hideContextMenus() {
  hideFileMenu();
  hideSftpContextMenu();
  hideTabContextMenu();
  hideProfileContextMenu();
  hideTerminalContextMenu();
}
/**
 * 切换左上角文件菜单的显示状态。
 */
function toggleFileMenu(event) {
  event.preventDefault();
  event.stopPropagation();
  hideSftpContextMenu();
  hideTabContextMenu();
  hideProfileContextMenu();
  hideTerminalContextMenu();

  const rect = elements.fileMenuButton.getBoundingClientRect();
  elements.fileMenu.style.left = `${rect.left}px`;
  elements.fileMenu.style.top = `${rect.bottom + 6}px`;
  elements.fileMenu.classList.toggle('hidden');
}

/**
 * 执行文件菜单动作并关闭菜单。
 */
async function runFileMenuAction(action) {
  hideFileMenu();
  await action();
}

/**
 * 隐藏左上角文件菜单。
 */
function hideFileMenu() {
  elements.fileMenu.classList.add('hidden');
}

function toggleConnectionSearch(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const collapsed = elements.connectionSearchBox.classList.toggle('collapsed');
  elements.connectionSearchToggleButton.classList.toggle('active', !collapsed);
  if (!collapsed) {
    elements.connectionSearchInput.focus();
    elements.connectionSearchInput.select();
  }
}

function toggleProfileMask() {
  state.profileMasked = !state.profileMasked;
  elements.welcomeMaskProfilesButton.classList.toggle('active', state.profileMasked);
  renderProfiles();
}

/**
 * 执行标签右键菜单动作。
 */
async function runTabContextAction(action) {
  const tabId = state.contextTabId;
  hideTabContextMenu();
  await action(tabId);
}

/**
 * 执行 SFTP 右键菜单动作。
 */
async function runContextAction(action) {
  hideSftpContextMenu();
  await action();
}

function openProfileContextMenu(event, profileId) {
  event.preventDefault();
  event.stopPropagation();
  state.profileContextId = profileId;
  hideFileMenu();
  hideSftpContextMenu();
  hideTabContextMenu();
  hideTerminalContextMenu();
  const hasOpenSession = state.tabs.some((tab) => tab.profileId === profileId);
  const profile = state.profiles.find((item) => item.id === profileId);
  elements.profileContextCloseButton.disabled = !hasOpenSession;
  elements.profileContextCloseAllButton.disabled = state.tabs.length === 0;
  elements.profileContextCopyHostButton.disabled = !profile?.host;
  elements.profileContextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
  elements.profileContextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 230)}px`;
  elements.profileContextMenu.classList.remove('hidden');
}

function hideProfileContextMenu() {
  elements.profileContextMenu?.classList.add('hidden');
}

async function runProfileContextAction(action) {
  const profileId = state.profileContextId;
  hideProfileContextMenu();
  await action(profileId);
}

async function openProfileFromContext(profileId) {
  await openProfileTab(profileId);
}

async function closeProfileSessionsFromContext(profileId) {
  const tabIds = state.tabs.filter((tab) => tab.profileId === profileId).map((tab) => tab.id);
  await closeTabsByIds(tabIds);
}

function editProfileFromContext(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (profile) {
    openProfileModal(profile);
  }
}

function copyProfileHostFromContext(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  const host = String(profile?.host || '').trim();
  if (!host) {
    showNotice('当前连接没有可复制的 IP。', 'error');
    return;
  }

  window.nexusSsh.clipboard.writeText(host);
  showNotice(`已复制 IP：${host}`, 'success');
}

async function copyProfileFromContext(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) {
    return;
  }
  const payload = {
    ...profile,
    id: undefined,
    name: `${profile.name} 副本`,
    password: '',
    passphrase: ''
  };
  try {
    const saved = await window.nexusSsh.profiles.save(payload);
    state.selectedProfileId = saved.id;
    await loadProfiles();
    showNotice('连接已复制，密码需要重新填写。', 'success');
  } catch (error) {
    showNotice(`复制失败：${error.message}`, 'error');
  }
}

async function renameProfileFromContext(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) {
    return;
  }
  const name = window.prompt('请输入新的连接名称', profile.name);
  if (!name || name.trim() === profile.name) {
    return;
  }
  try {
    await window.nexusSsh.profiles.save({ ...profile, name: name.trim() });
    await loadProfiles();
    showNotice('连接已重命名。', 'success');
  } catch (error) {
    showNotice(`重命名失败：${error.message}`, 'error');
  }
}

async function deleteProfileFromContext(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile || !window.confirm(`确认删除「${profile.name}」吗？`)) {
    return;
  }
  try {
    await window.nexusSsh.profiles.remove(profileId);
    state.selectedProfileId = '';
    await closeProfileSessionsFromContext(profileId);
    await loadProfiles();
    showNotice('连接配置已删除。', 'success');
  } catch (error) {
    showNotice(`删除失败：${error.message}`, 'error');
  }
}

function openTerminalContextMenu(event) {
  if (!elements.terminalWrap.contains(event.target)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  hideFileMenu();
  hideSftpContextMenu();
  hideTabContextMenu();
  hideProfileContextMenu();
  elements.terminalContextCopyButton.disabled = !getActiveTab()?.terminal?.hasSelection?.();
  elements.terminalContextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 180)}px`;
  elements.terminalContextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 170)}px`;
  elements.terminalContextMenu.classList.remove('hidden');
}

function hideTerminalContextMenu() {
  elements.terminalContextMenu?.classList.add('hidden');
}

async function runTerminalContextAction(action) {
  hideTerminalContextMenu();
  await action();
}

function openTerminalSearchPlaceholder() {
  if (!getActiveTab()?.terminal) {
    return;
  }
  elements.terminalSearchPanel?.classList.remove('hidden');
  elements.terminalSearchInput?.focus();
  elements.terminalSearchInput?.select();
  updateTerminalSearch();
}

function closeTerminalSearch() {
  elements.terminalSearchPanel?.classList.add('hidden');
  state.terminalSearch = { query: '', matches: [], index: -1 };
  getActiveTab()?.terminal?.clearSelection?.();
  getActiveTab()?.terminal?.focus?.();
}

function handleTerminalSearchKeydown(event) {
  if (event.key === 'Escape') {
    closeTerminalSearch();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    showAdjacentTerminalSearchMatch(event.shiftKey ? -1 : 1);
  }
}

function updateTerminalSearch() {
  const tab = getActiveTab();
  const query = elements.terminalSearchInput?.value || '';
  if (!tab?.terminal || !query) {
    state.terminalSearch = { query, matches: [], index: -1 };
    updateTerminalSearchCount();
    tab?.terminal?.clearSelection?.();
    return;
  }
  const matches = findTerminalSearchMatches(tab.terminal, query);
  state.terminalSearch = { query, matches, index: matches.length ? 0 : -1 };
  updateTerminalSearchCount();
  showTerminalSearchMatch(state.terminalSearch.index);
}

function findTerminalSearchMatches(terminal, query) {
  const lowerQuery = query.toLowerCase();
  const buffer = terminal.buffer?.active;
  if (!buffer || !lowerQuery) {
    return [];
  }
  const matches = [];
  for (let lineIndex = 0; lineIndex < buffer.length; lineIndex += 1) {
    const line = buffer.getLine(lineIndex);
    const text = line?.translateToString(true) || '';
    const lowerText = text.toLowerCase();
    let column = lowerText.indexOf(lowerQuery);
    while (column >= 0) {
      matches.push({ line: lineIndex, column });
      column = lowerText.indexOf(lowerQuery, column + lowerQuery.length);
    }
  }
  return matches;
}

function showAdjacentTerminalSearchMatch(offset) {
  const matches = state.terminalSearch.matches || [];
  if (!matches.length) {
    updateTerminalSearchCount();
    return;
  }
  state.terminalSearch.index = (state.terminalSearch.index + offset + matches.length) % matches.length;
  updateTerminalSearchCount();
  showTerminalSearchMatch(state.terminalSearch.index);
}

function showTerminalSearchMatch(index) {
  const tab = getActiveTab();
  const match = state.terminalSearch.matches?.[index];
  if (!tab?.terminal || !match) {
    return;
  }
  try {
    tab.terminal.scrollToLine(match.line);
    tab.terminal.select(match.column, match.line, state.terminalSearch.query.length);
  } catch (error) {
    // xterm select/scroll APIs vary slightly between versions; keep search UI usable.
  }
}

function updateTerminalSearchCount() {
  if (!elements.terminalSearchCount) {
    return;
  }
  const total = state.terminalSearch.matches?.length || 0;
  elements.terminalSearchCount.textContent = total ? `${state.terminalSearch.index + 1}/${total}` : '0/0';
}

/**
 * 打开连接配置弹窗。
 */
async function openProfileModal(profile) {
  elements.profileForm.reset();
  elements.profileIdInput.value = profile?.id || '';
  elements.profileModalTitle.textContent = profile ? '编辑连接' : '新建连接';
  elements.profileNameInput.value = profile?.name || '';
  elements.profileGroupInput.value = profile?.group || '默认';
  elements.profileHostInput.value = profile?.host || '';
  elements.profilePortInput.value = profile?.port || 22;
  elements.profileUsernameInput.value = profile?.username || '';
  elements.profileAuthTypeInput.value = profile?.authType || 'password';
  elements.profileTimeoutInput.value = profile?.timeoutSeconds || 20;
  elements.profileKeepaliveInput.value = profile?.keepaliveSeconds || 15;
  elements.profileRemotePathInput.value = '/';
  elements.profileStartupCommandInput.value = '';
  elements.profileTagsInput.value = profile?.remark || (profile?.tags || []).join(', ');
  setProfileColorValue(profile?.color || 'default');
  elements.profilePasswordInput.type = 'password';
  elements.profilePassphraseInput.type = 'password';
  elements.togglePasswordButton.classList.remove('is-visible');
  elements.togglePassphraseButton.classList.remove('is-visible');
  elements.profilePasswordInput.value = '';
  elements.profilePrivateKeyInput.value = profile?.privateKeyPath || '';
  elements.profilePassphraseInput.value = '';
  elements.profilePathSyncInput.checked = profile ? profile.pathSync === true : state.settings.pathSync !== false;

  if (profile?.id) {
    await fillSavedSecrets(profile.id);
  }
  elements.deleteProfileButton.style.visibility = profile ? 'visible' : 'hidden';
  elements.profileTestResult.className = 'test-result hidden';
  updateAuthPanels();

  if (!elements.profileModal.open) {
    elements.profileModal.showModal();
  }
}

/**
 * 在编辑连接时读取并填充已保存的敏感字段。
 */
async function fillSavedSecrets(profileId) {
  try {
    const secrets = await window.nexusSsh.profiles.getSecrets(profileId);
    if (secrets?.password) {
      elements.profilePasswordInput.value = secrets.password;
    }
    if (secrets?.passphrase) {
      elements.profilePassphraseInput.value = secrets.passphrase;
    }
  } catch (error) {
    elements.profilePasswordInput.placeholder = '读取已保存密码失败，可重新输入';
    elements.profilePassphraseInput.placeholder = '读取已保存口令失败，可重新输入';
  }
}

/**
 * 切换密码类输入框的可见状态。
 */
function toggleSecretInput(input, button) {
  const shouldShow = input.type === 'password';
  input.type = shouldShow ? 'text' : 'password';
  button.classList.toggle('is-visible', shouldShow);
}

function handleProfileColorClick(event) {
  const button = event.target.closest('button[data-color]');
  if (!button) {
    return;
  }
  setProfileColorValue(button.dataset.color || 'default');
}

function setProfileColorValue(color) {
  const value = normalizeProfileColor(color);
  elements.profileColorInput.value = value;
  elements.profileColorGroup?.querySelectorAll('button[data-color]').forEach((button) => {
    button.classList.toggle('active', button.dataset.color === value);
  });
}

/**
 * 关闭连接配置弹窗。
 */
function closeProfileModal() {
  if (elements.profileModal.open) {
    elements.profileModal.close();
  }
}

/**
 * 设置连接认证方式。
 */
function setAuthTypeValue(authType) {
  elements.profileAuthTypeInput.value = authType === 'key' ? 'key' : 'password';
  updateAuthPanels();
}

/**
 * 根据认证方式切换表单区域。
 */
function updateAuthPanels() {
  const authType = elements.profileAuthTypeInput.value;
  const isKey = authType === 'key';
  elements.profileForm.classList.toggle('auth-key', isKey);
  elements.authPasswordButton.classList.toggle('active', !isKey);
  elements.authKeyButton.classList.toggle('active', isKey);
  elements.passwordAuthPanel.classList.toggle('hidden', isKey);
  elements.keyAuthPanel.classList.toggle('hidden', !isKey);
}

/**
 * 收集连接配置表单数据。
 */
function collectProfileFormPayload() {
  return {
    id: elements.profileIdInput.value || undefined,
    name: elements.profileNameInput.value,
    group: elements.profileGroupInput.value,
    host: elements.profileHostInput.value,
    port: elements.profilePortInput.value,
    username: elements.profileUsernameInput.value,
    authType: elements.profileAuthTypeInput.value,
    timeoutSeconds: elements.profileTimeoutInput.value,
    keepaliveSeconds: elements.profileKeepaliveInput.value,
    remoteStartPath: elements.profileRemotePathInput.value,
    terminalStartupCommand: '',
    tags: '',
    remark: elements.profileTagsInput.value,
    color: elements.profileColorInput.value,
    password: elements.profilePasswordInput.value,
    privateKeyPath: elements.profilePrivateKeyInput.value,
    passphrase: elements.profilePassphraseInput.value,
    pathSync: state.settings.pathSync !== false
  };
}

/**
 * 保存连接配置。
 */
async function saveProfileFromForm(event) {
  event.preventDefault();

  try {
    const saved = await window.nexusSsh.profiles.save(collectProfileFormPayload());
    state.selectedProfileId = saved.id;
    await loadProfiles();
    closeProfileModal();
    showNotice('连接配置已保存。', 'success');
  } catch (error) {
    showNotice(`保存失败：${error.message}`, 'error');
  }
}

/**
 * 测试连接配置表单中的 SSH 与 SFTP 可用性。
 */
async function testProfileFromModal() {
  elements.profileTestResult.className = 'test-result';
  elements.profileTestResult.textContent = '正在测试连接...';
  elements.testProfileButton.disabled = true;

  try {
    const result = await window.nexusSsh.profiles.test(collectProfileFormPayload());
    elements.profileTestResult.className = `test-result ${result.success ? 'success' : 'error'}`;
    elements.profileTestResult.textContent = formatTestResultMessage(result);
  } catch (error) {
    elements.profileTestResult.className = 'test-result error';
    elements.profileTestResult.textContent = `连接测试失败：${error.message}`;
  } finally {
    elements.testProfileButton.disabled = false;
  }
}

/**
 * 删除当前编辑的连接配置。
 */
async function removeCurrentProfile() {
  const profileId = elements.profileIdInput.value;
  if (!profileId) {
    return;
  }

  const confirmed = window.confirm('确认删除此连接配置吗？');
  if (!confirmed) {
    return;
  }

  try {
    await window.nexusSsh.profiles.remove(profileId);
    state.selectedProfileId = '';
    await loadProfiles();
    closeProfileModal();
    showNotice('连接配置已删除。', 'success');
  } catch (error) {
    showNotice(`删除失败：${error.message}`, 'error');
  }
}

/**
 * 选择私钥文件路径。
 */
async function pickPrivateKey() {
  const privateKeyPath = await window.nexusSsh.dialog.pickPrivateKey();
  if (privateKeyPath) {
    elements.profilePrivateKeyInput.value = privateKeyPath;
  }
}

/**
 * 导入连接配置。
 */
async function importProfiles() {
  try {
    const result = await window.nexusSsh.profiles.import();
    if (!result.canceled) {
      state.profiles = result.profiles || await window.nexusSsh.profiles.list();
      renderProfiles();
      showNotice(`已导入 ${result.imported || 0} 个连接。`, 'success');
    }
  } catch (error) {
    showNotice(`导入失败：${error.message}`, 'error');
  }
}

/**
 * 打开导出连接配置弹窗。
 */
function openExportModal() {
  renderExportProfileList();
  elements.exportSelectAllInput.checked = true;
  elements.exportSecretsInput.checked = false;

  if (!elements.exportModal.open) {
    elements.exportModal.showModal();
  }
}

/**
 * 关闭导出连接配置弹窗。
 */
function closeExportModal() {
  if (elements.exportModal.open) {
    elements.exportModal.close();
  }
}

/**
 * 渲染可导出的连接配置列表。
 */
function renderExportProfileList() {
  elements.exportProfileList.innerHTML = '';

  if (state.profiles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-cell';
    empty.textContent = '暂无可导出的连接配置';
    elements.exportProfileList.appendChild(empty);
    return;
  }

  state.profiles.forEach((profile) => {
    const label = document.createElement('label');
    label.className = 'export-profile-item checkbox-line';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = profile.id;
    checkbox.checked = true;
    checkbox.addEventListener('change', syncExportSelectAllState);

    const text = document.createElement('span');
    text.textContent = profile.name;

    label.appendChild(checkbox);
    label.appendChild(text);
    elements.exportProfileList.appendChild(label);
  });
}

/**
 * 切换导出弹窗中所有连接配置的选中状态。
 */
function toggleExportSelection() {
  elements.exportProfileList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = elements.exportSelectAllInput.checked;
  });
}

/**
 * 同步导出弹窗的全选状态。
 */
function syncExportSelectAllState() {
  const checkboxes = Array.from(elements.exportProfileList.querySelectorAll('input[type="checkbox"]'));
  elements.exportSelectAllInput.checked = checkboxes.length > 0 && checkboxes.every((checkbox) => checkbox.checked);
}

/**
 * 根据弹窗选择导出连接配置。
 */
async function confirmExportProfiles(event) {
  event.preventDefault();
  const profileIds = Array.from(elements.exportProfileList.querySelectorAll('input[type="checkbox"]'))
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);

  if (profileIds.length === 0) {
    showNotice('请至少选择一个连接。', 'error');
    return;
  }

  try {
    const result = await window.nexusSsh.profiles.export({
      includeSecrets: elements.exportSecretsInput.checked,
      profileIds
    });

    if (!result.canceled) {
      closeExportModal();
      showNotice('连接配置已导出。', 'success');
    }
  } catch (error) {
    showNotice(`导出失败：${error.message}`, 'error');
  }
}

/**
 * 兼容主菜单调用的导出入口。
 */
function exportProfiles() {
  openExportModal();
}

/**
 * 设置设置弹窗中的主题值并刷新分段按钮状态。
 */
function setSettingsThemeValue(theme) {
  const normalized = normalizeTheme(theme);
  elements.settingsThemeSelect.value = normalized;
  elements.settingsThemeDarkButton.classList.toggle('active', normalized === 'dark');
  elements.settingsThemeLightButton.classList.toggle('active', normalized === 'light');
}

/**
 * 打开设置弹窗。
 */
function openSettingsModal() {
  setSettingsThemeValue(state.settings.theme);
  elements.settingsFontSizeInput.value = state.settings.terminalFontSize;
  elements.settingsLeftDrawerInput.checked = state.settings.leftDrawerOpen === true;
  elements.settingsRightDrawerInput.checked = state.settings.rightDrawerOpen !== false;
  elements.settingsPathSyncInput.checked = state.settings.pathSync !== false;
  elements.settingsCommandHintInput.checked = state.settings.commandHints !== false;
  elements.settingsFileFollowInput.checked = state.settings.fileFollow !== false;
  elements.settingsShowConnectionDetailInput.checked = state.settings.showConnectionDetails === true;
  renderShortcutButtons();
  renderMouseActionGroups();
  renderStoreInfo();

  if (!elements.settingsModal.open) {
    elements.settingsModal.showModal();
  }
}

/**
 * 关闭设置弹窗。
 */
function closeSettingsModal() {
  if (elements.settingsModal.open) {
    elements.settingsModal.close();
  }
}

/**
 * 保存设置弹窗中的配置。
 */
function saveSettingsFromForm(event) {
  event.preventDefault();
  state.settings.theme = normalizeTheme(elements.settingsThemeSelect.value);
  state.settings.terminalFontSize = normalizeNumber(elements.settingsFontSizeInput.value, 14, 12, 20);
  state.settings.leftDrawerOpen = elements.settingsLeftDrawerInput.checked;
  state.settings.rightDrawerOpen = elements.settingsRightDrawerInput.checked;
  state.settings.commandHints = elements.settingsCommandHintInput.checked;
  state.settings.fileFollow = elements.settingsFileFollowInput.checked;
  state.settings.pathSync = elements.settingsPathSyncInput.checked || state.settings.fileFollow;
  state.settings.showConnectionDetails = elements.settingsShowConnectionDetailInput.checked;
  state.settings.mouseBackAction = normalizeMouseAction(state.settings.mouseBackAction);
  state.settings.mouseForwardAction = normalizeMouseAction(state.settings.mouseForwardAction);
  state.settings.shortcuts = normalizeShortcutSettings(state.settings.shortcuts);
  state.settings.latencyRefreshSeconds = normalizeNumber(state.settings.latencyRefreshSeconds, 60, 15, 600);
  saveApplicationSettings();
  applyApplicationSettings();
  resetLatencyRefreshTimer();
  renderProfiles();
  closeSettingsModal();
  showNotice('设置已保存。', 'success');
}

/**
 * 处理鼠标侧键动作分组按钮点击。
 */
function handleMouseActionGroupClick(event) {
  const button = event.target.closest('button[data-value]');
  if (!button) {
    return;
  }

  const group = button.closest('.shortcut-action-group');
  const target = group?.dataset.target;
  if (!target) {
    return;
  }

  state.settings[target] = normalizeMouseAction(button.dataset.value);
  renderMouseActionGroups();
}

/**
 * 渲染鼠标侧键动作分组状态。
 */
function renderMouseActionGroups() {
  renderMouseActionGroup(elements.mouseBackActionGroup, state.settings.mouseBackAction);
  renderMouseActionGroup(elements.mouseForwardActionGroup, state.settings.mouseForwardAction);
}

/**
 * 渲染单个鼠标动作分组状态。
 */
function renderMouseActionGroup(group, value) {
  if (!group) {
    return;
  }

  group.querySelectorAll('button[data-value]').forEach((button) => {
    button.classList.toggle('active', button.dataset.value === value);
  });
}

/**
 * 更改连接配置保存位置并复制已有连接信息。
 */
async function changeStoreDirectory() {
  try {
    const result = await window.nexusSsh.profiles.chooseStoreDirectory();
    state.storeInfo = result.storeInfo;
    renderStoreInfo();
    if (!result.canceled) {
      await loadProfiles();
      showNotice('保存位置已更改，现有连接信息已复制到新位置。', 'success');
    }
  } catch (error) {
    showNotice(`更改保存位置失败：${error.message}`, 'error');
  }
}

/**
 * 绑定左右抽屉拖拽调整宽度事件。
 */
function bindDrawerResizeEvents() {
  elements.leftResizeHandle.addEventListener('mousedown', (event) => startDrawerResize(event, 'left'));
  elements.rightResizeHandle.addEventListener('mousedown', (event) => startDrawerResize(event, 'right'));
  window.addEventListener('mousemove', resizeDrawerByPointer);
  window.addEventListener('mouseup', stopDrawerResize);
}

/**
 * 开始拖拽调整抽屉宽度。
 */
function startDrawerResize(event, side) {
  event.preventDefault();
  state.resizeState = {
    side,
    startX: event.clientX,
    leftWidth: state.settings.leftDrawerWidth,
    rightWidth: state.settings.rightDrawerWidth
  };
  document.body.classList.add('is-resizing-drawer');
}

/**
 * 根据鼠标位置更新抽屉宽度。
 */
function resizeDrawerByPointer(event) {
  if (!state.resizeState) {
    return;
  }

  if (state.resizeState.side === 'left') {
    const width = normalizeNumber(state.resizeState.leftWidth + event.clientX - state.resizeState.startX, 260, 220, 420);
    state.settings.leftDrawerWidth = width;
    elements.mainLayout.style.setProperty('--left-drawer-width', `${width}px`);
  } else {
    const width = normalizeNumber(state.resizeState.rightWidth - event.clientX + state.resizeState.startX, 520, 360, 760);
    state.settings.rightDrawerWidth = width;
    elements.sessionView.style.setProperty('--right-drawer-width', `${width}px`);
  }

  setTimeout(fitActiveTerminal, 0);
}

/**
 * 结束拖拽调整抽屉宽度并保存配置。
 */
function stopDrawerResize() {
  if (!state.resizeState) {
    return;
  }

  state.resizeState = null;
  document.body.classList.remove('is-resizing-drawer');
  saveApplicationSettings();
  setTimeout(fitActiveTerminal, 30);
}

/**
 * 展开或收起左侧连接面板。
 */
function toggleLeftDrawer() {
  setLeftDrawerOpen(state.settings.leftDrawerOpen !== true);
}

/**
 * 设置左侧连接面板状态。
 */
async function setLeftDrawerOpen(open) {
  state.settings.leftDrawerOpen = open === true;
  saveApplicationSettings();
  applyDrawerLayout();
  await waitForStableLayout();
  fitActiveTerminal();
}

/**
 * 展开或收起右侧 SFTP 面板。
 */
function toggleRightDrawer() {
  setRightDrawerOpen(state.settings.rightDrawerOpen === false);
}

/**
 * 设置右侧 SFTP 面板状态。
 */
async function setRightDrawerOpen(open) {
  state.settings.rightDrawerOpen = open === true;
  saveApplicationSettings();
  applyDrawerLayout();
  await waitForStableLayout();
  fitActiveTerminal();
}

/**
 * 在黑色与白色主题之间切换。
 */
function toggleTheme() {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  saveApplicationSettings();
  applyApplicationSettings();
}

/**
 * 判断键盘事件是否匹配指定快捷键文本。
 */
function matchesShortcut(event, shortcutText) {
  const shortcut = parseShortcutText(shortcutText);
  if (!shortcut.key) {
    return false;
  }

  return event.ctrlKey === shortcut.ctrl
    && event.shiftKey === shortcut.shift
    && event.altKey === shortcut.alt
    && event.metaKey === shortcut.meta
    && normalizeEventKey(event) === shortcut.key;
}

/**
 * 将快捷键文本解析为结构化对象。
 */
function parseShortcutText(shortcutText) {
  const parts = String(shortcutText || '').split('+').map((part) => part.trim()).filter(Boolean);
  const shortcut = { ctrl: false, shift: false, alt: false, meta: false, key: '' };

  parts.forEach((part) => {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') {
      shortcut.ctrl = true;
    } else if (lower === 'shift') {
      shortcut.shift = true;
    } else if (lower === 'alt' || lower === 'option') {
      shortcut.alt = true;
    } else if (lower === 'meta' || lower === 'cmd' || lower === 'win') {
      shortcut.meta = true;
    } else {
      shortcut.key = normalizeShortcutKey(part);
    }
  });

  return shortcut;
}

/**
 * 根据键盘事件生成可保存的快捷键文本。
 */
function formatShortcutFromEvent(event) {
  const key = normalizeEventKey(event);
  if (!key || ['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
    return '';
  }

  const parts = [];
  if (event.ctrlKey) {
    parts.push('Ctrl');
  }
  if (event.shiftKey) {
    parts.push('Shift');
  }
  if (event.altKey) {
    parts.push('Alt');
  }
  if (event.metaKey) {
    parts.push('Meta');
  }
  parts.push(key);
  return parts.join('+');
}

/**
 * 标准化快捷键文本。
 */
function normalizeShortcutText(shortcutText) {
  const shortcut = parseShortcutText(shortcutText);
  const parts = [];
  if (shortcut.ctrl) {
    parts.push('Ctrl');
  }
  if (shortcut.shift) {
    parts.push('Shift');
  }
  if (shortcut.alt) {
    parts.push('Alt');
  }
  if (shortcut.meta) {
    parts.push('Meta');
  }
  if (shortcut.key) {
    parts.push(shortcut.key);
  }
  return parts.join('+');
}

/**
 * 标准化键盘事件中的按键名称。
 */
function normalizeEventKey(event) {
  if (event.code && /^Key[A-Z]$/.test(event.code)) {
    return event.code.slice(3);
  }

  if (event.code && /^Digit[0-9]$/.test(event.code)) {
    return event.code.slice(5);
  }

  return normalizeShortcutKey(event.key);
}

/**
 * 标准化快捷键中的主键名称。
 */
function normalizeShortcutKey(key) {
  const value = String(key || '').trim();
  if (!value) {
    return '';
  }

  if (value.length === 1) {
    return value.toUpperCase();
  }

  const aliases = {
    esc: 'Escape',
    del: 'Delete',
    space: 'Space',
    ' ': 'Space'
  };
  return aliases[value.toLowerCase()] || value[0].toUpperCase() + value.slice(1);
}

/**
 * 进入快捷键录制状态。
 */
function startShortcutRecording(action) {
  state.recordingShortcutAction = action;
  renderShortcutButtons();
}

/**
 * 处理快捷键录制时的按键。
 */
function handleShortcutRecordingKey(event) {
  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape') {
    state.recordingShortcutAction = '';
    renderShortcutButtons();
    return;
  }

  const shortcutText = formatShortcutFromEvent(event);
  if (!shortcutText) {
    return;
  }

  state.settings.shortcuts[state.recordingShortcutAction] = shortcutText;
  state.recordingShortcutAction = '';
  renderShortcutButtons();
}

/**
 * 渲染设置中的快捷键按钮文本。
 */
function renderShortcutButtons() {
  const buttons = {
    copy: elements.copyShortcutButton,
    paste: elements.pasteShortcutButton,
    clear: elements.clearShortcutButton,
    search: elements.searchShortcutButton
  };

  Object.entries(buttons).forEach(([action, button]) => {
    if (!button) {
      return;
    }
    button.classList.toggle('recording', state.recordingShortcutAction === action);
    button.textContent = state.recordingShortcutAction === action ? '按下新的快捷键' : state.settings.shortcuts[action];
  });
}

/**
 * 处理全局快捷键。
 */
function handleGlobalKeydown(event) {
  const isTerminalEvent = elements.terminalWrap?.contains(event.target);
  const activeTerminal = getActiveTab()?.terminal;

  if (event.key === 'Tab' && isTerminalEvent) {
    event.preventDefault();
    event.stopPropagation();
    handleTerminalTabCompletion();
    return;
  }

  if (isFormField(event.target)) {
    return;
  }

  if (state.recordingShortcutAction) {
    handleShortcutRecordingKey(event);
    return;
  }

  if (matchesShortcut(event, state.settings.shortcuts.copy)) {
    if (isTerminalEvent && !activeTerminal?.hasSelection?.()) {
      return;
    }
    event.preventDefault();
    copySelectionToClipboard();
  } else if (matchesShortcut(event, state.settings.shortcuts.paste)) {
    event.preventDefault();
    pasteClipboardToTerminal();
  } else if (matchesShortcut(event, state.settings.shortcuts.clear)) {
    event.preventDefault();
    clearActiveTerminal();
  } else if (matchesShortcut(event, state.settings.shortcuts.search)) {
    event.preventDefault();
    openTerminalSearchPlaceholder();
  } else if (event.key === 'Delete' && getSelectedFileEntry()) {
    event.preventDefault();
    deleteSelectedFile();
  }
}

/**
 * 处理鼠标侧键快捷操作。
 */
function handleMouseShortcut(event) {
  if (event.button !== 3 && event.button !== 4) {
    return;
  }

  const action = event.button === 3 ? state.settings.mouseBackAction : state.settings.mouseForwardAction;
  if (action === 'none') {
    return;
  }

  event.preventDefault();
  runMouseAction(action);
}

/**
 * 执行鼠标侧键动作。
 */
function runMouseAction(action) {
  if (action === 'sftpBack') {
    navigateSftpHistory(-1);
  } else if (action === 'sftpForward') {
    navigateSftpHistory(1);
  } else if (action === 'parentPath') {
    openParentPath();
  } else if (action === 'terminalPath') {
    openCurrentTerminalPath();
  } else if (action === 'previousTab') {
    switchTabByOffset(-1);
  } else if (action === 'nextTab') {
    switchTabByOffset(1);
  } else if (action === 'toggleSftp') {
    toggleRightDrawer();
  }
}

/**
 * 按偏移量切换标签。
 */
function switchTabByOffset(offset) {
  if (state.tabs.length === 0) {
    return;
  }

  const currentIndex = Math.max(0, state.tabs.findIndex((tab) => tab.id === state.activeTabId));
  const nextIndex = (currentIndex + offset + state.tabs.length) % state.tabs.length;
  activateTab(state.tabs[nextIndex].id);
}

/**
 * 切换最大化状态并更新按钮样式。
 */
async function toggleMaximizeWindow() {
  const result = await window.nexusSsh.window.maximize();
  updateWindowControlState(result?.maximized === true);
}

/**
 * 更新最大化按钮图形状态。
 */
function updateWindowControlState(maximized) {
  elements.maximizeWindowButton.classList.toggle('is-maximized', maximized === true);
  elements.maximizeWindowButton.title = maximized ? '还原' : '最大化';
}

/**
 * 启动时根据 URL 参数自动打开连接。
 */
async function openStartupProfileIfNeeded() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const profileId = params.get('profileId');
  const shouldConnect = params.get('connect') === '1';
  if (profileId && shouldConnect) {
    await openProfileTab(profileId);
  }
}

/**
 * 启动会话时长计时器。
 */
function startDurationTimer() {
  if (state.durationTimer) {
    return;
  }

  state.durationTimer = setInterval(updateDurationText, 1000);
}

/**
 * 更新活动会话时长文本。
 */
function updateDurationText() {
  const tab = getActiveTab();
  if (!tab?.sessionStartAt) {
    elements.sessionDurationText.textContent = '00:00:00';
    return;
  }

  const seconds = Math.floor((Date.now() - tab.sessionStartAt) / 1000);
  elements.sessionDurationText.textContent = formatDuration(seconds);
}

/**
 * 显示右下角通知。
 */
function showNotice(message, type = 'success') {
  if (!message) {
    return;
  }

  const existing = Array.from(elements.noticeHost.children).find((item) => item.textContent === message);
  if (existing) {
    existing.remove();
  }

  const notice = document.createElement('div');
  notice.className = `notice ${type}`;
  notice.textContent = message;
  elements.noticeHost.appendChild(notice);

  setTimeout(() => {
    notice.remove();
  }, 2400);
}

/**
 * 格式化连接测试结果。
 */
function formatTestResultMessage(result) {
  const status = result.success ? '测试通过' : '测试失败';
  const sftp = result.sftp ? 'SFTP 可用' : 'SFTP 不可用';
  const latency = Number.isFinite(result.latency) ? `${result.latency}ms` : '--';
  return `${status}，延迟 ${latency}，${sftp}。${result.message || ''}`;
}

/**
 * 返回文件图标文本。
 */
function getFileIcon(entry) {
  if (entry.isDirectory) {
    return 'DIR';
  }

  const name = entry.name.toLowerCase();
  if (name.endsWith('.php')) return 'PHP';
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'HTML';
  if (name.endsWith('.md')) return 'MD';
  if (name.endsWith('.log')) return 'LOG';
  if (name.endsWith('.txt')) return 'TXT';
  if (name.endsWith('.json')) return 'JSON';
  if (name.endsWith('.js')) return 'JS';
  if (name.endsWith('.css')) return 'CSS';
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'YML';
  return 'FILE';
}

/**
 * 格式化文件大小。
 */
function formatFileSize(size) {
  const value = Number(size) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let result = value;

  while (result >= 1024 && index < units.length - 1) {
    result /= 1024;
    index += 1;
  }

  return index === 0 ? `${result} ${units[index]}` : `${result.toFixed(1)} ${units[index]}`;
}

/**
 * 格式化文件修改时间。
 */
function formatTime(timestamp) {
  if (!timestamp) {
    return '—';
  }

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

/**
 * 格式化会话时长。
 */
function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

/**
 * 标准化远程路径。
 */
function normalizeRemotePath(remotePath) {
  const value = String(remotePath || '/').trim().replace(/\\/g, '/').replace(/\/+/g, '/');
  const absolute = value.startsWith('/') ? value : `/${value}`;
  const parts = [];

  absolute.split('/').forEach((part) => {
    if (!part || part === '.') {
      return;
    }
    if (part === '..') {
      parts.pop();
      return;
    }
    parts.push(part);
  });

  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

/**
 * 拼接远程路径。
 */
function joinRemotePath(basePath, name) {
  const base = normalizeRemotePath(basePath);
  const normalizedName = String(name || '').replace(/^\/+/, '');
  return base === '/' ? `/${normalizedName}` : `${base.replace(/\/+$/g, '')}/${normalizedName}`;
}

/**
 * 获取远程路径的父级目录。
 */
function getParentRemotePath(remotePath) {
  const normalized = normalizeRemotePath(remotePath);
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

/**
 * 将数字输入限制在指定范围。
 */
function normalizeNumber(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

/**
 * 判断事件目标是否为表单字段。
 */
function isFormField(target) {
  return target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * 返回当前活动标签。
 */
function getActiveTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId) || null;
}

/**
 * 根据标签标识查找标签。
 */
function findTab(tabId) {
  return state.tabs.find((tab) => tab.id === tabId) || null;
}

/**
 * 根据 SSH 会话标识查找标签。
 */
function findTabBySession(sessionId) {
  if (!sessionId) {
    return null;
  }

  return state.tabs.find((tab) => tab.sessionId === sessionId) || null;
}
