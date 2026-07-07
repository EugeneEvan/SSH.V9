# UI System And Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SSH desktop app feel coherent, compact, and responsive while fixing drawer/search overlap, terminal Tab focus escape, command hints, and live latency/status signals.

**Architecture:** Keep the existing Electron renderer structure and add a final, explicit UI-system override layer at the end of `src/renderer/styles.css`. Implement latency refresh in `src/renderer/app.js` using the existing `profiles:test` IPC path, with concurrency guards and existing profile badge rendering.

**Tech Stack:** Electron 31, vanilla renderer JavaScript, xterm.js, ssh2, CSS custom properties.

---

## File Structure

- Modify: `src/renderer/styles.css`
  - Add final design tokens for spacing, radii, control sizes, panel chrome, terminal colors, search/header layouts, hints, status cards, badges, and responsive SFTP header behavior.
- Modify: `src/renderer/app.js`
  - Add latency refresh helpers, normalize `latencyRefreshSeconds`, wire settings save/open behavior, prevent terminal Tab from moving focus when command hints are active, and make rendering consume cached latency results.
- Modify: `docs/superpowers/plans/2026-07-07-ui-system-latency.md`
  - Track this implementation plan and test commands.

### Task 1: Renderer Latency Data Model

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Normalize refresh interval in settings load**

Use this implementation inside `loadApplicationSettings()` after the existing drawer width normalization:

```js
state.settings.latencyRefreshSeconds = normalizeNumber(state.settings.latencyRefreshSeconds, 60, 15, 600);
```

- [ ] **Step 2: Read cached latency in badges**

Use this logic at the top of `buildLatencyBadge(profile)`:

```js
const cached = state.profileLatencies?.[profile.id];
const cachedLatency = Number.parseInt(cached?.latency, 10);
if (Number.isFinite(cachedLatency)) {
  const level = cachedLatency < 120 ? 'good' : (cachedLatency < 300 ? 'warn' : 'bad');
  badge.className = `latency-badge ${level}`;
  badge.textContent = `${cachedLatency}ms`;
  badge.title = cached.checkedAt ? `Last checked ${formatTime(cached.checkedAt)}` : '';
  return badge;
}
if (cached?.status === 'checking') {
  badge.className = 'latency-badge checking';
  badge.textContent = 'Checking';
  return badge;
}
```

- [ ] **Step 3: Implement interval refresh helpers**

Add these functions near the profile rendering helpers:

```js
function resetLatencyRefreshTimer() {
  if (state.latencyRefreshTimer) {
    window.clearInterval(state.latencyRefreshTimer);
    state.latencyRefreshTimer = null;
  }
  const seconds = normalizeNumber(state.settings.latencyRefreshSeconds, 60, 15, 600);
  state.settings.latencyRefreshSeconds = seconds;
  state.latencyRefreshTimer = window.setInterval(() => refreshProfileLatencies({ silent: true }), seconds * 1000);
}
```

```js
async function refreshProfileLatencies(options = {}) {
  if (state.latencyRefreshRunning || !Array.isArray(state.profiles) || state.profiles.length === 0) {
    return;
  }
  state.latencyRefreshRunning = true;
  try {
    for (const profile of state.profiles) {
      state.profileLatencies[profile.id] = { status: 'checking', checkedAt: Date.now() };
      if (!options.silent) {
        renderProfiles();
      }
      const result = await window.nexusSsh.profiles.test(profile);
      state.profileLatencies[profile.id] = {
        status: result.success ? 'ok' : 'error',
        latency: result.latency,
        sftp: result.sftp === true,
        message: result.message || '',
        checkedAt: Date.now()
      };
      renderProfiles();
    }
  } finally {
    state.latencyRefreshRunning = false;
  }
}
```

- [ ] **Step 4: Verify syntax**

Run:

```powershell
node --check src\renderer\app.js
```

Expected: no output and exit code `0`.

### Task 2: Terminal Focus And Hint UX

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Prevent Tab focus escape while hints are active**

Replace the current Tab branch in `handleTerminalCustomKey()` with:

```js
if (event.key === 'Tab' && tab.commandHints) {
  if (tab.inlineSuggestion) {
    replaceCurrentCommand(tab, tab.inlineSuggestion.command);
  }
  return false;
}
```

- [ ] **Step 2: Make hints follow terminal bottom with comfortable spacing**

Add final CSS:

```css
.terminal-wrap {
  position: relative !important;
  padding: var(--space-3) !important;
}

.terminal-inline-hint {
  left: var(--space-4) !important;
  right: var(--space-4) !important;
  bottom: var(--space-4) !important;
  max-width: calc(100% - var(--space-8)) !important;
}
```

- [ ] **Step 3: Verify syntax**

Run:

```powershell
node --check src\renderer\app.js
```

Expected: no output and exit code `0`.

### Task 3: Unified Visual System

**Files:**
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Add final design tokens**

Append a final CSS block with:

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --control-height: 28px;
  --control-gap: 8px;
  --radius-lg: 8px;
  --radius-md: 6px;
  --radius-sm: 5px;
}
```

- [ ] **Step 2: Fix drawer search and more-button spacing**

Use grid layout for the drawer toolbar:

```css
.drawer-toolbar {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) var(--control-height) !important;
  column-gap: var(--control-gap) !important;
}

#connectionSearchBox.drawer-search,
#connectionSearchBox.drawer-search.collapsed {
  position: static !important;
  width: 100% !important;
  grid-column: 1 !important;
}

.drawer-actions {
  grid-column: 2 !important;
  gap: var(--control-gap) !important;
}
```

- [ ] **Step 3: Normalize buttons, inputs, panels, status cards, and tables**

Append final selectors for `.small-button`, `.icon-button`, `.toolbar-icon-button`, `.search-box`, `.sftp-search-box`, `.terminal-panel`, `.sftp-panel`, `.server-status-card`, `.file-table`, and `.statusbar`, all using the same spacing tokens.

- [ ] **Step 4: Verify CSS is at the end**

Run:

```powershell
Get-Content src\renderer\styles.css -Tail 120
```

Expected: the final block starts with `/* v29 unified interaction and telemetry pass */`.

### Task 4: Build Smoke Test

**Files:**
- Read: `package.json`
- Read: `src/renderer/app.js`
- Read: `src/main/terminal-session-manager.js`

- [ ] **Step 1: Run syntax checks**

Run:

```powershell
node --check src\renderer\app.js
node --check src\main\terminal-session-manager.js
```

Expected: both commands exit `0`.

- [ ] **Step 2: Start app if manual visual verification is needed**

Run:

```powershell
npm start
```

Expected: Electron app opens. Check that drawer search and more button have an 8px gap, terminal Tab stays inside xterm, command hints sit above the terminal bottom edge, and latency badges update after the refresh interval.
