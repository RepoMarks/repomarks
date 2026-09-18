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
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const UNAUTHORIZED_EVENT = 'repomarks:unauthorized';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'content-type': 'application/json',
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
    throw new ApiError(res.status, message || `HTTP ${res.status}`);
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
    }
  ) =>
    request<Collection>(`/collections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteCollection: (id: string) =>
    request<{ ok: boolean }>(`/collections/${id}`, { method: 'DELETE' }),

  tags: () => request<TagCount[]>('/tags'),

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
  return `/api/links/${id}/file`;
}

export function archiveFormatUrl(
  id: string,
  format: 'html' | 'readable' | 'screenshot' | 'pdf'
): string {
  return `/api/links/${id}/archive?format=${format}`;
}

export function faviconSrc(link: LinkRecord): string | null {
  if (link.kind === 'file') return null;
  if (link.icon) return `/api/favicon?url=${encodeURIComponent(link.icon)}`;
  if (link.favicon) return `/api/favicon?url=${encodeURIComponent(link.favicon)}`;
  try {
    const origin = new URL(link.url).origin;
    return `/api/favicon?url=${encodeURIComponent(`${origin}/favicon.ico`)}`;
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
