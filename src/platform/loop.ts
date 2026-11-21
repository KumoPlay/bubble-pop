/**
 * Draws frames only while something moves. When everything is still, or the tab
 * is hidden, no frames are drawn at all (saves battery). `wake()` starts it again.
 */
export class Loop {
  private id = 0;
  private running = false;
  private paused = false;
  private last = 0;
  /** A smoothed frame time, to notice a phone that cannot keep up. */
  private average = 1 / 60;
  private streak = 0;

  constructor(
    private readonly frame: (now: number) => boolean,
    /** Called once when frames have been slow for a while (the app then draws with fewer pixels). */
    private readonly onSlow: () => void = () => undefined,
  ) {}

  wake(): void {
    if (this.running || this.paused) return;
    this.running = true;
    this.streak = 0;
    this.last = performance.now();
    this.id = requestAnimationFrame(this.tick);
  }

  /** Tab hidden: stop completely. */
  pause(): void {
    this.paused = true;
    cancelAnimationFrame(this.id);
    this.running = false;
  }

  resume(): void {
    this.paused = false;
    this.wake();
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.streak > 0) {
      this.average += (dt - this.average) * 0.05;
      // About 1.5 seconds of frames slower than ~45 per second.
      if (this.streak > 90 && this.average > 1 / 45) {
        this.average = 1 / 60;
        this.streak = 0;
        this.onSlow();
      }
    }
    this.streak += 1;
    let more = false;
    try {
      more = this.frame(now);
    } catch (error) {
      console.error(error);
    }
    if (more && !this.paused) this.id = requestAnimationFrame(this.tick);
    else this.running = false;
  };
}
