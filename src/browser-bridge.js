/**
 * 浏览器布局预览兼容层。
 *
 * Electron 启动时 preload 会提前注入 desktop* 接口，本文件不会覆盖它们。
 * 直接运行 Vite 时则提供本地模拟接口，让 UI、Live2D、日历和面板可以独立调试。
 */
export function installBrowserPreviewBridge() {
  if (window.desktopAgent) return;

  document.documentElement.classList.add("browser-preview");
  // H5 作为 UI 调试画板使用：样式层会强制展示所有浮层。
  document.documentElement.classList.add("show-all-overlays");

  const todoStorageKey = "ellen-browser-preview-todos";
  const readTodos = () => {
    try { return JSON.parse(localStorage.getItem(todoStorageKey) || "[]"); }
    catch { return []; }
  };
  const writeTodos = (items) => localStorage.setItem(todoStorageKey, JSON.stringify(items));

  window.desktopTodos = {
    async list({ from, to } = {}) {
      return readTodos().filter((item) => (!from || item.date >= from) && (!to || item.date <= to));
    },
    async add(data) {
      const item = { id: crypto.randomUUID(), completed: false, ...data };
      writeTodos([...readTodos(), item]);
      return item;
    },
    async update(id, changes) {
      const items = readTodos().map((item) => item.id === id ? { ...item, ...changes } : item);
      writeTodos(items);
      return items.find((item) => item.id === id);
    },
    async remove(id) {
      writeTodos(readTodos().filter((item) => item.id !== id));
      return true;
    },
  };

  let timers = [];
  const timerChangedListeners = new Set();
  window.desktopTimers = {
    async list() { return timers; },
    async cancel(id) {
      timers = timers.filter((timer) => timer.id !== id);
      timerChangedListeners.forEach((listener) => listener(timers));
    },
    onChanged(listener) { timerChangedListeners.add(listener); },
    onFired() {},
  };

  window.desktopAgent = {
    async chat(text) {
      return {
        reply: `浏览器预览回复：${text}`,
        intent: "conversation",
        toolResults: [],
      };
    },
    async reviewSpeech(text) {
      return { originalText: text, correctedText: text, needsConfirmation: false, confidence: 1 };
    },
    async clearHistory() {},
  };

  window.desktopVoice = {
    async transcribe() {
      throw new Error("HTML 预览模式不连接本地语音识别，请使用文字输入测试界面");
    },
  };

  window.desktopWindow = {
    async minimize() {},
    async close() {},
    async openPanel() { window.open("/panel.html", "ellen-panel", "width=400,height=520"); },
    async setPanelSize() {},
    async getPosition() { return { x: 0, y: 0 }; },
    async setPosition() {},
    async finishStartup() {},
  };
  window.desktopSpeechConfirm = {
    async request() { return "corrected"; },
    async respond() {},
    onData() {},
    onTimeoutWarning() {},
  };
  window.desktopPanel = {
    async runMainAction() {},
    async updateSettings() {},
    onSetView() {},
    onMainAction() {},
    onSettings() {},
    onVisibility() {},
  };
}
