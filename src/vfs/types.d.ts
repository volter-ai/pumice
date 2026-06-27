// VaultAdapter — the storage seam. Implement this to back Pumice with any store
// (S3, Supabase, a CMS, …). Required: name, capabilities, list, read, snapshot.
// Optional methods are capability-gated; declare what you support in `capabilities`.

export interface Capabilities {
  /** can persist changes (else read-only) */
  write?: boolean;
  /** can notify on external changes (else the UI polls) */
  watch?: boolean;
  /** backing store is shared/syncable across clients */
  sync?: boolean;
  /** survives reloads in-browser (OPFS) */
  persistent?: boolean;
  /** read-only backend (Notion) */
  readonly?: boolean;
  /** supports commit history (git) */
  versioned?: boolean;
  /** CORS-free fetch available (desktop) */
  requestUrl?: boolean;
  /** subprocess execution available (desktop) */
  childProcess?: boolean;
}

export interface Stat {
  type: 'file' | 'folder';
  size: number;
  mtime?: number;
  ctime?: number;
}

export interface VaultAdapter {
  name: string;
  capabilities: Capabilities;
  /** list all markdown paths (forward-slash, relative) */
  list(): Promise<string[]>;
  read(path: string): Promise<string>;
  /** all files as { path -> content } (for graph/search) */
  snapshot(): Promise<Record<string, string>>;
  write?(path: string, content: string): Promise<void>;
  remove?(path: string): Promise<void>;
  rename?(from: string, to: string): Promise<void>;
  stat?(path: string): Promise<Stat | null>;
  mkdir?(path: string): Promise<void>;
  /** subscribe to external changes; returns an unsubscribe fn */
  watch?(path: string, cb: (event: string, path: string) => void): () => void;
}
