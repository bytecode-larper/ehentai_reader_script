# E-Hentai Clean Reader

A userscript that replaces the default E-Hentai / ExHentai page viewer with a minimal, keyboard-driven SPA. No pagination, no surrounding page chrome — just the image, a heads-up display, and instant navigation backed by prefetching.

Supports both `e-hentai.org` and `exhentai.org`.

---

## Features

- Replaces the native viewer with a clean full-screen layout
- Two fit modes: **fit-height** (default, no scroll) and **natural width** (vertical scroll)
- Keyboard navigation — arrow keys and WASD
- Ahead-of-time prefetching in both directions
- Automatic retry on failed images via the site's `nl` token mechanism
- Browser history integration (`pushState` / `popstate`) so back/forward work as expected

### Keybindings

| Key | Action |
|---|---|
| `→` / `D` | Next page |
| `←` / `A` | Previous page |
| `↓` / `S` | Scroll down (fit-width mode) |
| `↑` / `W` | Scroll up (fit-width mode) |
| `F` | Toggle fit mode |

---

## Installation

1. Install a userscript manager ([Tampermonkey](https://www.tampermonkey.net/) recommended)
2. Install the script from `dist/ehentai_clean_reader.user.js`

---

## Development

### Requirements

- [Bun](https://bun.sh/) — used for bundling and the build script

### Setup

```bash
bun install
```

### Build

```bash
bun run build      # single build
bun run dev        # rebuild on file changes (--watch)
```

The build script (`build.ts`) does three things in sequence:

1. **Bundles** `src/main.ts` and all imports into a single JS file via `Bun.build`
2. **Lints and auto-formats** the output using the ESLint API with Prettier integration
3. **Prepends** the `==UserScript==` header block so the output is a valid installable userscript

Output: `dist/ehentai_clean_reader.user.js`

---

## Architecture

The source is split into focused modules under `src/`. The build collapses them into one file — there are no runtime module boundaries in the installed script.

```
src/
├── main.ts        — entry point, init, event wiring, navigation loop
├── parser.ts      — HTML → PageData extraction
├── network.ts     — fetch, caching, prefetch, nl-retry
├── ui.ts          — DOM injection, rendering, image display
├── config.ts      — CONFIG constants and debug logger
├── types.ts       — shared TypeScript interfaces
├── shell.html     — viewer DOM template (inlined at build time)
├── style.css      — all styles (inlined at build time)
└── text.d.ts      — module declarations for .html and .css imports
```

### Data flow

```
page load
  └─ parseViewerDoc(document)    # extract PageData from current DOM
       └─ injectShell()           # replace body with clean viewer HTML
            └─ renderPage()       # populate UI refs, set image src
                 └─ prefetchBoth()
                      ├─ prefetchDirection(→ next)
                      └─ prefetchDirection(← prev)

navigation (click / keydown)
  └─ navigateTo(url)
       └─ fetchViewerPage(url)    # fetch + parse + cache viewer HTML
            └─ renderPage()
                 └─ prefetchBoth()
```

### `PageData` (types.ts)

The central data structure passed between all modules. Parsed once per viewer URL and stored in `pageCache`.

```ts
interface PageData {
  viewerUrl: string;
  pageNum: number;
  counterText: string;  // e.g. "4 / 32"
  imgSrc: string;
  nextHref: string | null;
  prevHref: string | null;
  fileInfo: string;     // resolution + file metadata from #i2
  galleryHref: string;
  nlToken: string | null;
}
```

### `parser.ts`

`parseViewerDoc(doc, viewerUrl)` takes a `Document` (either the live page or a fetched one) and returns `PageData`. It:

- Extracts page number, gallery ID, and page hash from the URL via regex
- Finds the image element via `#i3 a img`, `iframe + a img`, or `.sni > a img`
- Scrapes prev/next hrefs from anchor tags by matching `-(N)` patterns, with a fallback to constructing the prev URL from parsed URL components
- Finds the counter element by matching the `N / N` text pattern across all `div/span/td` elements
- Extracts the `nl` retry token from the `onclick` attribute of the reload anchor

### `network.ts`

Handles all fetching and caching.

- **`pageCache`** — `Map<url, PageData>`. Capped at `PAGE_CACHE_LIMIT` (40) entries, evicted oldest-first.
- **`imgCache`** — `Map<src, HTMLImageElement>`. Capped at `IMG_CACHE_LIMIT` (20). Images are preloaded into a hidden off-screen container so the browser decodes them before they're needed.
- **`fetchViewerPage(url)`** — cache-first fetch; parses the HTML and stores in `pageCache`.
- **`fetchNlRetry(pageData)`** — on image load failure, appends `?nl=<token>` to the viewer URL to request a fresh image URL from the server. Updates the cache entry in-place.
- **`prefetchBoth(data)`** — fires both directions concurrently. Each direction walks up to `PREFETCH_COUNT` pages ahead, fetching viewer pages and preloading images. A fetch failure breaks that direction's chain; a missing `imgSrc` on a page is skipped without stopping the chain.

### `ui.ts`

- **`injectShell(initData)`** — replaces `document.body` with the `shell.html` template, injects styles via `GM_addStyle`, and returns typed `UIRefs` for all interactive elements.
- **`applyMode(fitHeight)`** — toggles `body.fit-h` / `body.fit-w` classes which drive all layout via CSS.
- **`displayImage(elImg, pageData, retryCount)`** — assigns `img.src`. If the preload cache already has a fully decoded image it assigns immediately (zero-flash). Otherwise attaches `onerror` which triggers `fetchNlRetry` and recurses up to `MAX_NL_RETRY` times.
- **`renderPage(ui, data, fitHeight, isInitial)`** — updates all UI refs, calls `displayImage`, and calls `history.pushState` (skipped when `isInitial` is `true` to avoid duplicating the entry on first load).

### `main.ts`

Wires everything together. Key details:

- The document is hidden via `visibility:hidden` at `document-start` to prevent the native viewer from flashing before the shell is injected. It's restored synchronously after `injectShell`.
- **`navigateTo(url)`** uses a pending-navigation pattern: if a navigation is already in flight, the new target is stored in `pendingNav` and picked up when the current one finishes. Rapid keypresses always resolve to the last-requested page without queuing intermediate ones.
- `popstate` is handled by checking `pageCache` first — cached pages render instantly without a network round-trip.

### `config.ts`

All tuneable constants live here:

| Key | Default | Description |
|---|---|---|
| `DEBUG` | `false` | Enables `console.log` output via `log()` / `warn()` |
| `PREFETCH_COUNT` | `2` | Pages to prefetch in each direction |
| `MAX_NL_RETRY` | `4` | Max image reload attempts via nl token |
| `IMG_CACHE_LIMIT` | `20` | Max preloaded images kept in memory |
| `SCROLL_STEP` | `160` | Pixels per keyboard scroll in fit-width mode |

---

## Tooling

| Tool | Role |
|---|---|
| Bun | Runtime, bundler, build script |
| TypeScript | Type-checked source |
| ESLint + Prettier | Auto-formatting applied to the bundle output |
| `@types/tampermonkey` | Types for `GM_addStyle` and other GM APIs |
