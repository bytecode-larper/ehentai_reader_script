export interface TitleMetadata {
  text: string;
  type: "artist" | "event" | "tag" | "parody" | "anthology" | "lang";
}

export interface ParsedTitle {
  leading: TitleMetadata[];
  primary: string;
  secondary: string | null;
  trailing: TitleMetadata[];
}

export interface PageData {
  viewerUrl: string;
  pageNum: number;
  counterText: string;
  galleryTitle: ParsedTitle;
  imgSrc: string;
  nextHref: string | null;
  prevHref: string | null;
  fileInfo: string;
  galleryHref: string;
  nlToken: string | null;
}

export interface KeyMap {
  next: string[];
  prev: string[];
  fit: string[];
  gallery: string[];
  up: string[];
  down: string[];
}

export interface UserSettings {
  fitHeight: boolean;
  debug: boolean;
  scrollStep: number;
  prefetchCount: number;
  maxNlRetry: number;
  imgCacheLimit: number;
  keymap: KeyMap;
}
