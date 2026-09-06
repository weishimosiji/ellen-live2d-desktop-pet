/**
 * 直接拖动人物来移动无边框窗口。
 * 移动距离超过阈值才进入拖动，普通单击仍交给人物点击交互处理。
 */
export function createCharacterWindowDrag({ canvas, shell, modelContext }) {
  const DRAG_THRESHOLD = 5;
  let pointerId = null;
  let pointerStart = null;
  let windowStart = null;
  let dragging = false;
  let suppressClickUntil = 0;
  let pendingPosition = null;
  let moveFrame = 0;

  async function handlePointerDown(event) {
    if (event.button !== 0 || pointerId !== null) return;
    if (!modelContext.hitTestBody(event.clientX, event.clientY)) return;

    pointerId = event.pointerId;
    pointerStart = { x: event.screenX, y: event.screenY };
    canvas.setPointerCapture?.(event.pointerId);
    const position = await window.desktopWindow.getPosition();
    // 获取窗口坐标期间可能已经松手，此时不再进入拖动状态。
    if (!position || pointerId !== event.pointerId) return;
    windowStart = position;
  }

  function handlePointerMove(event) {
    if (pointerId === null) {
      shell.classList.toggle("window-drag-ready", modelContext.hitTestBody(event.clientX, event.clientY));
      return;
    }
    if (event.pointerId !== pointerId || !pointerStart || !windowStart) return;
    const dx = event.screenX - pointerStart.x;
    const dy = event.screenY - pointerStart.y;

    if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!dragging) {
      dragging = true;
      shell.classList.add("window-dragging");
    }

    pendingPosition = { x: windowStart.x + dx, y: windowStart.y + dy };
    if (moveFrame) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      if (!pendingPosition) return;
      void window.desktopWindow.setPosition(pendingPosition.x, pendingPosition.y);
    });
  }

  function finishDrag(event) {
    if (event.pointerId !== pointerId) return;
    if (dragging) suppressClickUntil = performance.now() + 450;
    pointerId = null;
    pointerStart = null;
    windowStart = null;
    dragging = false;
    pendingPosition = null;
    // 延迟收起按钮，避免松手瞬间因窗口移动触发 pointerleave 而闪烁。
    window.setTimeout(() => shell.classList.remove("window-dragging"), 350);
  }

  function handlePointerLeave() {
    if (pointerId === null) shell.classList.remove("window-drag-ready");
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);
  canvas.addEventListener("pointerleave", handlePointerLeave);

  return {
    shouldSuppressClick: () => dragging || performance.now() < suppressClickUntil,
    isPointerEngaged: () => dragging || pointerId !== null,
    destroy() {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", finishDrag);
      canvas.removeEventListener("pointercancel", finishDrag);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      if (moveFrame) cancelAnimationFrame(moveFrame);
    },
  };
}
