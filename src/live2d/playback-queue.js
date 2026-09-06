import { createTaskQueue } from "../task-queue";
import { playMotionAndWait } from "../util";

/**
 * 创建桌宠播放队列。
 * 当前业务类型：单独动作、单独音频、动作与音频同时播放。
 * 后续新增 expression、delay、move 等类型时，也统一在这里注册。
 */
export function createPlaybackQueue({
  modelContext,
  gaze,
  blink,
  lipSync,
  emotionController,
  onTaskStart,
  onTaskFinish,
  onTaskError,
  onQueueChange,
}) {
  let motionPlaying = false;
  let idleMotionPlaying = false;

  /** 所有动作任务开始前共用的状态清理。 */
  function prepareMotion(idle = false) {
    motionPlaying = true;
    idleMotionPlaying = idle;
    lipSync.stop();
    modelContext.restoreDefaults();
    gaze.reset();
    blink.reset();
  }

  /** 播放动作，并以 MotionManager 的实际结束状态为准。 */
  async function runMotion({ group, index, priority = 3 }) {
    const started = await playMotionAndWait(
      modelContext.model,
      group,
      index,
      priority,
    );
    if (!started) throw new Error("动作无法启动");
  }

  /** 播放音频，并在结束后等待语气表情恢复正常。 */
  async function runAudio({ url, emotion, controlMouth }) {
    emotionController.start(emotion);
    try {
      await lipSync.playAndWait(url, { controlMouth });
    } finally {
      await emotionController.restore();
    }
  }

  const queue = createTaskQueue({
    handlers: {
      async motion(payload) {
        prepareMotion(payload.idle === true);
        try {
          await runMotion(payload);
        } finally {
          await modelContext.transitionToDefaults(0.25);
          gaze.reset();
          blink.reset();
          motionPlaying = false;
          idleMotionPlaying = false;
        }
      },

      async audio({ url, emotion }) {
        await runAudio({ url, emotion, controlMouth: true });
      },

      async motionAudio({ group, index, priority = 3, audioUrl, emotion }) {
        prepareMotion();

        try {
          // 两项在同一轮事件循环中启动，并等待二者全部结束。
          const results = await Promise.allSettled([
            runMotion({ group, index, priority }),
            // 音频只与动作同步播放，嘴形完全由 motion3 文件控制。
            runAudio({ url: audioUrl, emotion, controlMouth: false }),
          ]);
          const failed = results.find((result) => result.status === "rejected");
          if (failed) throw failed.reason;
        } finally {
          await modelContext.transitionToDefaults(0.25);
          gaze.reset();
          blink.reset();
          motionPlaying = false;
          idleMotionPlaying = false;
        }
      },
    },
    onTaskStart,
    onTaskFinish,
    onTaskError,
    onQueueChange,
  });

  /** 新任务到来时只中断打瞌睡，不打断正常动作。 */
  function wakeIdleMotion() {
    if (!idleMotionPlaying) return false;
    modelContext.internalModel.motionManager.stopAllMotions();
    return true;
  }

  return {
    /** 将一个 Live2D 动作放到队尾。 */
    enqueueMotion({ group = "Preview", index, priority = 3, label }) {
      wakeIdleMotion();
      return queue.enqueue("motion", { group, index, priority, idle: false }, label);
    },

    /** 空闲控制器专用；只有队列完全空闲时才播放，不与业务任务排队。 */
    enqueueIdleMotion({ group = "Preview", index, priority = 3, label = "空闲：打瞌睡" }) {
      if (queue.getCurrentTask() || queue.getPendingCount() > 0) {
        return Promise.resolve({ status: "ignored" });
      }
      return queue.enqueue("motion", { group, index, priority, idle: true }, label);
    },

    /** 将一段带口型的音频放到队尾。 */
    enqueueAudio({ url, emotion, label }) {
      wakeIdleMotion();
      return queue.enqueue("audio", { url, emotion }, label);
    },

    /**
     * 鼠标触碰等即时反馈专用：仅在播放器完全空闲时启动。
     * 忙碌时直接返回 ignored，不进入等待队列。
     */
    enqueueAudioIfIdle({ url, emotion, label }) {
      if (idleMotionPlaying) {
        wakeIdleMotion();
        return queue.enqueue("audio", { url, emotion }, label);
      }
      if (queue.getCurrentTask() || queue.getPendingCount() > 0) {
        return Promise.resolve({ status: "ignored" });
      }
      return queue.enqueue("audio", { url, emotion }, label);
    },

    /** 将动作和音频作为一个同时执行的组合任务放到队尾。 */
    enqueueMotionWithAudio({
      group = "Preview",
      index,
      priority = 3,
      audioUrl,
      emotion,
      label,
    }) {
      wakeIdleMotion();
      return queue.enqueue(
        "motionAudio",
        { group, index, priority, audioUrl, emotion },
        label,
      );
    },

    /** 清空等待任务，并停止当前动作或音频。 */
    clear() {
      queue.clearPending();
      modelContext.internalModel.motionManager.stopAllMotions();
      lipSync.stop();
      emotionController.restoreImmediately();
      motionPlaying = false;
      idleMotionPlaying = false;
    },

    /**
     * 中止当前动作但保留后续队列。动作处理器检测到 MotionManager 结束后，
     * 会继续执行统一的平滑回正过渡。
     */
    interruptCurrentMotion() {
      if (!motionPlaying) return false;
      modelContext.internalModel.motionManager.stopAllMotions();
      lipSync.stop();
      emotionController.restoreImmediately();
      return true;
    },

    wakeIdleMotion,

    isMotionPlaying: () => motionPlaying,
    isIdleMotionPlaying: () => idleMotionPlaying,
    getCurrentTask: queue.getCurrentTask,
    getPendingCount: queue.getPendingCount,
    isBusy: () => Boolean(queue.getCurrentTask()) || queue.getPendingCount() > 0,
  };
}
