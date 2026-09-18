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
  icon?: string | null;
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
  kind?: 'link' | 'file';
  filePath?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  lastCheckedAt?: string | null;
  httpStatus?: number | null;
  isDead?: boolean | null;
  checkError?: string | null;
  readAt?: string | null;
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
  icon?: string;
  parentId?: string | null;
  isPublic?: boolean;
  slug?: string;
  description?: string;
  passwordHash?: string;
  shareExpiresAt?: string | null;
  feedUrl?: string;
  feedLastFetchedAt?: string | null;
  order?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyRecord {
  id: string;
  label: string;
  hash: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface RepoMeta {
  version: number;
  generator: string;
  createdAt: string;
}

export interface SearchQuery {
  q?: string;
  collectionId?: string;
  tag?: string;
  archived?: boolean;
  read?: boolean;
  sort?: 'created' | 'updated' | 'title';
  order?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
}

export interface SearchResult {
  items: LinkRecord[];
  total: number;
  page: number;
  perPage: number;
}

export interface LinkInput {
  url: string;
  title?: string;
  description?: string;
  tags?: string[];
  collectionId?: string | null;
  notes?: string;
  icon?: string | null;
  pinned?: boolean;
  fetchMetadata?: boolean;
}

export interface ImportSummary {
  linksAdded: number;
  linksSkipped: number;
  collectionsCreated: number;
}
