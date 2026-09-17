import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitRepo } from '../src/git/repo.js';
import { DataService } from '../src/services/service.js';
import { loadConfig } from '../src/config.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const base = path.join(os.tmpdir(), `gitmarks-smoke-${Date.now()}`);
  const remote = path.join(base, 'remote.git');
  fs.mkdirSync(remote, { recursive: true });
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], { stdio: 'ignore' });
  console.log('bare remote:', remote);

  process.env.REPO_URL = remote;
  process.env.DATA_DIR = path.join(base, 'data-a');
  process.env.AUTH_PASSWORD = 'test';
  process.env.ARCHIVE_ENGINE = 'basic';
  process.env.GIT_BRANCH = 'main';
  process.env.GIT_TOKEN = '';
  const config = loadConfig();

  const a = new DataService(config);
  await a.init();
  console.log('service A initialized, head:', (await a.repo.status()).head);

  const link = await a.addLink({
    url: 'https://example.com',
    title: '示例链接',
    tags: ['测试', 'demo'],
    fetchMetadata: false,
  });
  console.log('added link:', link.id, link.title);

  const collection = await a.createCollection({ name: '技术' });
  await a.updateLink(link.id, { collectionId: collection.id, description: '一条测试链接' });
  console.log('updated link, collection:', collection.name);

  await a.archiveLink(link.id);
  for (let i = 0; i < 40; i++) {
    const current = a.requireLink(link.id);
    if (current.archiveStatus !== 'pending') break;
    await sleep(250);
  }
  const archived = a.requireLink(link.id);
  console.log('archive status:', archived.archiveStatus, archived.archiveEngine, archived.archiveSize);
  if (archived.archiveStatus !== 'ok') throw new Error(`存档失败: ${archived.archiveError}`);
  const html = await a.readArchive(link.id);
  if (!html.includes('<')) throw new Error('存档内容异常');

  const search = a.search({ q: '测试' });
  console.log('search hits:', search.total);
  if (search.total !== 1) throw new Error('搜索失败');

  const importResult = await a.importBookmarks({
    html: `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
      <DT><H3>开发</H3>
      <DL><p>
        <DT><A HREF="https://nodejs.org" ADD_DATE="1600000000">Node.js</A>
        <DT><A HREF="https://example.com">重复链接</A>
      </DL><p>
    </DL><p>`,
  });
  console.log('import:', JSON.stringify(importResult));
  if (importResult.linksAdded !== 1 || importResult.linksSkipped !== 1) throw new Error('导入结果不符');

  const syncA = await a.runSync();
  console.log('sync A:', JSON.stringify(syncA));
  const remoteLog = execFileSync('git', ['--git-dir', remote, 'log', '--oneline'], { encoding: 'utf8' });
  console.log('remote commits:\n' + remoteLog.trim());

  const configB = { ...config, dataDir: path.join(base, 'data-b') };
  const b = new DataService(configB);
  await b.init();
  console.log('service B links:', b.store.links.size, 'collections:', b.store.collections.size);
  if (b.store.links.size !== 2) throw new Error('B 未拉到 A 的数据');

  const linkB = await b.addLink({
    url: 'https://www.rust-lang.org',
    title: 'Rust',
    fetchMetadata: false,
  });
  await b.runSync();
  const syncA2 = await a.runSync();
  console.log('sync A after B pushed:', JSON.stringify(syncA2));
  if (a.store.links.size !== 3) throw new Error('A 未拉到 B 新增的链接');
  console.log('link from B visible in A:', Boolean(a.store.findById(linkB.id)));

  const exported = await a.exportData();
  console.log('export:', exported.links.length, 'links,', exported.collections.length, 'collections');

  // 回归测试：两个实例同时在空仓库上首次初始化（产生无关历史）后必须能合并
  const raceRemote = path.join(base, 'race.git');
  fs.mkdirSync(raceRemote, { recursive: true });
  execFileSync('git', ['init', '--bare', '-b', 'main', raceRemote], { stdio: 'ignore' });
  const dirA = path.join(base, 'race-a');
  const dirB = path.join(base, 'race-b');
  const repoA = new GitRepo(dirA, raceRemote, 'main', 'test', 'test@local');
  const repoB = new GitRepo(dirB, raceRemote, 'main', 'test', 'test@local');
  await repoA.init();
  await repoB.init();
  fs.mkdirSync(path.join(dirA, 'links'), { recursive: true });
  fs.mkdirSync(path.join(dirB, 'links'), { recursive: true });
  fs.writeFileSync(path.join(dirA, 'meta.json'), '{"side":"a"}\n');
  fs.writeFileSync(path.join(dirA, 'links', '0000.jsonl'), '{"id":"aaa","url":"https://a.example"}\n');
  await repoA.commit(['meta.json', 'links/0000.jsonl'], 'init a');
  await repoA.sync();
  fs.writeFileSync(path.join(dirB, 'meta.json'), '{"side":"b"}\n');
  fs.writeFileSync(path.join(dirB, 'links', '0000.jsonl'), '{"id":"bbb","url":"https://b.example"}\n');
  await repoB.commit(['meta.json', 'links/0000.jsonl'], 'init b');
  await repoB.sync();
  const merged = fs.readFileSync(path.join(dirB, 'links', '0000.jsonl'), 'utf8');
  if (!merged.includes('aaa') || !merged.includes('bbb')) {
    throw new Error(`无关历史合并失败: ${merged}`);
  }
  const repoAReload = new GitRepo(dirA, raceRemote, 'main', 'test', 'test@local');
  await repoAReload.init();
  await repoAReload.sync();
  const aFiles = fs.readdirSync(path.join(dirA, 'links'));
  console.log('unrelated-history merge ok, A sees:', aFiles.join(','));
  if (!fs.readFileSync(path.join(dirA, 'links', '0000.jsonl'), 'utf8').includes('bbb')) {
    throw new Error('A 未合并 B 的记录');
  }

  await a.deleteLink(link.id);
  await a.runSync();
  console.log('deleted, store A links:', a.store.links.size);
  const remoteShow = execFileSync('git', ['--git-dir', remote, 'show', 'main:meta.json'], {
    encoding: 'utf8',
  });
  console.log('remote meta.json:', remoteShow.trim());

  fs.rmSync(base, { recursive: true, force: true });
  console.log('\nSMOKE TEST PASSED');
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
