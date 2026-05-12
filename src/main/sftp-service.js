const fs = require('node:fs');
const path = require('node:path');

class SftpService {
  /**
   * 初始化 SFTP 服务。
   */
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.previewLimitBytes = 1024 * 1024 * 2;
  }

  /**
   * 列出远程目录内容。
   */
  async listDirectory(sessionId, remotePath) {
    const sftp = await this.ensureSftp(sessionId);
    const normalizedPath = this.normalizeRemotePath(remotePath);
    const entries = await new Promise((resolve, reject) => {
      sftp.readdir(normalizedPath, (error, list) => {
        if (error) {
          reject(this.normalizeSftpError(error, normalizedPath));
          return;
        }
        resolve(list || []);
      });
    });

    return entries
      .filter((entry) => entry.filename !== '.' && entry.filename !== '..')
      .map((entry) => this.mapDirectoryEntry(normalizedPath, entry))
      .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
  }

  /**
   * 上传多个本地文件到远程目录。
   */
  async uploadFiles(sessionId, localPaths, remoteDirectory) {
    const sftp = await this.ensureSftp(sessionId);
    const normalizedDirectory = this.normalizeRemotePath(remoteDirectory);
    const uploaded = [];

    for (const localPath of localPaths) {
      const remotePath = this.joinRemotePath(normalizedDirectory, path.basename(localPath));
      await this.uploadLocalEntry(sftp, localPath, remotePath, uploaded);
    }

    return { uploaded };
  }

  /**
   * 下载远程文件到本地路径。
   */
  async downloadFile(sessionId, remotePath, localPath) {
    const sftp = await this.ensureSftp(sessionId);
    const normalizedRemotePath = this.normalizeRemotePath(remotePath);

    await new Promise((resolve, reject) => {
      sftp.fastGet(normalizedRemotePath, localPath, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    return { remotePath: normalizedRemotePath, localPath };
  }

  /**
   * 下载远程文件或目录到本地路径。
   */
  async downloadEntry(sessionId, remotePath, localPath) {
    const sftp = await this.ensureSftp(sessionId);
    const normalizedRemotePath = this.normalizeRemotePath(remotePath);
    const attrs = await this.statRemoteAttrs(sftp, normalizedRemotePath);

    if (this.isDirectoryAttrs(attrs)) {
      fs.mkdirSync(localPath, { recursive: true });
      await this.downloadRemoteDirectory(sftp, normalizedRemotePath, localPath);
      return { remotePath: normalizedRemotePath, localPath, isDirectory: true };
    }

    await this.downloadRemoteFile(sftp, normalizedRemotePath, localPath);
    return { remotePath: normalizedRemotePath, localPath, isDirectory: false };
  }

  /**
   * 批量下载远程文件或目录到同一个本地目录。
   */
  async downloadEntries(sessionId, remotePaths, localDirectory) {
    const downloaded = [];
    for (const remotePath of remotePaths || []) {
      const normalizedRemotePath = this.normalizeRemotePath(remotePath);
      const localPath = path.join(localDirectory, path.posix.basename(normalizedRemotePath));
      downloaded.push(await this.downloadEntry(sessionId, normalizedRemotePath, localPath));
    }
    return { downloaded };
  }

  async uploadLocalEntry(sftp, localPath, remotePath, uploaded) {
    const stat = fs.statSync(localPath);
    if (stat.isDirectory()) {
      await this.ensureRemoteDirectory(sftp, remotePath);
      const children = fs.readdirSync(localPath);
      for (const child of children) {
        await this.uploadLocalEntry(
          sftp,
          path.join(localPath, child),
          this.joinRemotePath(remotePath, child),
          uploaded
        );
      }
      return;
    }

    await new Promise((resolve, reject) => {
      sftp.fastPut(localPath, remotePath, (error) => {
        if (error) {
          reject(this.normalizeSftpError(error, remotePath));
          return;
        }
        resolve();
      });
    });
    uploaded.push({ localPath, remotePath });
  }

  async ensureRemoteDirectory(sftp, remotePath) {
    await new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (error) => {
        if (!error) {
          resolve();
          return;
        }
        this.statRemoteAttrs(sftp, remotePath)
          .then((attrs) => {
            if (this.isDirectoryAttrs(attrs)) {
              resolve();
              return;
            }
            reject(this.normalizeSftpError(error, remotePath));
          })
          .catch(() => reject(this.normalizeSftpError(error, remotePath)));
      });
    });
  }

  async downloadRemoteFile(sftp, remotePath, localPath) {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    await new Promise((resolve, reject) => {
      sftp.fastGet(remotePath, localPath, (error) => {
        if (error) {
          reject(this.normalizeSftpError(error, remotePath));
          return;
        }
        resolve();
      });
    });
  }

  async downloadRemoteDirectory(sftp, remotePath, localDirectory) {
    fs.mkdirSync(localDirectory, { recursive: true });
    const entries = await new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (error, list) => {
        if (error) {
          reject(this.normalizeSftpError(error, remotePath));
          return;
        }
        resolve(list || []);
      });
    });

    for (const entry of entries) {
      if (entry.filename === '.' || entry.filename === '..') {
        continue;
      }
      const childRemotePath = this.joinRemotePath(remotePath, entry.filename);
      const childLocalPath = path.join(localDirectory, entry.filename);
      const attrs = entry.attrs || await this.statRemoteAttrs(sftp, childRemotePath);
      if (this.isDirectoryAttrs(attrs)) {
        await this.downloadRemoteDirectory(sftp, childRemotePath, childLocalPath);
      } else {
        await this.downloadRemoteFile(sftp, childRemotePath, childLocalPath);
      }
    }
  }

  async statRemoteAttrs(sftp, remotePath) {
    return new Promise((resolve, reject) => {
      sftp.stat(remotePath, (error, result) => {
        if (error) {
          reject(this.normalizeSftpError(error, remotePath));
          return;
        }
        resolve(result || {});
      });
    });
  }

  isDirectoryAttrs(attrs) {
    return typeof attrs?.isDirectory === 'function' ? attrs.isDirectory() : false;
  }

  /**
   * 读取远程文本文件用于预览和编辑。
   */
  async readTextFile(sessionId, remotePath, options = {}) {
    const sftp = await this.ensureSftp(sessionId);
    const normalizedPath = this.normalizeRemotePath(remotePath);
    const stat = await this.statEntry(sessionId, normalizedPath);
    const maxBytes = Math.min(Math.max(Number(options.maxBytes) || this.previewLimitBytes, 1024), 1024 * 1024 * 5);

    if (stat.isDirectory) {
      throw new Error('目录不能作为文件预览');
    }

    if (stat.size > maxBytes) {
      return {
        path: normalizedPath,
        content: '',
        editable: false,
        binary: false,
        truncated: true,
        size: stat.size,
        modifiedAt: stat.modifiedAt,
        permissions: stat.permissions,
        message: `文件大小超过 ${this.formatBytes(maxBytes)}，为避免卡顿未自动读取。`
      };
    }

    const buffer = await this.readRemoteBuffer(sftp, normalizedPath);
    const binary = this.isBinaryBuffer(buffer);

    if (binary) {
      return {
        path: normalizedPath,
        content: '',
        editable: false,
        binary: true,
        truncated: false,
        size: stat.size,
        modifiedAt: stat.modifiedAt,
        permissions: stat.permissions,
        message: '文件疑似二进制内容，已禁用文本编辑。'
      };
    }

    return {
      path: normalizedPath,
      content: buffer.toString('utf8'),
      editable: true,
      binary: false,
      truncated: false,
      size: stat.size,
      modifiedAt: stat.modifiedAt,
      permissions: stat.permissions,
      message: '文件已读取'
    };
  }

  /**
   * 将文本内容写回远程文件。
   */
  async writeTextFile(sessionId, remotePath, content) {
    const sftp = await this.ensureSftp(sessionId);
    const normalizedPath = this.normalizeRemotePath(remotePath);
    const buffer = Buffer.from(String(content ?? ''), 'utf8');

    await this.writeRemoteBuffer(sftp, normalizedPath, buffer);
    const stat = await this.statEntry(sessionId, normalizedPath);
    return {
      path: normalizedPath,
      size: stat.size,
      modifiedAt: stat.modifiedAt,
      permissions: stat.permissions
    };
  }

  /**
   * 创建空白远程文本文件。
   */
  async createFile(sessionId, remotePath) {
    const normalizedPath = this.normalizeRemotePath(remotePath);
    await this.writeTextFile(sessionId, normalizedPath, '');
    return { remotePath: normalizedPath };
  }

  /**
   * 在远程主机创建目录。
   */
  async makeDirectory(sessionId, remotePath) {
    const sftp = await this.ensureSftp(sessionId);
    const normalizedPath = this.normalizeRemotePath(remotePath);

    await new Promise((resolve, reject) => {
      sftp.mkdir(normalizedPath, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    return { remotePath: normalizedPath };
  }

  /**
   * 重命名远程文件或目录。
   */
  async renameEntry(sessionId, oldPath, newPath) {
    const sftp = await this.ensureSftp(sessionId);
    const normalizedOldPath = this.normalizeRemotePath(oldPath);
    const normalizedNewPath = this.normalizeRemotePath(newPath);

    await new Promise((resolve, reject) => {
      sftp.rename(normalizedOldPath, normalizedNewPath, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    return { oldPath: normalizedOldPath, newPath: normalizedNewPath };
  }

  /**
   * 修改远程文件或目录权限。
   */
  async changeMode(sessionId, remotePath, mode) {
    const sftp = await this.ensureSftp(sessionId);
    const normalizedPath = this.normalizeRemotePath(remotePath);
    const numericMode = this.parseMode(mode);

    await new Promise((resolve, reject) => {
      sftp.chmod(normalizedPath, numericMode, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    return { remotePath: normalizedPath, permissions: numericMode.toString(8).padStart(3, '0') };
  }

  /**
   * 删除远程文件或空目录。
   */
  async deleteEntry(sessionId, remotePath, isDirectory) {
    const sftp = await this.ensureSftp(sessionId);
    const normalizedPath = this.normalizeRemotePath(remotePath);
    const operation = isDirectory ? 'rmdir' : 'unlink';

    await new Promise((resolve, reject) => {
      sftp[operation](normalizedPath, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    return { remotePath: normalizedPath, deleted: true };
  }

  /**
   * 获取远程文件或目录状态。
   */
  async statEntry(sessionId, remotePath) {
    const sftp = await this.ensureSftp(sessionId);
    const normalizedPath = this.normalizeRemotePath(remotePath);
    const attrs = await new Promise((resolve, reject) => {
      sftp.stat(normalizedPath, (error, result) => {
        if (error) {
          reject(this.normalizeSftpError(error, normalizedPath));
          return;
        }
        resolve(result || {});
      });
    });

    const isDirectory = typeof attrs.isDirectory === 'function' ? attrs.isDirectory() : false;
    const isFile = typeof attrs.isFile === 'function' ? attrs.isFile() : !isDirectory;
    const mode = attrs.mode ? attrs.mode & 0o777 : 0;

    return {
      path: normalizedPath,
      name: path.posix.basename(normalizedPath),
      isDirectory,
      isFile,
      size: attrs.size || 0,
      modifiedAt: attrs.mtime ? attrs.mtime * 1000 : null,
      permissions: mode ? mode.toString(8).padStart(3, '0') : ''
    };
  }

  /**
   * 获取或创建指定会话的 SFTP 通道。
   */
  async ensureSftp(sessionId) {
    const session = this.sessionManager.getSession(sessionId);

    if (session.sftp) {
      return session.sftp;
    }

    session.sftp = await new Promise((resolve, reject) => {
      session.conn.sftp((error, sftp) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(sftp);
      });
    });

    this.bindSftpLifecycle(session, session.sftp);
    return session.sftp;
  }

  /**
   * SFTP 通道关闭后清除缓存，下一次文件操作会重新创建通道。
   */
  bindSftpLifecycle(session, sftp) {
    if (!sftp || sftp.__nexusLifecycleBound) {
      return;
    }

    sftp.__nexusLifecycleBound = true;
    const clear = () => {
      if (session.sftp === sftp) {
        session.sftp = null;
      }
    };

    sftp.once?.('close', clear);
    sftp.once?.('end', clear);
    sftp.on?.('error', clear);
  }

  /**
   * 将 ssh2 目录项转换为界面数据。
   */
  mapDirectoryEntry(remoteDirectory, entry) {
    const attrs = entry.attrs || {};
    const isDirectory = typeof attrs.isDirectory === 'function' ? attrs.isDirectory() : false;
    const isFile = typeof attrs.isFile === 'function' ? attrs.isFile() : !isDirectory;
    const mode = attrs.mode ? attrs.mode & 0o777 : 0;

    return {
      name: entry.filename,
      path: this.joinRemotePath(remoteDirectory, entry.filename),
      isDirectory,
      isFile,
      size: attrs.size || 0,
      modifiedAt: attrs.mtime ? attrs.mtime * 1000 : null,
      permissions: mode ? mode.toString(8).padStart(3, '0') : ''
    };
  }

  /**
   * 从远程文件读取 Buffer。
   */
  async readRemoteBuffer(sftp, remotePath) {
    if (typeof sftp.readFile === 'function') {
      return new Promise((resolve, reject) => {
        sftp.readFile(remotePath, (error, data) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(Buffer.isBuffer(data) ? data : Buffer.from(data || ''));
        });
      });
    }

    return new Promise((resolve, reject) => {
      const chunks = [];
      const stream = sftp.createReadStream(remotePath);
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  /**
   * 将 Buffer 写入远程文件。
   */
  async writeRemoteBuffer(sftp, remotePath, buffer) {
    if (typeof sftp.writeFile === 'function') {
      await new Promise((resolve, reject) => {
        sftp.writeFile(remotePath, buffer, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      return;
    }

    await new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(remotePath, { flags: 'w' });
      stream.on('error', reject);
      stream.on('close', resolve);
      stream.end(buffer);
    });
  }

  /**
   * 判断 Buffer 是否疑似二进制内容。
   */
  isBinaryBuffer(buffer) {
    const limit = Math.min(buffer.length, 4096);

    for (let index = 0; index < limit; index += 1) {
      const value = buffer[index];
      if (value === 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * 将底层 SFTP 异常转换为用户可理解的错误。
   */
  normalizeSftpError(error, remotePath) {
    const code = error && (error.code || error.errno);
    if (code === 2 || /no such file/i.test(String(error?.message || ''))) {
      const next = new Error(`远程路径不存在：${remotePath}`);
      next.code = 'NO_SUCH_REMOTE_PATH';
      return next;
    }

    if (code === 3 || /permission denied/i.test(String(error?.message || ''))) {
      const next = new Error(`没有权限访问远程路径：${remotePath}`);
      next.code = 'PERMISSION_DENIED';
      return next;
    }

    return error instanceof Error ? error : new Error(String(error || 'SFTP 操作失败'));
  }

  /**
   * 标准化远程路径。
   */
  normalizeRemotePath(remotePath) {
    const value = typeof remotePath === 'string' && remotePath.trim() ? remotePath.trim() : '/';
    const normalized = value.replace(/\\/g, '/').replace(/\/+/g, '/');

    if (!normalized.startsWith('/')) {
      return `/${normalized}`;
    }

    return normalized;
  }

  /**
   * 拼接远程 POSIX 路径。
   */
  joinRemotePath(basePath, name) {
    const base = this.normalizeRemotePath(basePath);
    const normalizedName = String(name || '').replace(/^\/+/g, '');

    if (base === '/') {
      return `/${normalizedName}`;
    }

    return `${base.replace(/\/+$/g, '')}/${normalizedName}`;
  }

  /**
   * 解析权限字符串。
   */
  parseMode(mode) {
    const value = String(mode || '').trim();

    if (!/^[0-7]{3,4}$/.test(value)) {
      throw new Error('权限格式应为 644、755 或 0755');
    }

    return Number.parseInt(value, 8);
  }

  /**
   * 格式化字节数量。
   */
  formatBytes(size) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(size) || 0;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }
}

module.exports = { SftpService };
