# SSH

一个面向 Windows 10 的 SSH/SFTP 桌面客户端源码工程，基于 Electron、xterm.js 和 ssh2 实现。

## 功能

- 保存 SSH 连接信息，支持密码和私钥认证。
- 新建或编辑连接时可测试 SSH 与 SFTP 可用性。
- 启动页居中展示所有连接，双击连接直接打开会话。
- 同一个连接可重复双击打开，标签名自动追加 `(2)`、`(3)`。
- 标签可通过拉出按钮或拖向窗口边缘打开到独立窗口。
- 终端支持复制、粘贴和清屏快捷键。
- 右侧 SFTP 支持上传、下载、刷新、目录进入、文本文件打开编辑、保存回远程服务器。
- SFTP 名称列支持右键新建文件、新建文件夹、重命名、修改权限和删除。
- 设置中支持黑色和白色主题、终端字号、连接信息保存位置、SFTP 行为和鼠标侧键快捷操作。

## 快捷键

```powershell
Ctrl+Shift+C
```

```powershell
Ctrl+Shift+V
```

```powershell
Ctrl+Shift+L
```

## 运行

```powershell
npm install
```

```powershell
npm start
```

## 打包 Windows 版本

```powershell
npm run dist:win
```

## 连接信息保存位置

默认保存位置由 Electron 的 `app.getPath('userData')` 决定，软件内 Setting 页面会显示默认位置和当前位置。更改位置时，程序会把现有 `profiles.json` 复制到新目录。

