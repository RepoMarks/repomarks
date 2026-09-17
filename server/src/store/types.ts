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
  notes?: string;
}

export interface Collection {
  id: string;
  name: string;
  color?: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
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
  pinned?: boolean;
  fetchMetadata?: boolean;
}

export interface ImportSummary {
  linksAdded: number;
  linksSkipped: number;
  collectionsCreated: number;
}
