/**
 * JSONL / JSON 数组的语义合并。
 * 单用户多端并发写入时，git 可能在同一分片文件产生冲突：
 * 这里按记录 id 求并集，同 id 以 updatedAt 较新者为准。
 */

interface HasId {
  id?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
}

function newer(a: HasId, b: HasId): boolean {
  const at = typeof a.updatedAt === 'string' ? a.updatedAt : '';
  const bt = typeof b.updatedAt === 'string' ? b.updatedAt : '';
  if (at && bt && at !== bt) return at > bt;
  const ac = typeof a.createdAt === 'string' ? a.createdAt : '';
  const bc = typeof b.createdAt === 'string' ? b.createdAt : '';
  if (ac && bc && ac !== bc) return ac > bc;
  return false;
}

function parseLines(content: string): Array<Record<string, unknown> | null> {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    });
}

/** 合并两个 JSONL 文本（ours 优先保持顺序） */
export function mergeJsonl(ours: string, theirs: string): string {
  const byId = new Map<string, Record<string, unknown>>();
  const anonymous: string[] = [];
  const order: string[] = [];

  const collect = (content: string): void => {
    for (const line of parseLines(content)) {
      if (!line) continue;
      const id = typeof line.id === 'string' ? line.id : '';
      if (!id) {
        anonymous.push(JSON.stringify(line));
        continue;
      }
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, line);
        order.push(id);
      } else if (newer(line as HasId, existing as HasId)) {
        byId.set(id, line);
      }
    }
  };

  collect(ours);
  collect(theirs);

  const lines = order.map((id) => JSON.stringify(byId.get(id)));
  lines.push(...anonymous);
  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

/** 合并两个 JSON 数组文本（collections.json），同样按 id 去重 */
export function mergeJsonArray(ours: string, theirs: string): string {
  const parse = (text: string): Array<Record<string, unknown>> => {
    try {
      const value = JSON.parse(text);
      return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  };

  const byId = new Map<string, Record<string, unknown>>();
  const order: string[] = [];
  const rest: Array<Record<string, unknown>> = [];
  for (const item of [...parse(ours), ...parse(theirs)]) {
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id) {
      rest.push(item);
      continue;
    }
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, item);
      order.push(id);
    } else if (newer(item as HasId, existing as HasId)) {
      byId.set(id, item);
    }
  }
  const merged = [...order.map((id) => byId.get(id)), ...rest];
  return JSON.stringify(merged, null, 2) + '\n';
}
