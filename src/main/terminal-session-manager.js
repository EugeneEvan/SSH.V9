const fs = require('node:fs');
const { Client } = require('ssh2');
const { v4: uuidv4 } = require('uuid');


class TerminalSessionManager {
  /**
   * 初始化 SSH 终端会话管理器。
   */
  constructor() {
    this.sessions = new Map();
  }

  /**
   * 创建 SSH 连接并打开交互式终端。
   */
  createSession(profile, webContents) {
    const sessionId = uuidv4();
    const conn = new Client();
    const session = {
      id: sessionId,
      conn,
      stream: null,
      sftp: null,
      profile,
      webContents,
      currentPath: profile.remoteStartPath || '/',
      startedAt: Date.now(),
      pathSync: profile.pathSync === true,
      pathSyncHookInstalled: false,
      pathSyncHookInstalling: false,
      pathSyncHookBuffer: '',
      pathSyncHookTimer: null,
      settled: false
    };

    this.sessions.set(sessionId, session);

    return new Promise((resolve, reject) => {
      conn.on('ready', () => {
        this.sendStatus(session, 'connected', 'SSH 已连接');
        this.openShell(session, resolve, reject);
      });

      conn.on('error', (error) => {
        this.sendStatus(session, 'error', error.message);
        if (!session.settled) {
          session.settled = true;
          this.clearPathSyncHookState(session);
          this.sessions.delete(sessionId);
          reject(error);
        }
      });

      conn.on('close', () => {
        this.sendStatus(session, 'closed', 'SSH 已断开');
        this.clearPathSyncHookState(session);
        this.sessions.delete(sessionId);
      });

      try {
        this.sendStatus(session, 'connecting', '正在建立 SSH 连接');
        conn.connect(this.buildConnectionConfig(profile));
      } catch (error) {
        this.clearPathSyncHookState(session);
        this.sessions.delete(sessionId);
        reject(error);
      }
    });
  }

  /**
   * 测试 SSH 和 SFTP 连接可用性。
   */
  testConnection(profile) {
    const startedAt = Date.now();
    const conn = new Client();
    const timeoutMilliseconds = Math.max(5, Number(profile.timeoutSeconds) || 20) * 1000;

    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        finish({
          success: false,
          latency: Date.now() - startedAt,
          sftp: false,
          message: '连接测试超时'
        });
      }, timeoutMilliseconds + 2000);

      const finish = (result) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        try {
          conn.end();
        } catch (error) {
          // 忽略测试连接关闭时的底层异常。
        }
        resolve(result);
      };

      conn.on('ready', () => {
        const latency = Date.now() - startedAt;
        conn.sftp((error, sftp) => {
          if (sftp && typeof sftp.end === 'function') {
            sftp.end();
          }

          finish({
            success: true,
            latency,
            sftp: !error,
            message: error ? `SSH 可用，SFTP 不可用：${error.message}` : 'SSH 与 SFTP 均可用'
          });
        });
      });

      conn.on('error', (error) => {
        finish({
          success: false,
          latency: Date.now() - startedAt,
          sftp: false,
          message: error.message
        });
      });

      try {
        conn.connect(this.buildConnectionConfig(profile));
      } catch (error) {
        finish({
          success: false,
          latency: Date.now() - startedAt,
          sftp: false,
          message: error.message
        });
      }
    });
  }

  /**
   * 返回指定 SSH 会话。
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error('SSH 会话不存在或已断开');
    }

    return session;
  }

  /**
   * 向交互式终端写入文本。
   */
  write(sessionId, data) {
    const session = this.getSession(sessionId);

    if (session.stream) {
      session.stream.write(data);
    }
  }

  /**
   * 执行命令并在末尾追加换行。
   */
  sendCommand(sessionId, command) {
    const normalized = typeof command === 'string' ? command.trim() : '';

    if (!normalized) {
      return;
    }

    this.write(sessionId, `${normalized}\n`);
  }

  /**
   * 调整远程伪终端尺寸。
   */
  resize(sessionId, cols, rows) {
    const session = this.getSession(sessionId);

    if (session.stream && typeof session.stream.setWindow === 'function') {
      session.stream.setWindow(rows, cols, rows * 16, cols * 8);
    }
  }

  /**
   * 开启或关闭路径同步。
   */
  setPathSync(sessionId, enabled) {
    const session = this.getSession(sessionId);
    session.pathSync = enabled === true;
    if (session.pathSync) {
      this.installPathSyncHook(session);
    }
    return { enabled: session.pathSync };
  }

  /**
   * 读取当前服务器的基础运行状态。
   */
  getServerStatus(sessionId) {
    const session = this.getSession(sessionId);
    const command = `
printf 'LOAD='; cat /proc/loadavg 2>/dev/null | awk '{print $1" "$2" "$3}';
printf 'MEM='; free -m 2>/dev/null | awk '/Mem:/ {print $2" "$3" "$4" "$7}';
printf 'DISK='; df -P -h / 2>/dev/null | awk 'NR==2 {print $2" "$3" "$4" "$5}';
printf 'CPU='; top -bn1 2>/dev/null | awk '/Cpu\(s\)|%Cpu/ {for (i=1;i<=NF;i++) if ($i ~ /^id/) {print 100-$(i-1); exit}}';
printf 'PROC='; ps -eo comm,%cpu,%mem --sort=-%cpu 2>/dev/null | head -n 6 | tail -n 5 | tr '\n' ';'; printf '\n';
`;

    return this.execCommand(session, command, 7000).then((output) => this.parseServerStatus(output));
  }

  /**
   * 通过当前 SSH 连接执行一次性命令并返回输出。
   */
  execCommand(session, command, timeoutMilliseconds) {
    return new Promise((resolve, reject) => {
      let output = '';
      let settled = false;
      const timer = setTimeout(() => {
        finish(new Error('读取服务器状态超时'));
      }, timeoutMilliseconds);

      const finish = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (error) {
          reject(error);
        } else {
          resolve(output);
        }
      };

      session.conn.exec(command, (error, stream) => {
        if (error) {
          finish(error);
          return;
        }

        stream.on('data', (chunk) => {
          output += chunk.toString('utf8');
        });
        stream.stderr?.on('data', (chunk) => {
          output += chunk.toString('utf8');
        });
        stream.on('close', () => finish());
        stream.on('error', finish);
      });
    });
  }

  /**
   * 将服务器状态命令输出转换为结构化数据。
   */
  parseServerStatus(output) {
    const lines = String(output || '').split(/\r?\n/);
    const data = {};

    lines.forEach((line) => {
      const index = line.indexOf('=');
      if (index > 0) {
        data[line.slice(0, index)] = line.slice(index + 1).trim();
      }
    });

    const [memTotal, memUsed, memFree, memAvailable] = String(data.MEM || '').split(/\s+/).map((value) => Number.parseFloat(value));
    const [diskTotal, diskUsed, diskAvailable, diskUsePercent] = String(data.DISK || '').split(/\s+/);

    return {
      sampledAt: new Date().toISOString(),
      loadAverage: data.LOAD || '--',
      cpuUsagePercent: Number.isFinite(Number.parseFloat(data.CPU)) ? Math.max(0, Math.min(100, Number.parseFloat(data.CPU))).toFixed(1) : '--',
      memory: {
        totalMb: Number.isFinite(memTotal) ? memTotal : null,
        usedMb: Number.isFinite(memUsed) ? memUsed : null,
        freeMb: Number.isFinite(memFree) ? memFree : null,
        availableMb: Number.isFinite(memAvailable) ? memAvailable : null,
        usedPercent: Number.isFinite(memTotal) && memTotal > 0 && Number.isFinite(memUsed) ? ((memUsed / memTotal) * 100).toFixed(1) : '--'
      },
      disk: {
        total: diskTotal || '--',
        used: diskUsed || '--',
        available: diskAvailable || '--',
        usedPercent: diskUsePercent || '--'
      },
      processes: String(data.PROC || '').split(';').map((item) => item.trim()).filter(Boolean).slice(0, 5)
    };
  }

  /**
   * 断开指定 SSH 会话。
   */
  disconnect(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    this.clearPathSyncHookState(session);

    if (session.stream) {
      session.stream.end('exit\n');
    }

    if (session.sftp && typeof session.sftp.end === 'function') {
      try {
        session.sftp.end();
      } catch (error) {
        // SFTP 可能已经被远端关闭，断开 SSH 时忽略清理异常。
      }
    }

    session.conn.end();
    this.sessions.delete(sessionId);
  }

  /**
   * 断开全部 SSH 会话。
   */
  disconnectAll() {
    Array.from(this.sessions.keys()).forEach((sessionId) => this.disconnect(sessionId));
  }

  /**
   * 根据连接配置构建 ssh2 连接参数。
   */
  buildConnectionConfig(profile) {
    const config = {
      host: profile.host,
      port: profile.port || 22,
      username: profile.username,
      readyTimeout: Math.max(5, Number(profile.timeoutSeconds) || 20) * 1000,
      keepaliveInterval: Math.max(5, Number(profile.keepaliveSeconds) || 15) * 1000,
      keepaliveCountMax: 3
    };

    if (profile.authType === 'key') {
      if (!profile.privateKeyPath) {
        throw new Error('私钥认证需要提供私钥路径');
      }

      config.privateKey = fs.readFileSync(profile.privateKeyPath);

      if (profile.passphrase) {
        config.passphrase = profile.passphrase;
      }
    } else if (profile.password) {
      config.password = profile.password;
    }

    return config;
  }

  /**
   * 打开远程交互式 shell。
   */
  openShell(session, resolve, reject) {
    session.conn.shell({ term: 'xterm-256color', cols: 120, rows: 34, env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' } }, (error, stream) => {
      if (error) {
        if (!session.settled) {
          session.settled = true;
          reject(error);
        }
        return;
      }

      session.stream = stream;
      stream.on('data', (chunk) => this.handleStreamData(session, chunk));
      stream.on('close', () => {
        this.clearPathSyncHookState(session);
        this.sendStatus(session, 'closed', '远程终端已关闭');
      });
      stream.stderr?.on('data', (chunk) => this.handleStreamData(session, chunk));

      if (session.pathSync) {
        setTimeout(() => this.installPathSyncHook(session), 220);
      }

      if (session.profile.terminalStartupCommand) {
        setTimeout(() => {
          if (session.stream) {
            session.stream.write(`${session.profile.terminalStartupCommand}\n`);
          }
        }, 450);
      }

      session.settled = true;
      resolve({ sessionId: session.id, latency: Date.now() - session.startedAt });
    });
  }

  /**
   * 处理终端输出并提取远程当前目录。
   */
  handleStreamData(session, chunk) {
    const data = chunk.toString('utf8');
    const currentPath = session.pathSync ? this.extractCurrentPath(data, session.profile) : "";

    if (currentPath) {
      session.currentPath = currentPath;
      this.send(session, 'ssh:cwd', {
        sessionId: session.id,
        path: currentPath
      });
    }

    const visibleData = this.filterPathSyncInstallOutput(session, data);
    if (visibleData) {
      this.send(session, 'ssh:data', {
        sessionId: session.id,
        data: visibleData
      });
    }
  }

  /**
   * 从 OSC 控制序列中提取当前目录。
   */
  extractCurrentPath(data, profile) {
    const osc7Pattern = /\x1b\]7;file:\/\/[^\x07\x1b]*?(\/[^\x07\x1b]*?)(?:\x07|\x1b\\)/g;
    const customPattern = /\x1b\]1337;CurrentDir=([^\x07\x1b]*?)(?:\x07|\x1b\\)/g;
    const promptPattern = /\[[^\]\r\n]+\s+([~\/][^\]\r\n]*)\][#$>]\s*$/gm;
    const commonPromptPattern = /(?:^|\n)[^\r\n@\s]+@[^:\s]+:([~\/][^#$>\r\n]*)[#$>]\s*$/gm;
    let match = null;
    let currentPath = '';

    while ((match = osc7Pattern.exec(data)) !== null) {
      currentPath = match[1];
    }

    while ((match = customPattern.exec(data)) !== null) {
      currentPath = match[1];
    }

    if (currentPath) {
      return this.decodeRemotePath(currentPath);
    }

    while ((match = promptPattern.exec(data)) !== null) {
      currentPath = this.normalizePromptPath(match[1], profile);
    }

    while ((match = commonPromptPattern.exec(data)) !== null) {
      currentPath = this.normalizePromptPath(match[1], profile);
    }

    if (!currentPath) {
      return '';
    }

    return this.decodeRemotePath(currentPath);
  }

  /**
   * 解码远端路径中的 URL 转义。
   */
  decodeRemotePath(remotePath) {
    try {
      return decodeURIComponent(remotePath);
    } catch (error) {
      return remotePath;
    }
  }

  /**
   * 过滤路径同步 hook 安装阶段的远端回显。
   */
  filterPathSyncInstallOutput(session, data) {
    const marker = '\x1b]1337;NexusHookReady=1\x07';
    const stripMarker = (value) => String(value || '').replace(/\x1b\]1337;NexusHookReady=1(?:\x07|\x1b\\)/g, '');

    if (!session.pathSyncHookInstalling) {
      return stripMarker(data);
    }

    const combined = `${session.pathSyncHookBuffer || ''}${data}`;
    const markerIndex = combined.indexOf(marker);
    if (markerIndex === -1) {
      session.pathSyncHookBuffer = combined.slice(Math.max(0, combined.length - marker.length + 1));
      return '';
    }

    session.pathSyncHookInstalling = false;
    session.pathSyncHookBuffer = '';
    if (session.pathSyncHookTimer) {
      clearTimeout(session.pathSyncHookTimer);
      session.pathSyncHookTimer = null;
    }

    return stripMarker(combined.slice(markerIndex + marker.length));
  }

  /**
   * 清理路径同步 hook 安装过程中的临时状态。
   */
  clearPathSyncHookState(session) {
    if (!session) {
      return;
    }

    if (session.pathSyncHookTimer) {
      clearTimeout(session.pathSyncHookTimer);
    }
    session.pathSyncHookInstalling = false;
    session.pathSyncHookBuffer = '';
    session.pathSyncHookTimer = null;
  }

  /**
   * 将常见 shell 提示符中的路径转换为绝对路径。
   */
  normalizePromptPath(promptPath, profile) {
    const value = String(promptPath || '').trim();
    if (!value) {
      return '';
    }

    if (value === '~') {
      return profile?.username === 'root' ? '/root' : `/home/${profile?.username || 'user'}`;
    }

    if (value.startsWith('~/')) {
      const homePath = profile?.username === 'root' ? '/root' : `/home/${profile?.username || 'user'}`;
      return `${homePath}${value.slice(1)}`;
    }

    return value.startsWith('/') ? value : '';
  }

  /**
   * 安装 shell cwd 回报 hook，由远端 shell 在每次提示符前发送真实 $PWD。
   */
  installPathSyncHook(session) {
    if (!session?.stream || session.pathSyncHookInstalled) {
      return;
    }

    session.pathSyncHookInstalled = true;
    session.pathSyncHookInstalling = true;
    session.pathSyncHookBuffer = '';
    if (session.pathSyncHookTimer) {
      clearTimeout(session.pathSyncHookTimer);
    }
    session.pathSyncHookTimer = setTimeout(() => {
      session.pathSyncHookInstalling = false;
      session.pathSyncHookBuffer = '';
      session.pathSyncHookTimer = null;
    }, 5000);
    session.stream.write(`${this.buildPathSyncHookScript()}\n`);
  }

  /**
   * 构建兼容 bash/zsh 的 cwd 回报脚本。
   */
  buildPathSyncHookScript() {
    return [
      "stty -echo 2>/dev/null",
      "__nexus_ssh_emit_cwd() { printf '\\033]1337;CurrentDir=%s\\007' \"$PWD\"; }",
      "if [ -n \"$ZSH_VERSION\" ]; then",
      "  autoload -Uz add-zsh-hook 2>/dev/null",
      "  add-zsh-hook precmd __nexus_ssh_emit_cwd 2>/dev/null || eval 'case \" ${precmd_functions[*]} \" in *\" __nexus_ssh_emit_cwd \"*) ;; *) precmd_functions=(\"${precmd_functions[@]}\" __nexus_ssh_emit_cwd);; esac'",
      "elif [ -n \"$BASH_VERSION\" ]; then",
      "  case \";$PROMPT_COMMAND;\" in *\";__nexus_ssh_emit_cwd;\"*) ;; *) PROMPT_COMMAND=\"__nexus_ssh_emit_cwd${PROMPT_COMMAND:+;$PROMPT_COMMAND}\" ;; esac",
      "fi",
      "__nexus_ssh_emit_cwd",
      "printf '\\033]1337;NexusHookReady=1\\007'",
      "stty echo 2>/dev/null"
    ].join('\n');
  }

  /**
   * 向渲染进程发送状态消息。
   */
  sendStatus(session, status, message) {
    this.send(session, 'ssh:status', {
      sessionId: session.id,
      status,
      message
    });
  }

  /**
   * 向渲染进程发送事件。
   */
  send(session, channel, payload) {
    if (session.webContents && !session.webContents.isDestroyed()) {
      session.webContents.send(channel, payload);
    }
  }

  /**
   * 为 shell 参数添加安全引号。
   */
  shellQuote(value) {
    const normalized = String(value || '/');
    return `'${normalized.replace(/'/g, `'\\''`)}'`;
  }
}

module.exports = { TerminalSessionManager };
