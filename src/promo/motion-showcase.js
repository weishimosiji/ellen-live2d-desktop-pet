import { PROMO_MOTION_SHOWCASE } from "./motion-showcase-config";

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/**
 * 启动宣传片专用 Motion 循环。
 *
 * 每次只向正式播放队列提交一个动作，并等待其完整结束后再继续，
 * 因此不会绕过原有的回正过渡，也不会直接操作 Live2D MotionManager。
 */
export function createPromoMotionShowcase({ playbackQueue }) {
  let stopped = false;
  let running = false;

  async function run() {
    if (running || !PROMO_MOTION_SHOWCASE.enabled) return;
    running = true;

    await wait(PROMO_MOTION_SHOWCASE.initialDelayMs);

    while (!stopped) {
      for (const motion of PROMO_MOTION_SHOWCASE.motions) {
        if (stopped) break;

        await playbackQueue.enqueueMotion({
          group: "Preview",
          index: motion.index,
          priority: 3,
          label: motion.label,
        });

        if (!stopped) await wait(PROMO_MOTION_SHOWCASE.intervalMs);
      }
    }

    running = false;
  }

  return {
    start() {
      void run().catch((error) => {
        running = false;
        console.error("宣传 Motion 循环已停止", error);
      });
    },
    stop() {
      stopped = true;
    },
  };
}
