export class ScrollingService {
  public static scrollIntoView(element: HTMLElement, options?: ScrollIntoViewOptions): Promise<void> {
    return new Promise((resolve) => {
      const abort = new AbortController();
      const done = () => {
        abort.abort();

        setTimeout(() => resolve(), 10);
      };

      window.addEventListener("scrollend", () => done(), {
        signal: abort.signal
      });

      element.scrollIntoView(options);
    });
  }
}