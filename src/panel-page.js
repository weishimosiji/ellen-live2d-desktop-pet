import "./styles.css";
import "./ui-theme.css";
import "./panel-page.css";
import { initAgentChat } from "./agent/agent-chat";
import { initVoiceRecognition } from "./voice/voice-recognition";
import { initTodoCalendar } from "./todo/calendar";
import { initTimerPanel } from "./timer/timer-panel";
import { installBrowserPreviewBridge } from "./browser-bridge";

if (!window.desktopPanel) {
  installBrowserPreviewBridge();
  document.documentElement.classList.remove("browser-preview", "show-all-overlays");
}

const $ = (selector) => document.querySelector(selector);
const views = [...document.querySelectorAll("[data-panel]")];

// 功能窗口聚焦时由这里监听 Option。页面的 keyup 比 macOS 下主进程的
// before-input-event 更稳定；blur 再补一次 up，避免切换窗口时录音卡住。
let optionHeld = false;
let lastActivityForwardedAt = 0;
const forwardUserActivity = () => {
  const now = Date.now();
  if (now - lastActivityForwardedAt < 1000) return;
  lastActivityForwardedAt = now;
  void window.desktopPanel.runMainAction({ type: "userActivity" });
};
window.addEventListener("pointerdown", forwardUserActivity, { passive: true });
window.addEventListener("wheel", forwardUserActivity, { passive: true });
window.addEventListener("keydown", forwardUserActivity, { passive: true });
window.addEventListener("keydown", (event) => {
  if (event.key !== "Alt" || event.repeat || optionHeld) return;
  event.preventDefault();
  optionHeld = true;
  window.desktopVoice.forwardHotkey?.("down");
}, true);
window.addEventListener("keyup", (event) => {
  if (event.key !== "Alt" || !optionHeld) return;
  event.preventDefault();
  optionHeld = false;
  window.desktopVoice.forwardHotkey?.("up");
}, true);
window.addEventListener("blur", () => {
  if (!optionHeld) return;
  optionHeld = false;
  window.desktopVoice.forwardHotkey?.("up");
});

/** 根据当前卡片的真实尺寸调整 Electron 副窗口。 */
async function fitPanelWindow() {
  const openDialog = document.querySelector("dialog[open]");
  const activeView = views.find((view) => !view.hidden);
  const target = openDialog || activeView;
  if (!target) return;
  // getBoundingClientRect 会同步刷新当前布局；不能依赖 requestAnimationFrame，
  // 因为 Electron 隐藏窗口时可能暂停动画帧回调。
  const rect = target.getBoundingClientRect();
  const width = Math.ceil(rect.width + 18);
  const height = Math.ceil(rect.height + 18);
  await window.desktopWindow.setPanelSize?.(width, height);
}

async function showView(name) {
  views.forEach((view) => { view.hidden = view.dataset.panel !== name; });
  await fitPanelWindow();
  // Electron 收到该通知后才显示窗口，避免上一张卡片短暂闪现。
  await window.desktopWindow.panelReady?.(name);
}

window.desktopPanel.onSetView(showView);
window.desktopSpeechConfirm.onTimeoutWarning?.(() => {
  void window.desktopPanel.runMainAction({ type: "playMotionReaction", motionIndex: 9, label: "等待确认：生气跺脚" });
});
document.querySelectorAll("[data-close-panel]").forEach((button) => button.addEventListener("click", () => window.desktopWindow.close()));
$("#todo-add-focus").addEventListener("click", () => $("#todo-title").focus());

initTodoCalendar({
  openButton: null,
  dialog: $("#todo-dialog"),
  closeButton: null,
  monthLabel: $("#todo-month"),
  grid: $("#todo-calendar"),
  list: $("#todo-list"),
  form: $("#todo-form"),
  titleInput: $("#todo-title"),
  timeInput: $("#todo-time"),
  embedded: true,
});

void initTimerPanel({
  container: $("#timer-list"),
  primaryTime: $("#timer-primary-time"),
  primaryTask: $("#timer-primary-task"),
  onFired: (timer) => {
    $("#agent-result").textContent = timer.type === "task" ? `时间到了。该${timer.task}了。` : "时间到了。";
    showView("chat");
  },
});

const historyList = $("#history-list");
const todoConfirmDialog = $("#todo-confirm-dialog");
const agentChat = initAgentChat({
  input: $("#agent-input"), sendButton: $("#agent-send"), clearButton: $("#agent-clear"),
  result: $("#agent-result"), intent: $("#agent-intent"), speechConfirm: $("#speech-confirm"),
  speechOriginal: $("#speech-original"), speechCorrected: $("#speech-corrected"),
  speechAcceptButton: $("#speech-accept"), speechOriginalButton: $("#speech-original-use"),
  speechRejectButton: $("#speech-reject"), historyList,
  status: (message) => { $("#status").textContent = message; },
  onAction: async (action) => {
    if (action.type === "confirmTodoCreate") {
      const todo = action.todo;
      $("#confirm-todo-time").textContent = `${todo.date}${todo.time ? ` ${todo.time}` : "（全天）"}`;
      $("#confirm-todo-title").textContent = todo.title;
      todoConfirmDialog.showModal();
      fitPanelWindow();
      const confirmed = await new Promise((resolve) => todoConfirmDialog.addEventListener("close", () => resolve(todoConfirmDialog.returnValue === "confirm"), { once: true }));
      if (!confirmed) return { message: "已取消，没有写入待办。" };
      await window.desktopTodos.add(todo);
      return { message: `已写入待办：${todo.date}${todo.time ? ` ${todo.time}` : "（全天）"}｜${todo.title}` };
    }
    await window.desktopPanel.runMainAction(action);
  },
});

initVoiceRecognition({
  button: $("#voice-record"), result: $("#voice-result"),
  status: (message) => { $("#status").textContent = message; },
  onTranscript: (text) => agentChat.reviewSpeech(text),
});

const follow = $("#follow");
const tracking = $("#tracking");
const autoBlink = $("#auto-blink");
function syncSettings() {
  $("#follow-value").textContent = `${follow.value}%`;
  [[tracking, tracking.closest(".toggle-row")], [autoBlink, autoBlink.closest(".toggle-row")]].forEach(([input, row]) => {
    const state = row?.querySelector("em");
    if (state) state.textContent = input.checked ? "ON" : "OFF";
    row?.classList.toggle("disabled", !input.checked);
  });
  void window.desktopPanel.updateSettings({ follow: Number(follow.value), tracking: tracking.checked, autoBlink: autoBlink.checked });
}
follow.addEventListener("input", syncSettings);
tracking.addEventListener("change", syncSettings);
autoBlink.addEventListener("change", syncSettings);
syncSettings();
$("#reset").addEventListener("click", () => window.desktopPanel.runMainAction({ type: "resetModel" }));

// 历史记录、日历和语音确认内容变化时，副窗口会跟随内容自适应。
const resizeObserver = new ResizeObserver(fitPanelWindow);
views.forEach((view) => resizeObserver.observe(view));
resizeObserver.observe(todoConfirmDialog);
new MutationObserver(fitPanelWindow).observe(document.body, { attributes: true, childList: true, subtree: true });

showView(new URLSearchParams(location.search).get("view") || "chat");
