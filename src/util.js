/**
 * 播放动作并等待 MotionManager 确认动作结束。
 * 不依赖当前引擎失效的 onFinish。
 */
export async function playMotionAndWait(model, group, index, priority = 3) {
  const manager = model?.internalModel?.motionManager;

  if (!manager) {
    throw new Error("MotionManager 尚未初始化");
  }

  // model.motion() 的 Promise 只表示“是否成功开始”，
  // 不代表整段动作已经播放完成。
  const started = await model.motion(group, index, priority, {
    loop: false,
  });

  if (!started) {
    return false;
  }

  // 等待至少一个渲染帧，避免刚启动时读取到旧的完成状态。
  await new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });

  // 每一帧检查 MotionManager。
  await new Promise((resolve) => {
    function check() {
      if (manager.isFinished()) {
        resolve();
        return;
      }

      requestAnimationFrame(check);
    }

    check();
  });

  return true;
}
