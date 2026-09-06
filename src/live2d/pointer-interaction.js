/**
 * 创建人物鼠标交互。
 * 移入只在“人物外 → 人物内”时触发；冷却用于避免沿头发/衣服边缘移动时反复播放。
 */
export function createPointerInteraction({
  canvas,
  modelContext,
  onHover,
  onClick,
  shouldIgnoreClick = () => false,
  shouldIgnoreHover = () => false,
}) {
  const HOVER_COOLDOWN_MS = 8000;
  const HOVER_DWELL_MS = 2000;
  const STATIONARY_TOLERANCE_PX = 3;
  const CLICK_COOLDOWN_MS = 1200;
  let pointerInsideModel = false;
  let lastHoverAt = -Infinity;
  let lastClickAt = -Infinity;
  let hoverTriggeredThisStay = false;
  let stablePoint = null;
  let dwellTimer = null;
  let pendingPointerEvent = null;
  let frameRequested = false;

  function cancelDwell() {
    window.clearTimeout(dwellTimer);
    dwellTimer = null;
  }

  function scheduleDwell(clientX, clientY) {
    cancelDwell();
    stablePoint = { x: clientX, y: clientY };
    const cooldownRemaining = Math.max(0, HOVER_COOLDOWN_MS - (performance.now() - lastHoverAt));
    dwellTimer = window.setTimeout(() => {
      dwellTimer = null;
      if (shouldIgnoreHover() || !pointerInsideModel || hoverTriggeredThisStay) return;
      if (!modelContext.hitTestBody(stablePoint.x, stablePoint.y)) return;
      lastHoverAt = performance.now();
      hoverTriggeredThisStay = true;
      void onHover();
    }, Math.max(HOVER_DWELL_MS, cooldownRemaining));
  }

  function handlePointerMove(event) {
    pendingPointerEvent = event;
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      const current = pendingPointerEvent;
      if (!current) return;
      if (shouldIgnoreHover()) {
        cancelDwell();
        pointerInsideModel = false;
        stablePoint = null;
        return;
      }
      const hit = modelContext.hitTestBody(current.clientX, current.clientY);
      if (!hit) {
        cancelDwell();
        pointerInsideModel = false;
        hoverTriggeredThisStay = false;
        stablePoint = null;
        return;
      }

      if (!pointerInsideModel) {
        pointerInsideModel = true;
        hoverTriggeredThisStay = false;
        scheduleDwell(current.clientX, current.clientY);
        return;
      }

      const moved = !stablePoint || Math.hypot(
        current.clientX - stablePoint.x,
        current.clientY - stablePoint.y,
      ) > STATIONARY_TOLERANCE_PX;
      if (moved && !hoverTriggeredThisStay) {
        scheduleDwell(current.clientX, current.clientY);
      }
    });
  }

  function handlePointerLeave() {
    pendingPointerEvent = null;
    cancelDwell();
    pointerInsideModel = false;
    hoverTriggeredThisStay = false;
    stablePoint = null;
  }

  function handleClick(event) {
    if (shouldIgnoreClick()) return;
    if (!modelContext.hitTestBody(event.clientX, event.clientY)) return;
    const now = performance.now();
    if (now - lastClickAt < CLICK_COOLDOWN_MS) return;
    lastClickAt = now;
    void onClick();
  }

  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerleave", handlePointerLeave);
  canvas.addEventListener("click", handleClick);

  return {
    destroy() {
      cancelDwell();
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("click", handleClick);
    },
  };
}
