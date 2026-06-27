// Phase 10 AC: mobile spike. Platform.isMobile/isDesktop honored; manifest isDesktopOnly
// gating prevents desktop-only plugins loading on mobile (but they load on desktop);
// mobile capability map withholds child_process/fs-sync.
import { makePlatform, canLoadPlugin, filterLoadablePlugins, requireCapability } from '../src/mobile/platform.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

const desktop = makePlatform('desktop');
const mobile = makePlatform('mobile');
const ios = makePlatform('ios');

// --- platform flags ---
ok('desktop flags', desktop.isDesktop && !desktop.isMobile && desktop.isDesktopApp);
ok('mobile flags', mobile.isMobile && !mobile.isDesktop && mobile.isMobileApp && mobile.isPhone);
ok('ios specific flag', ios.isIosApp && ios.isMobile);

// --- capability map ---
ok('desktop has child_process', desktop.capabilities.childProcess === true && desktop.capabilities.fsSync === true);
ok('mobile lacks child_process', mobile.capabilities.childProcess === false && mobile.capabilities.fsSync === false);
ok('mobile keeps requestUrl', mobile.capabilities.requestUrl === true);

// --- isDesktopOnly gating ---
const gitPlugin = { id: 'obsidian-git', isDesktopOnly: true, minAppVersion: '1.0.0' };
const dataview = { id: 'dataview', isDesktopOnly: false, minAppVersion: '1.0.0' };

eq('desktop-only blocked on mobile', canLoadPlugin(gitPlugin, mobile).allowed, false);
ok('block reason mentions desktop-only', /desktop-only/.test(canLoadPlugin(gitPlugin, mobile).reason));
eq('desktop-only allowed on desktop', canLoadPlugin(gitPlugin, desktop).allowed, true);
eq('cross-platform plugin allowed on mobile', canLoadPlugin(dataview, mobile).allowed, true);

// --- minAppVersion gating ---
const future = { id: 'future', minAppVersion: '2.0.0' };
const dt = makePlatform('desktop'); dt.appVersion = '1.5.0';
eq('too-new plugin blocked', canLoadPlugin(future, dt).allowed, false);

// --- filterLoadablePlugins (what the manager does at startup) ---
const manifests = [gitPlugin, dataview, { id: 'calendar', isDesktopOnly: false }];
const onMobile = filterLoadablePlugins(manifests, mobile);
eq('mobile loads cross-platform only', onMobile.loaded.sort(), ['calendar', 'dataview']);
eq('mobile skips desktop-only with reason', onMobile.skipped.map((s) => s.id), ['obsidian-git']);
const onDesktop = filterLoadablePlugins(manifests, desktop);
eq('desktop loads all', onDesktop.loaded.sort(), ['calendar', 'dataview', 'obsidian-git']);

// --- requireCapability typed error off-platform ---
ok('requireCapability ok on desktop', requireCapability('childProcess', desktop) === true);
let capErr = null; try { requireCapability('childProcess', mobile); } catch (e) { capErr = e; }
ok('requireCapability throws on mobile', capErr && /unavailable on mobile/.test(capErr.message));

console.log('=== Phase 10: mobile platform + isDesktopOnly gating ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: Platform flags + isDesktopOnly gating + capability map verified.');
process.exit(0);
