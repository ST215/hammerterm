const intervals: ReturnType<typeof setInterval>[] = [];
const timeouts: ReturnType<typeof setTimeout>[] = [];
const cleanupFns: Array<() => void> = [];

export function registerInterval(id: ReturnType<typeof setInterval>) {
  intervals.push(id);
}

export function registerTimeout(id: ReturnType<typeof setTimeout>) {
  timeouts.push(id);
}

export function registerCleanup(fn: () => void) {
  cleanupFns.push(fn);
}

export function cleanupAll() {
  intervals.forEach(clearInterval);
  timeouts.forEach(clearTimeout);
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
  intervals.length = 0;
  timeouts.length = 0;
  cleanupFns.length = 0;
}
