import { EventEmitter } from "../libs/EventEmitter";
import { ScrollingService } from "./ScrollingService";

export class OldHighligherService {
  public onHighlightChange = new EventEmitter<() => void>();

  private _restoreMap = new Map<Node, Node[]>();

  private _autoScrolling = true;

  private _scrollingService = new ScrollingService();

  private _scrollingId = 0;
  public scrolling = false;

  public setAutoScrolling(enabled: boolean) {
    this._autoScrolling = enabled;
  }

  public isAutoScrolling(): boolean {
    return this._autoScrolling;
  }

  private _getSplitRange(range: Range): Range[] {
    const originalTextNode = range.startContainer;

    const split = this._restoreMap.get(originalTextNode);
    if (split === undefined) {
      return [range];
    }

    const ranges = [];
    let currentIndex = 0;
    for (const textNode of split) {
      const textLength = (textNode.textContent ?? "").length;
      const newRange = document.createRange();

      const start = Math.min(
        Math.max(range.startOffset - currentIndex, 0),
        textLength,
      );
      const end = Math.max(
        Math.min(range.endOffset - currentIndex, textLength),
        0,
      );

      newRange.setStart(textNode, start);
      newRange.setEnd(textNode, end);

      ranges.push(newRange);
      currentIndex += textLength;
    }

    return ranges
      .filter((range) => !range.collapsed);
  }

  public highlightBrowserRange(range: Range, prevRect?: DOMRect): void {
    if (
      range.startContainer !== range.endContainer ||
      range.startContainer.nodeType !== Node.TEXT_NODE
    ) {
      return;
    }

    const originalTextNode = range.startContainer;

    const highlightElements: HTMLElement[] = [];

    const ranges = this._getSplitRange(range);
    for (const range of ranges) {
      const subTextNode = range.startContainer as ChildNode;
      const textContent = subTextNode.textContent ?? "";
      const parts: Node[] = [
        textContent.slice(0, range.startOffset),
        textContent.slice(range.startOffset, range.endOffset),
        textContent.slice(range.endOffset),
      ]
        .map((part) => document.createTextNode(part));

      const allSubNodes = this._restoreMap.get(originalTextNode);
      if (allSubNodes === undefined) {
        this._restoreMap.set(originalTextNode, parts);
      } else {
        const index = allSubNodes.indexOf(subTextNode);
        allSubNodes.splice(index, 1, ...parts);
      }

      const highlightTextNode = parts[1];
      const wrapperNode = document.createElement("span");
      wrapperNode.classList.add("kokotts-highlight");
      wrapperNode.appendChild(highlightTextNode);
      parts[1] = wrapperNode;

      subTextNode.replaceWith(...parts);

      if (prevRect !== undefined) {
        const rect = wrapperNode.getBoundingClientRect();
        if (rect.top === prevRect.top) {
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
    for (const [textNode, subNodes] of this._restoreMap) {
      const range = new Range();
      range.setStart(subNodes[0], 0);
      range.setEnd(
        subNodes[subNodes.length - 1],
        (subNodes[subNodes.length - 1].textContent ?? "").length,
      );

      range.deleteContents();
      range.insertNode(textNode);
    }

    this._restoreMap.clear();
  }
}
