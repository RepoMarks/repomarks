import fs from 'node:fs';
import path from 'node:path';
import { Git } from './git.js';
import { mergeJsonArray, mergeJsonl } from './merge.js';
import { logger } from '../logger.js';

export interface RepoStatus {
  branch: string;
  remoteUrl: string;
  head: string | null;
  lastCommit: { sha: string; message: string; date: string; author: string } | null;
  ahead: number;
  behind: number;
  dirty: boolean;
  hasRemoteBranch: boolean;
}

export interface SyncOutcome {
  changed: boolean;
  pushed: boolean;
  pulled: boolean;
  head: string | null;
}

function stripCredentials(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function isNonFastForward(text: string): boolean {
  return /non-fast-forward|fetch first|\[rejected\]|Updates were rejected|cannot lock ref/i.test(text);
}

export class GitRepo {
  private git: Git;
  readonly remoteUrl: string;

  constructor(
    private dir: string,
    remoteUrl: string,
    private branch: string,
    authorName: string,
    authorEmail: string,
    token?: string,
    username?: string,
    sshKeyPath?: string
  ) {
    this.remoteUrl = stripCredentials(remoteUrl);
    this.git = new Git({
      cwd: dir,
      token,
      username,
      sshKeyPath,
      authorName,
      authorEmail,
    });
  }

  get directory(): string {
    return this.dir;
  }

  async init(): Promise<void> {
    fs.mkdirSync(this.dir, { recursive: true });
    const isRepo = fs.existsSync(path.join(this.dir, '.git'));
    if (!isRepo) {
      await this.git.initRepo(this.branch);
      await this.git.run(['remote', 'add', 'origin', this.remoteUrl]);
      logger.info(`已初始化本地数据仓库 ${this.dir}`);
    } else {
      const currentRemote = await this.git.tryText(['remote', 'get-url', 'origin']);
      if (currentRemote !== this.remoteUrl) {
        if (currentRemote) {
          await this.git.run(['remote', 'set-url', 'origin', this.remoteUrl]);
        } else {
          await this.git.run(['remote', 'add', 'origin', this.remoteUrl]);
        }
      }
      await this.git.ensureIdentity();
    }

    await this.fetch();
    const hasRemote = await this.refExists(this.remoteRef());
    const hasLocal = await this.hasCommits();
    if (hasRemote && !hasLocal) {
      await this.git.run(['reset', '--hard', `origin/${this.branch}`]);
      logger.info(`已从远端拉取 ${this.branch} 分支`);
    }
  }

  private remoteRef(): string {
    return `refs/remotes/origin/${this.branch}`;
  }

  async fetch(): Promise<boolean> {
    const res = await this.git.run(['fetch', 'origin', this.branch], { allowFail: true });
    if (res.code === 0) return true;
    const text = res.stderr + res.stdout;
    if (/couldn't find remote ref|could not find remote ref/i.test(text)) return false;
    throw new Error(`git fetch 失败: ${text.trim()}`);
  }

  async refExists(ref: string): Promise<boolean> {
    const res = await this.git.run(['rev-parse', '--verify', '--quiet', ref], { allowFail: true });
    return res.code === 0;
  }

  async hasCommits(): Promise<boolean> {
    return this.refExists('HEAD');
  }

  async head(): Promise<string | null> {
    const res = await this.git.run(['rev-parse', 'HEAD'], { allowFail: true });
    return res.code === 0 ? res.stdout.trim() : null;
  }

  private async count(range: string): Promise<number> {
    const res = await this.git.run(['rev-list', '--count', range], { allowFail: true });
    if (res.code !== 0) return 0;
    return Number.parseInt(res.stdout.trim(), 10) || 0;
  }

  async isDirty(): Promise<boolean> {
    // --no-optional-locks: 状态查询不写索引，避免与并发提交抢 index.lock
    const out = await this.git.text(['--no-optional-locks', 'status', '--porcelain']);
    return out.length > 0;
  }

  async commit(paths: string[], message: string): Promise<string | null> {
    if (paths.length > 0) {
      await this.git.run(['add', '--', ...paths]);
    }
    const res = await this.git.run(['commit', '-m', message, '--no-verify'], { allowFail: true });
    if (res.code !== 0) {
      const text = res.stdout + res.stderr;
      if (/nothing to commit|no changes added|nothing added to commit/i.test(text)) return null;
      throw new Error(`git commit 失败: ${text.trim()}`);
    }
    return this.head();
  }

  async commitAll(message: string): Promise<string | null> {
    await this.git.run(['add', '-A']);
    return this.commit([], message);
  }

  async status(): Promise<RepoStatus> {
    const head = await this.head();
    let lastCommit: RepoStatus['lastCommit'] = null;
    if (head) {
      const out = await this.git.text(['log', '-1', '--format=%H%x1f%s%x1f%aI%x1f%an']);
      const [sha, message, date, author] = out.split('\x1f');
      lastCommit = { sha, message, date, author };
    }
    const hasRemote = await this.refExists(this.remoteRef());
    let ahead = 0;
    let behind = 0;
    if (head && hasRemote) {
      ahead = await this.count(`origin/${this.branch}..HEAD`);
      behind = await this.count(`HEAD..origin/${this.branch}`);
    }
    const dirty = await this.isDirty();
    return {
      branch: this.branch,
      remoteUrl: this.remoteUrl,
      head,
      lastCommit,
      ahead,
      behind,
      dirty,
      hasRemoteBranch: hasRemote,
    };
  }

  /** 先同步远端再推送本地提交；若远端有新提交则合并（支持语义合并冲突） */
  async sync(): Promise<SyncOutcome> {
    const before = await this.head();
    await this.fetch();
    const hasRemote = await this.refExists(this.remoteRef());
    const hasLocal = before !== null;
    let pushed = false;
    let pulled = false;

    if (!hasRemote) {
      if (hasLocal) {
        await this.pushWithMerge();
        pushed = true;
      }
    } else if (!hasLocal) {
      await this.git.run(['reset', '--hard', `origin/${this.branch}`]);
      pulled = true;
    } else {
      const ahead = await this.count(`origin/${this.branch}..HEAD`);
      const behind = await this.count(`HEAD..origin/${this.branch}`);
      if (ahead > 0) {
        await this.pushWithMerge();
        pushed = true;
      } else if (behind > 0) {
        await this.git.run(['merge', '--ff-only', `origin/${this.branch}`]);
        pulled = true;
      }
    }

    const after = await this.head();
    return { changed: before !== after, pushed, pulled, head: after };
  }

  private async pushWithMerge(attempt = 0): Promise<void> {
    const res = await this.git.run(['push', 'origin', `HEAD:refs/heads/${this.branch}`], {
      allowFail: true,
    });
    if (res.code === 0) return;

    const text = res.stderr + res.stdout;
    if (!isNonFastForward(text)) {
      throw new Error(`git push 失败: ${text.trim()}`);
    }
    if (attempt >= 5) {
      throw new Error(`git push 连续被拒绝 ${attempt} 次，请检查是否有其他客户端在写入: ${text.trim()}`);
    }

    logger.warn('远端有新提交，正在合并后重试推送…');
    await this.fetch();
    // --allow-unrelated-histories: 处理两个实例同时首次初始化的场景
    const merge = await this.git.run(
      ['merge', '--no-edit', '--allow-unrelated-histories', `origin/${this.branch}`],
      { allowFail: true }
    );
    if (merge.code !== 0) {
      const conflicts = await this.unmergedFiles();
      if (conflicts.length === 0) {
        throw new Error(`git merge 失败: ${(merge.stderr + merge.stdout).trim()}`);
      }
      logger.warn(`检测到 ${conflicts.length} 个冲突文件，执行语义合并: ${conflicts.join(', ')}`);
      await this.resolveConflicts(conflicts);
      const commit = await this.git.run(['commit', '--no-edit', '--no-verify'], { allowFail: true });
      if (commit.code !== 0 && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
        throw new Error(`合并提交失败: ${(commit.stderr + commit.stdout).trim()}`);
      }
    }
    await this.pushWithMerge(attempt + 1);
  }

  private async unmergedFiles(): Promise<string[]> {
    const out = await this.git.text(['diff', '--name-only', '--diff-filter=U']);
    return out
      .split('\n')
      .map((line) => line.trim().replace(/\\/g, '/'))
      .filter(Boolean);
  }

  private async fileAtStage(stage: 2 | 3, file: string): Promise<string> {
    const res = await this.git.run(['show', `:${stage}:${file}`], { allowFail: true });
    return res.code === 0 ? res.stdout : '';
  }

  private async resolveConflicts(files: string[]): Promise<void> {
    for (const file of files) {
      if (/^links\/[^/]+\.jsonl$/.test(file)) {
        const ours = await this.fileAtStage(2, file);
        const theirs = await this.fileAtStage(3, file);
        fs.writeFileSync(path.join(this.dir, file), mergeJsonl(ours, theirs), 'utf8');
      } else if (file === 'collections.json') {
        const ours = await this.fileAtStage(2, file);
        const theirs = await this.fileAtStage(3, file);
        fs.writeFileSync(path.join(this.dir, file), mergeJsonArray(ours, theirs), 'utf8');
      } else {
        await this.git.run(['checkout', '--ours', '--', file], { allowFail: true });
      }
      await this.git.run(['add', '--', file]);
    }
  }
}
