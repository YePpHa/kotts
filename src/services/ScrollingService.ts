export class ScrollingService {
  public static scrollIntoView(element: HTMLElement, options?: ScrollIntoViewOptions): Promise<void> {
    const timeout = 5000;
  
    return new Promise((resolve) => {
      const abort = new AbortController();
      const done = () => {
        abort.abort();
        resolve();
      };

      window.addEventListener("scrollend", () => done(), {
        signal: abort.signal
      });

      element.scrollIntoView(options);
    });
  }
}