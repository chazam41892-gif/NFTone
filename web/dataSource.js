// NFTones — frontend data source.
//
// Single seam between the UI and the data world. Two modes, selected at boot
// by window.NFTONES_CONFIG.useApi:
//
//   useApi === false  (default — demo / Phase 1 ship state)
//     Reads from window.NFTONES_MOCK (loaded by ../mock-data/data.js).
//     Byte-identical demo behavior; no network calls.
//
//   useApi === true   (Phase 1+ deployed mode)
//     Fetches from window.NFTONES_CONFIG.apiBase (default /api/v1) and
//     unwraps the {ok,data,cost_ktrs} envelope.
//
// Both modes return Promises so callers don't branch. The mock path resolves
// synchronously via Promise.resolve(...).
//
// Phase 1 is read-only. POSTs (revoke, register, mint, scan) are Phase 5+
// when wallet-signature auth ships. Until then, in-page mutations are local
// to a cache app.js holds — they don't persist server-side and don't pretend
// to. See app.js bootstrap for the cache pattern.
//
// Fortune-500 ISOLATE: flag default OFF = no-op delegate to the existing
// mock global. Demo is byte-identical to pre-this-change behavior.

window.NFTONES_DATA_SOURCE = (() => {
  const CFG = window.NFTONES_CONFIG || {};
  const USE_API = !!CFG.useApi;
  const API_BASE = (CFG.apiBase || "/api/v1").replace(/\/$/, "");

  // ---------- mock ----------
  const M = () => window.NFTONES_MOCK;

  // ---------- api ----------
  async function apiGet(path) {
    const resp = await fetch(`${API_BASE}${path}`, {
      headers: { "Accept": "application/json" },
      credentials: "omit",
    });
    if (!resp.ok) {
      let detail = `${resp.status} ${resp.statusText}`;
      try {
        const body = await resp.json();
        if (body && body.error) detail = `${body.error.code}: ${body.error.message}`;
      } catch (_) { /* non-JSON */ }
      throw new Error(`GET ${path} → ${detail}`);
    }
    const body = await resp.json();
    if (body && body.ok && "data" in body) return body.data;
    return body;
  }

  // Hydrate every collection in parallel. Returned object's shape mirrors
  // window.NFTONES_MOCK so app.js can use the same field names.
  async function hydrateAll() {
    if (!USE_API) {
      const m = M();
      return {
        wallets: m.wallets, releases: m.releases, grants: m.grants,
        scans: m.scans, evidenceReports: m.evidenceReports,
        tokenEvents: m.tokenEvents, balances: m.balances,
      };
    }
    const [wallets, releases, grants, scans, evidenceReports, tokenEvents, balances] =
      await Promise.all([
        apiGet("/wallets"),
        apiGet("/releases"),
        apiGet("/grants"),
        apiGet("/scans"),
        apiGet("/evidence"),
        apiGet("/token/events"),
        apiGet("/token/balance"),
      ]);
    return { wallets, releases, grants, scans, evidenceReports, tokenEvents, balances };
  }

  return {
    mode: USE_API ? "api" : "mock",
    apiBase: API_BASE,
    useApi: USE_API,
    hydrateAll,
    // Granular getters if a view ever needs to refresh just one collection.
    getReleases:      () => USE_API ? apiGet("/releases")               : Promise.resolve(M().releases),
    getRelease:     (id) => USE_API ? apiGet(`/releases/${id}`)         : Promise.resolve(M().releases.find(r => r.id === id)),
    getReleaseGrants:(id) => USE_API ? apiGet(`/releases/${id}/access`) : Promise.resolve(M().grants.filter(g => g.release_id === id)),
    getGrants:        () => USE_API ? apiGet("/grants")                 : Promise.resolve(M().grants),
    getWallets:       () => USE_API ? apiGet("/wallets")                : Promise.resolve(M().wallets),
    getScans:         () => USE_API ? apiGet("/scans")                  : Promise.resolve(M().scans),
    getScan:        (id) => USE_API ? apiGet(`/scans/${id}`)            : Promise.resolve(M().scans.find(s => s.id === id)),
    getEvidence:      () => USE_API ? apiGet("/evidence")               : Promise.resolve(M().evidenceReports),
    getTokenEvents:   () => USE_API ? apiGet("/token/events")           : Promise.resolve(M().tokenEvents),
    getTokenBalance:  () => USE_API ? apiGet("/token/balance")          : Promise.resolve(M().balances),
  };
})();
