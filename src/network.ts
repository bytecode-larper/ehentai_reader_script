import { log, warn, SETTINGS } from "./config";
import { parseViewerDoc } from "./parser";
import type { PageData } from "./types";

export const PAGE_CACHE_LIMIT = 40;

export const pageCache = new Map<string, PageData>();
export const imgCache = new Map<string, HTMLImageElement>();
let preloadContainer: HTMLDivElement | null = null;

function ensurePreloadContainer() {
  if (preloadContainer) return;
  preloadContainer = Object.assign(document.createElement("div"), {
    style: "position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none",
  });
  document.body.appendChild(preloadContainer);
}

export function preloadImage(src: string): HTMLImageElement {
  if (imgCache.has(src)) return imgCache.get(src)!;

  if (imgCache.size >= SETTINGS.imgCacheLimit) {
    const oldest = imgCache.keys().next().value as string;
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
  preloadContainer!.appendChild(img);
  imgCache.set(src, img);
  log("preloading", src);
  return img;
}

export async function fetchViewerPage(viewerUrl: string): Promise<PageData> {
  if (pageCache.has(viewerUrl)) {
    log("viewer cache hit", viewerUrl);
    return pageCache.get(viewerUrl)!;
  }
  log("fetching viewer →", viewerUrl);
  const res = await fetch(viewerUrl, { credentials: "include" });
  const html = await res.text();
  const data = parseViewerDoc(new DOMParser().parseFromString(html, "text/html"), viewerUrl);
  if (pageCache.size >= PAGE_CACHE_LIMIT) {
    pageCache.delete(pageCache.keys().next().value as string);
  }
  pageCache.set(viewerUrl, data);
  log("cached viewer", viewerUrl, "| img:", data.imgSrc, "| nl:", data.nlToken);
  return data;
}

export async function fetchNlRetry(pageData: PageData): Promise<PageData | null> {
  if (!pageData.nlToken) return null;
  const retryUrl = `${pageData.viewerUrl.split("?")[0]}?nl=${pageData.nlToken}`;
  log("nl retry →", retryUrl);
  try {
    const res = await fetch(retryUrl, { credentials: "include" });
    const newData = parseViewerDoc(
      new DOMParser().parseFromString(await res.text(), "text/html"),
      pageData.viewerUrl,
    );
    pageCache.set(pageData.viewerUrl, newData);
    return newData;
  } catch (e) {
    warn("nl retry fetch failed", e);
    return null;
  }
}

async function prefetchDirection(
  data: PageData,
  getNext: (d: PageData) => string | null,
): Promise<void> {
  let cur = data;
  for (let i = 0; i < SETTINGS.prefetchCount; i++) {
    const href = getNext(cur);
    if (!href) break;
    const next = await fetchViewerPage(href).catch(() => null);
    if (!next) break;
    if (next.imgSrc) preloadImage(next.imgSrc);
    cur = next;
  }
}

export function prefetchBoth(data: PageData): void {
  prefetchDirection(data, (d) => d.nextHref).catch((e) => warn("prefetch forward error", e));
  prefetchDirection(data, (d) => d.prevHref).catch((e) => warn("prefetch backward error", e));
}
