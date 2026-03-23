import { log } from "./config";
import type { PageData, ParsedTitle, TitleMetadata } from "./types";

export function parseViewerDoc(doc: Document | HTMLElement, viewerUrl: string): PageData {
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

  const anchors = [...(doc.querySelectorAll('a[href*="/s/"]') as NodeListOf<HTMLAnchorElement>)];
  const hrefMatching = (n: number) =>
    anchors.find((a) => a.href.match(new RegExp(`-(${n})(\\?|$)`)))?.href ?? null;

  const nextHref = (() => {
    const byNum = hrefMatching(pageNum + 1);
    if (byNum) return byNum;
    const i3 = (doc.querySelector("#i3 a") as HTMLAnchorElement | null)?.href;
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
      if (/\d+ x \d+/.test(t) && t.includes("::")) return (t.split("\n")[0] ?? t).trim();
    }
    return "";
  })();

  const galleryHref =
    (doc.querySelector('a[href*="/g/"]') as HTMLAnchorElement | null)?.href ?? "#";

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

function parseTitle(raw: string): ParsedTitle {
  let text = raw.trim();
  const leading: TitleMetadata[] = [];
  const trailing: TitleMetadata[] = [];

  const langRegex = /\[(English|Japanese|Chinese|Korean|Thai|Vietnamese|French|German|Italian|Portuguese|Russian|Spanish)/i;
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
    if (!match || !match[1]) break;
    const m = match[1];

    let type: TitleMetadata["type"] = "tag";
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
    if (!match || !match[1]) break;
    const m = match[1];

    let type: TitleMetadata["type"] = "tag";
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
