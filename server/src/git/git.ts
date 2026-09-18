import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Mutex, sleep } from '../util/misc.js';
import { logger } from '../logger.js';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface GitOptions {
  cwd: string;
  token?: string;
  username?: string;
  sshKeyPath?: string;
  remoteUrl?: string;
  authorName: string;
  authorEmail: string;
}

function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length > 3) out = out.split(s).join('***');
  }
  return out;
}

export class Git {
  private secrets: string[];
  /** 所有 git 进程串行执行，避免 index.lock 冲突（例如状态轮询与提交同时发生） */
  private mutex = new Mutex();

  constructor(private opts: GitOptions) {
    const secrets = [opts.token ?? '', opts.sshKeyPath ?? ''].filter(Boolean);
    if (opts.token) {
      const user = opts.username || 'x-access-token';
      secrets.push(Buffer.from(`${user}:${opts.token}`).toString('base64'));
    }
    this.secrets = secrets;
  }

  private env(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
      GCM_INTERACTIVE: 'never',
    };
    if (this.opts.sshKeyPath) {
      const key = this.opts.sshKeyPath.replace(/\\/g, '/');
      env.GIT_SSH_COMMAND = `ssh -i "${key}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
    }
    return env;
  }

  private authArgs(): string[] {
    // 低速传输 60 秒后主动断开，避免网络异常时卡死
    const args = ['-c', 'http.lowSpeedLimit=1000', '-c', 'http.lowSpeedTime=60'];
    if (!this.opts.token) return args;
    const user = this.opts.username || 'x-access-token';
    const basic = Buffer.from(`${user}:${this.opts.token}`).toString('base64');
    // 认证头必须限定在仓库主机：否则 git-lfs 上传对象时会把 Authorization
    // 一起发给 S3 等存储端点，导致预签名 URL 认证失败
    let headerKey = 'http.extraheader';
    try {
      const parsed = new URL(this.opts.remoteUrl ?? '');
      if (parsed.protocol === 'https:') headerKey = `http.${parsed.origin}/.extraheader`;
    } catch {
      /* 无法解析时退回全局，SSH 模式不会走到这里 */
    }
    args.push('-c', `${headerKey}=Authorization: Basic ${basic}`);
    return args;
  }

  run(args: string[], opts: { allowFail?: boolean } = {}): Promise<RunResult> {
    return this.mutex.run(async () => {
      try {
        return await this.exec(args, opts);
      } catch (err) {
        if (!/index\.lock/i.test((err as Error).message)) throw err;
        await this.recoverIndexLock();
        return this.exec(args, opts);
      }
    });
  }

  /** 进程被杀等情况会残留 index.lock：确认锁已陈旧后清理并重试一次 */
  private async recoverIndexLock(): Promise<void> {
    const lockPath = path.join(this.opts.cwd, '.git', 'index.lock');
    await sleep(700);
    try {
      const stat = await fsp.stat(lockPath);
      if (Date.now() - stat.mtimeMs < 30_000) {
        logger.warn('检测到较新的 .git/index.lock，等待后重试');
        return;
      }
      await fsp.rm(lockPath, { force: true });
      logger.warn('已清理陈旧的 .git/index.lock 并重试');
    } catch {
      /* 锁已被释放，直接重试即可 */
    }
  }

  private exec(args: string[], opts: { allowFail?: boolean } = {}): Promise<RunResult> {
    const full = [...this.authArgs(), ...args];
    return new Promise((resolve, reject) => {
      const child = spawn('git', full, {
        cwd: this.opts.cwd,
        env: this.env(),
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        const result: RunResult = { code: code ?? 0, stdout, stderr };
        if (result.code !== 0 && !opts.allowFail) {
          const cmd = redact(full.join(' '), this.secrets);
          const detail = redact(stderr.trim() || stdout.trim(), this.secrets);
          reject(new Error(`git ${cmd} 执行失败 (exit ${result.code}): ${detail}`));
          return;
        }
        resolve(result);
      });
    });
  }

  async text(args: string[]): Promise<string> {
    const res = await this.run(args);
    return res.stdout.trim();
  }

  async tryText(args: string[]): Promise<string | null> {
    const res = await this.run(args, { allowFail: true });
    return res.code === 0 ? res.stdout.trim() : null;
  }

  async initRepo(branch: string): Promise<void> {
    await this.run(['init', '-b', branch]);
    await this.run(['config', 'user.name', this.opts.authorName]);
    await this.run(['config', 'user.email', this.opts.authorEmail]);
    await this.run(['config', 'core.autocrlf', 'false']);
    await this.run(['config', 'core.safecrlf', 'false']);
    await this.run(['config', 'merge.conflictStyle', 'merge']);
    await this.run(['config', 'commit.gpgsign', 'false']);
  }

  async ensureIdentity(): Promise<void> {
    await this.run(['config', 'user.name', this.opts.authorName]);
    await this.run(['config', 'user.email', this.opts.authorEmail]);
  }
}
