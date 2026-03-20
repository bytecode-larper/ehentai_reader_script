export interface PageData {
  viewerUrl: string;
  pageNum: number;
  counterText: string;
  totalPages: number;
  imgSrc: string;
  nextHref: string | null;
  prevHref: string | null;
  fileInfo: string;
  galleryHref: string;
  nlToken: string | null;
}
