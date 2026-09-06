/**
 * 创建自动眨眼控制器。
 * 眨眼采用“等待 → 闭眼 → 睁眼”的状态机，不依赖动作文件。
 */
export function createBlinkController({ core, parameterIds, config }) {
  let phase = "waiting";
  let elapsed = 0;
  let nextBlinkAt = makeNextBlinkTime();

  function makeNextBlinkTime() {
    return config.blinkWaitMinSeconds
      + Math.random() * config.blinkWaitRandomSeconds;
  }

  function setEyes(value) {
    core.setParameterValueById(parameterIds.eyeLOpen, value);
    core.setParameterValueById(parameterIds.eyeROpen, value);
  }

  /** 重新睁眼，并从头计算下一次眨眼时间。 */
  function reset() {
    phase = "waiting";
    elapsed = 0;
    nextBlinkAt = makeNextBlinkTime();
    setEyes(config.eyeOpenValue);
  }

  /** 每一帧调用一次；enabled=false 时保持睁眼。 */
  function update(deltaSeconds, enabled) {
    if (!enabled) {
      reset();
      return;
    }

    elapsed += deltaSeconds;

    if (phase === "waiting") {
      if (elapsed < nextBlinkAt) return;
      phase = "closing";
      elapsed = 0;
    }

    if (phase === "closing") {
      const progress = Math.min(elapsed / config.blinkCloseSeconds, 1);
      const value = config.eyeOpenValue
        + (config.eyeClosedValue - config.eyeOpenValue) * progress;
      setEyes(value);

      if (progress >= 1) {
        phase = "opening";
        elapsed = 0;
      }
      return;
    }

    const progress = Math.min(elapsed / config.blinkOpenSeconds, 1);
    const value = config.eyeClosedValue
      + (config.eyeOpenValue - config.eyeClosedValue) * progress;
    setEyes(value);

    if (progress >= 1) reset();
  }

  return { update, reset };
}
