/**
 * 创建严格串行的通用任务队列。
 *
 * handlers 的 key 是任务类型，value 是返回 Promise 的执行方法。
 * 只要执行方法在真正结束时才 resolve，队列就一定会按加入顺序逐个执行。
 */
export function createTaskQueue({
  handlers,
  onTaskStart = () => {},
  onTaskFinish = () => {},
  onTaskError = () => {},
  onQueueChange = () => {},
}) {
  const pendingTasks = [];
  let currentTask = null;
  let running = false;
  let nextId = 1;

  function notifyQueueChange() {
    onQueueChange({
      currentTask,
      pendingCount: pendingTasks.length,
      totalCount: pendingTasks.length + (currentTask ? 1 : 0),
    });
  }

  async function drain() {
    if (running) return;
    running = true;

    while (pendingTasks.length > 0) {
      currentTask = pendingTasks.shift();
      notifyQueueChange();

      const handler = handlers[currentTask.type];
      if (!handler) {
        const error = new Error(`没有注册任务类型：${currentTask.type}`);
        onTaskError(currentTask, error);
        currentTask.resolve({ status: "failed", error });
        currentTask = null;
        continue;
      }

      try {
        onTaskStart(currentTask);
        const result = await handler(currentTask.payload, currentTask);
        onTaskFinish(currentTask, result);
        currentTask.resolve({ status: "finished", result });
      } catch (error) {
        onTaskError(currentTask, error);
        currentTask.resolve({ status: "failed", error });
      }

      currentTask = null;
      notifyQueueChange();
    }

    running = false;
  }

  /** 将任务加入队尾，并返回一个在该任务结束时完成的 Promise。 */
  function enqueue(type, payload = {}, label = type) {
    return new Promise((resolve) => {
      pendingTasks.push({ id: nextId++, type, payload, label, resolve });
      notifyQueueChange();
      void drain();
    });
  }

  /** 清除尚未开始的任务；当前任务由主程序负责停止。 */
  function clearPending() {
    for (const task of pendingTasks.splice(0)) {
      task.resolve({ status: "cancelled" });
    }
    notifyQueueChange();
  }

  return {
    enqueue,
    clearPending,
    getCurrentTask: () => currentTask,
    getPendingCount: () => pendingTasks.length,
  };
}
