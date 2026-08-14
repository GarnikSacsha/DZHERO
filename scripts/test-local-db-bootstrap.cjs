const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForHealth(baseUrl, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Bootstrap test server exited early: ${output()}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Bootstrap test server did not start: ${output()}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}

async function main() {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'dzhero-local-db-bootstrap-'));
  const databasePath = path.join(tempDirectory, 'runtime', 'db.json');
  const port = await getFreePort();
  const outputChunks = [];
  const child = spawn(process.execPath, ['backend/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DATABASE_URL: '',
      DB_PATH: databasePath,
      AUTOMATIC_DISCOVERY_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => outputChunks.push(String(chunk)));
  child.stderr.on('data', (chunk) => outputChunks.push(String(chunk)));

  try {
    await waitForHealth(`http://127.0.0.1:${port}`, child, () => outputChunks.join(''));
    const state = JSON.parse(readFileSync(databasePath, 'utf8'));
    assert.deepEqual(state.sessions, []);
    assert.ok(Array.isArray(state.workspaces) && state.workspaces.length > 0);
    assert.equal(state.users.some((user) => Object.hasOwn(user, 'passwordHash')), false);
    assert.equal(state.sessions.some((session) => Object.hasOwn(session, 'token')), false);
    console.log('Local DB bootstrap test passed with a missing runtime database.');
  } finally {
    await stop(child);
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
