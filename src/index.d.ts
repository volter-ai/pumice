// Public type surface for pumice-md. Hand-authored (source is JS+JSDoc).
export type { VaultAdapter, Capabilities, Stat } from './vfs/types.d.ts';

export interface PluginHost {
  app: any;
  obsidian: any;
  renderMarkdown(md: string, el: HTMLElement, opts?: any): HTMLElement;
  loadPlugin(id: string, source: string, manifest?: object): Promise<{ manifest: any; instance: any }>;
}

/** Render Obsidian-flavored markdown into a DOM element (callouts/wikilinks/embeds/math/…). */
export function renderMarkdown(content: string, el: HTMLElement, opts?: { resolve?: (name: string) => string; postProcessors?: Array<(el: HTMLElement, ctx: any) => void>; sourcePath?: string }): HTMLElement;
export function renderToString(content: string, opts?: object): string;

/** One-call host setup: install globals + create an app over an adapter + return a plugin host. */
export function setupPluginHost(adapter: import('./vfs/types.d.ts').VaultAdapter, opts?: { window?: Window; externals?: Record<string, unknown>; renderMarkdown?: Function }): Promise<PluginHost>;
export function installPumiceGlobals(win?: Window, externals?: Record<string, unknown>): Window;
export function createApp(adapter: import('./vfs/types.d.ts').VaultAdapter, renderMarkdown?: Function): Promise<any>;
export function activatePlugin(o: { app: any; manifest: any; source: string; externals?: Record<string, unknown>; permissive?: boolean }): Promise<any>;

// adapters
export function memoryAdapter(seed?: Record<string, string>): import('./vfs/types.d.ts').VaultAdapter;
export function opfsAdapter(opts?: { dir?: string }): Promise<import('./vfs/types.d.ts').VaultAdapter>;
export function httpAdapter(base?: string): import('./vfs/types.d.ts').VaultAdapter;
export function pickFolderAdapter(): Promise<import('./vfs/types.d.ts').VaultAdapter>;

// host VFS search/graph primitives (rich search = real omnisearch; graph = real 3D-graph plugin)
export function search(files: Record<string, string>, query: string): Array<{ path: string; score: number; snippet: string }>;
export function tagIndex(files: Record<string, string>): Record<string, string[]>;
export function buildGraph(files: Record<string, string>): { nodes: any[]; links: any[] };
export function backlinks(files: Record<string, string>, path: string): string[];

// agent surface
export function createVaultCore(store: { get(): Record<string, string>; set(p: string, c: string): void }): any;
export function createMcpServer(core: any, opts?: { allowWrite?: boolean }): { listTools(): any[]; callTool(name: string, args?: object): Promise<any> };
export function createRestHandler(core: any, opts?: { allowWrite?: boolean }): (req: { method?: string; path?: string; query?: any; body?: any }) => Promise<any>;
