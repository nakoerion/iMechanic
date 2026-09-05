/** Build id injected by `define` in vite.config.ts (QA defect D9).
 *  Used to version the service-worker registration URL so each deploy
 *  installs a fresh worker and drops the previous build's caches. */
declare const __BUILD_ID__: string;
