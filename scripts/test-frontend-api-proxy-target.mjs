import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_ENTRY = path.join(ROOT_DIR, 'frontend', 'server.mjs');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function getFreePort() {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForFrontend(origin, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Proxy test frontend exited early: ${output()}`);
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      // Keep polling until the isolated frontend is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Proxy test frontend did not start: ${output()}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

function rawHttpGet(port, requestTarget) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let response = '';
    socket.setEncoding('utf8');
    socket.setTimeout(5_000, () => socket.destroy(new Error('Raw HTTP request timed out.')));
    socket.once('error', reject);
    socket.on('data', (chunk) => { response += chunk; });
    socket.on('end', () => {
      const status = Number(response.match(/^HTTP\/1\.1 (\d{3})/)?.[1] || 0);
      resolve({ status, response });
    });
    socket.on('connect', () => {
      socket.write(`GET ${requestTarget} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
    });
  });
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-frontend-proxy-target-'));
const distPath = path.join(tempDir, 'dist');
await mkdir(distPath);
await writeFile(path.join(distPath, 'index.html'), '<!doctype html><title>proxy-target-test</title>', 'utf8');

const backendRequests = [];
const backend = http.createServer((req, res) => {
  backendRequests.push(req.url);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ url: req.url }));
});
const backendPort = await listen(backend);

const attackerRequests = [];
const attacker = http.createServer((req, res) => {
  attackerRequests.push(req.url);
  res.writeHead(418, { 'content-type': 'text/plain' });
  res.end('attacker received proxy request');
});
const attackerPort = await listen(attacker);

const frontendPort = await getFreePort();
const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
const frontendChild = spawn(process.execPath, [FRONTEND_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(frontendPort),
    HOST: '127.0.0.1',
    FRONTEND_DIST_PATH: distPath,
    API_PROXY_TARGET: `http://127.0.0.1:${backendPort}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let frontendOutput = '';
frontendChild.stdout.on('data', (chunk) => { frontendOutput += chunk.toString(); });
frontendChild.stderr.on('data', (chunk) => { frontendOutput += chunk.toString(); });

try {
  await waitForFrontend(frontendOrigin, frontendChild, () => frontendOutput);

  const normalQuery = '/api/echo?destination=%2F%3Fpreview%3Dproduct%26tab%3Ddiscover&flag=a%20b';
  const normalResponse = await fetch(`${frontendOrigin}${normalQuery}`);
  assert.equal(normalResponse.status, 200);
  assert.equal((await normalResponse.json()).url, normalQuery);

  const absoluteForm = await rawHttpGet(
    frontendPort,
    `http://127.0.0.1:${attackerPort}/api/capture?via=absolute-form`,
  );
  const protocolRelative = await rawHttpGet(
    frontendPort,
    `//127.0.0.1:${attackerPort}/api/capture?via=protocol-relative`,
  );
  const malformedAbsolute = await rawHttpGet(
    frontendPort,
    `http://[::1/api/capture?via=malformed`,
  );

  console.log(`observed absolute-form status: ${absoluteForm.status}`);
  console.log(`observed protocol-relative status: ${protocolRelative.status}`);
  console.log(`observed malformed absolute status: ${malformedAbsolute.status}`);
  console.log(`observed attacker requests: ${attackerRequests.length}`);
  console.log(`observed backend requests: ${backendRequests.length}`);

  assert.equal(absoluteForm.status, 400, 'Absolute-form targets must fail before proxying.');
  assert.equal(protocolRelative.status, 400, 'Protocol-relative targets must fail before routing.');
  assert.equal(malformedAbsolute.status, 400, 'Malformed absolute targets must fail closed.');
  assert.deepEqual(attackerRequests, [], 'The attacker origin must receive zero proxy requests.');
  assert.deepEqual(backendRequests, [normalQuery], 'Only the valid origin-form /api request may reach backend.');

  console.log('Frontend API proxy target confinement passed.');
  console.log(`absolute-form status: ${absoluteForm.status}`);
  console.log(`protocol-relative status: ${protocolRelative.status}`);
  console.log(`malformed absolute status: ${malformedAbsolute.status}`);
  console.log(`attacker requests: ${attackerRequests.length}`);
  console.log(`backend requests: ${backendRequests.length}`);
} catch (error) {
  if (frontendOutput.trim()) console.error(frontendOutput.trim());
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopProcess(frontendChild);
  await new Promise((resolve) => backend.close(resolve));
  await new Promise((resolve) => attacker.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
