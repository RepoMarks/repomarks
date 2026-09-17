type Level = 'debug' | 'info' | 'warn' | 'error';

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(level: Level, msg: string, extra?: unknown): void {
  const line = `[${ts()}] ${level.toUpperCase().padEnd(5)} ${msg}`;
  if (level === 'error') console.error(line, extra ?? '');
  else if (level === 'warn') console.warn(line, extra ?? '');
  else console.log(line, extra ?? '');
}

export const logger = {
  debug: (msg: string, extra?: unknown) => {
    if (process.env.DEBUG) log('debug', msg, extra);
  },
  info: (msg: string, extra?: unknown) => log('info', msg, extra),
  warn: (msg: string, extra?: unknown) => log('warn', msg, extra),
  error: (msg: string, extra?: unknown) => log('error', msg, extra),
};
