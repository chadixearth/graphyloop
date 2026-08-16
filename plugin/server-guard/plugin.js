// graphyloop - server-guard: auto-detaches inline server launches on Windows.
//
// THE HANG THIS FIXES
// An agent shell tool reads the child's stdout/stderr until EOF. EOF arrives
// when every handle to the pipe's write end is closed -- NOT when the direct
// child exits. So any process that inherited a duplicate of that pipe keeps the
// tool call blocked. `npm run dev` therefore stalls the turn forever, and the
// user has to cancel to get the session back.
//
// WHY THE OBVIOUS DETACH DOES NOT WORK
// `Start-Process -RedirectStandardOutput x -RedirectStandardError y` looks like
// a clean detach, but it makes PowerShell call CreateProcess with
// bInheritHandles=TRUE, which duplicates every inheritable handle of the
// launching shell into the child -- including the tool's stdout pipe. Measured
// with a self-exiting fixture server: the launcher exited at 2.3s, the caller's
// stdout EOF only arrived at 21.8s, exactly when the server died. With a real
// dev server, "21.8s" is "never". start-server.ps1 instead writes the
// redirection into a generated .cmd wrapper and starts it via ShellExecuteEx
// (bInheritHandles=FALSE), which closes the pipe with the launcher (lag 7-8ms).
//
// STRATEGY - keep the flow moving instead of erroring:
//   1. REWRITE when deterministic: npm run/start scripts, direct node server
//      entrypoints and python -m http.server become a start-server.ps1 call
//      (detached, health-checked, PID saved). The agent sees SERVER_UP/PID and
//      continues in the same turn.
//   2. BLOCK with instructions when a rewrite would be guesswork: pnpm/yarn/bun,
//      bare framework CLIs (.cmd shims), --watch modes, command chains, and the
//      detach patterns confirmed to hang (cmd /c start, Start-Process npm,
//      Start-Process with stdio redirects).
//   3. Backstop timeout on any bash call that omits one.
//
// Windows-only by design: the launcher is PowerShell and the handle-inheritance
// trap is a Win32 behavior. On other platforms the plugin installs no hooks.

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TIMEOUT_MS = 300000;

// Installed layout is <configDir>/plugins/server-guard/plugin.js. Prefer the
// copy shipped beside the plugin (always current with the kit); fall back to
// the legacy <configDir>/scripts/ location so older setups keep working.
const LAUNCHER_CANDIDATES = [
  path.join(PLUGIN_DIR, 'start-server.ps1'),
  path.join(PLUGIN_DIR, '..', '..', 'scripts', 'start-server.ps1'),
];

export function findLauncher(candidates = LAUNCHER_CANDIDATES) {
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

// Commands that leave a long-lived server/watcher attached to the shell.
export const SERVER_PATTERNS = [
  /\b(?:npm|pnpm|yarn|bun)(?:\.cmd)?\s+(?:run\s+)?(?:dev|start|serve|preview|watch)\b/i,
  /\b(?:next|nuxt|astro|remix|vite|webpack|parcel)(?:\.cmd)?\s+(?:dev|start|serve|preview)\b/i,
  /\bng\s+serve\b/i,
  /\bexpo\s+start\b/i,
  /\b(?:nodemon|webpack-dev-server|http-server|live-server|browser-sync|json-server)\b/i,
  /\bnode(?:\.exe)?\s+[^&|;\r\n]*\b(?:server|serve)[\w.-]*\.[cm]?js\b/i,
  /\bpython[\d.]*(?:\.exe)?\s+-m\s+http\.server\b/i,
  /\b(?:flask\s+run|uvicorn|gunicorn|php\s+-S|rails\s+s(?:erver)?)\b/i,
  /\s--watch\b/i,
];

// Detach patterns measured to STILL hang, with the reason each one leaks:
//   cmd /c start        - the started child inherits the tool's pipe handles.
//   Start-Process npm   - npm.cmd spawns cmd.exe -> node.exe children that keep
//                         console/pipe handles alive.
//   Start-Process with stdio redirects - CreateProcess(bInheritHandles=TRUE).
//     -Wait is exempt: that is a foreground run, so the caller is meant to wait.
export const BROKEN_DETACH_PATTERNS = [
  /\bcmd(?:\.exe)?\s+\/c\s+start\b/i,
  /\bStart-Process\b[^|;\r\n]*\b(?:npm|npx|yarn|pnpm)(?:\.cmd)?\b/i,
  (command) => /\bStart-Process\b/i.test(command)
    && /-RedirectStandard(?:Output|Error)\b/i.test(command)
    && !/-Wait\b/i.test(command),
];

const DEFAULT_PORTS = [
  [/\bvite\b/i, 5173],
  [/\bastro\b/i, 4321],
  [/\bng\s+serve\b/i, 4200],
  [/\bwebpack\b/i, 8080],
  [/\bexpo\b/i, 8081],
  [/\bhttp\.server\b/i, 8000],
  [/\buvicorn\b/i, 8000],
  [/\bflask\b/i, 5000],
  [/\b(?:next|nuxt|remix)\b/i, 3000],
];

export function matchesPattern(pattern, command) {
  return typeof pattern === 'function' ? pattern(command) : pattern.test(command);
}

// Only the launcher counts. Start-Process with -RedirectStandardOutput/Error was
// whitelisted here in earlier versions -- that was the bug: the pattern is the
// leak, not the fix.
export function isSafelyDetached(command) {
  return command.includes('start-server.ps1');
}

export function detectPort(text) {
  let m = text.match(/(?:--port|-p)[=\s]+(\d{2,5})\b/i);
  if (m) return Number(m[1]);
  m = text.match(/\bhttp\.server\s+(\d{2,5})\b/i);
  if (m) return Number(m[1]);
  m = text.match(/\bPORT=(\d{2,5})\b/);
  if (m) return Number(m[1]);
  for (const [pattern, port] of DEFAULT_PORTS) {
    if (pattern.test(text)) return port;
  }
  return null;
}

function packageScript(directory, name) {
  try {
    const pkg = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    return (pkg.scripts && pkg.scripts[name]) || null;
  } catch {
    return null;
  }
}

// Resolve a real .exe, skipping WindowsApps Store-alias stubs (they exist on
// disk but exit non-zero / open the Store instead of running).
function findExe(name) {
  const result = spawnSync('where.exe', [name], { encoding: 'utf8', windowsHide: true });
  const exes = result.status === 0
    ? String(result.stdout || '')
      .split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      .filter((candidate) => candidate.toLowerCase().endsWith('.exe'))
    : [];
  const ordered = [
    ...exes.filter((c) => !/\\WindowsApps\\/i.test(c)),
    ...exes.filter((c) => /\\WindowsApps\\/i.test(c)),
  ];
  for (const candidate of ordered) {
    if (!existsSync(candidate)) continue;
    const check = spawnSync(candidate, ['--version'], { windowsHide: true, timeout: 5000 });
    if (check.status === 0) return candidate;
  }
  return null;
}

export function blockMessage(kind, launcher) {
  const why = kind === 'broken-detach'
    ? "This detach pattern is confirmed to hang: the child inherits a duplicate of the tool's stdout pipe handle, so the tool never sees EOF even after your launcher exits (measured: EOF 19.5s late, exactly when the child died)."
    : kind === 'no-launcher'
      ? 'Inline server/watcher commands stall the session, and the start-server.ps1 launcher is missing from this install.'
      : 'Inline server/watcher commands stall the session: the shell tool reads stdout until EOF, and a live server keeps that pipe open forever.';
  const lines = [`SERVER_GUARD_BLOCKED: ${why}`];
  if (kind === 'no-launcher' || !launcher) {
    lines.push('Reinstall the kit to restore it: npx graphyloop@latest', 'Until then, run the server in a separate terminal outside the agent session.');
  } else {
    lines.push(
      'Use the detached launcher instead (returns immediately, polls health, saves PID):',
      `  powershell -File "${launcher}" -Port <port> -Command '"C:\\Program Files\\nodejs\\node.exe" "<entry-script>"' [-HealthUrl <url>] [-WorkingDirectory <dir>]`,
      `  stop later: powershell -File "${launcher}" -Port <port> -Stop`,
      'Rules: launch node.exe (or the real exe) directly - never npm.cmd/npx/pnpm/yarn wrappers or .cmd shims, they hang even detached.',
      "Do not hand-roll a detach with Start-Process -RedirectStandardOutput/-RedirectStandardError: that inherits the tool's pipes. The launcher redirects inside a generated .cmd and starts it via ShellExecuteEx (bInheritHandles=FALSE).",
      'For package-manager scripts, read package.json and run the underlying command via the launcher.',
      'One-shot builds/tests are fine - drop the watch/serve/dev flag if you only needed a single run.',
    );
  }
  return lines.join('\n');
}

/**
 * Build the guard. Options exist so the suite can exercise the logic on any
 * platform and so unusual installs can pin interpreter paths:
 *   directory  project root used to read package.json scripts
 *   launcher   path to start-server.ps1 (default: resolved next to the plugin)
 *   platform   default process.platform; the guard is Windows-only
 *   exePaths   { node, npmCli, python } overrides for PATH lookups
 *   timeoutMs  backstop timeout applied when a bash call omits one
 */
export function createServerGuard({
  directory,
  launcher = findLauncher(),
  platform = process.platform,
  exePaths = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (platform !== 'win32') return null;

  const projectDir = directory || process.cwd();
  const cache = new Map();

  const resolve = (name, finder) => {
    if (exePaths[name]) return exePaths[name];
    if (!cache.has(name)) cache.set(name, finder());
    return cache.get(name);
  };

  const nodeExe = () => resolve('node', () => findExe('node'));
  const pythonExe = () => resolve('python', () => findExe('python'));

  // npm as a plain node script - never the .cmd shim, which hangs the tool.
  const npmCliJs = () => resolve('npmCli', () => {
    const node = nodeExe();
    if (!node) return null;
    const cli = path.join(path.dirname(node), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return existsSync(cli) ? cli : null;
  });

  function launcherCommand(port, inner) {
    // Base64 dodges the powershell.exe argv parser, which strips embedded
    // double quotes and mangles paths with spaces.
    const b64 = Buffer.from(inner, 'utf8').toString('base64');
    return (
      `Write-Output 'SERVER_GUARD_REWRITE: inline server auto-detached via start-server.ps1 (port ${port}). `
      + `SERVER_UP = ready; SERVER_DOWN = check .opencode\\logs\\err.log or the port guess was wrong. `
      + `Stop later: powershell -File "${launcher}" -Port ${port} -Stop'; `
      + `powershell -NoProfile -File "${launcher}" -Port ${port} -CommandB64 ${b64}`
    );
  }

  // Returns the rewritten command, or null when a safe rewrite isn't possible.
  function rewrite(command) {
    if (!launcher) return null;
    // Rewriting one segment of a chain would break the rest - whole commands only.
    if (/[;&|]|\r|\n/.test(command)) return null;

    // npm run <script> / npm start - run npm's own JS entry under node.exe.
    let m = command.match(/^\s*npm(?:\.cmd)?\s+(?:run\s+)?(dev|start|serve|preview)\b\s*(.*)$/i);
    if (m) {
      const node = nodeExe();
      const cli = npmCliJs();
      if (!node || !cli) return null;
      const script = m[1].toLowerCase();
      const extra = m[2].trim();
      const scriptText = packageScript(projectDir, script) || '';
      const port = detectPort(command) || detectPort(scriptText) || 3000;
      const inner = `"${node}" "${cli}" run ${script}${extra ? ` ${extra}` : ''}`;
      return launcherCommand(port, inner);
    }

    // Direct node server entrypoint.
    m = command.match(/^\s*(?:node(?:\.exe)?|"[^"]*node(?:\.exe)?")\s+(.+)$/i);
    if (m && /\b(?:server|serve)[\w.-]*\.[cm]?js\b/i.test(m[1])) {
      const node = nodeExe();
      if (!node) return null;
      const rest = m[1].trim();
      const port = detectPort(rest) || 3000;
      return launcherCommand(port, `"${node}" ${rest}`);
    }

    // python -m http.server [port]
    m = command.match(/^\s*python[\d.]*(?:\.exe)?\s+(-m\s+http\.server\b.*)$/i);
    if (m) {
      const python = pythonExe();
      if (!python) return null;
      const rest = m[1].trim();
      const port = detectPort(rest) || 8000;
      return launcherCommand(port, `"${python}" ${rest}`);
    }

    return null;
  }

  return {
    'tool.execute.before': async (input, output) => {
      if (input?.tool !== 'bash') return;
      const args = output?.args;
      const command = String(args?.command || '');
      if (!command) return;

      for (const pattern of BROKEN_DETACH_PATTERNS) {
        if (matchesPattern(pattern, command)) {
          throw new Error(blockMessage('broken-detach', launcher));
        }
      }

      if (!isSafelyDetached(command) && SERVER_PATTERNS.some((p) => p.test(command))) {
        const detached = rewrite(command);
        if (detached) {
          args.command = detached;
        } else {
          throw new Error(blockMessage(launcher ? 'inline-server' : 'no-launcher', launcher));
        }
      }

      // Backstop: nothing inline runs unbounded. Explicit timeouts are respected.
      if (args && !args.timeout) args.timeout = timeoutMs;
    },
  };
}

export default async ({ directory } = {}) => createServerGuard({ directory }) || {};
