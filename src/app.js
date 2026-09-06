import { createAudioLipSync } from "./live2d/audio-lipsync";
import { createBlinkController } from "./live2d/blink";
import {
  INTERACTION_AUDIO_CONFIG,
  AGENT_REACTION_AUDIO,
  MOTION_AUDIO_CONFIG,
} from "./config/audio-config";
import { LIVE2D_CONFIG } from "./live2d/config";
import { createGazeController } from "./live2d/gaze";
import { createIdleDozeController } from "./live2d/idle-doze-controller";
import { initLive2DModel } from "./live2d/model";
import { createPlaybackQueue } from "./live2d/playback-queue";
import { createEmotionController } from "./live2d/emotion-controller";
import { createPointerInteraction } from "./live2d/pointer-interaction";
import { initTimerPanel } from "./timer/timer-panel";
import { createCharacterWindowDrag } from "./window/character-window-drag";
import { initCharacterVoiceControl } from "./voice/character-voice-control";
import { createStartupIntro } from "./startup-intro";

/** 获取预览页面元素。页面结构相关的选择器只集中在这里。 */
function getElements() {
  return {
    canvas: document.querySelector("#live2d-canvas"),
    shell: document.querySelector(".desktop-shell"),
    stage: document.querySelector("#stage"),
    status: document.querySelector("#status"),
    fps: document.querySelector("#fps"),
    startupIntro: document.querySelector("#startup-intro"),
    startupVideo: document.querySelector("#startup-video"),
    trackingEnabled: document.querySelector("#tracking"),
    trackingStrength: document.querySelector("#follow"),
    trackingStrengthLabel: document.querySelector("#follow-value"),
    blinkEnabled: document.querySelector("#auto-blink"),
    voiceResult: document.querySelector("#voice-result"),
    agentInput: document.querySelector("#agent-input"),
    agentSendButton: document.querySelector("#agent-send"),
    agentClearButton: document.querySelector("#agent-clear"),
    agentResult: document.querySelector("#agent-result"),
    agentIntent: document.querySelector("#agent-intent"),
    speechBubble: document.querySelector("#speech-bubble"),
    bubbleText: document.querySelector("#bubble-text"),
    bubbleMeta: document.querySelector("#bubble-meta"),
    timerHead: document.querySelector("#timer-head"),
    timerHeadTime: document.querySelector("#timer-head-time"),
    timerHeadTask: document.querySelector("#timer-head-task"),
    chatOpen: document.querySelector("#chat-open"),
    chatDock: document.querySelector("#chat-dock"),
    speechConfirm: document.querySelector("#speech-confirm"),
    speechOriginal: document.querySelector("#speech-original"),
    speechCorrected: document.querySelector("#speech-corrected"),
    speechAcceptButton: document.querySelector("#speech-accept"),
    speechOriginalButton: document.querySelector("#speech-original-use"),
    speechRejectButton: document.querySelector("#speech-reject"),
    resetButton: document.querySelector("#reset"),
    todoOpen: document.querySelector("#todo-open"), todoDialog: document.querySelector("#todo-dialog"), todoClose: document.querySelector("#todo-close"), todoMonth: document.querySelector("#todo-month"), todoCalendar: document.querySelector("#todo-calendar"), todoList: document.querySelector("#todo-list"), todoForm: document.querySelector("#todo-form"), todoTitle: document.querySelector("#todo-title"), todoTime: document.querySelector("#todo-time"),
    timerList: document.querySelector("#timer-list"),
    timerOpen: document.querySelector("#timer-open"), historyOpen: document.querySelector("#history-open"), settingsOpen: document.querySelector("#settings-open"),
    timerWindow: document.querySelector("#timer-window"), historyWindow: document.querySelector("#history-window"), settingsWindow: document.querySelector("#settings-window"), historyList: document.querySelector("#history-list"),
    todoConfirmDialog: document.querySelector("#todo-confirm-dialog"), confirmTodoTime: document.querySelector("#confirm-todo-time"), confirmTodoTitle: document.querySelector("#confirm-todo-title"),
  };
}

/** 初始化整个桌宠预览应用。 */
export async function initDesktopPreview() {
  const elements = getElements();
  const startupIntro = createStartupIntro({
    shell: elements.shell,
    container: elements.startupIntro,
    video: elements.startupVideo,
  });
  let idleDozeController = null;
  const setStatus = (message) => {
    elements.status.textContent = message;
  };

  setStatus("正在加载模型…");
  // 整个桌宠区域负责唤出工具栏，避免隐藏的工具栏自身无法接收 hover。
  elements.shell.addEventListener("pointerenter", () => elements.shell.classList.add("tools-visible"));
  elements.shell.addEventListener("pointerleave", () => elements.shell.classList.remove("tools-visible"));
  const openPanel = (view, options) => {
    idleDozeController?.markInteraction();
    return window.desktopWindow.openPanel?.(view, options);
  };
  elements.chatOpen.addEventListener("click", () => openPanel("chat"));
  elements.todoOpen.addEventListener("click", () => openPanel("todo"));
  elements.timerOpen.addEventListener("click", () => openPanel("timer"));
  elements.historyOpen.addEventListener("click", () => openPanel("history"));
  elements.settingsOpen.addEventListener("click", () => openPanel("settings"));

  const modelContext = await initLive2DModel({
    canvas: elements.canvas,
    stage: elements.stage,
    config: LIVE2D_CONFIG,
  });

  const blink = createBlinkController({
    core: modelContext.core,
    parameterIds: modelContext.parameterIds,
    config: LIVE2D_CONFIG,
  });

  const gaze = createGazeController({
    stage: elements.stage,
    core: modelContext.core,
    parameterIds: modelContext.parameterIds,
    neutralValues: modelContext.neutralValues,
    config: LIVE2D_CONFIG,
    getStrength: () => Number(elements.trackingStrength?.value ?? 100) / 100,
  });

  const lipSync = createAudioLipSync({
    core: modelContext.core,
    mouthParameterId: modelContext.parameterIds.mouthOpenY,
    neutralValue: modelContext.neutralValues.mouthOpenY,
    audioUrl: INTERACTION_AUDIO_CONFIG[0].audioUrl,
    // 普通对话口型使用完整开口范围；动作配音仍完全遵循 motion 文件。
    // 这个模型的嘴部参数是 1=闭嘴、0=完全张嘴。
    fullMouthOpenValue: 0.5,
    voiceNoiseFloor: 0.008,
    voiceFullLevel: 0.075,
  });

  const emotionController = createEmotionController({
    core: modelContext.core,
    parameterIds: modelContext.parameterIds,
    transitionSeconds: 0.2,
  });

  const playbackQueue = createPlaybackQueue({
    modelContext,
    gaze,
    blink,
    lipSync,
    emotionController,
    onTaskStart: (task) => setStatus(`正在执行：${task.label}`),
    onTaskFinish: (task) => setStatus(`${task.label} 执行完成`),
    onTaskError: (task, error) => {
      console.error(error);
      setStatus(`${task.label} 执行失败：${error.message}`);
    },
    onQueueChange: ({ pendingCount }) => {
      if (pendingCount > 0) setStatus(`队列中还有 ${pendingCount} 个任务等待执行`);
    },
  });

  idleDozeController = createIdleDozeController({
    timeoutMs: 10 * 60 * 1000,
    isBusy: playbackQueue.isBusy,
    playDoze: () => playbackQueue.enqueueIdleMotion({ index: 5, label: "空闲：打瞌睡" }),
    wake: playbackQueue.wakeIdleMotion,
  });

  let timerPanelVisible = false;
  let characterVoiceControl = null;
  let latestTimerDisplay = { timer: null, formatted: "" };
  const syncHeadTimer = () => {
    const { timer, formatted } = latestTimerDisplay;
    elements.timerHead.hidden = timerPanelVisible || !timer;
    if (!timer) return;
    elements.timerHeadTime.textContent = formatted;
    elements.timerHeadTask.textContent = timer.task || "倒计时";
  };
  await initTimerPanel({ container: elements.timerList, onUpdate: (state) => {
    latestTimerDisplay = state;
    syncHeadTimer();
  }, onFired: (timer) => {
    const reminder = timer.type === "task" ? `时间到了。该${timer.task}了。` : "时间到了。";
    elements.agentResult.textContent = reminder;
    characterVoiceControl?.showMessage(reminder, "番茄钟提醒", 10000);
    void playbackQueue.enqueueAudioIfIdle({ url: AGENT_REACTION_AUDIO.hihiboss.audioUrl, emotion: null, label: "番茄钟提醒" });
  } });
  window.desktopPanel.onVisibility?.(({ view, visible }) => {
    timerPanelVisible = Boolean(visible && view === "timer");
    syncHeadTimer();
  });

  /** 将鼠标交互语音也放入统一队列，避免与动作、Agent 语音同时抢播。 */
  const enqueueReactionAudio = (audioId) => {
    const audio = AGENT_REACTION_AUDIO[audioId];
    if (!audio) return Promise.resolve();
    return playbackQueue.enqueueAudio({
      url: audio.audioUrl,
      emotion: audio.emotion,
      label: `鼠标交互：${audio.label}`,
    });
  };
  const playPointerReactionIfIdle = (audioId) => {
    const audio = AGENT_REACTION_AUDIO[audioId];
    if (!audio) return Promise.resolve({ status: "ignored" });
    return playbackQueue.enqueueAudioIfIdle({
      url: audio.audioUrl,
      emotion: audio.emotion,
      label: `鼠标交互：${audio.label}`,
    });
  };
  const windowDrag = createCharacterWindowDrag({
    canvas: elements.canvas,
    shell: elements.shell,
    modelContext,
  });
  // 只有在人物有效区域按下才算与桌宠交互；普通系统鼠标移动不会重置计时。
  elements.canvas.addEventListener("pointerdown", (event) => {
    if (modelContext.hitTestBody(event.clientX, event.clientY)) {
      idleDozeController.markInteraction();
    }
  }, { passive: true });
  createPointerInteraction({
    canvas: elements.canvas,
    modelContext,
    // 鼠标反馈不排队：当前只要有任何任务，就直接忽略本次触发。
    onHover: () => {
      idleDozeController.markInteraction();
      return playPointerReactionIfIdle("touch");
    },
    onClick: () => {
      idleDozeController.markInteraction();
      return playPointerReactionIfIdle("no");
    },
    shouldIgnoreClick: windowDrag.shouldSuppressClick,
    shouldIgnoreHover: windowDrag.isPointerEngaged,
  });

  const resetModel = async () => {
    playbackQueue.clear();
    await modelContext.transitionToDefaults(0.25);
    gaze.reset();
    blink.reset();
    setStatus("已清空队列并恢复模型初始状态");
  };
  elements.resetButton?.addEventListener("click", () => void resetModel());

  const executeAgentAction = async (action) => {
    if (action.type === "userActivity") {
      idleDozeController.markInteraction();
      return;
    }
    if (action.type === "confirmTodoCreate") {
      // 语音工具请求在识别确认框中已经得到用户确认，因此主人物窗口可直接写入。
      const todo = await window.desktopTodos.add(action.todo);
      return { message: `已写入待办：${todo.date}${todo.time ? ` ${todo.time}` : "（全天）"}｜${todo.title}` };
    }
    if (action.type === "playMotionReaction") {
      const motionIndex = Number(action.motionIndex);
      const motionAudio = MOTION_AUDIO_CONFIG[motionIndex];
      if (!motionAudio) {
        await playbackQueue.enqueueMotion({ index: motionIndex, label: action.label || `动作 ${motionIndex + 1}` });
        return;
      }
      await playbackQueue.enqueueMotionWithAudio({
        index: motionIndex,
        audioUrl: motionAudio.audioUrl,
        emotion: motionAudio.emotion,
        label: `错误反应：${action.label || "动作"}`,
      });
      return;
    }
    if (action.type === "playReactionAudio") {
      const audio = AGENT_REACTION_AUDIO[action.audioId];
      if (audio) await playbackQueue.enqueueAudio({ url: audio.audioUrl, emotion: audio.emotion, label: `Agent 情绪：${audio.label}` });
      return;
    }
    if (action.type === "windowControl") {
      const isClose = action.action === "close";
      await enqueueReactionAudio(isClose ? "byebye" : "seeyou");
      if (isClose) await window.desktopWindow.close();
      else await window.desktopWindow.minimize();
      return;
    }
    if (action.type === "resetModel") await resetModel();
  };
  window.desktopPanel.onMainAction?.(executeAgentAction);

  characterVoiceControl = initCharacterVoiceControl({
    bubble: elements.speechBubble,
    text: elements.bubbleText,
    meta: elements.bubbleMeta,
    onAction: executeAgentAction,
    onActivity: idleDozeController.markInteraction,
  });
  window.desktopSpeechConfirm.onTimeoutWarning?.(() => {
    void executeAgentAction({ type: "playMotionReaction", motionIndex: 9, label: "等待确认：生气跺脚" });
  });
  window.desktopSpeechConfirm.onResolved?.(() => {
    const currentTask = playbackQueue.getCurrentTask();
    if (!currentTask?.label?.includes("等待确认：生气跺脚")) return;
    // 只中止确认超时触发的跺脚。动作处理器会接着执行 0.25 秒回正过渡，
    // 并在完成后继续处理队列中的下一项。
    playbackQueue.interruptCurrentMotion();
  });

  window.desktopPanel.onSettings?.((settings) => {
    if (Number.isFinite(settings.follow)) elements.trackingStrength.value = String(settings.follow);
    if (typeof settings.tracking === "boolean") elements.trackingEnabled.checked = settings.tracking;
    if (typeof settings.autoBlink === "boolean") elements.blinkEnabled.checked = settings.autoBlink;
  });

  // 页面每帧只调度已经初始化好的控制器，不包含任务执行规则。
  modelContext.app.ticker.add((ticker) => {
    const deltaSeconds = ticker.deltaMS / 1000;

    if (!playbackQueue.isMotionPlaying()) {
      gaze.update(deltaSeconds, Boolean(elements.trackingEnabled?.checked));
      blink.update(deltaSeconds, Boolean(elements.blinkEnabled?.checked));
    }

    // 只有普通语音任务才根据音量驱动嘴巴；动作配音不参与嘴形控制。
    if (lipSync.isMouthControlActive()) lipSync.update(deltaSeconds);

    // 语气表情覆盖动作/眨眼中的眉眼值，过渡时长由初始化配置决定。
    emotionController.update(deltaSeconds);

    elements.fps.textContent = `${Math.round(ticker.FPS)} FPS`;
  });

  // 开屏和模型并行准备。视频结束后透明淡出，再开放人物及其交互。
  await startupIntro.finish();
  setStatus("模型加载完成");
  // 启动问候必须等开屏视频完全消失后播放。
  void enqueueReactionAudio("seviceforyou");

}
