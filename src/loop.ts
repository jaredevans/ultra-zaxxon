export const DT = 1 / 60;

export function startLoop(update: (dt: number) => void, render: (alpha: number) => void): void {
  let acc = 0;
  let last = performance.now();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      last = performance.now(); // drop hidden time; accumulator stays paused
      acc = 0;
    }
  });

  function frame(now: number): void {
    if (!document.hidden) {
      acc += Math.min((now - last) / 1000, 0.25); // tab-switch spiral guard
      last = now;
      while (acc >= DT) {
        update(DT);
        acc -= DT;
      }
      render(acc / DT); // interpolation alpha
    } else {
      last = now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
