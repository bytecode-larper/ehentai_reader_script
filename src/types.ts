export interface PageData {
  viewerUrl: string;
  pageNum: number;
  counterText: string;
  galleryTitle: string;
  imgSrc: string;
  nextHref: string | null;
  prevHref: string | null;
  fileInfo: string;
  galleryHref: string;
  nlToken: string | null;
}

export interface UserSettings {
  // User-facing (Menu)
  fitHeight: boolean;
  debug: boolean;
  
  // Tunables (Internal)
  scrollStep: number;
  prefetchCount: number;
  maxNlRetry: number;
  imgCacheLimit: number;
}
