// A clock that runs little jobs every frame, and turns waits and tweens into
// promises, so a battle reads top to bottom as a script: say this, wait, swing,
// wait for the hit, show the number.

type Job = (dt: number) => boolean;

export class Clock {
  private jobs: Array<Job> = [];

  /** Seconds since the game started, paused with it. */
  time = 0;

  update(dt: number): void {
    this.time += dt;
    // Jobs started during this update land in the fresh list and wait for the
    // next frame, rather than being run or lost mid-loop.
    const running = this.jobs;
    this.jobs = [];
    for (const job of running) {
      if (!job(dt)) {
        this.jobs.push(job);
      }
    }
  }

  /** Runs `job` every frame until it returns true. */
  every(job: Job): void {
    this.jobs.push(job);
  }

  wait(seconds: number): Promise<void> {
    return new Promise(resolve => {
      let left = seconds;
      this.every(dt => {
        left -= dt;
        if (left <= 0) {
          resolve();
          return true;
        }
        return false;
      });
    });
  }

  /** Calls `step` with 0 → 1 over `seconds`, eased, ending exactly on 1. */
  tween(
    seconds: number,
    step: (t: number) => void,
    ease: (t: number) => number = Ease.inOut,
  ): Promise<void> {
    step(ease(0));
    return new Promise(resolve => {
      let t = 0;
      this.every(dt => {
        t = Math.min(1, t + dt / seconds);
        step(ease(t));
        if (t >= 1) {
          resolve();
          return true;
        }
        return false;
      });
    });
  }
}

export const Ease = {
  linear: (t: number) => t,
  inOut: (t: number) => 0.5 - Math.cos(Math.PI * t) / 2,
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t * t,
  /** Overshoots and settles back: things popping into being. */
  back: (t: number) => {
    const s = 1.9;
    const u = t - 1;
    return 1 + u * u * ((s + 1) * u + s);
  },
  bounce: (t: number) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) {
      return n * t * t;
    }
    if (t < 2 / d) {
      const u = t - 1.5 / d;
      return n * u * u + 0.75;
    }
    if (t < 2.5 / d) {
      const u = t - 2.25 / d;
      return n * u * u + 0.9375;
    }
    const u = t - 2.625 / d;
    return n * u * u + 0.984375;
  },
};

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
