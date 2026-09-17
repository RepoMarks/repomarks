import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'repomarks-http-'));
const remote = path.join(base, 'remote.git');
execFileSync('git', ['init', '--bare', '-b', 'main', remote]);

const port = Number(process.env.SMOKE_PORT ?? 3126);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/dist/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    REPO_URL: remote,
    DATA_DIR: path.join(base, 'data'),
    PORT: String(port),
    AUTH_PASSWORD: 'secret',
    ARCHIVE_ENGINE: 'basic',
    SYNC_INTERVAL: '0',
    GIT_TOKEN: '',
    GIT_BRANCH: 'main',
  },
});

let logs = '';
server.stdout.on('data', (d) => (logs += d.toString()));
server.stderr.on('data', (d) => (logs += d.toString()));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (msg) => {
  throw new Error(`ASSERT FAILED: ${msg}`);
};

let cookie = '';
async function req(pathname, options = {}) {
  const res = await fetch(baseUrl + pathname, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(options.headers ?? {}),
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
}

try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/auth/session`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  if (!ready) fail(`server not ready. logs:\n${logs}`);
  console.log('1. server up');

  const session = await req('/api/auth/session');
  if (!session.data.enabled) fail('auth should be enabled');
  if (session.data.authenticated) fail('should not be authenticated');
  console.log('2. session endpoint ok');

  const unauth = await req('/api/links');
  if (unauth.res.status !== 401) fail(`expected 401, got ${unauth.res.status}`);
  console.log('3. auth guard ok');

  const login = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password: 'secret' }),
  });
  if (login.res.status !== 200) fail(`login failed: ${login.text}`);
  const setCookie = login.res.headers.getSetCookie?.() ?? [login.res.headers.get('set-cookie')];
  cookie = setCookie[0].split(';')[0];
  console.log('4. login ok');

  const created = await req('/api/links', {
    method: 'POST',
    body: JSON.stringify({
      url: 'https://example.com',
      title: '示例站点',
      tags: ['测试', 'demo'],
      fetchMetadata: false,
    }),
  });
  if (created.res.status !== 201) fail(`add link failed: ${created.text}`);
  const link = created.data;
  console.log('5. add link ok:', link.id);

  const collection = await req('/api/collections', {
    method: 'POST',
    body: JSON.stringify({ name: '阅读' }),
  });
  if (collection.res.status !== 201) fail(`create collection failed: ${collection.text}`);
  const patched = await req(`/api/links/${link.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ collectionId: collection.data.id }),
  });
  if (patched.data.collectionId !== collection.data.id) fail('patch collection failed');
  console.log('6. collection + patch ok');

  const shared = await req(`/api/collections/${collection.data.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isPublic: true, description: 'smoke share' }),
  });
  if (!shared.data.isPublic || !shared.data.slug) fail(`enable sharing failed: ${shared.text}`);
  const sharePage = await fetch(`${baseUrl}/share/${shared.data.slug}`);
  const shareHtml = await sharePage.text();
  if (sharePage.status !== 200 || !shareHtml.includes('smoke share')) {
    fail(`share page failed: ${sharePage.status}`);
  }
  const feed = await fetch(`${baseUrl}/share/${shared.data.slug}/feed.xml`);
  const feedXml = await feed.text();
  if (feed.status !== 200 || !feedXml.includes('<rss')) fail('rss feed failed');
  const hiddenShare = await fetch(`${baseUrl}/share/doesnotexist`);
  if (hiddenShare.status !== 404) fail('unknown share should 404');
  console.log(`6b. public sharing + RSS ok (slug=${shared.data.slug})`);

  const dupe = await req('/api/links', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com', title: '重复', fetchMetadata: false }),
  });
  if (dupe.res.status !== 409) fail(`expected 409 duplicate, got ${dupe.res.status}`);
  console.log('7. duplicate rejected ok');

  const archiveStart = await req(`/api/links/${link.id}/archive`, { method: 'POST' });
  if (archiveStart.res.status !== 202) fail(`archive start failed: ${archiveStart.text}`);
  let archived = null;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const current = await req(`/api/links/${link.id}`);
    if (current.data.archiveStatus !== 'pending') {
      if (current.data.archiveStatus !== 'ok') fail(`archive failed: ${current.data.archiveError}`);
      archived = current.data;
      break;
    }
  }
  if (!archived) fail('archive timed out');
  console.log(`8. archive ok (${archived.archiveEngine}, ${archived.archiveSize} bytes)`);

  const archivePage = await fetch(`${baseUrl}/api/links/${link.id}/archive`, {
    headers: { cookie },
  });
  const archiveHtml = await archivePage.text();
  if (archivePage.status !== 200) fail(`archive http ${archivePage.status}`);
  if (!archiveHtml.includes('repomarks-archive') && archived.archiveEngine !== 'singlefile') {
    fail('archive marker missing');
  }
  const readablePage = await fetch(`${baseUrl}/api/links/${link.id}/archive?format=readable`, {
    headers: { cookie },
  });
  const readableText = await readablePage.text();
  if (readablePage.status !== 200) fail(`readable http ${readablePage.status}`);
  if (readableText.length < 20) fail('readable archive empty');
  console.log('9. archive served ok (html + readable)');

  const highlight = await req(`/api/links/${link.id}/highlights`, {
    method: 'POST',
    body: JSON.stringify({ text: 'Example Domain', color: 'green' }),
  });
  if (highlight.res.status !== 201) fail(`add highlight failed: ${highlight.text}`);
  const highlightId = highlight.data.highlights?.[0]?.id;
  if (!highlightId) fail('highlight missing in response');
  const noted = await req(`/api/links/${link.id}/highlights/${highlightId}`, {
    method: 'PATCH',
    body: JSON.stringify({ note: 'smoke note' }),
  });
  if (noted.data.highlights?.[0]?.note !== 'smoke note') fail('highlight note update failed');
  const highlightSearch = await req('/api/links?q=smoke%20note');
  if (highlightSearch.data.total !== 1) fail('highlight search failed');
  const removed = await req(`/api/links/${link.id}/highlights/${highlightId}`, {
    method: 'DELETE',
  });
  if ((removed.data.highlights ?? []).length !== 0) fail('highlight delete failed');
  console.log('9b. highlights CRUD + search ok');

  const imported = await req('/api/import', {
    method: 'POST',
    body: JSON.stringify({
      json: '[{"url":"https://nodejs.org","title":"Node","folder":"技术"}]',
    }),
  });
  if (imported.data.linksAdded !== 1) fail(`import failed: ${imported.text}`);
  console.log('10. import ok');

  const search = await req('/api/links?q=demo');
  if (search.data.total !== 1) fail(`search failed: ${search.text}`);
  const filtered = await req(`/api/links?collection=${collection.data.id}`);
  if (filtered.data.total !== 1) fail('collection filter failed');
  console.log('11. search + filter ok');

  const status = await req('/api/status');
  if (status.data.stats.links !== 2) fail(`expected 2 links, got ${status.data.stats.links}`);
  console.log(
    `12. status ok (links=${status.data.stats.links}, archived=${status.data.stats.archived}, engine=${status.data.archive.engine})`
  );

  const sync = await req('/api/sync', { method: 'POST' });
  if (!sync.data.ok) fail(`sync failed: ${sync.text}`);
  const remoteLog = execFileSync('git', ['--git-dir', remote, 'log', '--oneline'], {
    encoding: 'utf8',
  });
  const commitCount = remoteLog.trim().split('\n').length;
  if (commitCount < 6) fail(`expected >=6 remote commits, got ${commitCount}`);
  console.log(`13. sync/push ok, remote commits: ${commitCount}`);

  const index = await fetch(`${baseUrl}/`);
  const indexHtml = await index.text();
  if (!indexHtml.includes('RepoMarks')) fail('frontend not served');
  const spa = await fetch(`${baseUrl}/settings`);
  const spaHtml = await spa.text();
  if (!spaHtml.includes('id="root"')) fail('SPA fallback broken');
  console.log('14. frontend + SPA fallback ok');

  const exported = await req('/api/export');
  if (exported.data.links.length !== 2) fail('export failed');
  console.log('15. export ok');

  const badUrl = await req('/api/links', {
    method: 'POST',
    body: JSON.stringify({ url: 'http://127.0.0.1:1234', fetchMetadata: false }),
  });
  if (badUrl.res.status !== 400) fail('private url should be rejected');
  console.log('16. SSRF guard ok');

  const bulk = await req('/api/links/bulk', {
    method: 'POST',
    body: JSON.stringify({ ids: [link.id], action: 'pin' }),
  });
  if (bulk.data.updated !== 1) fail(`bulk pin failed: ${bulk.text}`);
  const afterBulkTags = await req('/api/links/bulk', {
    method: 'POST',
    body: JSON.stringify({ ids: [link.id], action: 'addTags', tags: ['bulk-test'] }),
  });
  if (!afterBulkTags.data.updated) fail('bulk addTags failed');
  const pinned = await req(`/api/links/${link.id}`);
  if (!pinned.data.pinned) fail('pin not applied');
  if (!pinned.data.tags.includes('bulk-test')) fail('bulk tags not applied');
  console.log('16b. bulk actions ok');

  const logout = await req('/api/auth/logout', { method: 'POST' });
  if (logout.res.status !== 200) fail('logout failed');
  cookie = '';
  const afterLogout = await req('/api/links');
  if (afterLogout.res.status !== 401) fail('logout did not clear session');
  console.log('17. logout ok');

  console.log('\nHTTP SMOKE TEST PASSED');
} catch (err) {
  console.error(String(err));
  console.error('--- server logs ---');
  console.error(logs);
  process.exitCode = 1;
} finally {
  server.kill();
  await sleep(300);
  fs.rmSync(base, { recursive: true, force: true });
}
