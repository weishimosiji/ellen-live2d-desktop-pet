/** 连续没有与桌宠交互一段时间后触发打瞌睡。 */
export function createIdleDozeController({
  timeoutMs = 10 * 60 * 10,
  isBusy,
  playDoze,
  wake,
}) {
  let timer = 0;
  let destroyed = false;

  const schedule = (delay = timeoutMs) => {
    clearTimeout(timer);
    if (!destroyed) timer = window.setTimeout(tryDoze, delay);
  };

  const markInteraction = () => {
    wake();
    schedule();
  };

  const tryDoze = async () => {
    if (destroyed) return;
    // 正在说话、播放动作或还有排队任务时不插入打瞌睡，稍后再检查。
    if (isBusy()) {
      schedule(30 * 1000);
      return;
    }
    await playDoze();
    // 动作自然结束或被新交互唤醒后，重新计算下一轮十分钟空闲。
    schedule();
  };

  schedule();

  return {
    markInteraction,
    destroy() {
      destroyed = true;
      clearTimeout(timer);
    },
  };
}
