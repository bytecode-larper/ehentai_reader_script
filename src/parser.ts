import type { PageData } from "./types";

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

  // Fix: previous logic had an operator precedence bug — ?? binds looser than
  // the ternary, so the #i3 fallback was always evaluated. Explicit check first.
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

  const galleryTitle = doc.querySelector("h1")?.textContent?.trim() ?? "";

  return {
    viewerUrl,
    pageNum,
    counterText,
    galleryTitle,
    imgSrc,
    nextHref,
    prevHref,
    fileInfo,
    galleryHref,
    nlToken,
  };
}
