/**
 * Frees the dev port and stops any leftover watcher for THIS project.
 *
 *   npm run dev:stop      stop everything
 *   npm run dev           stop, then start clean
 *
 * Why this exists: `nest start --watch` is three processes, not one —
 *
 *   npm run start:dev   →   nest start --watch   →   node dist/main   ← holds the port
 *
 * Killing whatever holds port 3000 only kills the last one. The watcher above
 * it survives, and on the next file change it rebuilds and grabs the port
 * again. That is the EADDRINUSE that keeps coming back: not a stuck port, but
 * an orphaned watcher respawning into it.
 *
 * So this matches on the command line rather than on the port, and only for
 * this project directory — an unrelated Node app of yours is left alone.
 */

const { execFileSync } = require('child_process');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const PROJECT = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

/** Runs a command and returns stdout, or '' if it fails or matches nothing. */
function run(file, args) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', stdio: 'pipe' });
  } catch {
    return '';
  }
}

const killed = new Set();

function kill(pid, why) {
  if (!pid || killed.has(pid) || pid === process.pid) return;
  killed.add(pid);
  try {
    if (isWindows) run('taskkill', ['/PID', String(pid), '/T', '/F']);
    else process.kill(pid, 'SIGKILL');
    console.log(`  stopped PID ${pid} — ${why}`);
  } catch {
    console.log(`  could not stop PID ${pid} (${why}) — it may already be gone`);
  }
}

// --------------------------------------------------------- watcher processes

if (isWindows) {
  // CommandLine is the only way to tell "this project's nest watcher" apart
  // from any other node process on the machine.
  const csv = run('powershell', [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
      'Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress',
  ]);

  let processes = [];
  try {
    const parsed = JSON.parse(csv || '[]');
    processes = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    processes = [];
  }

  // Path separators differ between how npm and the shell spell the directory,
  // so compare on a normalised, lowercased form.
  const projectKey = PROJECT.replace(/\\/g, '/').toLowerCase();

  for (const proc of processes) {
    const cmd = (proc.CommandLine || '').replace(/\\/g, '/').toLowerCase();
    if (!cmd) continue;

    const isThisProject =
      cmd.includes(projectKey) || cmd.includes('start:dev');
    const isDevServer =
      cmd.includes('start:dev') ||
      cmd.includes('nest.js start') ||
      cmd.includes('dist/main');

    if (isThisProject && isDevServer) {
      kill(proc.ProcessId, 'nest dev server / watcher');
    }
  }
} else {
  const pids = run('pgrep', ['-f', 'nest start --watch']).trim().split(/\s+/);
  for (const pid of pids.filter(Boolean)) {
    kill(Number(pid), 'nest dev server / watcher');
  }
}

// ------------------------------------------------------------ port listeners

// A belt-and-braces pass: catches a compiled `node dist/main` started by hand,
// or anything else that took the port while the watcher was down.
if (isWindows) {
  const out = run('powershell', [
    '-NoProfile',
    '-Command',
    `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ` +
      'Select-Object -ExpandProperty OwningProcess',
  ]);
  for (const line of out.split(/\r?\n/)) {
    const pid = Number(line.trim());
    if (pid) kill(pid, `was listening on port ${PORT}`);
  }
} else {
  const out = run('lsof', ['-ti', `tcp:${PORT}`]);
  for (const line of out.split(/\r?\n/)) {
    const pid = Number(line.trim());
    if (pid) kill(pid, `was listening on port ${PORT}`);
  }
}

console.log(
  killed.size === 0
    ? `Nothing to stop — port ${PORT} is already free.`
    : `Stopped ${killed.size} process(es). Port ${PORT} is free.`,
);
