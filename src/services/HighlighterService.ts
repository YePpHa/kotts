import { EventEmitter } from "../libs/EventEmitter";
import { ScrollingService } from "./ScrollingService";

export class HighligherService {
  public onHighlightChange = new EventEmitter<() => void>();

  private _autoScrolling = true;

  private _scrollingService = new ScrollingService();

  private _highlightContainer: HTMLElement | null = null;

  private _scrollingId = 0;
  public scrolling = false;

  public setAutoScrolling(enabled: boolean) {
    this._autoScrolling = enabled;
  }

  public isAutoScrolling(): boolean {
    return this._autoScrolling;
  }

  private _getHighlightContainer(): HTMLElement {
    if (this._highlightContainer === null) {
      this._highlightContainer = document.createElement("div");
      this._highlightContainer.classList.add("kokotts-highlight-container");
      document.body.appendChild(this._highlightContainer);
    }

    return this._highlightContainer;
  }

  public highlightBrowserRange(range: Range, prevRect?: DOMRect): void {
    if (
      range.startContainer !== range.endContainer ||
      range.startContainer.nodeType !== Node.TEXT_NODE
    ) {
      return;
    }

    const container = this._getHighlightContainer();
    const highlightElements: HTMLElement[] = [];

    const rects = Array.from(range.getClientRects());
    for (const rect of rects) {
      const wrapperNode = document.createElement("div");
      wrapperNode.classList.add("kokotts-highlight");
      wrapperNode.style.left = `${Math.round(rect.left + (document.scrollingElement?.scrollLeft ?? 0))}px`;
      wrapperNode.style.top = `${Math.round(rect.top + (document.scrollingElement?.scrollTop ?? 0))}px`;
      wrapperNode.style.width = `${rect.width}px`;
      wrapperNode.style.height = `${rect.height}px`;
      container.appendChild(wrapperNode);

      if (prevRect !== undefined) {
        if (Math.abs(rect.top - prevRect.top) < rect.height/2) {
          const diff = prevRect.left - rect.left;
          wrapperNode.style.setProperty("--animate-from-left", `${diff}px`);
          wrapperNode.style.setProperty(
            "--animate-from-width",
            `${prevRect.width}px`,
          );
          wrapperNode.classList.add("kokotts-highlight--animate");
          window.requestAnimationFrame(() => {
            wrapperNode.style.removeProperty("--animate-from-left");
            wrapperNode.style.removeProperty("--animate-from-width");
            wrapperNode.classList.remove("kokotts-highlight--animate");
          });
        }
      }

      highlightElements.push(wrapperNode);
    }

    const firstHighlight = highlightElements.at(0);
    if (this._autoScrolling && firstHighlight) {
      this.scrollIntoView(firstHighlight);
    }
    this.onHighlightChange.emit();
  }

  public async scrollIntoView(element: HTMLElement): Promise<void> {
    const scrollingId = ++this._scrollingId;
    try {
      this.scrolling = true;
      await this._scrollingService.scrollIntoView(element, {
        behavior: "smooth",
        block: "center",
      });
    } finally {
      if (scrollingId === this._scrollingId) {
        this.scrolling = false;
      }
    }
  }

  public clear() {
    if (this._highlightContainer !== null) {
      for (const child of Array.from(this._highlightContainer.children)) {
        this._highlightContainer.removeChild(child);
      }
    }
  }
}
