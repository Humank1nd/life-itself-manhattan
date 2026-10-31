# GEV → LIM live world context (first implementation)

This connects **existing** Gods Eye View `getWorld()` output to the **active** Life Itself Manhattan `tickLivingCity()`. It does not add another simulator, move state authority, change the renderer, depend on 3D tile credentials, or imply that fallback values are physical truth.

## Run on Houston

From `/home/humank1nd/projects/gods-eye-view`, keep the existing Vite app serving port 4173. From **`/home/humank1nd/life-itself-manhattan`** (NOT `projects/life-itself-manhattan`):

1. `node scripts/serve-gev-world.mjs` — loopback-only bridge on 127.0.0.1:8617, imports the original GEV `src/life/worldFeeds.js` and reads its existing HTTP APIs.
2. `python3 -m http.server 8000 --bind 127.0.0.1` — serves the active Manhattan page locally.
3. Open `http://127.0.0.1:8000/index.html?gev=live`.
4. Browser console: `window.__gevFeed` shows the staged and applied snapshot IDs. `window.islandJournal.verifyChain()` verifies the journal.

No `?gev=live` query parameter = unchanged default simulation. The feed polls every 40 seconds, the existing 5-second tick is the **only** writer to `livingCity.world`, and the first eligible tick seals a `gev-world-context` action before applying a new snapshot. The existing `city_tick` action still seals the resulting mutable city state.

## Proof

- `node scripts/test-gev-world-bridge.mjs`: same-seed five-zone −5 happiness effect, idempotency, deterministic replay, seven invalid-snapshot rejections.
- Headless Chrome on Houston, 2026-10-31: the shipped page at `?gev=live` reached tick 1, applied a fresh GEV snapshot, recorded `gev-world-context`, returned `window.islandJournal.verifyChain() === true`, with zero page/console errors.
- Witness screenshot: `/tmp/opencode/gev-lim-connected.png`. E2E evidence from browser output and GEV node services.

## Provenance is part of the contract

The GEV source uses **proxies and defaults**. `traffic=green` when TomTom has no key is not measured free-flow. Weather may be a fail-soft default. FIRMS errors yield empty fires, not verified absence. USGS `all_day` is **not** filtered to M2.5+ by GEV. `servicesNear=false` means empty CCTV camera registry, **not** no essential services. The existing five-zone happiness shift is deterministic game logic, not an assertion about actual NYC well-being. Every snapshot stores a source revision, timestamp, ID and field classifications.

## Remaining work

This is a genuine **one-way live context feed** plus LIM's internal deterministic feedback loop. It is **not** a bidirectional GEV↔LIM transport, not Twin proposal/observation ingestion, and not Unreal streaming. Do not describe it as any of those. Production hardening still needs a durable snapshot archive and a deployment-safe origin/transport plan; loopback demo is intentional.

Original S2-PLAY-001 changes, rat authority, P017 history, and Gods Eye View source remain intact. Google Tiles/Cesium credentials are independent of this feed.

## Bidirectional local observations (2026-10-31)

LIM remains the authoritative simulation. Once a `?gev=live` city tick is sealed,
`makeLIMJournalPublisher()` sends its complete hash-chained journal to the **local**
verification bridge via `POST /lim/journal`. The bridge checks every link,
rejects tampering and historical rewrites for the same session, and retains
only a sanitized, simulated-observation receipt. No raw journal or user messages
are returned by `GET /lim/observations`.

Run the same bridge from this branch and the isolated GEV branch
`feat/lim-observation-return-20261031`. The GEV data-layer toggle
`Life Itself · Verified Observations` (or `?lim=live`) polls the returned
receipt. It only changes a screen-space status label, never GEV simulation,
city-state, missions, camera, or entities. The observation summarizes
the entire city, so it deliberately has **no invented world-space point**.

The full journal crosses loopback for verification, which is a **local development
trust boundary**, not yet a secure production transport. An authenticated,
minimal-disclosure inter-process channel and durable receipt archive remain
release-hardening work. Two local services and a running browser are required
for the live demo; the application defaults to the original simulation when
`?gev=live` is absent.

Verification: `node scripts/test-lim-journal-return.mjs`, then a headless
browser at LIM :8001 and GEV :4183: 96 walkers, journal valid,
bridge returns `simulated-observation`, and GEV displays that tick.
Screenshot: `/tmp/opencode/gev-lim-return-verified.png`.
