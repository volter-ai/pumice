// Phase 10 — Mobile platform model + capability gating. Obsidian exposes `Platform.*`
// and refuses to load plugins whose manifest sets `isDesktopOnly: true` on mobile. This
// models that: a configurable Platform, a capability map per platform, and the plugin
// load gate the loader consults before constructing a plugin.

export function makePlatform(kind = 'desktop') {
  const isMobile = kind === 'mobile' || kind === 'ios' || kind === 'android';
  return {
    isDesktop: !isMobile,
    isMobile,
    isDesktopApp: !isMobile,
    isMobileApp: isMobile,
    isIosApp: kind === 'ios',
    isAndroidApp: kind === 'android',
    isPhone: isMobile,
    isTablet: false,
    // capabilities the platform exposes
    capabilities: isMobile
      ? { childProcess: false, fsSync: false, requestUrl: true, nodeIntegration: false, fileSystemAccess: false }
      : { childProcess: true, fsSync: true, requestUrl: true, nodeIntegration: true, fileSystemAccess: true },
  };
}

export const Platform = makePlatform('desktop');

/**
 * The gate Obsidian's plugin loader uses: a plugin may load unless it declares
 * `isDesktopOnly: true` and we're on mobile. Returns { allowed, reason }.
 */
export function canLoadPlugin(manifest, platform = Platform) {
  if (manifest.isDesktopOnly && platform.isMobile) {
    return { allowed: false, reason: `"${manifest.id}" is desktop-only and cannot run on mobile` };
  }
  if (manifest.minAppVersion && platform.appVersion && cmpVersion(platform.appVersion, manifest.minAppVersion) < 0) {
    return { allowed: false, reason: `"${manifest.id}" requires app ${manifest.minAppVersion}` };
  }
  return { allowed: true, reason: '' };
}

function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}

/**
 * Filter a manifest list to those loadable on the platform — what the plugin manager
 * does at startup. Returns { loaded:[ids], skipped:[{id, reason}] }.
 */
export function filterLoadablePlugins(manifests, platform = Platform) {
  const loaded = [], skipped = [];
  for (const m of manifests) { const g = canLoadPlugin(m, platform); if (g.allowed) loaded.push(m.id); else skipped.push({ id: m.id, reason: g.reason }); }
  return { loaded, skipped };
}

/** A capability accessor that throws the right typed error when used off-platform. */
export function requireCapability(name, platform = Platform) {
  if (!platform.capabilities[name]) throw new Error(`capability "${name}" is unavailable on ${platform.isMobile ? 'mobile' : 'desktop'}`);
  return true;
}
