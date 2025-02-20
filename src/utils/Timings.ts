export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number = 200,
) {
  let lastCallTime: number | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (...args: any[]) {
    const now = Date.now();

    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }

    if (lastCallTime === null || now - lastCallTime >= wait) {
      func(...args);
      lastCallTime = now;
    } else {
      timeout = setTimeout(() => {
        func(...args);
        lastCallTime = Date.now();
        timeout = null;
      }, wait - (now - lastCallTime));
    }
  };
}
