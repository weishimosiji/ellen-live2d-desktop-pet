import { createMicrophoneRecorder } from "./microphone-recorder";

/** 初始化右侧的录音与文字识别控件。 */
export function initVoiceRecognition({ button, result, status, onTranscript }) {
  const recorder = createMicrophoneRecorder();
  let busy = false;
  let autoStopTimer = null;
  let shortcutHeld = false;
  // 图标按钮只更新提示文字，避免录音状态切换时清空 CSS 图标结构。
  const setControlText = (text) => {
    if (!button.querySelector(".ui-icon")) button.textContent = text;
    button.title = text;
    button.setAttribute("aria-label", text);
  };

  async function startRecording() {
    if (busy || recorder.isRecording()) return;
    try {
      await recorder.start();
      setControlText("正在录音，松开 Option 开始识别");
      button.classList.add("recording");
      result.textContent = "正在听…";
      status("正在录音，请说话");
      // 单次最多录制 30 秒，到时即使仍按住按键也会自动识别。
      autoStopTimer = setTimeout(() => void finishRecording(), 30000);
      // 首次授权麦克风时用户可能已经松开按键，授权完成后应立即结束而不是继续录音。
      if (!shortcutHeld) void finishRecording();
    } catch (error) {
      console.error(error);
      result.textContent = `无法开始录音：${error.message}`;
      status("无法开始录音");
      resetShortcutState();
    }
  }

  async function finishRecording() {
    if (busy || !recorder.isRecording()) return;
    try {
      busy = true;
      clearTimeout(autoStopTimer);
      autoStopTimer = null;
      setControlText("正在识别…");
      const wavBytes = await recorder.stop();
      const text = await window.desktopVoice.transcribe(wavBytes);
      result.textContent = text || "没听见你在说什么。";
      if (text) onTranscript?.(text);
      status(text ? "语音识别完成" : "没听见你在说什么");
    } catch (error) {
      console.error(error);
      result.textContent = `识别失败：${error.message}`;
      status("语音识别失败");
    } finally {
      busy = false;
      resetShortcutState();
    }
  }

  function resetShortcutState() {
    shortcutHeld = false;
    setControlText("按住 Option（Alt）录音");
    button.classList.remove("recording");
  }

  function handleKeyDown(event) {
    if (event.key !== "Alt" || event.repeat || shortcutHeld || busy) return;
    event.preventDefault();
    shortcutHeld = true;
    void startRecording();
  }

  function handleKeyUp(event) {
    if (event.key !== "Alt" || !shortcutHeld) return;
    event.preventDefault();
    shortcutHeld = false;
    void finishRecording();
  }

  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("keyup", handleKeyUp, true);

  // 按住快捷键时切换到其他窗口可能收不到 keyup，用失焦事件保证录音会结束。
  window.addEventListener("blur", () => {
    if (!shortcutHeld) return;
    shortcutHeld = false;
    void finishRecording();
  });
}
