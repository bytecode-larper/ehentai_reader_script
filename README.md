# E-Hentai Clean Reader

A modern, high-performance userscript that replaces the default E-Hentai / ExHentai page viewer with a minimal, keyboard-driven SPA. Designed for speed, immersion, and a clean aesthetic.

Supports both `e-hentai.org` and `exhentai.org`.

---

## Features

- **True Full-Screen SPA**: Replaces the entire page body with a clean, centered viewer. No page chrome, no flickering.
- **Advanced Title Parsing**: Automatically segments complex gallery titles into semantic components (Artist, Event, Series, Tags) based on the official EH style guide with clear visual hierarchy.
- **Two Distinct Modes**:
  - **Fit-Height (Inspect Mode)**: Default. Perfect for high-detail viewing. Supports zooming and panning.
  - **Natural-Width (Read Mode)**: Full-width scrolling experience.
- **Smart Navigation**:
  - **Click-to-Navigate**: 40/60 split on the entire viewport (Left = Prev, Right = Next).
  - **Keyboard**: Arrows or WASD.
- **Smooth Image Handling**:
  - **Concurrent Prefetching**: Chains HTML fetches to discover and preload upcoming images ahead of time.
  - **Zero-Jank Swapping**: Uses `img.decode()` to ensure pixels are ready in VRAM before display.
  - **Rubber-Band Zoom**: Override browser shortcuts (`Ctrl +`, `Ctrl -`, `Ctrl Scroll`) to zoom into details with automatic snap-back when zooming out.
  - **Smooth Panning**: Click and drag or use keys to explore zoomed images with edge-aware clamping.
- **Immersive UI**:
  - **Auto-Hide Cursor**: Mouse cursor disappears after 3 seconds of inactivity.
  - **Dynamic Title Sizing**: Title width adjusts automatically based on the image size to prevent overlap.
  - **Subtle Toasts**: Minimal feedback for mode changes and zoom levels.

---

## Controls

| Key | Action |
|---|---|
| `→` / `D` | Next Page |
| `←` / `A` | Previous Page |
| `↓` / `S` | Scroll Down (Read Mode) / Pan Down (Zoomed) |
| `↑` / `W` | Scroll Up (Read Mode) / Pan Up (Zoomed) |
| `F` | Toggle Fit Mode |
| `U` | Return to Gallery |
| `Ctrl` + `+/-/Scroll` | Custom Image Zoom |
| `Ctrl` + `0` | Reset Zoom |

---

## Installation

1. Install a userscript manager ([Violentmonkey](https://violentmonkey.github.io/) recommended).
2. Install the script from `dist/ehentai_clean_reader.user.js` or via the local development URL.

---

## Development

### Requirements
- [Bun](https://bun.sh/) — used for bundling, linting, and serving.

### Setup
```bash
bun install
```

### Unified Dev Workflow
The build script includes a built-in server and watcher. Run this to start developing:
```bash
bun run dev
```
- **Local Server**: Serves the script at `http://localhost:8080/ehentai_clean_reader.user.js`.
- **Auto-Rebuild**: Watches `src/` and automatically updates the bundle on change.
- **Live Updates**: In Violentmonkey, use "Install from URL" with the address above and enable "Track local file changes" for a seamless workflow.

### Settings & Debugging
- **Persistent Settings**: Access the script's preferences via the Violentmonkey/Tampermonkey menu (toggle Default Mode, Debug Mode, etc.).
- **Debugging**: Enable **Debug Mode** in the menu to see detailed `PageData` and `ParsedTitle` objects in your browser console.

---

## Architecture

- **`src/main.ts`**: Entry point, session state, and event wiring.
- **`src/parser.ts`**: Logical data extraction and EH style-guide parsing.
- **`src/ui.ts`**: DOM management, dynamic resizing, and HTML rendering.
- **`src/network.ts`**: Fetching, prefetching, and `img.decode` optimization.
- **`src/config.ts`**: Settings management via `GM_setValue/getValue` and menu registration.
