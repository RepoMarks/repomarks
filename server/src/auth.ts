import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const COOKIE_NAME = 'repomarks_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

function safeEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(digest(a), digest(b));
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(value);
      } catch {
        result[key] = value;
      }
    }
  }
  return result;
}

export class Auth {
  private failures = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private password: string,
    private secret: string
  ) {}

  get enabled(): boolean {
    return this.password.length > 0;
  }

  private sign(payload: string): string {
    return crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  private sessionToken(): string {
    const expires = String(Date.now() + SESSION_MS);
    return `${expires}.${this.sign(expires)}`;
  }

  private validToken(token: string | undefined): boolean {
    if (!token) return false;
    const separator = token.lastIndexOf('.');
    if (separator <= 0) return false;
    const expires = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    if (!/^\d+$/.test(expires) || !safeEqual(signature, this.sign(expires))) return false;
    return Number(expires) > Date.now();
  }

  verifyPassword(candidate: string): boolean {
    if (!this.enabled) return true;
    return safeEqual(candidate ?? '', this.password);
  }

  isAuthenticated(req: Request): boolean {
    if (!this.enabled) return true;
    return this.validToken(req.cookies?.[COOKIE_NAME] ?? parseCookies(req.headers.cookie)[COOKIE_NAME]);
  }

  login(res: Response): void {
    res.cookie(COOKIE_NAME, this.sessionToken(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: SESSION_MS,
      path: '/',
    });
  }

  logout(res: Response): void {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }

  checkRateLimit(ip: string): boolean {
    const entry = this.failures.get(ip);
    if (!entry) return true;
    if (Date.now() > entry.resetAt) {
      this.failures.delete(ip);
      return true;
    }
    return entry.count < 10;
  }

  recordFailure(ip: string): void {
    const entry = this.failures.get(ip);
    if (!entry || Date.now() > entry.resetAt) {
      this.failures.set(ip, { count: 1, resetAt: Date.now() + 10 * 60 * 1000 });
      return;
    }
    entry.count++;
  }

  middleware = (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path;
    // 前端静态资源不需要登录，由页面自行展示登录框
    if (!path.startsWith('/api')) {
      next();
      return;
    }
    if (!this.enabled) {
      next();
      return;
    }
    if (path === '/api/auth/login' || path === '/api/auth/session') {
      next();
      return;
    }
    if (this.isAuthenticated(req)) {
      next();
      return;
    }
    res.status(401).json({ error: '未登录' });
  };
}

export { COOKIE_NAME };
