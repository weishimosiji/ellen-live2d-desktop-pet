/**
 * 创建表情参数调试控制器。
 * 启用后在每一帧最后写入眉毛和眼睛数值，用于人工寻找合适组合。
 */
export function createExpressionTuner({ core, parameterIds }) {
  let enabled = false;
  const values = {
    browLY: 0,
    browRY: 0,
    eyeLOpen: 0,
    eyeROpen: 0,
  };

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    if (!enabled) {
      // 退出调试时立即撤销调试表情，避免眉毛值残留。
      core.setParameterValueById(parameterIds.browLY, 0);
      core.setParameterValueById(parameterIds.browRY, 0);
      core.setParameterValueById(parameterIds.eyeLOpen, 0);
      core.setParameterValueById(parameterIds.eyeROpen, 0);
    }
  }

  function setValue(name, value) {
    if (!(name in values)) throw new Error(`未知表情参数：${name}`);
    values[name] = Number(value);
  }

  /** 在其他动画控制器之后调用，确保调试值能显示在模型上。 */
  function update() {
    if (!enabled) return;

    core.setParameterValueById(parameterIds.browLY, values.browLY);
    core.setParameterValueById(parameterIds.browRY, values.browRY);
    core.setParameterValueById(parameterIds.eyeLOpen, values.eyeLOpen);
    core.setParameterValueById(parameterIds.eyeROpen, values.eyeROpen);
  }

  function getValues() {
    return { ...values };
  }

  return { setEnabled, setValue, update, getValues };
}
