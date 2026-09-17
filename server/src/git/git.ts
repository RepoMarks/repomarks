import { spawn } from 'node:child_process';
import { Mutex } from '../util/misc.js';

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
    this.secrets = [opts.token ?? '', opts.sshKeyPath ?? ''].filter(Boolean);
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
    if (!this.opts.token) return [];
    const user = this.opts.username || 'x-access-token';
    const basic = Buffer.from(`${user}:${this.opts.token}`).toString('base64');
    return ['-c', `http.extraheader=Authorization: Basic ${basic}`];
  }

  run(args: string[], opts: { allowFail?: boolean } = {}): Promise<RunResult> {
    return this.mutex.run(() => this.exec(args, opts));
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
