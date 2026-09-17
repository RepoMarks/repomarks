import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const repoUrl = process.env.REPO_URL;
const token = process.env.GIT_TOKEN;
if (!repoUrl || !token) {
  console.error('REPO_URL and GIT_TOKEN are required');
  process.exit(1);
}
const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
const owner = match?.[1];
const repoName = match?.[2];
if (!owner || !repoName) {
  console.error('cannot parse owner/repo');
  process.exit(1);
}

const stamp = Date.now();
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gitmarks-gh-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (msg) => {
  throw new Error(`ASSERT FAILED: ${msg}`);
};
const gitCommitCount = () =>
  Number(
    execFileSync(
      'gh',
      ['api', `repos/${owner}/${repoName}/commits?per_page=100`, '--jq', 'length'],
      { encoding: 'utf8' }
    ).trim()
  );

function startServer(dataDir, port) {
  const proc = spawn(process.execPath, ['server/dist/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      REPO_URL: repoUrl,
      GIT_TOKEN: token,
      DATA_DIR: dataDir,
      PORT: String(port),
      AUTH_PASSWORD: 'secret',
      SYNC_INTERVAL: '0',
      GIT_BRANCH: 'main',
      HOST: '127.0.0.1',
    },
  });
  let logs = '';
  proc.stdout.on('data', (d) => (logs += d.toString()));
  proc.stderr.on('data', (d) => (logs += d.toString()));
  return { proc, getLogs: () => logs };
}

function client(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  let cookie = '';
  const req = async (pathname, options = {}) => {
    const res = await fetch(baseUrl + pathname, {
      ...options,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { res, data, text };
  };
  return {
    req,
    waitReady: async () => {
      for (let i = 0; i < 90; i++) {
        try {
          const res = await fetch(`${baseUrl}/api/auth/session`);
          if (res.ok) return;
        } catch {
          /* retry */
        }
        await sleep(500);
      }
      throw new Error(`server on ${port} not ready`);
    },
    login: async () => {
      const res = await req('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password: 'secret' }),
      });
      if (res.res.status !== 200) fail(`login failed on ${port}: ${res.text}`);
      cookie = (
        res.res.headers.getSetCookie?.() ?? [res.res.headers.get('set-cookie')]
      )[0].split(';')[0];
    },
  };
}

const a = startServer(path.join(base, 'data-a'), 3131);
const b = startServer(path.join(base, 'data-b'), 3132);
const logs = () => `--- A ---\n${a.getLogs()}\n--- B ---\n${b.getLogs()}`;

try {
  const clientA = client(3131);
  await clientA.waitReady();
  await clientA.login();
  const before = await clientA.req('/api/links?perPage=1');
  const initialCount = before.data.total;
  if (initialCount < 2) fail(`A did not pull existing data from GitHub, got ${initialCount}`);
  const commitsBefore = gitCommitCount();
  console.log(
    `1. server A up, repo=${owner}/${repoName}, existing links=${initialCount}, commits=${commitsBefore}`
  );

  const urlA = `https://example.org/?gitmarks-e2e=${stamp}`;
  const created = await clientA.req('/api/links', {
    method: 'POST',
    body: JSON.stringify({ url: urlA, tags: ['github-test'] }),
  });
  if (created.res.status !== 201) fail(`add link failed: ${created.text}`);
  if (!created.data.title || created.data.title === urlA) fail(`metadata not fetched: ${created.data.title}`);
  console.log(`2. link + metadata ok (title="${created.data.title}")`);

  const archiveStart = await clientA.req(`/api/links/${created.data.id}/archive`, { method: 'POST' });
  if (archiveStart.res.status !== 202) fail(`archive start failed: ${archiveStart.text}`);
  let archived = null;
  for (let i = 0; i < 180; i++) {
    await sleep(1000);
    const current = await clientA.req(`/api/links/${created.data.id}`);
    if (current.data.archiveStatus !== 'pending') {
      if (current.data.archiveStatus !== 'ok') fail(`archive failed: ${current.data.archiveError}`);
      archived = current.data;
      break;
    }
  }
  if (!archived) fail('archive timed out');
  console.log(
    `3. archive ok (engine=${archived.archiveEngine}, ${Math.round(archived.archiveSize / 1024)} KB)`
  );

  const urlImport = `https://nodejs.org/?gitmarks-e2e=${stamp}`;
  const importPayload = {
    json: JSON.stringify([
      { url: urlImport, title: 'Node.js test', folder: '技术/运行时', tags: ['dev'] },
    ]),
  };
  const imported = await clientA.req('/api/import', {
    method: 'POST',
    body: JSON.stringify(importPayload),
  });
  if (imported.data.linksAdded !== 1) fail(`import failed: ${imported.text}`);
  console.log('4. import ok');

  const syncA = await clientA.req('/api/sync', { method: 'POST' });
  if (!syncA.data.ok) fail(`sync A failed: ${syncA.text}`);
  const commitsAfter = gitCommitCount();
  if (commitsAfter < commitsBefore + 3) {
    fail(`expected >=3 new commits, before=${commitsBefore} after=${commitsAfter}`);
  }
  console.log(`5. pushed to GitHub ok (commits ${commitsBefore} -> ${commitsAfter})`);

  const clientB = client(3132);
  await clientB.waitReady();
  await clientB.login();
  const syncB0 = await clientB.req('/api/sync', { method: 'POST' });
  if (!syncB0.data.ok || !syncB0.data.pulled) fail(`B initial sync failed: ${syncB0.text}`);
  const listB = await clientB.req('/api/links?perPage=500');
  if (listB.data.total !== initialCount + 2) {
    fail(`B should see ${initialCount + 2} links, got ${listB.data.total}`);
  }
  const linkedB = listB.data.items.find((item) => item.url === urlA);
  if (!linkedB) fail('B missing new link');
  if (!linkedB.archivedAt) fail('B missing archive metadata');
  const archiveInB = await clientB.req(`/api/links/${linkedB.id}`);
  if (!archiveInB.data.archivePath) fail('B missing archivePath');
  console.log(`6. second instance pulled from GitHub ok (links=${listB.data.total}, archive synced)`);

  const urlB = `https://www.rust-lang.org/?gitmarks-e2e=${stamp}`;
  const addedB = await clientB.req('/api/links', {
    method: 'POST',
    body: JSON.stringify({ url: urlB, tags: ['from-b'] }),
  });
  if (addedB.res.status !== 201) fail(`B add failed: ${addedB.text}`);
  const syncB = await clientB.req('/api/sync', { method: 'POST' });
  if (!syncB.data.ok) fail(`sync B failed: ${syncB.text}`);
  console.log('7. B pushed new link ok');

  const syncA2 = await clientA.req('/api/sync', { method: 'POST' });
  if (!syncA2.data.pulled) fail('A should have pulled B commit');
  const listA = await clientA.req('/api/links?q=rust-lang');
  if (listA.data.total !== 1) fail('A did not receive B link');
  console.log('8. A pulled B link ok');

  const gitConfig = fs.readFileSync(path.join(base, 'data-a', '.git', 'config'), 'utf8');
  if (gitConfig.includes(token)) fail('token leaked into .git/config');
  console.log('9. token not persisted in .git/config ok');

  const cloneDir = path.join(base, 'fresh-clone');
  execFileSync(
    'git',
    [
      '-c',
      `http.extraheader=Authorization: Basic ${Buffer.from(
        `${process.env.GIT_USERNAME ?? 'x-access-token'}:${token}`
      ).toString('base64')}`,
      'clone',
      '--depth',
      '1',
      repoUrl,
      cloneDir,
    ],
    { stdio: 'ignore' }
  );
  const tree = execFileSync('git', ['-C', cloneDir, 'ls-files'], { encoding: 'utf8' })
    .trim()
    .split('\n');
  const jsonlFile = tree.find((file) => /^links\/\d+\.jsonl$/.test(file));
  const jsonl = fs.readFileSync(path.join(cloneDir, jsonlFile), 'utf8');
  if (!jsonl.includes(urlA) || !jsonl.includes(urlB)) fail('jsonl content missing new links');
  const archiveFile = tree.find((file) => /^archives\/.+\.html\.gz$/.test(file));
  if (!archiveFile) fail('fresh clone missing archive');
  const archiveBytes = fs.statSync(path.join(cloneDir, archiveFile)).size;
  console.log(`10. fresh clone ok (${tree.length} files, archive ${Math.round(archiveBytes / 1024)} KB)`);

  console.log('\nGITHUB E2E TEST PASSED');
} catch (err) {
  console.error(String(err));
  console.error(logs());
  process.exitCode = 1;
} finally {
  a.proc.kill();
  b.proc.kill();
  await sleep(500);
  fs.rmSync(base, { recursive: true, force: true });
}
