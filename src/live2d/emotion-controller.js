/** 语气对应的眉眼参数。后续增加语气时统一扩展这里。 */
export const EMOTION_PRESETS = {
  slightlyAngry: {
    browLY: 0.8,
    browRY: 0.8,
    eyeLOpen: 0.1,
    eyeROpen: 0.1,
  },
  veryAngry: {
    browLY: 1,
    browRY: 1,
    eyeLOpen: 0.2,
    eyeROpen: 0.2,
  },
};

const NORMAL_EXPRESSION = {
  browLY: 0,
  browRY: 0,
  eyeLOpen: 0,
  eyeROpen: 0,
};

/**
 * 创建语气表情控制器。
 * 语气开始和恢复都使用平滑过渡，避免眉眼参数突然跳变。
 */
export function createEmotionController({
  core,
  parameterIds,
  transitionSeconds = 0.5,
}) {
  let active = false;
  let elapsed = 0;
  let startValues = { ...NORMAL_EXPRESSION };
  let currentValues = { ...NORMAL_EXPRESSION };
  let targetValues = { ...NORMAL_EXPRESSION };
  let finishTransition = null;

  function settleTransition() {
    if (!finishTransition) return;
    const resolve = finishTransition;
    finishTransition = null;
    resolve();
  }

  function transitionTo(values) {
    settleTransition();
    active = true;
    elapsed = 0;
    startValues = { ...currentValues };
    targetValues = { ...values };

    return new Promise((resolve) => {
      finishTransition = resolve;
    });
  }

  /** 开始指定语气；不等待 0.1 秒完成即可同时启动音频。 */
  function start(emotion) {
    if (!emotion) return Promise.resolve();
    const preset = EMOTION_PRESETS[emotion];
    if (!preset) throw new Error(`未知语气类型：${emotion}`);
    return transitionTo(preset);
  }

  /** 音频结束后，用 0.1 秒平滑恢复正常眉眼。 */
  async function restore() {
    if (!active) return;
    await transitionTo(NORMAL_EXPRESSION);
    active = false;
  }

  /** 清空队列等紧急操作使用：立即恢复，不等待过渡。 */
  function restoreImmediately() {
    settleTransition();
    active = false;
    currentValues = { ...NORMAL_EXPRESSION };
    targetValues = { ...NORMAL_EXPRESSION };
    writeValues(currentValues);
  }

  function writeValues(values) {
    core.setParameterValueById(parameterIds.browLY, values.browLY);
    core.setParameterValueById(parameterIds.browRY, values.browRY);
    core.setParameterValueById(parameterIds.eyeLOpen, values.eyeLOpen);
    core.setParameterValueById(parameterIds.eyeROpen, values.eyeROpen);
  }

  /** 每帧在动作和眨眼之后调用，让语气成为眉眼的最终显示值。 */
  function update(deltaSeconds) {
    if (!active) return;

    elapsed += deltaSeconds;
    const progress = Math.min(elapsed / transitionSeconds, 1);

    for (const name of Object.keys(currentValues)) {
      currentValues[name] = startValues[name]
        + (targetValues[name] - startValues[name]) * progress;
    }
    writeValues(currentValues);

    if (progress >= 1) settleTransition();
  }

  return { start, restore, restoreImmediately, update };
}
