// ==UserScript==
// @name         E-Hentai Clean Reader
// @namespace    https://github.com/bytecode-larper/
// @version      2.3.0
// @description  A modern, responsive, and customizable viewer for E-Hentai and ExHentai. Features include SPA-style navigation, advanced zooming, auto-hide cursor, and prefetching for a seamless reading experience.
// @author       bytecode-larper
// @icon         https://api.iconify.design/ph/book-open-bold.svg
// @match        https://e-hentai.org/s/*/*
// @match        https://exhentai.org/s/*/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @license      MIT
// ==/UserScript==

// src/config.ts
const DEFAULT_KEYMAP = {
  next: ["D", "ARROWRIGHT"],
  prev: ["A", "ARROWLEFT"],
  fit: ["F"],
  gallery: ["Q"],
  up: ["W", "ARROWUP"],
  down: ["S", "ARROWDOWN"],
};
const DEFAULT_SETTINGS = {
  fitHeight: true,
  debug: false,
  scrollStep: 220,
  prefetchCount: 2,
  maxNlRetry: 4,
  imgCacheLimit: 20,
  keymap: DEFAULT_KEYMAP,
};
function loadSettings() {
  const settings = {
    ...DEFAULT_SETTINGS,
    fitHeight: GM_getValue("defaultFitHeight", DEFAULT_SETTINGS.fitHeight),
    debug: GM_getValue("debug", DEFAULT_SETTINGS.debug),
    keymap: GM_getValue("keymap", DEFAULT_SETTINGS.keymap),
  };
  if (!GM_getValue("keymap")) {
    GM_setValue("keymap", DEFAULT_KEYMAP);
  }
  return settings;
}
const SETTINGS = loadSettings();
const TAG = "[EH-Reader]";
const log = (...a) => SETTINGS.debug && console.log(TAG, ...a);
const warn = (...a) => SETTINGS.debug && console.warn(TAG, ...a);
function isKey(e, action) {
  const k = e.key.toUpperCase();
  return SETTINGS.keymap[action].includes(k);
}
function registerMenuCommands(onUpdate) {
  GM_registerMenuCommand(
    `Default Mode: ${SETTINGS.fitHeight ? "Fit-Height" : "Natural-Width"}`,
    () => {
      SETTINGS.fitHeight = !SETTINGS.fitHeight;
      GM_setValue("defaultFitHeight", SETTINGS.fitHeight);
      onUpdate(SETTINGS.fitHeight);
      registerMenuCommands(onUpdate);
    }
  );
  GM_registerMenuCommand(`Debug Mode: ${SETTINGS.debug ? "Enabled" : "Disabled"}`, () => {
    SETTINGS.debug = !SETTINGS.debug;
    GM_setValue("debug", SETTINGS.debug);
    location.reload();
  });
  GM_registerMenuCommand("Reset Keymap to Defaults", () => {
    if (confirm("Reset all keys to defaults (WASD/Arrows/F/Q)?")) {
      GM_setValue("keymap", DEFAULT_KEYMAP);
      location.reload();
    }
  });
}

// src/parser.ts
function parseViewerDoc(doc, viewerUrl) {
  const [, pageHash = "", galleryId = "", rawNum = "1"] =
    viewerUrl.match(/\/s\/([^/]+)\/(\d+)-(\d+)/) ?? [];
  const pageNum = parseInt(rawNum, 10);
  const imgEl = doc.querySelector("#i3 a img, iframe + a img, .sni > a img");
  const imgSrc = imgEl?.getAttribute("src") ?? "";
  const nlToken =
    doc
      .querySelector('a[onclick*="nl("]')
      ?.getAttribute("onclick")
      ?.match(/nl\((\d+)\)/)?.[1] ?? null;
  const anchors = [...doc.querySelectorAll('a[href*="/s/"]')];
  const hrefMatching = (n) =>
    anchors.find((a) => a.href.match(new RegExp(`-(${n})(\\?|$)`)))?.href ?? null;
  const nextHref = (() => {
    const byNum = hrefMatching(pageNum + 1);
    if (byNum) {
      return byNum;
    }
    const i3 = doc.querySelector("#i3 a")?.href;
    return i3 && i3 !== viewerUrl ? i3 : null;
  })();
  const prevHref =
    pageNum <= 1
      ? null
      : (hrefMatching(pageNum - 1) ??
        (pageHash && galleryId
          ? `https://${location.host}/s/${pageHash}/${galleryId}-${pageNum - 1}`
          : null));
  const counterText =
    [...doc.querySelectorAll("div, span, td")]
      .find((el) => /^\d+ \/ \d+$/.test(el.textContent?.trim() ?? ""))
      ?.textContent?.trim() ?? `${pageNum} / ?`;
  const fileInfo = (() => {
    for (const el of doc.querySelector("#i2")?.querySelectorAll("div, span") ?? []) {
      const t = (el.textContent ?? "").trim();
      if (/\d+ x \d+/.test(t) && t.includes("::")) {
        return (
          t.split(`
`)[0] ?? t
        ).trim();
      }
    }
    return "";
  })();
  const galleryHref = doc.querySelector('a[href*="/g/"]')?.href ?? "#";
  const galleryTitleElement = doc.querySelector("h1");
  const galleryTitle = galleryTitleElement?.textContent?.trim() ?? "Untitled";
  const parsedTitle = parseTitle(galleryTitle);
  log("parsedTitle", galleryTitle, parsedTitle);
  return {
    viewerUrl,
    pageNum,
    counterText,
    galleryTitle: parsedTitle,
    imgSrc,
    nextHref,
    prevHref,
    fileInfo,
    galleryHref,
    nlToken,
  };
}
function parseTitle(raw) {
  let text = raw.trim();
  const leading = [];
  const trailing = [];
  const langRegex =
    /\[(English|Japanese|Chinese|Korean|Thai|Vietnamese|French|German|Italian|Portuguese|Russian|Spanish)/i;
  const NON_ARTIST_TAGS = new Set([
    "digital",
    "colorized",
    "decensored",
    "incomplete",
    "raw",
    "translated",
    "edited",
    "webtoon",
    "doujinshi",
    "manga",
  ]);
  while (true) {
    const match = text.match(/^(\([^)]+\)|\[[^\]]+\])\s*/);
    if (!match || !match[1]) {
      break;
    }
    const m = match[1];
    let type = "tag";
    if (m.startsWith("(")) {
      type = "event";
    } else if (m.toLowerCase().includes("anthology")) {
      type = "anthology";
    } else {
      const inner = m.slice(1, -1).toLowerCase();
      if (!NON_ARTIST_TAGS.has(inner)) {
        type = "artist";
      }
    }
    leading.push({ text: m, type });
    text = text.slice(match[0].length).trim();
  }
  while (true) {
    const match = text.match(/\s*(\([^)]+\)|\[[^\]]+\])$/);
    if (!match || !match[1]) {
      break;
    }
    const m = match[1];
    let type = "tag";
    if (m.startsWith("(")) {
      type = "parody";
    } else if (langRegex.test(m)) {
      type = "lang";
    }
    trailing.unshift({ text: m, type });
    text = text.slice(0, -match[0].length).trim();
  }
  const parts = text.split(/\s*\|\s*/);
  return {
    leading,
    primary: parts[0] || "Untitled",
    secondary: parts[1] || null,
    trailing,
  };
}

// src/network.ts
const PAGE_CACHE_LIMIT = 40;
const pageCache = new Map();
const imgCache = new Map();
let preloadContainer = null;
function ensurePreloadContainer() {
  if (preloadContainer) {
    return;
  }
  preloadContainer = Object.assign(document.createElement("div"), {
    style: "position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none",
  });
  document.body.appendChild(preloadContainer);
}
function preloadImage(src) {
  if (imgCache.has(src)) {
    return imgCache.get(src);
  }
  if (imgCache.size >= SETTINGS.imgCacheLimit) {
    const oldest = imgCache.keys().next().value;
    imgCache.get(oldest)?.remove();
    imgCache.delete(oldest);
    log("evicted preload", oldest);
  }
  ensurePreloadContainer();
  const img = document.createElement("img");
  img.onload = () => {
    img.decode().then(() => log("preload + decode done", src));
  };
  img.onerror = () => warn("preload error", src);
  img.src = src;
  preloadContainer.appendChild(img);
  imgCache.set(src, img);
  log("preloading", src);
  return img;
}
async function fetchViewerPage(viewerUrl, signal) {
  if (pageCache.has(viewerUrl)) {
    log("viewer cache hit", viewerUrl);
    return pageCache.get(viewerUrl);
  }
  log("fetching viewer →", viewerUrl);
  const res = await fetch(viewerUrl, { credentials: "include", signal });
  const html = await res.text();
  const data = parseViewerDoc(new DOMParser().parseFromString(html, "text/html"), viewerUrl);
  if (pageCache.size >= PAGE_CACHE_LIMIT) {
    pageCache.delete(pageCache.keys().next().value);
  }
  pageCache.set(viewerUrl, data);
  log("cached viewer", viewerUrl, "| img:", data.imgSrc, "| nl:", data.nlToken);
  return data;
}
async function fetchNlRetry(pageData) {
  if (!pageData.nlToken) {
    return null;
  }
  const retryUrl = `${pageData.viewerUrl.split("?")[0]}?nl=${pageData.nlToken}`;
  log("nl retry →", retryUrl);
  try {
    const res = await fetch(retryUrl, { credentials: "include" });
    const newData = parseViewerDoc(
      new DOMParser().parseFromString(await res.text(), "text/html"),
      pageData.viewerUrl
    );
    pageCache.set(pageData.viewerUrl, newData);
    return newData;
  } catch (e) {
    warn("nl retry fetch failed", e);
    return null;
  }
}
async function prefetchDirection(data, getNext, signal) {
  let cur = data;
  for (let i = 0; i < SETTINGS.prefetchCount; i++) {
    const href = getNext(cur);
    if (!href) {
      break;
    }
    const next = await fetchViewerPage(href, signal).catch(() => null);
    if (!next) {
      break;
    }
    if (next.imgSrc) {
      preloadImage(next.imgSrc);
    }
    cur = next;
  }
}
let prefetchAbortController = null;
function prefetchBoth(data) {
  prefetchAbortController?.abort();
  prefetchAbortController = new AbortController();
  const signal = prefetchAbortController.signal;
  prefetchDirection(data, (d) => d.nextHref, signal).catch(
    (e) => !signal.aborted && warn("prefetch forward error", e)
  );
  prefetchDirection(data, (d) => d.prevHref, signal).catch(
    (e) => !signal.aborted && warn("prefetch backward error", e)
  );
}

// src/shell.html
const shell_default = `<div id="reader">
  <span id="img-wrap"><img id="main-img" src="" alt="" /></span>
  <div id="hud">
    <a id="hud-gallery" href="" title="Back to gallery">&#8617;</a>
    <div class="hud-spacer"></div>
    <div id="hud-title"></div>
  </div>
  <div id="page-info">
    <div id="hud-toast"></div>
    <div id="hud-counter"></div>
    <div id="file-info"></div>
  </div>
</div>
`;

// src/style.css
const style_default = `*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
html,
body {
  background: #111;
  color: #ccc;
  font:
    13px/1 system-ui,
    sans-serif;
  height: 100%;
}

body.no-cursor, 
body.no-cursor * {
  cursor: none !important;
}

body.fit-h {
  overflow: hidden;
}
body.fit-h #reader {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
body.fit-h #img-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}
body.fit-h #main-img {
  max-height: 100vh;
  max-width: 100vw;
  width: auto;
  height: 100vh;
  object-fit: contain;
}

body.fit-w {
  overflow-y: auto;
  overflow-x: hidden;
}
body.fit-w #reader {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
}
body.fit-w #img-wrap {
  display: block;
}
body.fit-w #main-img {
  display: block;
  max-width: 100vw;
  height: auto;
}

#reader {
  cursor: pointer;
}

#main-img {
  user-select: none;
  -webkit-user-drag: none;
  transition: transform 0.1s ease-out;
}
#main-img.no-transition {
  transition: none !important;
}

#hud-toast {
  font-size: 11px;
  color: #ffaa00;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  pointer-events: none;
  opacity: 0;
  transform: translateY(5px);
  transition: all 0.2s ease-out;
}
#hud-toast.show {
  opacity: 1;
  transform: translateY(0);
}

#hud {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-start;
  padding: 8px 14px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 10;
}
body:hover #hud {
  opacity: 1;
}
#hud-gallery {
  color: #aaa;
  text-decoration: none;
  font-size: 18px;
  line-height: 1.2;
}
#hud-gallery:hover {
  color: #fff;
}
.hud-spacer {
  flex: 1;
}
#hud-title {
  font-size: 11px;
  color: #777;
  text-align: right;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  line-height: 1.35;
  font-family: "Segoe UI", Tahoma, sans-serif;
}
.title-main {
  margin: 2px 0;
}
.title-primary {
  font-size: 16px;
  color: #eee;
  font-weight: 600;
}
.title-secondary {
  font-size: 15px;
  color: #aaa;
  font-weight: 400;
}
.title-sep {
  color: #555;
  margin: 0 2px;
}
.meta-item {
  display: inline-block;
  margin-left: 4px;
}
.meta-artist {
  color: #5588aa;
  font-weight: 600;
}
.meta-artist span {
  color: #77aadd;
  font-weight: 400;
}
.meta-event {
  color: #aa8855;
}
.meta-anthology {
  color: #cc6699;
  font-weight: 600;
}
.meta-parody {
  color: #55aa66;
}
.meta-tag {
  color: #888;
}
.meta-lang {
  color: #8877aa;
  font-weight: 600;
}

#page-info {
  position: fixed;
  bottom: 12px;
  right: 14px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 10;
}
body:hover #page-info {
  opacity: 1;
}

#hud-counter {
  font-size: 14px;
  color: #eee;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}

#file-info {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
`;

// src/ui.ts
function injectShell(initData) {
  document.body.innerHTML = shell_default.replace('href=""', `href="${initData.galleryHref}"`);
  GM_addStyle(style_default);
  const ui = {
    elImg: document.getElementById("main-img"),
    elTitle: document.getElementById("hud-title"),
    elCounter: document.getElementById("hud-counter"),
    elFileInfo: document.getElementById("file-info"),
    elGallery: document.getElementById("hud-gallery"),
  };
  const updateTitleWidth = () => {
    const imgWidth = ui.elImg.clientWidth;
    const viewportWidth = window.innerWidth;
    const gutter = (viewportWidth - imgWidth) / 2;
    ui.elTitle.style.maxWidth = `${Math.max(200, gutter - 30)}px`;
  };
  new ResizeObserver(updateTitleWidth).observe(document.body);
  new ResizeObserver(updateTitleWidth).observe(ui.elImg);
  return ui;
}
function applyMode(fitHeight) {
  document.body.classList.toggle("fit-h", fitHeight);
  document.body.classList.toggle("fit-w", !fitHeight);
}
let toastTimer = null;
function showToast(text) {
  const el = document.getElementById("hud-toast");
  if (!el) {
    return;
  }
  el.textContent = text;
  el.classList.add("show");
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    el.classList.remove("show");
  }, 1200);
}
function displayImage(elImg, pageData, retryCount = 0) {
  elImg.onload = null;
  elImg.onerror = null;
  const preloaded = imgCache.get(pageData.imgSrc);
  if (preloaded?.complete && preloaded.naturalWidth > 0) {
    log("instant from cache", pageData.imgSrc);
    elImg.src = pageData.imgSrc;
    return;
  }
  elImg.onload = () => log("image displayed", pageData.imgSrc);
  elImg.onerror = async () => {
    warn(`image failed (attempt ${retryCount + 1})`, pageData.imgSrc);
    if (retryCount >= SETTINGS.maxNlRetry) {
      warn("giving up");
      return;
    }
    const newData = await fetchNlRetry(pageData);
    if (newData) {
      displayImage(elImg, newData, retryCount + 1);
    }
  };
  elImg.src = pageData.imgSrc;
}
function renderTitle(title) {
  const formatMeta = (m) => {
    let content = m.text;
    if (m.type === "artist") {
      content = content.replace(/\(([^)]+)\)/, "<span>($1)</span>");
    }
    return `<span class="meta-item meta-${m.type}">${content}</span>`;
  };
  const leading = title.leading.map(formatMeta).join("");
  const trailing = title.trailing.map(formatMeta).join("");
  const main = `<span class="title-primary">${title.primary}</span>`;
  const sub = title.secondary
    ? `<span class="title-sep"> | </span><span class="title-secondary">${title.secondary}</span>`
    : "";
  return `
    <div class="title-meta-wrap leading">${leading}</div>
    <div class="title-main">${main}${sub}</div>
    <div class="title-meta-wrap trailing">${trailing}</div>
  `.trim();
}
function renderPage(ui, data, fitHeight, isInitial = false) {
  ui.elTitle.innerHTML = renderTitle(data.galleryTitle);
  ui.elCounter.textContent = data.counterText;
  ui.elFileInfo.textContent = data.fileInfo;
  ui.elGallery.href = data.galleryHref;
  const reader = document.getElementById("reader");
  if (reader) {
    reader.dataset.prev = data.prevHref ?? "";
    reader.dataset.next = data.nextHref ?? "";
  }
  displayImage(ui.elImg, data);
  if (!isInitial) {
    history.pushState({ viewerUrl: data.viewerUrl }, "", data.viewerUrl);
  }
  if (!fitHeight) {
    window.scrollTo(0, 0);
  }
  log("rendered", data.counterText);
}

// src/zoom.ts
class ZoomController {
  container;
  img;
  getFitHeight;
  zoomLevel = 1;
  zoomSnapTimer = null;
  panX = 0;
  panY = 0;
  isDragging = false;
  startX = 0;
  startY = 0;
  hasMoved = false;
  constructor(container, img, getFitHeight) {
    this.container = container;
    this.img = img;
    this.getFitHeight = getFitHeight;
    this.initEvents();
  }
  initEvents() {
    this.container.addEventListener("mousedown", (e) => this.onMouseDown(e));
    window.addEventListener("mousemove", (e) => this.onMouseMove(e));
    window.addEventListener("mouseup", () => this.onMouseUp());
    window.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          this.updateZoom(e.deltaY < 0 ? 0.1 : -0.1, this.getFitHeight());
        }
      },
      { passive: false }
    );
  }
  updateTransform() {
    const imgWidth = this.img.clientWidth;
    const imgHeight = this.img.clientHeight;
    const scaledWidth = imgWidth * this.zoomLevel;
    const scaledHeight = imgHeight * this.zoomLevel;
    const limitX = Math.max(0, (scaledWidth - window.innerWidth) / 2);
    const limitY = Math.max(0, (scaledHeight - window.innerHeight) / 2);
    this.panX = Math.max(-limitX, Math.min(this.panX, limitX));
    this.panY = Math.max(-limitY, Math.min(this.panY, limitY));
    this.img.style.transform =
      this.zoomLevel === 1 && this.panX === 0 && this.panY === 0
        ? ""
        : `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
  }
  updateZoom(delta, isFitHeight) {
    const isReset = delta === null;
    if (!isReset && !isFitHeight) {
      showToast("ZOOM: fit-height only");
      return;
    }
    if (isReset) {
      this.reset();
    } else {
      this.zoomLevel = Math.max(0.7, Math.min(5, this.zoomLevel + delta));
      this.updateTransform();
      showToast(`ZOOM: ${Math.round(this.zoomLevel * 100)}%`);
    }
    if (this.zoomSnapTimer !== null) {
      window.clearTimeout(this.zoomSnapTimer);
    }
    if (this.zoomLevel < 1) {
      this.zoomSnapTimer = window.setTimeout(() => {
        this.reset();
        showToast("ZOOM: 100%");
      }, 200);
    }
  }
  reset() {
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
    this.hasMoved = false;
    this.updateTransform();
  }
  onMouseDown(e) {
    if (e.target.closest("#hud, #page-info")) {
      return;
    }
    if (!this.getFitHeight()) {
      return;
    }
    e.preventDefault();
    if (this.zoomLevel > 1) {
      this.isDragging = true;
      this.hasMoved = false;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
      this.container.style.cursor = "grabbing";
      this.img.classList.add("no-transition");
    }
  }
  onMouseMove(e) {
    if (this.isDragging) {
      const newPanX = e.clientX - this.startX;
      const newPanY = e.clientY - this.startY;
      if (Math.abs(newPanX - this.panX) > 2 || Math.abs(newPanY - this.panY) > 2) {
        this.hasMoved = true;
      }
      this.panX = newPanX;
      this.panY = newPanY;
      this.updateTransform();
    }
  }
  onMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.container.style.cursor = "pointer";
      this.img.classList.remove("no-transition");
    }
  }
  handleKey(e, isFitHeight) {
    if (isFitHeight && this.zoomLevel > 1) {
      if (isKey(e, "up")) {
        this.panY += SETTINGS.scrollStep;
        this.updateTransform();
        return true;
      }
      if (isKey(e, "down")) {
        this.panY -= SETTINGS.scrollStep;
        this.updateTransform();
        return true;
      }
    }
    return false;
  }
  get isZoomed() {
    return this.zoomLevel > 1;
  }
  get wasPanned() {
    return this.hasMoved;
  }
}

// src/main.ts
document.documentElement.style.cssText = "visibility:hidden!important;background:#111!important";
let pendingNav = null;
let isNavigating = false;
let ui;
let zoom;
let currentFitHeight = SETTINGS.fitHeight;
async function navigateTo(url) {
  if (!url) {
    return;
  }
  pendingNav = url;
  if (isNavigating) {
    return;
  }
  while (pendingNav) {
    const target = pendingNav;
    pendingNav = null;
    isNavigating = true;
    try {
      const data = await fetchViewerPage(target);
      zoom?.reset();
      renderPage(ui, data, currentFitHeight);
      prefetchBoth(data);
    } catch (e) {
      warn("navigation failed", target, e);
    }
    isNavigating = false;
  }
}
function init() {
  log("init");
  const initData = parseViewerDoc(document, location.href);
  pageCache.set(location.href, initData);
  ui = injectShell(initData);
  zoom = new ZoomController(document.getElementById("reader"), ui.elImg, () => currentFitHeight);
  applyMode(currentFitHeight);
  renderPage(ui, initData, currentFitHeight, true);
  prefetchBoth(initData);
  registerMenuCommands((newFit) => {
    currentFitHeight = newFit;
    zoom.updateZoom(null, currentFitHeight);
    applyMode(currentFitHeight);
  });
  document.documentElement.style.cssText = "";
  log("SPA ready");
  window.addEventListener("popstate", (e) => {
    const url = e.state?.viewerUrl ?? location.href;
    const data = pageCache.get(url);
    if (data) {
      zoom.reset();
      renderPage(ui, data, currentFitHeight);
      prefetchBoth(data);
    } else {
      navigateTo(url);
    }
  });
  const reader = document.getElementById("reader");
  reader?.addEventListener("click", (e) => {
    if (e.target.closest("#hud, #page-info")) {
      return;
    }
    if (zoom.wasPanned) {
      return;
    }
    const x = e.clientX;
    const width = window.innerWidth;
    if (x < width * 0.4) {
      navigateTo(reader.dataset.prev);
    } else {
      navigateTo(reader.dataset.next);
    }
  });
  let mouseTimer = null;
  const hideCursor = () => document.body.classList.add("no-cursor");
  const showCursor = () => {
    document.body.classList.remove("no-cursor");
    if (mouseTimer !== null) {
      window.clearTimeout(mouseTimer);
    }
    mouseTimer = window.setTimeout(hideCursor, 3000);
  };
  window.addEventListener("mousemove", showCursor);
  window.addEventListener("mousedown", showCursor);
  showCursor();
  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (e.ctrlKey) {
      const k = e.key.toUpperCase();
      if (k === "=" || k === "+" || e.key === "+") {
        e.preventDefault();
        zoom.updateZoom(0.1, currentFitHeight);
        return;
      }
      if (k === "-" || k === "_" || e.key === "-") {
        e.preventDefault();
        zoom.updateZoom(-0.1, currentFitHeight);
        return;
      }
      if (k === "0") {
        e.preventDefault();
        zoom.updateZoom(null, currentFitHeight);
        return;
      }
    }
    if (mouseTimer !== null) {
      window.clearTimeout(mouseTimer);
    }
    mouseTimer = window.setTimeout(hideCursor, 3000);
    if (zoom.handleKey(e, currentFitHeight)) {
      return;
    }
    if (isKey(e, "fit")) {
      currentFitHeight = !currentFitHeight;
      zoom.updateZoom(null, currentFitHeight);
      applyMode(currentFitHeight);
      showToast(`MODE: ${currentFitHeight ? "FIT HEIGHT" : "NATURAL WIDTH"}`);
    } else if (isKey(e, "gallery")) {
      location.href = ui.elGallery.href;
    } else if (isKey(e, "up")) {
      if (!currentFitHeight) {
        e.preventDefault();
        window.scrollBy(0, -SETTINGS.scrollStep);
      }
    } else if (isKey(e, "down")) {
      if (!currentFitHeight) {
        e.preventDefault();
        window.scrollBy(0, SETTINGS.scrollStep);
      }
    } else if (isKey(e, "next")) {
      e.preventDefault();
      navigateTo(reader?.dataset.next);
    } else if (isKey(e, "prev")) {
      e.preventDefault();
      navigateTo(reader?.dataset.prev);
    }
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
