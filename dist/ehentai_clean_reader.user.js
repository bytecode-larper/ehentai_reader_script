// ==UserScript==
// @name         E-Hentai Clean Reader
// @namespace    https://e-hentai.org/
// @version      2.3.0
// @icon         https://api.iconify.design/ph/book-open-bold.svg
// @match        https://e-hentai.org/s/*/*
// @match        https://exhentai.org/s/*/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

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
  return {
    viewerUrl,
    pageNum,
    counterText,
    imgSrc,
    nextHref,
    prevHref,
    fileInfo,
    galleryHref,
    nlToken,
  };
}

// src/config.ts
const CONFIG = {
  DEBUG: true,
  PREFETCH_COUNT: 2,
  MAX_NL_RETRY: 4,
  IMG_CACHE_LIMIT: 20,
  SCROLL_STEP: 160,
};
const TAG = "[EH-Reader]";
const log = (...a) => CONFIG.DEBUG && console.log(TAG, ...a);
const warn = (...a) => CONFIG.DEBUG && console.warn(TAG, ...a);

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
  if (imgCache.size >= CONFIG.IMG_CACHE_LIMIT) {
    const oldest = imgCache.keys().next().value;
    imgCache.get(oldest)?.remove();
    imgCache.delete(oldest);
    log("evicted preload", oldest);
  }
  ensurePreloadContainer();
  const img = document.createElement("img");
  img.onload = () => log("preload done", src);
  img.onerror = () => warn("preload error", src);
  img.src = src;
  preloadContainer.appendChild(img);
  imgCache.set(src, img);
  log("preloading", src);
  return img;
}
async function fetchViewerPage(viewerUrl) {
  if (pageCache.has(viewerUrl)) {
    log("viewer cache hit", viewerUrl);
    return pageCache.get(viewerUrl);
  }
  log("fetching viewer →", viewerUrl);
  const res = await fetch(viewerUrl, { credentials: "include" });
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
async function prefetchDirection(data, getNext) {
  let cur = data;
  for (let i = 0; i < CONFIG.PREFETCH_COUNT; i++) {
    const href = getNext(cur);
    if (!href) {
      break;
    }
    const next = await fetchViewerPage(href).catch(() => null);
    if (!next) {
      break;
    }
    if (next.imgSrc) {
      preloadImage(next.imgSrc);
    }
    cur = next;
  }
}
function prefetchBoth(data) {
  prefetchDirection(data, (d) => d.nextHref).catch((e) => warn("prefetch forward error", e));
  prefetchDirection(data, (d) => d.prevHref).catch((e) => warn("prefetch backward error", e));
}

// src/shell.html
const shell_default = `<div id="reader">\r
  <span id="img-wrap"><img id="main-img" src="" alt="" /></span>\r
  <div id="hud">\r
    <a id="hud-gallery" href="" title="Back to gallery">&#8617;</a>\r
    <span id="hud-counter"></span>\r
    <button id="hud-fit" title="Toggle fit (F)">fit&nbsp;H</button>\r
  </div>\r
  <span id="nav-prev" class="disabled">&#8592;</span>\r
  <span id="nav-next" class="disabled">&#8594;</span>\r
  <div id="file-info"></div>\r
</div>\r
`;

// src/style.css
const style_default = `*,\r
*::before,\r
*::after {\r
  box-sizing: border-box;\r
  margin: 0;\r
  padding: 0;\r
}\r
html,\r
body {\r
  background: #111;\r
  color: #ccc;\r
  font:\r
    13px/1 system-ui,\r
    sans-serif;\r
  height: 100%;\r
}\r
\r
body.fit-h {\r
  overflow: hidden;\r
}\r
body.fit-h #reader {\r
  position: relative;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  width: 100vw;\r
  height: 100vh;\r
  overflow: hidden;\r
}\r
body.fit-h #img-wrap {\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
}\r
body.fit-h #main-img {\r
  max-height: 100vh;\r
  max-width: 100vw;\r
  width: auto;\r
  height: 100vh;\r
  object-fit: contain;\r
}\r
\r
body.fit-w {\r
  overflow-y: auto;\r
  overflow-x: hidden;\r
}\r
body.fit-w #reader {\r
  position: relative;\r
  min-height: 100vh;\r
  display: flex;\r
  align-items: flex-start;\r
  justify-content: center;\r
  width: 100%;\r
}\r
body.fit-w #img-wrap {\r
  display: block;\r
}\r
body.fit-w #main-img {\r
  display: block;\r
  max-width: 100vw;\r
  height: auto;\r
}\r
\r
#main-img {\r
  user-select: none;\r
  -webkit-user-drag: none;\r
}\r
\r
#hud {\r
  position: fixed;\r
  top: 0;\r
  left: 0;\r
  right: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
  padding: 8px 14px;\r
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7) 0%, transparent 100%);\r
  opacity: 0;\r
  transition: opacity 0.2s;\r
  z-index: 10;\r
}\r
body:hover #hud {\r
  opacity: 1;\r
}\r
#hud-gallery {\r
  color: #aaa;\r
  text-decoration: none;\r
  font-size: 18px;\r
  line-height: 1;\r
}\r
#hud-gallery:hover {\r
  color: #fff;\r
}\r
#hud-counter {\r
  flex: 1;\r
  text-align: center;\r
  font-size: 13px;\r
  color: #999;\r
  letter-spacing: 0.04em;\r
}\r
#hud-fit {\r
  background: rgba(255, 255, 255, 0.08);\r
  border: 1px solid rgba(255, 255, 255, 0.15);\r
  color: #ccc;\r
  padding: 3px 9px;\r
  border-radius: 4px;\r
  cursor: pointer;\r
  font-size: 12px;\r
}\r
#hud-fit:hover {\r
  background: rgba(255, 255, 255, 0.18);\r
  color: #fff;\r
}\r
\r
#nav-prev,\r
#nav-next {\r
  position: fixed;\r
  top: 50%;\r
  transform: translateY(-50%);\r
  font-size: 28px;\r
  color: rgba(255, 255, 255, 0);\r
  padding: 20px 16px;\r
  transition: color 0.15s;\r
  z-index: 10;\r
  user-select: none;\r
  cursor: pointer;\r
}\r
#nav-prev {\r
  left: 0;\r
}\r
#nav-next {\r
  right: 0;\r
}\r
#nav-prev.disabled,\r
#nav-next.disabled {\r
  cursor: default;\r
  pointer-events: none;\r
}\r
#nav-prev.loading,\r
#nav-next.loading {\r
  color: rgba(255, 255, 255, 0.15) !important;\r
}\r
body:hover #nav-prev:not(.disabled):not(.loading),\r
body:hover #nav-next:not(.disabled):not(.loading) {\r
  color: rgba(255, 255, 255, 0.3);\r
}\r
#nav-prev:not(.disabled):not(.loading):hover,\r
#nav-next:not(.disabled):not(.loading):hover {\r
  color: rgba(255, 255, 255, 0.9) !important;\r
}\r
\r
#file-info {\r
  position: fixed;\r
  bottom: 10px;\r
  right: 14px;\r
  font-size: 11px;\r
  color: rgba(255, 255, 255, 0.25);\r
  white-space: nowrap;\r
  pointer-events: none;\r
  opacity: 0;\r
  transition: opacity 0.2s;\r
  z-index: 10;\r
}\r
body:hover #file-info {\r
  opacity: 1;\r
}\r
`;

// src/ui.ts
function injectShell(initData) {
  document.body.innerHTML = shell_default.replace('href=""', `href="${initData.galleryHref}"`);
  GM_addStyle(style_default);
  return {
    elImg: document.getElementById("main-img"),
    elCounter: document.getElementById("hud-counter"),
    elFileInfo: document.getElementById("file-info"),
    elPrev: document.getElementById("nav-prev"),
    elNext: document.getElementById("nav-next"),
    elGallery: document.getElementById("hud-gallery"),
  };
}
function applyMode(fitHeight) {
  document.body.classList.toggle("fit-h", fitHeight);
  document.body.classList.toggle("fit-w", !fitHeight);
  const btn = document.getElementById("hud-fit");
  if (btn) {
    btn.textContent = fitHeight ? "fit H" : "natural";
  }
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
    if (retryCount >= CONFIG.MAX_NL_RETRY) {
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
function renderPage(ui, data, fitHeight, isInitial = false) {
  ui.elCounter.textContent = data.counterText;
  ui.elFileInfo.textContent = data.fileInfo;
  ui.elGallery.href = data.galleryHref;
  document.title = `${data.counterText} - E-Hentai`;
  ui.elPrev.className = data.prevHref ? "" : "disabled";
  ui.elPrev.dataset.href = data.prevHref ?? "";
  ui.elNext.className = data.nextHref ? "" : "disabled";
  ui.elNext.dataset.href = data.nextHref ?? "";
  displayImage(ui.elImg, data);
  if (!isInitial) {
    history.pushState({ viewerUrl: data.viewerUrl }, "", data.viewerUrl);
  }
  if (!fitHeight) {
    window.scrollTo(0, 0);
  }
  log("rendered", data.counterText);
}

// src/main.ts
document.documentElement.style.cssText = "visibility:hidden!important;background:#111!important";
let pendingNav = null;
let isNavigating = false;
let fitHeight = true;
let ui;
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
      renderPage(ui, data, fitHeight);
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
  applyMode(fitHeight);
  renderPage(ui, initData, fitHeight, true);
  prefetchBoth(initData);
  document.documentElement.style.cssText = "";
  log("SPA ready");
  window.addEventListener("popstate", (e) => {
    const url = e.state?.viewerUrl ?? location.href;
    const data = pageCache.get(url);
    if (data) {
      renderPage(ui, data, fitHeight);
      prefetchBoth(data);
    } else {
      navigateTo(url);
    }
  });
  ui.elPrev.addEventListener("click", () => navigateTo(ui.elPrev.dataset.href));
  ui.elNext.addEventListener("click", () => navigateTo(ui.elNext.dataset.href));
  document.getElementById("hud-fit")?.addEventListener("click", () => {
    fitHeight = !fitHeight;
    applyMode(fitHeight);
  });
  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    switch (e.key) {
      case "f":
      case "F":
        fitHeight = !fitHeight;
        applyMode(fitHeight);
        break;
      case "ArrowUp":
      case "w":
      case "W":
        if (!fitHeight) {
          e.preventDefault();
          window.scrollBy({ top: -CONFIG.SCROLL_STEP, behavior: "smooth" });
        }
        break;
      case "ArrowDown":
      case "s":
      case "S":
        if (!fitHeight) {
          e.preventDefault();
          window.scrollBy({ top: CONFIG.SCROLL_STEP, behavior: "smooth" });
        }
        break;
      case "ArrowRight":
      case "d":
      case "D":
        e.preventDefault();
        navigateTo(ui.elNext.dataset.href);
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        e.preventDefault();
        navigateTo(ui.elPrev.dataset.href);
        break;
    }
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
