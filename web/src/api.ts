import { translate, type Lang } from './i18n';
import type {
  Collection,
  ImportSummary,
  LinkRecord,
  MetadataPreview,
  SearchResult,
  StatusResponse,
  TagCount,
} from './types';

function lang(): Lang {
  return document.documentElement.lang === 'en' ? 'en' : 'zh';
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const UNAUTHORIZED_EVENT = 'repomarks:unauthorized';
const BASE_URL = import.meta.env.BASE_URL ?? '/';
const API_PREFIX = `${BASE_URL.replace(/\/$/, '')}/api`;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'content-type': 'application/json',
        'x-ui-language': document.documentElement.lang === 'en' ? 'en' : 'zh',
        ...(options.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ApiError(0, translate(lang(), '网络错误: {msg}', { msg: (err as Error).message }));
  }
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(401, translate(lang(), '未登录'));
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : res.statusText;
    const details =
      data && typeof data === 'object' && 'details' in data
        ? ((data as { details?: Record<string, unknown> }).details ?? undefined)
        : undefined;
    throw new ApiError(res.status, message || `HTTP ${res.status}`, details);
  }
  return data as T;
}

export const api = {
  onUnauthorized(handler: () => void): () => void {
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  },

  session: () => request<{ enabled: boolean; authenticated: boolean }>('/auth/session'),

  login: (password: string) =>
    request<{ ok: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  status: () => request<StatusResponse>('/status'),

  sync: () =>
    request<{ ok: boolean; changed: boolean; pushed: boolean; pulled: boolean; head: string | null }>(
      '/sync',
      { method: 'POST' }
    ),

  searchLinks: (params: Record<string, string | number | boolean | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === '') continue;
      search.set(key, String(value));
    }
    return request<SearchResult>(`/links?${search.toString()}`);
  },

  getLink: (id: string) => request<LinkRecord>(`/links/${id}`),

  addLink: (input: Record<string, unknown>) =>
    request<LinkRecord>('/links', { method: 'POST', body: JSON.stringify(input) }),

  updateLink: (id: string, patch: Record<string, unknown>) =>
    request<LinkRecord>(`/links/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteLink: (id: string) => request<{ ok: boolean }>(`/links/${id}`, { method: 'DELETE' }),

  bulkUpdate: (
    ids: string[],
    action: string,
    payload: { tags?: string[]; collectionId?: string | null } = {}
  ) =>
    request<{ updated: number; archived: number }>('/links/bulk', {
      method: 'POST',
      body: JSON.stringify({ ids, action, ...payload }),
    }),

  refetchLink: (id: string) => request<LinkRecord>(`/links/${id}/refetch`, { method: 'POST' }),

  archiveLink: (id: string) => request<LinkRecord>(`/links/${id}/archive`, { method: 'POST' }),

  addFileLink: (input: {
    filename: string;
    mime: string;
    dataBase64: string;
    title?: string;
    tags?: string[];
    collectionId?: string | null;
    notes?: string;
  }) => request<LinkRecord>('/links/upload', { method: 'POST', body: JSON.stringify(input) }),

  uploadArchive: (id: string, format: 'html' | 'pdf' | 'screenshot', dataBase64: string) =>
    request<LinkRecord>(`/links/${id}/archive/upload`, {
      method: 'POST',
      body: JSON.stringify({ format, dataBase64 }),
    }),

  aiEmbed: (limit = 50) =>
    request<{ embedded: number; remaining: number }>('/ai/embed', {
      method: 'POST',
      body: JSON.stringify({ limit }),
    }),

  aiSearch: (q: string, topK = 10) =>
    request<{ results: Array<{ link: LinkRecord; score: number }> }>('/ai/search', {
      method: 'POST',
      body: JSON.stringify({ q, topK }),
    }),

  aiChat: (question: string) =>
    request<{ answer: string; sources: Array<{ id: string; title: string; url: string }> }>(
      '/ai/chat',
      { method: 'POST', body: JSON.stringify({ question }) }
    ),

  suggestAi: (id: string, apply = false) =>
    request<{ tags: string[]; summary: string; applied: boolean }>(`/links/${id}/ai`, {
      method: 'POST',
      body: JSON.stringify({ apply }),
    }),

  metadata: (url: string) =>
    request<MetadataPreview>(`/metadata?url=${encodeURIComponent(url)}`),

  addHighlight: (id: string, input: { text: string; note?: string; color?: string }) =>
    request<LinkRecord>(`/links/${id}/highlights`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateHighlight: (id: string, highlightId: string, patch: { note?: string; color?: string }) =>
    request<LinkRecord>(`/links/${id}/highlights/${highlightId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteHighlight: (id: string, highlightId: string) =>
    request<LinkRecord>(`/links/${id}/highlights/${highlightId}`, { method: 'DELETE' }),

  listCollections: () => request<Collection[]>('/collections'),

  createCollection: (input: {
    name: string;
    parentId?: string | null;
    color?: string;
    icon?: string;
  }) => request<Collection>('/collections', { method: 'POST', body: JSON.stringify(input) }),

  updateCollection: (
    id: string,
    patch: {
      name?: string;
      parentId?: string | null;
      color?: string;
      icon?: string;
      isPublic?: boolean;
      description?: string;
      password?: string;
      shareExpiresAt?: string | null;
      feedUrl?: string;
    }
  ) =>
    request<Collection>(`/collections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteCollection: (id: string) =>
    request<{ ok: boolean }>(`/collections/${id}`, { method: 'DELETE' }),

  tags: () => request<TagCount[]>('/tags'),

  renameTag: (tag: string, name: string) =>
    request<{ updated: number }>(`/tags/${encodeURIComponent(tag)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteTag: (tag: string) =>
    request<{ updated: number }>(`/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' }),

  mergeTags: (source: string, target: string) =>
    request<{ updated: number }>('/tags/merge', {
      method: 'POST',
      body: JSON.stringify({ source, target }),
    }),

  syncFeed: (id: string) =>
    request<{ added: number; skipped: number; title?: string }>(`/collections/${id}/feed/sync`, {
      method: 'POST',
    }),

  moveCollection: (id: string, direction: 'up' | 'down') =>
    request<Collection>(`/collections/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),

  markRead: (id: string, read: boolean) =>
    request<LinkRecord>(`/links/${id}/read`, {
      method: 'POST',
      body: JSON.stringify({ read }),
    }),

  removeArchiveFormat: (id: string, format: 'html' | 'readable' | 'screenshot' | 'pdf') =>
    request<LinkRecord>(`/links/${id}/archive/${format}`, { method: 'DELETE' }),

  refreshArchives: (days = 30, limit = 5) =>
    request<{ refreshed: number }>('/maintenance/refresh-archives', {
      method: 'POST',
      body: JSON.stringify({ days, limit }),
    }),

  checkLinks: (ids?: string[]) =>
    request<{ checked: number; dead: number }>('/links/check', {
      method: 'POST',
      body: JSON.stringify(ids && ids.length > 0 ? { ids } : {}),
    }),

  generateIndexes: () =>
    request<{ files: number }>('/maintenance/indexes', { method: 'POST' }),

  listApiKeys: () => request<import('./types').ApiKeyInfo[]>('/apikeys'),

  createApiKey: (label: string) =>
    request<{ key: string; record: import('./types').ApiKeyInfo }>('/apikeys', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),

  deleteApiKey: (id: string) =>
    request<{ ok: boolean }>(`/apikeys/${id}`, { method: 'DELETE' }),

  importData: (payload: { html?: string; json?: string; defaultCollectionId?: string | null }) =>
    request<ImportSummary>('/import', { method: 'POST', body: JSON.stringify(payload) }),
};

export function fileUrl(id: string): string {
  return `${API_PREFIX}/links/${id}/file`;
}

export function archiveFormatUrl(
  id: string,
  format: 'html' | 'readable' | 'screenshot' | 'pdf'
): string {
  return `${API_PREFIX}/links/${id}/archive?format=${format}`;
}

export function apiUrl(path: string): string {
  return `${API_PREFIX}${path}`;
}

export function faviconSrc(link: LinkRecord): string | null {
  if (link.kind === 'file') return null;
  if (link.icon) return `${API_PREFIX}/favicon?url=${encodeURIComponent(link.icon)}`;
  if (link.favicon) return `${API_PREFIX}/favicon?url=${encodeURIComponent(link.favicon)}`;
  try {
    const origin = new URL(link.url).origin;
    return `${API_PREFIX}/favicon?url=${encodeURIComponent(`${origin}/favicon.ico`)}`;
  } catch {
    return null;
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const locale = document.documentElement.lang === 'en' ? 'en-US' : 'zh-CN';
  return date.toLocaleString(locale, { hour12: false });
}
