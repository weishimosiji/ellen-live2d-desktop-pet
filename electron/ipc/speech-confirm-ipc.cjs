const { BrowserWindow, ipcMain, screen } = require("electron");

/** 语音校对确认使用独立小窗口，不依赖对话面板是否打开。 */
function registerSpeechConfirmIpc({ confirmUrl, preloadPath, platform }) {
  let confirmWindow = null;
  let pendingResolve = null;
  let warningTimer = null;
  let confirmOwner = null;
  let ownerCloseHandler = null;

  const finish = (value) => {
    clearTimeout(warningTimer);
    warningTimer = null;
    // 通知人物窗口确认已经结束。若超时跺脚仍在播放，人物窗口会中止该动作
    // 并平滑回正；其他普通动作不会受影响。
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && window !== confirmWindow) {
        window.webContents.send("speech-confirm:resolved", value);
      }
    }
    if (confirmOwner && ownerCloseHandler && !confirmOwner.isDestroyed()) {
      confirmOwner.removeListener("closed", ownerCloseHandler);
    }
    confirmOwner = null;
    ownerCloseHandler = null;
    const resolve = pendingResolve;
    pendingResolve = null;
    if (confirmWindow && !confirmWindow.isDestroyed()) confirmWindow.close();
    confirmWindow = null;
    resolve?.(value);
  };

  ipcMain.handle("speech-confirm:request", async (event, review) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner || !confirmUrl || !preloadPath) return null;
    if (pendingResolve) finish(null);

    const width = 280;
    const height = 286;
    const ownerBounds = owner.getBounds();
    const workArea = screen.getDisplayMatching(ownerBounds).workArea;
    const x = Math.max(workArea.x, Math.min(ownerBounds.x - width - 8, workArea.x + workArea.width - width));
    const y = Math.max(workArea.y, Math.min(
      ownerBounds.y + ownerBounds.height - height,
      workArea.y + workArea.height - height,
    ));
    confirmWindow = new BrowserWindow({
      show: false,
      width,
      height,
      x,
      y,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: "确认语音内容",
      webPreferences: { contextIsolation: true, nodeIntegration: false, preload: preloadPath },
    });
    // 不绑定为功能面板的子窗口；macOS 的父子层级会反过来把确认框压在父窗口后面。
    // pop-up-menu 明确高于 floating 功能面板，确保确认框始终可操作。
    platform.configurePetWindow(confirmWindow, "confirmation");
    confirmOwner = owner;
    ownerCloseHandler = () => finish(null);
    owner.once("closed", ownerCloseHandler);
    await confirmWindow.loadURL(confirmUrl);
    confirmWindow.webContents.send("speech-confirm:data", review);
    confirmWindow.show();
    confirmWindow.focus();
    warningTimer = setTimeout(() => {
      if (!owner.isDestroyed()) owner.webContents.send("speech-confirm:timeout-warning");
    }, 5000);

    return new Promise((resolve) => {
      pendingResolve = resolve;
      confirmWindow.once("closed", () => {
        clearTimeout(warningTimer);
        warningTimer = null;
        if (confirmOwner && ownerCloseHandler && !confirmOwner.isDestroyed()) {
          confirmOwner.removeListener("closed", ownerCloseHandler);
        }
        confirmOwner = null;
        ownerCloseHandler = null;
        confirmWindow = null;
        if (pendingResolve === resolve) {
          pendingResolve = null;
          resolve(null);
        }
      });
    });
  });

  ipcMain.handle("speech-confirm:respond", (event, value) => {
    if (!confirmWindow || confirmWindow.isDestroyed() || event.sender !== confirmWindow.webContents) return false;
    finish(value === "original" || value === "corrected" ? value : null);
    return true;
  });
}

module.exports = { registerSpeechConfirmIpc };
