import { createMicrophoneRecorder } from "./microphone-recorder";
import { createAgentErrorFeedback } from "../agent/error-feedback";

/** 主人物窗口的 Option 按住语音：状态和回复只显示在人物气泡中。 */
export function initCharacterVoiceControl({ bubble, text, meta, onAction, onActivity = () => {} }) {
  const recorder = createMicrophoneRecorder();
  let held = false;
  let busy = false;
  let autoStopTimer = null;
  let hideTimer = null;

  const showBubble = (message, mode = "reply", detail = "") => {
    clearTimeout(hideTimer);
    bubble.hidden = false;
    bubble.dataset.mode = mode;
    text.textContent = message;
    meta.textContent = detail;
  };
  const hideBubble = () => {
    bubble.hidden = true;
  };
  const hideLater = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBubble, 8000);
  };
  const showMessage = (message, detail = "", durationMs = 8000) => {
    showBubble(message, "reply", detail);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBubble, durationMs);
  };

  const pressHotkey = () => {
    if (held || busy) return;
    onActivity();
    held = true;
    void start();
  };
  const releaseHotkey = () => {
    if (!held) return;
    held = false;
    void finish();
  };

  async function start() {
    if (busy || recorder.isRecording()) return;
    try {
      await recorder.start();
      showBubble("正在听……", "recording", "松开 Option 开始识别");
      autoStopTimer = setTimeout(() => void finish(), 30000);
      if (!held) void finish();
    } catch (error) {
      console.error(error);
      showBubble("麦克风没有回应。检查一下权限吧。", "reply");
      hideLater();
    }
  }

  async function finish() {
    if (busy || !recorder.isRecording()) return;
    busy = true;
    clearTimeout(autoStopTimer);
    try {
      showBubble("我在确认你说的话……", "thinking");
      const wavBytes = await recorder.stop();
      const recognized = await window.desktopVoice.transcribe(wavBytes);
      if (!recognized) {
        showBubble("没听见你在说什么。", "reply");
        hideLater();
        return;
      }
      const review = await window.desktopAgent.reviewSpeech(recognized);
      let submittedText = review.correctedText;
      if (review.needsConfirmation) {
        showBubble(review.ellenQuestion || "这句话需要你确认一下。", "thinking", "请在确认框中选择");
        const choice = await window.desktopSpeechConfirm.request(review);
        if (!choice) {
          showBubble("好。那就再说一次。", "reply");
          hideLater();
          return;
        }
        submittedText = choice === "original" ? review.originalText : review.correctedText;
      }
      showBubble("……", "thinking", "艾莲正在思考");
      const response = await window.desktopAgent.chat(submittedText);
      showBubble(response.reply, "reply");
      appendVoiceHistory(submittedText, response.reply);
      for (const item of response.toolResults || []) {
        if (item.result?.ok && item.result.action) {
          const outcome = await onAction?.(item.result.action);
          if (outcome?.message) showBubble(outcome.message, "reply");
        }
      }
      hideLater();
    } catch (error) {
      console.error(error);
      const feedback = createAgentErrorFeedback(error);
      showBubble(feedback.message, "reply");
      await onAction?.(feedback.action);
      hideLater();
    } finally {
      busy = false;
      held = false;
    }
  }

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Alt" || event.repeat || held || busy) return;
    event.preventDefault();
    pressHotkey();
  }, true);
  window.addEventListener("keyup", (event) => {
    if (event.key !== "Alt" || !held) return;
    event.preventDefault();
    releaseHotkey();
  }, true);
  window.addEventListener("blur", () => {
    // 焦点切换到功能面板时，面板会接管并转发后续 Option 事件。
    // 这里仍负责处理切换窗口前已经开始的录音。
    releaseHotkey();
  });

  window.desktopVoice.onHotkey?.((phase) => {
    if (phase === "down") pressHotkey();
    if (phase === "up") releaseHotkey();
  });

  return { showMessage };
}

function appendVoiceHistory(userText, reply) {
  const storageKey = "ellen-chat-history";
  let history = [];
  try { history = JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { /* 使用空记录 */ }
  history.unshift({ at: Date.now(), userText, reply, source: "voice" });
  localStorage.setItem(storageKey, JSON.stringify(history.slice(0, 30)));
}
