import { CONFIG, log, warn } from "./config";
import { parseViewerDoc } from "./parser";
import { PageData } from "./types";

export const pageCache = new Map<string, PageData>();
export const imgCache = new Map<string, HTMLImageElement>();
let preloadContainer: HTMLDivElement | null = null;

function ensurePreloadContainer() {
  if (preloadContainer) return;
  preloadContainer = Object.assign(document.createElement("div"), {
    style:
      "position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none",
  });
  document.body.appendChild(preloadContainer);
}

export function preloadImage(src: string): HTMLImageElement {
  if (imgCache.has(src)) return imgCache.get(src)!;

  if (imgCache.size >= CONFIG.IMG_CACHE_LIMIT) {
    const oldest = imgCache.keys().next().value as string;
    imgCache.get(oldest)?.remove();
    imgCache.delete(oldest);
  }

  ensurePreloadContainer();
  const img = document.createElement("img");
  img.onload = () => log("preload done", src);
  img.onerror = () => warn("preload error", src);
  img.src = src;
  preloadContainer!.appendChild(img);
  imgCache.set(src, img);
  return img;
}

export async function fetchViewerPage(viewerUrl: string): Promise<PageData> {
  if (pageCache.has(viewerUrl)) return pageCache.get(viewerUrl)!;

  log("fetching viewer →", viewerUrl);
  const res = await fetch(viewerUrl, { credentials: "include" });
  const html = await res.text();
  const data = parseViewerDoc(
    new DOMParser().parseFromString(html, "text/html"),
    viewerUrl,
  );

  pageCache.set(viewerUrl, data);
  return data;
}

export async function fetchNlRetry(
  pageData: PageData,
): Promise<PageData | null> {
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

export async function prefetchBoth(data: PageData) {
  const prefetchDirection = async (getNext: (d: PageData) => string | null) => {
    let cur = data;
    for (let i = 0; i < CONFIG.PREFETCH_COUNT; i++) {
      const href = getNext(cur);
      if (!href) break;
      const nextData = await fetchViewerPage(href).catch(() => null);
      if (!nextData?.imgSrc) break;
      preloadImage(nextData.imgSrc);
      cur = nextData;
    }
  };
  prefetchDirection((d) => d.nextHref);
  prefetchDirection((d) => d.prevHref);
}
