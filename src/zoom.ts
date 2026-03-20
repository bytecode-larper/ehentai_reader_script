import { SETTINGS, isKey } from "./config";
import { showToast } from "./ui";

export class ZoomController {
  private zoomLevel = 1.0;
  private zoomSnapTimer: any = null;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private hasMoved = false;

  constructor(
    private container: HTMLElement,
    private img: HTMLImageElement,
    private getFitHeight: () => boolean,
  ) {
    this.initEvents();
  }

  private initEvents() {
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
      { passive: false },
    );
  }

  private updateTransform() {
    const imgWidth = this.img.clientWidth;
    const imgHeight = this.img.clientHeight;
    const scaledWidth = imgWidth * this.zoomLevel;
    const scaledHeight = imgHeight * this.zoomLevel;

    const limitX = Math.max(0, (scaledWidth - window.innerWidth) / 2);
    const limitY = Math.max(0, (scaledHeight - window.innerHeight) / 2);

    this.panX = Math.max(-limitX, Math.min(this.panX, limitX));
    this.panY = Math.max(-limitY, Math.min(this.panY, limitY));

    this.img.style.transform =
      this.zoomLevel === 1.0 && this.panX === 0 && this.panY === 0
        ? ""
        : `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
  }

  public updateZoom(delta: number | null, isFitHeight: boolean) {
    if (delta !== null && !isFitHeight) return;

    if (delta === null) {
      this.reset();
    } else {
      this.zoomLevel = Math.max(0.7, Math.min(5.0, this.zoomLevel + delta));
      this.updateTransform();
      showToast(`ZOOM: ${Math.round(this.zoomLevel * 100)}%`);
    }

    if (this.zoomSnapTimer) window.clearTimeout(this.zoomSnapTimer);
    if (this.zoomLevel < 1.0) {
      this.zoomSnapTimer = window.setTimeout(() => {
        this.reset();
        showToast("ZOOM: 100%");
      }, 200);
    }
  }

  public reset() {
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.updateTransform();
  }

  private onMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest("#hud, #page-info")) return;
    if (!this.getFitHeight()) return;

    e.preventDefault();
    if (this.zoomLevel > 1.0) {
      this.isDragging = true;
      this.hasMoved = false;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
      this.container.style.cursor = "grabbing";
      this.img.classList.add("no-transition");
    }
  }

  private onMouseMove(e: MouseEvent) {
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

  private onMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.container.style.cursor = "pointer";
      this.img.classList.remove("no-transition");
    }
  }

  public handleKey(e: KeyboardEvent, isFitHeight: boolean): boolean {
    if (isFitHeight && this.zoomLevel > 1.0) {
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

  public get isZoomed() {
    return this.zoomLevel > 1.0;
  }

  public get wasPanned() {
    return this.hasMoved;
  }
}
