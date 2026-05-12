const fs = require('node:fs');
const path = require('node:path');
const { safeStorage } = require('electron');
const { v4: uuidv4 } = require('uuid');

class ProfileStore {
  /**
   * 初始化连接配置仓库并解析当前保存位置。
   */
  constructor(app) {
    this.app = app;
    this.userDataDirectory = app.getPath('userData');
    this.defaultStoreDirectory = path.join(this.userDataDirectory, 'profiles');
    this.locationFile = path.join(this.userDataDirectory, 'profile-store-location.json');
    this.storeDirectory = this.resolveStoreDirectory();
    this.storeFile = path.join(this.storeDirectory, 'profiles.json');
    this.ensureStoreFile();
  }

  /**
   * 返回当前连接配置保存位置信息。
   */
  getStoreInfo() {
    return {
      defaultDirectory: this.defaultStoreDirectory,
      currentDirectory: this.storeDirectory,
      storeFile: this.storeFile
    };
  }

  /**
   * 切换连接配置保存目录并复制当前配置到新目录。
   */
  setStoreDirectory(directoryPath) {
    const nextDirectory = this.normalizeDirectoryPath(directoryPath);
    if (!nextDirectory) {
      throw new Error('保存位置不能为空');
    }

    const nextFile = path.join(nextDirectory, 'profiles.json');
    const currentStore = this.readStore();
    fs.mkdirSync(nextDirectory, { recursive: true });

    if (fs.existsSync(nextFile) && path.resolve(nextFile) !== path.resolve(this.storeFile)) {
      const backupFile = path.join(nextDirectory, `profiles.backup.${Date.now()}.json`);
      fs.copyFileSync(nextFile, backupFile);
    }

    fs.writeFileSync(nextFile, JSON.stringify({ version: 4, profiles: currentStore.profiles || [] }, null, 2), 'utf8');
    this.storeDirectory = nextDirectory;
    this.storeFile = nextFile;
    this.writeLocationConfig(nextDirectory);
    this.ensureStoreFile();
    return this.getStoreInfo();
  }

  /**
   * 返回经过脱敏处理的连接配置列表。
   */
  listProfiles() {
    const store = this.readStore();
    return store.profiles.map((profile) => this.sanitizeProfile(profile));
  }

  /**
   * 返回指定连接中已保存的敏感字段。
   */
  getProfileSecrets(profileId) {
    const store = this.readStore();
    const profile = store.profiles.find((item) => item.id === profileId);

    if (!profile) {
      throw new Error('连接配置不存在');
    }

    return {
      password: this.decryptSecret(profile.passwordSecret) || '',
      passphrase: this.decryptSecret(profile.passphraseSecret) || ''
    };
  }

  /**
   * 根据连接标识返回用于建立 SSH 会话的完整配置。
   */
  getProfileForConnect(profileId) {
    const store = this.readStore();
    const profile = store.profiles.find((item) => item.id === profileId);

    if (!profile) {
      throw new Error('连接配置不存在');
    }

    return this.buildConnectionProfile(profile, {});
  }

  /**
   * 根据表单输入构建用于连接测试的完整配置。
   */
  getProfileForTest(input) {
    const store = this.readStore();
    const existing = input?.id ? store.profiles.find((item) => item.id === input.id) : null;
    const source = {
      ...(existing || {}),
      ...(input || {})
    };

    return this.buildConnectionProfile(source, existing || {});
  }

  /**
   * 新增或更新连接配置。
   */
  saveProfile(input) {
    this.validateProfileInput(input);

    const store = this.readStore();
    const existingIndex = store.profiles.findIndex((item) => item.id === input.id);
    const existing = existingIndex >= 0 ? store.profiles[existingIndex] : null;
    const profile = this.buildProfileRecord(input, existing);

    if (existingIndex >= 0) {
      store.profiles[existingIndex] = profile;
    } else {
      store.profiles.push(profile);
    }

    this.writeStore(store);
    return this.sanitizeProfile(profile);
  }

  /**
   * 删除指定连接配置。
   */
  removeProfile(profileId) {
    const store = this.readStore();
    const nextProfiles = store.profiles.filter((profile) => profile.id !== profileId);
    const removed = nextProfiles.length !== store.profiles.length;

    store.profiles = nextProfiles;
    this.writeStore(store);
    return { removed };
  }

  /**
   * 标记指定连接的最近连接时间。
   */
  markConnected(profileId) {
    const store = this.readStore();
    const profile = store.profiles.find((item) => item.id === profileId);

    if (!profile) {
      return null;
    }

    profile.lastConnectedAt = new Date().toISOString();
    profile.updatedAt = profile.updatedAt || profile.lastConnectedAt;
    this.writeStore(store);
    return this.sanitizeProfile(profile);
  }

  /**
   * 导出连接配置为 JSON 文本。
   */
  exportProfiles(options = {}) {
    const includeSecrets = options.includeSecrets === true;
    const selectedIds = Array.isArray(options.profileIds) ? new Set(options.profileIds.filter(Boolean)) : null;
    const store = this.readStore();
    const sourceProfiles = selectedIds ? store.profiles.filter((profile) => selectedIds.has(profile.id)) : store.profiles;
    const profiles = sourceProfiles.map((profile) => this.buildExportProfile(profile, includeSecrets));

    return JSON.stringify({
      version: 4,
      exportedAt: new Date().toISOString(),
      includeSecrets,
      profiles
    }, null, 2);
  }

  /**
   * 从 JSON 文本导入连接配置。
   */
  importProfiles(jsonPayload) {
    const payload = JSON.parse(jsonPayload);

    if (!payload || !Array.isArray(payload.profiles)) {
      throw new Error('导入文件格式不正确');
    }

    const store = this.readStore();
    const importedProfiles = payload.profiles.map((profile) => this.buildImportedRecord(profile, store));

    store.profiles.push(...importedProfiles);
    this.writeStore(store);

    return {
      imported: importedProfiles.length,
      profiles: store.profiles.map((profile) => this.sanitizeProfile(profile))
    };
  }

  /**
   * 解析当前配置保存目录。
   */
  resolveStoreDirectory() {
    try {
      if (!fs.existsSync(this.locationFile)) {
        return this.defaultStoreDirectory;
      }

      const parsed = JSON.parse(fs.readFileSync(this.locationFile, 'utf8'));
      const directory = this.normalizeDirectoryPath(parsed.storeDirectory);
      return directory || this.defaultStoreDirectory;
    } catch (error) {
      return this.defaultStoreDirectory;
    }
  }

  /**
   * 写入配置保存目录索引文件。
   */
  writeLocationConfig(directoryPath) {
    fs.mkdirSync(this.userDataDirectory, { recursive: true });
    fs.writeFileSync(this.locationFile, JSON.stringify({ storeDirectory: directoryPath }, null, 2), 'utf8');
  }

  /**
   * 确保配置目录和配置文件存在。
   */
  ensureStoreFile() {
    if (!fs.existsSync(this.storeDirectory)) {
      fs.mkdirSync(this.storeDirectory, { recursive: true });
    }

    if (!fs.existsSync(this.storeFile)) {
      this.writeStore({ version: 4, profiles: [] });
    }
  }

  /**
   * 读取本地配置文件。
   */
  readStore() {
    try {
      const raw = fs.readFileSync(this.storeFile, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        version: parsed.version || 4,
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : []
      };
    } catch (error) {
      return { version: 4, profiles: [] };
    }
  }

  /**
   * 写入本地配置文件。
   */
  writeStore(store) {
    fs.mkdirSync(this.storeDirectory, { recursive: true });
    fs.writeFileSync(this.storeFile, JSON.stringify({ version: 4, profiles: store.profiles || [] }, null, 2), 'utf8');
  }

  /**
   * 根据表单输入和已有配置构建持久化记录。
   */
  buildProfileRecord(input, existing) {
    const now = new Date().toISOString();
    const profileId = existing?.id || input.id || uuidv4();
    const authType = input.authType === 'key' ? 'key' : 'password';
    const hasRemarkInput = Object.prototype.hasOwnProperty.call(input, 'remark');

    return {
      id: profileId,
      name: this.normalizeString(input.name) || this.buildProfileName(input),
      host: this.normalizeString(input.host),
      port: this.normalizePort(input.port),
      username: this.normalizeString(input.username),
      authType,
      privateKeyPath: this.normalizeString(input.privateKeyPath),
      remoteStartPath: this.normalizeRemotePath(input.remoteStartPath || '/'),
      terminalStartupCommand: this.normalizeString(input.terminalStartupCommand),
      pathSync: input.pathSync === true,
      group: this.normalizeString(input.group) || existing?.group || '默认',
      favorite: false,
      color: this.normalizeProfileColor(input.color || existing?.color),
      remark: hasRemarkInput ? this.normalizeString(input.remark) : (existing?.remark || ''),
      tags: this.normalizeTags(input.tags, existing?.tags),
      timeoutSeconds: this.normalizeTimeout(input.timeoutSeconds || existing?.timeoutSeconds || 20),
      keepaliveSeconds: this.normalizeTimeout(input.keepaliveSeconds || existing?.keepaliveSeconds || 15),
      passwordSecret: this.resolveSecret(input.password, existing?.passwordSecret, input.clearPassword),
      passphraseSecret: this.resolveSecret(input.passphrase, existing?.passphraseSecret, input.clearPassphrase),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastConnectedAt: existing?.lastConnectedAt || null
    };
  }

  /**
   * 将持久化记录和临时输入转换为可连接配置。
   */
  buildConnectionProfile(source, existing) {
    const authType = source.authType === 'key' ? 'key' : 'password';
    const password = this.resolveConnectionSecret(source.password, existing.passwordSecret || source.passwordSecret);
    const passphrase = this.resolveConnectionSecret(source.passphrase, existing.passphraseSecret || source.passphraseSecret);

    const profile = {
      id: source.id || '',
      name: this.normalizeString(source.name) || this.buildProfileName(source),
      host: this.normalizeString(source.host),
      port: this.normalizePort(source.port),
      username: this.normalizeString(source.username),
      authType,
      privateKeyPath: this.normalizeString(source.privateKeyPath),
      remoteStartPath: this.normalizeRemotePath(source.remoteStartPath || '/'),
      terminalStartupCommand: this.normalizeString(source.terminalStartupCommand),
      pathSync: source.pathSync === true,
      timeoutSeconds: this.normalizeTimeout(source.timeoutSeconds || 20),
      keepaliveSeconds: this.normalizeTimeout(source.keepaliveSeconds || 15),
      password,
      passphrase
    };

    this.validateProfileInput(profile);
    return profile;
  }

  /**
   * 将导入的配置转换为本地持久化记录。
   */
  buildImportedRecord(profile, store) {
    const existingIds = new Set(store.profiles.map((item) => item.id));
    const importedId = profile.id && !existingIds.has(profile.id) ? profile.id : uuidv4();

    return this.buildProfileRecord({
      ...profile,
      id: importedId,
      name: profile.name ? `${profile.name}` : undefined,
      password: profile.password,
      passphrase: profile.passphrase,
      pathSync: profile.pathSync === true,
      group: profile.group || '导入'
    }, null);
  }

  /**
   * 构建导出时使用的连接配置对象。
   */
  buildExportProfile(profile, includeSecrets) {
    const exported = {
      id: profile.id,
      name: profile.name,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      authType: profile.authType,
      privateKeyPath: profile.privateKeyPath,
      remoteStartPath: profile.remoteStartPath,
      terminalStartupCommand: profile.terminalStartupCommand || '',
      pathSync: profile.pathSync === true,
      group: profile.group || '默认',
      color: this.normalizeProfileColor(profile.color),
      remark: this.normalizeString(profile.remark) || (Array.isArray(profile.tags) ? profile.tags.join(', ') : ''),
      tags: profile.tags || [],
      timeoutSeconds: profile.timeoutSeconds || 20,
      keepaliveSeconds: profile.keepaliveSeconds || 15,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      lastConnectedAt: profile.lastConnectedAt || null
    };

    if (includeSecrets) {
      exported.password = this.decryptSecret(profile.passwordSecret);
      exported.passphrase = this.decryptSecret(profile.passphraseSecret);
    }

    return exported;
  }

  /**
   * 对连接配置进行脱敏处理。
   */
  sanitizeProfile(profile) {
    return {
      id: profile.id,
      name: profile.name,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      authType: profile.authType,
      privateKeyPath: profile.privateKeyPath,
      remoteStartPath: profile.remoteStartPath,
      terminalStartupCommand: profile.terminalStartupCommand || '',
      pathSync: profile.pathSync === true,
      group: profile.group || '默认',
      color: this.normalizeProfileColor(profile.color),
      remark: this.normalizeString(profile.remark) || (Array.isArray(profile.tags) ? profile.tags.join(', ') : ''),
      tags: profile.tags || [],
      timeoutSeconds: profile.timeoutSeconds || 20,
      keepaliveSeconds: profile.keepaliveSeconds || 15,
      hasPassword: Boolean(profile.passwordSecret),
      hasPassphrase: Boolean(profile.passphraseSecret),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      lastConnectedAt: profile.lastConnectedAt || null
    };
  }

  /**
   * 校验连接配置的必要字段。
   */
  validateProfileInput(input) {
    if (!this.normalizeString(input?.host)) {
      throw new Error('主机不能为空');
    }

    if (!this.normalizeString(input?.username)) {
      throw new Error('用户名不能为空');
    }

    const port = Number.parseInt(input?.port, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('端口必须在 1 到 65535 之间');
    }

    if (input?.authType === 'key' && !this.normalizeString(input.privateKeyPath)) {
      throw new Error('私钥认证需要提供私钥路径');
    }
  }

  /**
   * 根据输入值决定是否更新密文。
   */
  resolveSecret(value, existingSecret, shouldClear) {
    if (shouldClear) {
      return null;
    }

    if (typeof value !== 'string' || value.length === 0) {
      return existingSecret || null;
    }

    return this.encryptSecret(value);
  }

  /**
   * 根据临时输入和已有密文解析连接密钥。
   */
  resolveConnectionSecret(value, existingSecret) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    return this.decryptSecret(existingSecret);
  }

  /**
   * 使用系统安全存储能力加密敏感文本。
   */
  encryptSecret(value) {
    if (!value) {
      return null;
    }

    if (safeStorage.isEncryptionAvailable()) {
      return {
        kind: 'safeStorage',
        value: safeStorage.encryptString(value).toString('base64')
      };
    }

    return {
      kind: 'plainTextFallback',
      value
    };
  }

  /**
   * 解密敏感文本。
   */
  decryptSecret(secret) {
    if (!secret || !secret.value) {
      return undefined;
    }

    try {
      if (secret.kind === 'safeStorage') {
        return safeStorage.decryptString(Buffer.from(secret.value, 'base64'));
      }

      return secret.value;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * 生成默认连接名称。
   */
  buildProfileName(input) {
    const username = this.normalizeString(input.username) || 'user';
    const host = this.normalizeString(input.host) || 'host';
    return `${username}@${host}`;
  }

  /**
   * 标准化字符串字段。
   */
  normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  /**
   * 标准化目录路径。
   */
  normalizeDirectoryPath(value) {
    const normalized = this.normalizeString(value);
    return normalized ? path.resolve(normalized) : '';
  }

  /**
   * 标准化端口字段。
   */
  normalizePort(value) {
    const port = Number.parseInt(value, 10);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 22;
  }

  /**
   * 标准化远程路径字段。
   */
  normalizeRemotePath(value) {
    const normalized = this.normalizeString(value).replace(/\\/g, '/').replace(/\/+/g, '/');

    if (!normalized) {
      return '/';
    }

    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }

  /**
   * 标准化超时秒数字段。
   */
  normalizeTimeout(value) {
    const seconds = Number.parseInt(value, 10);
    return Number.isInteger(seconds) && seconds > 0 && seconds <= 300 ? seconds : 20;
  }

  /**
   * 标准化标签字段。
   */
  normalizeTags(value, fallback = []) {
    if (Array.isArray(value)) {
      return value.map((tag) => this.normalizeString(tag)).filter(Boolean);
    }

    if (typeof value === 'string') {
      return value.split(',').map((tag) => this.normalizeString(tag)).filter(Boolean);
    }

    return Array.isArray(fallback) ? fallback : [];
  }

  /**
   * 标准化连接级别颜色。
   */
  normalizeProfileColor(value) {
    const color = this.normalizeString(value);
    return ['default', 'gray', 'green', 'red', 'blue', 'amber', 'purple', 'cyan', 'orange', 'lime', 'pink'].includes(color)
      ? color
      : 'default';
  }
}

module.exports = { ProfileStore };
