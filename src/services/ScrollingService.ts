export class ScrollingService {
  public scrollIntoView(range: Range, options?: ScrollIntoViewOptions): Promise<void> {
    return new Promise((resolve) => {
      const abort = new AbortController();
      const done = () => {
        abort.abort();

        setTimeout(() => resolve(), 10);
      };

      const scrollingElements = this._getScrollingElements(range);

      // Listen for scrollend on window (handles document scrolling)
      window.addEventListener("scrollend", () => done(), {
        signal: abort.signal,
      });

      // Listen for scrollend on other scrolling elements
      scrollingElements.forEach((element) => {
        if (element !== document.documentElement && element !== document.body) {
          element.addEventListener("scrollend", () => done(), {
            signal: abort.signal,
          });
        }
      });

      // Perform scrolling on all scrolling elements
      this._scrollRangeIntoView(range, scrollingElements, options);

      // Fallback timeout in case scrollend events don't fire
      setTimeout(() => {
        if (!abort.signal.aborted) {
          done();
        }
      }, 1000);
    });
  }

  private _getScrollingElements(range: Range): Element[] {
    const scrollingElements: Element[] = [];
    let current: Node | null = range.commonAncestorContainer;

    // Walk up the DOM tree to find all scrollable ancestors
    while (current && current !== document) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current as Element;
        const style = window.getComputedStyle(element);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        const isScrollable =
          (overflowY === "auto" ||
            overflowY === "scroll" ||
            overflowX === "auto" ||
            overflowX === "scroll") &&
          (element.scrollHeight > element.clientHeight ||
            element.scrollWidth > element.clientWidth);

        if (isScrollable) {
          scrollingElements.push(element);
        }
      }
      current = current.parentNode;
    }

    // Always include document.documentElement for main window scrolling
    if (!scrollingElements.includes(document.documentElement)) {
      scrollingElements.push(document.documentElement);
    }

    return scrollingElements;
  }

  private _scrollRangeIntoView(
    range: Range,
    scrollingElements: Element[],
    options?: ScrollIntoViewOptions,
  ): void {
    const rects = Array.from(range.getClientRects());
    if (rects.length === 0) {
      return;
    }

    // Use the first rect as the target position
    const targetRect = rects[0];

    // Determine block alignment
    const block = options?.block ?? "start";
    const behavior = options?.behavior ?? "auto";

    scrollingElements.forEach((element) => {
      const isDocumentElement = element === document.documentElement || element === document.body;

      // Calculate the scroll position needed
      let scrollTop = 0;
      let scrollLeft = 0;

      if (isDocumentElement) {
        // For document scrolling, use window dimensions
        // getClientRects() returns coordinates relative to viewport
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        // Calculate absolute position in document
        const absoluteTop = window.scrollY + targetRect.top;
        const absoluteLeft = window.scrollX + targetRect.left;

        // Calculate vertical scroll position
        if (block === "start") {
          scrollTop = absoluteTop;
        } else if (block === "center") {
          scrollTop = absoluteTop + targetRect.height / 2 - viewportHeight / 2;
        } else if (block === "end") {
          scrollTop = absoluteTop + targetRect.height - viewportHeight;
        } else {
          // "nearest" - only scroll if range is not visible
          const rangeTop = targetRect.top;
          const rangeBottom = targetRect.top + targetRect.height;
          if (rangeTop < 0) {
            scrollTop = absoluteTop;
          } else if (rangeBottom > viewportHeight) {
            scrollTop = absoluteTop + targetRect.height - viewportHeight;
          } else {
            scrollTop = window.scrollY; // No change
          }
        }

        // Horizontal alignment (always nearest for now)
        const rangeLeft = targetRect.left;
        const rangeRight = targetRect.left + targetRect.width;
        if (rangeLeft < 0) {
          scrollLeft = absoluteLeft;
        } else if (rangeRight > viewportWidth) {
          scrollLeft = absoluteLeft + targetRect.width - viewportWidth;
        } else {
          scrollLeft = window.scrollX; // No change
        }

        // Perform the scroll
        if (behavior === "smooth") {
          window.scrollTo({
            top: Math.max(0, scrollTop),
            left: Math.max(0, scrollLeft),
            behavior: "smooth",
          });
        } else {
          window.scrollTo(Math.max(0, scrollLeft), Math.max(0, scrollTop));
        }
      } else {
        // For other scrolling elements
        const containerRect = element.getBoundingClientRect();
        const containerHeight = containerRect.height;
        const containerWidth = containerRect.width;

        // Calculate position relative to the container
        const relativeTop = targetRect.top - containerRect.top + element.scrollTop;

        // Calculate vertical scroll position
        if (block === "start") {
          scrollTop = relativeTop;
        } else if (block === "center") {
          scrollTop = relativeTop + targetRect.height / 2 - containerHeight / 2;
        } else if (block === "end") {
          scrollTop = relativeTop + targetRect.height - containerHeight;
        } else {
          // "nearest" - only scroll if range is not visible
          const rangeTop = targetRect.top - containerRect.top;
          const rangeBottom = rangeTop + targetRect.height;
          if (rangeTop < 0) {
            scrollTop = element.scrollTop + rangeTop;
          } else if (rangeBottom > containerHeight) {
            scrollTop = element.scrollTop + rangeBottom - containerHeight;
          } else {
            scrollTop = element.scrollTop; // No change
          }
        }

        // Horizontal alignment (always nearest for now)
        const rangeLeft = targetRect.left - containerRect.left;
        const rangeRight = rangeLeft + targetRect.width;
        if (rangeLeft < 0) {
          scrollLeft = element.scrollLeft + rangeLeft;
        } else if (rangeRight > containerWidth) {
          scrollLeft = element.scrollLeft + rangeRight - containerWidth;
        } else {
          scrollLeft = element.scrollLeft; // No change
        }

        // Perform the scroll
        if (behavior === "smooth") {
          element.scrollTo({
            top: Math.max(0, scrollTop),
            left: Math.max(0, scrollLeft),
            behavior: "smooth",
          });
        } else {
          element.scrollTop = Math.max(0, scrollTop);
          element.scrollLeft = Math.max(0, scrollLeft);
        }
      }
    });
  }
}
