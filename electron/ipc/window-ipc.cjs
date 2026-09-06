const { BrowserWindow, ipcMain, screen } = require("electron");

const PANEL_GAP = 8;

/** 功能面板使用独立且可复用的窗口，始终显示在人物左侧。 */
function registerWindowIpc({ calendarUrl, preloadPath, platform } = {}) {
  let panelWindow = null;
  let panelOwner = null;
  let pendingPanelView = null;
  let pendingPanelActivate = true;
  let currentPanelView = null;

  const notifyPanelVisibility = (view, visible) => {
    if (panelOwner && !panelOwner.isDestroyed()) panelOwner.webContents.send("panel:visibility", { view, visible });
  };
  const senderWindow = (sender) => panelWindow && !panelWindow.isDestroyed() && sender === panelWindow.webContents
    ? panelOwner
    : BrowserWindow.fromWebContents(sender);
  const positionPanel = (width, height) => {
    if (!panelOwner || panelOwner.isDestroyed() || !panelWindow || panelWindow.isDestroyed()) return;
    const ownerBounds = panelOwner.getBounds();
    const workArea = screen.getDisplayMatching(ownerBounds).workArea;
    const x = Math.max(workArea.x, ownerBounds.x - width - PANEL_GAP);
    const y = Math.max(workArea.y, Math.min(
      ownerBounds.y + ownerBounds.height - height,
      workArea.y + workArea.height - height,
    ));
    panelWindow.setBounds({ x, y, width, height }, false);
  };
  const hidePanel = () => {
    if (!panelWindow || panelWindow.isDestroyed()) return;
    panelWindow.hide();
    notifyPanelVisibility(currentPanelView, false);
    currentPanelView = null;
    pendingPanelView = null;
    pendingPanelActivate = true;
  };
  const ensurePanelWindow = async (owner) => {
    panelOwner = owner;
    if (panelWindow && !panelWindow.isDestroyed()) return;
    const panelUrl = calendarUrl.replace(/calendar\.html$/, "panel.html");
    panelWindow = new BrowserWindow({
      show: false,
      width: 360,
      height: 410,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: "艾莲功能面板",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
        backgroundThrottling: false,
      },
    });
    panelWindow.setMenuBarVisibility(false);
    platform.configurePetWindow(panelWindow, "panel");
    panelWindow.on("closed", () => {
      panelWindow = null;
      pendingPanelView = null;
      currentPanelView = null;
    });
    panelOwner.once("closed", () => {
      if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close();
    });
    await panelWindow.loadURL(panelUrl);
  };
  const openPanel = async (owner, view = "chat", options = {}) => {
    if (!owner || !calendarUrl || !preloadPath) return { success: false };
    await ensurePanelWindow(owner);
    if (panelWindow.isVisible() && currentPanelView === view) {
      hidePanel();
      return { success: true, hidden: true };
    }
    panelWindow.hide();
    notifyPanelVisibility(currentPanelView, false);
    pendingPanelView = view;
    pendingPanelActivate = options.activate !== false;
    panelWindow.webContents.send("panel:set-view", view);
    return { success: true, hidden: false };
  };

  ipcMain.handle("window:minimize", (event) => {
    senderWindow(event.sender)?.minimize();
    return { success: true };
  });
  ipcMain.handle("window:close", (event) => {
    if (panelWindow && event.sender === panelWindow.webContents) {
      hidePanel();
      return { success: true, hidden: true };
    }
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) return { success: false };
    owner.close();
    return { success: true, hidden: false };
  });
  ipcMain.handle("window:open-calendar", (event) => openPanel(senderWindow(event.sender), "todo"));
  ipcMain.handle("window:open-panel", (event, view = "chat", options = {}) => openPanel(senderWindow(event.sender), view, options));
  ipcMain.on("voice:forward-hotkey", (event, phase) => {
    if (!panelWindow || event.sender !== panelWindow.webContents) return;
    if (phase !== "down" && phase !== "up") return;
    if (panelOwner && !panelOwner.isDestroyed()) panelOwner.webContents.send("voice:hotkey", phase);
  });
  ipcMain.handle("window:set-panel-size", (event, requestedWidth, requestedHeight) => {
    if (!panelWindow || event.sender !== panelWindow.webContents) return { success: false };
    const width = Math.max(180, Math.min(520, Math.round(Number(requestedWidth) || 0)));
    const height = Math.max(120, Math.min(700, Math.round(Number(requestedHeight) || 0)));
    positionPanel(width, height);
    return { success: true, width, height };
  });
  ipcMain.handle("window:panel-ready", (event, view) => {
    if (!panelWindow || event.sender !== panelWindow.webContents) return { success: false };
    if (view !== pendingPanelView) return { success: false, stale: true };
    currentPanelView = view;
    pendingPanelView = null;
    const activate = pendingPanelActivate;
    pendingPanelActivate = true;
    if (activate) panelWindow.show();
    else panelWindow.showInactive();
    notifyPanelVisibility(view, true);
    // 面板聚焦只改变键盘输入目标，不刷新或隐藏人物窗口，气泡会继续显示。
    return { success: true };
  });
  ipcMain.handle("panel:main-action", (_event, action) => {
    if (!panelOwner || panelOwner.isDestroyed()) return { success: false };
    panelOwner.webContents.send("panel:main-action", action);
    return { success: true };
  });
  ipcMain.handle("panel:update-settings", (_event, settings) => {
    if (!panelOwner || panelOwner.isDestroyed()) return { success: false };
    panelOwner.webContents.send("panel:update-settings", settings);
    return { success: true };
  });
  ipcMain.handle("window:get-position", (event) => {
    const owner = senderWindow(event.sender);
    if (!owner) return null;
    const [x, y] = owner.getPosition();
    return { x, y };
  });
  ipcMain.handle("window:set-position", (event, x, y) => {
    const owner = senderWindow(event.sender);
    if (!owner || !Number.isFinite(x) || !Number.isFinite(y)) return { success: false };
    owner.setPosition(Math.round(x), Math.round(y), false);
    if (panelWindow?.isVisible()) {
      const [width, height] = panelWindow.getSize();
      positionPanel(width, height);
    }
    return { success: true };
  });
  ipcMain.handle("window:finish-startup", (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) return { success: false };
    const bounds = owner.getBounds();
    const width = 240;
    const height = 410;
    // 收回启动时向左扩展的区域，保持窗口右边界和底边不动。
    owner.setBounds({
      x: bounds.x + bounds.width - width,
      y: bounds.y + bounds.height - height,
      width,
      height,
    }, false);
    return { success: true };
  });
}

module.exports = { registerWindowIpc };
