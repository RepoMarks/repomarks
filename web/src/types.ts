export interface LinkRecord {
  id: string;
  url: string;
  title: string;
  description?: string;
  tags: string[];
  collectionId?: string | null;
  createdAt: string;
  updatedAt: string;
  siteName?: string;
  favicon?: string;
  previewImage?: string;
  contentType?: string;
  pinned?: boolean;
  archivedAt?: string | null;
  archivePath?: string | null;
  archiveEngine?: 'singlefile' | 'basic' | null;
  archiveStatus?: 'none' | 'pending' | 'ok' | 'failed';
  archiveError?: string | null;
  archiveSize?: number | null;
  readablePath?: string | null;
  readableSize?: number | null;
  screenshotPath?: string | null;
  screenshotSize?: number | null;
  pdfPath?: string | null;
  pdfSize?: number | null;
  waybackUrl?: string | null;
  waybackAt?: string | null;
  formatErrors?: Record<string, string> | null;
  notes?: string;
  highlights?: Highlight[];
}

export interface Highlight {
  id: string;
  text: string;
  note?: string;
  color?: string;
  createdAt: string;
}

export interface Collection {
  id: string;
  name: string;
  color?: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
  linkCount?: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface SearchResult {
  items: LinkRecord[];
  total: number;
  page: number;
  perPage: number;
}

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

export interface StatusResponse {
  repo: RepoStatus;
  sync: {
    syncing: boolean;
    lastSyncAt: string | null;
    lastPushedAt: string | null;
    lastPulledAt: string | null;
    lastError: string | null;
    pendingPush: boolean;
  };
  archive: {
    engine: 'singlefile' | 'basic' | 'off';
    available: boolean;
    browserPath?: string;
    reason?: string;
    formats: string[];
  };
  stats: {
    links: number;
    archived: number;
    failed: number;
    collections: number;
    tags: number;
    uncategorized: number;
    totalArchiveBytes: number;
  };
  warnings: string[];
  uptimeSeconds: number;
  node: string;
}

export interface ImportSummary {
  linksAdded: number;
  linksSkipped: number;
  collectionsCreated: number;
}

export interface MetadataPreview {
  title?: string;
  description?: string;
  siteName?: string;
  favicon?: string;
  previewImage?: string;
  contentType?: string;
  resolvedUrl: string;
}
