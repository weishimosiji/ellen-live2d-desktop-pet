/**
 * 创建鼠标视线跟随控制器。
 * 这里直接控制 ParamAngleX/Y，没有使用 model.focus()；因为当前模型中
 * 一些标准视线参数可能已被重新用于其他部位，直接写角度参数更可控。
 */
export function createGazeController({
  stage,
  core,
  parameterIds,
  neutralValues,
  config,
  getStrength,
}) {
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };

  function onPointerMove(event) {
    const rect = stage.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    const strength = getStrength();

    target.x = normalizedX * config.trackingAngle * strength;
    target.y = -normalizedY * config.trackingAngle * strength;
  }

  function onPointerLeave() {
    target.x = 0;
    target.y = 0;
  }

  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerleave", onPointerLeave);

  /** 角度平滑回到模型的初始状态。 */
  function reset() {
    target.x = 0;
    target.y = 0;
    current.x = 0;
    current.y = 0;
    core.setParameterValueById(parameterIds.angleX, neutralValues.angleX);
    core.setParameterValueById(parameterIds.angleY, neutralValues.angleY);
  }

  /** 每一帧调用一次；enabled=false 时让角色平滑回正。 */
  function update(deltaSeconds, enabled) {
    if (!enabled) onPointerLeave();

    // 与帧率无关的缓动系数，数值越大跟随越快。
    const smoothing = 1 - Math.exp(-10 * deltaSeconds);
    current.x += (target.x - current.x) * smoothing;
    current.y += (target.y - current.y) * smoothing;

    core.setParameterValueById(
      parameterIds.angleX,
      neutralValues.angleX + current.x,
    );
    core.setParameterValueById(
      parameterIds.angleY,
      neutralValues.angleY + current.y,
    );
  }

  return {
    update,
    reset,
    destroy() {
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerleave", onPointerLeave);
    },
  };
}
