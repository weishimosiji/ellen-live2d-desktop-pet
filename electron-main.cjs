const { app, BrowserWindow, screen, session } = require("electron");
const { createServer } = require("node:http");
const { readFile, stat, writeFile } = require("node:fs/promises");
const { writeFileSync } = require("node:fs");
const { extname, join, normalize } = require("node:path");
const { createHybridTranscriptionService } = require("./electron/services/hybrid-transcription.cjs");
const { registerTranscriptionIpc } = require("./electron/ipc/transcription-ipc.cjs");
const { createDeepSeekAgent } = require("./electron/agent/deepseek-agent.cjs");
const { registerAgentIpc } = require("./electron/ipc/agent-ipc.cjs");
const { registerWindowIpc } = require("./electron/ipc/window-ipc.cjs");
const { createTodoService } = require("./electron/services/todo-service.cjs");
const { registerTodoIpc } = require("./electron/ipc/todo-ipc.cjs");
const { createTimerService } = require("./electron/services/timer-service.cjs");
const { registerTimerIpc } = require("./electron/ipc/timer-ipc.cjs");
const { registerSpeechConfirmIpc } = require("./electron/ipc/speech-confirm-ipc.cjs");
const { createPlatformAdapter } = require("./electron/platform/index.cjs");

// 启动问候需要在用户第一次点击前播放。
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const root = join(__dirname, "dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".moc3": "application/octet-stream"
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
        const relative = normalize(pathname).replace(/^[/\\]+/, "") || "index.html";
        let target = join(root, relative);
        if ((await stat(target)).isDirectory()) target = join(target, "index.html");
        const data = await readFile(target);
        response.writeHead(200, {
          "Content-Type": mime[extname(target)] || "application/octet-stream",
          "Cache-Control": "no-store"
        });
        response.end(data);
      } catch {
        response.writeHead(404);
        response.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

app.whenReady().then(async () => {
  const platform = createPlatformAdapter(__dirname);
  platform.configureApp(app, root);
  // 系统识别与 Whisper 保持为两个独立实现；路由层负责优先系统、失败回退。
  const transcriptionService = createHybridTranscriptionService(__dirname, platform);
  registerTranscriptionIpc(transcriptionService);
  const todoService = createTodoService(join(app.getPath("userData"), "todos.json"));
  const timerService = createTimerService(join(app.getPath("userData"), "timers.json"));
  await timerService.initialize();
  registerTimerIpc(timerService, platform);
  registerTodoIpc(todoService);
  const agent = await createDeepSeekAgent(__dirname, { todoService, timerService });
  registerAgentIpc(agent);

  // 只允许页面申请麦克风音频权限，不开放摄像头等其他媒体权限。
  platform.configureMediaPermissions(session);

  const server = await startServer();
  const address = server.address();
  registerWindowIpc({
    calendarUrl: `http://127.0.0.1:${address.port}/calendar.html`,
    preloadPath: join(__dirname, "electron/preload.cjs"),
    platform,
  });
  registerSpeechConfirmIpc({
    confirmUrl: `http://127.0.0.1:${address.port}/speech-confirm.html`,
    preloadPath: join(__dirname, "electron/preload.cjs"),
    platform,
  });
  // 常驻窗口只包住人物和工具列，减少透明区域占用桌面空间。
  // 与 HTML 布局预览保持一致，避免 Electron 中 canvas 被窗口尺寸放大。
  const windowWidth = 240;
  // 开屏视频是 1:1；启动阶段只向人物窗口左侧扩展，右边界保持不变。
  const startupWindowWidth = 410;
  // 在原 300px 人物区域上方增加 110px，专门用于气泡展示。
  const windowHeight = 410;
  const workArea = screen.getPrimaryDisplay().workArea;
  const windowStatePath = join(app.getPath("userData"), "window-state.json");
  let savedPosition = null;
  try {
    const value = JSON.parse(await readFile(windowStatePath, "utf8"));
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
      // 旧版保存的是 300px 窗口顶部；首次升级时向上补偿新增气泡区域，
      // 从视觉上保持艾莲仍在关闭前的位置。
      savedPosition = { ...value, y: value.layoutVersion === 2 ? value.y : value.y - 110 };
    }
  } catch {
    // 首次启动没有状态文件，使用默认右下角位置。
  }
  const display = savedPosition
    ? screen.getDisplayMatching({ x: savedPosition.x, y: savedPosition.y, width: windowWidth, height: windowHeight })
    : screen.getPrimaryDisplay();
  const targetWorkArea = display.workArea;
  const compactX = savedPosition
    ? Math.max(targetWorkArea.x, Math.min(savedPosition.x, targetWorkArea.x + targetWorkArea.width - windowWidth))
    : workArea.x + workArea.width - windowWidth - 16;
  const initialX = Math.max(targetWorkArea.x, compactX - (startupWindowWidth - windowWidth));
  const initialY = savedPosition
    ? Math.max(targetWorkArea.y, Math.min(savedPosition.y, targetWorkArea.y + targetWorkArea.height - windowHeight))
    : workArea.y + workArea.height - windowHeight - 16;
  const window = new BrowserWindow({
    width: startupWindowWidth,
    height: windowHeight,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: "艾莲桌宠",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "electron/preload.cjs")
    }
  });
  window.setMenuBarVisibility(false);
  // 气泡现在属于人物窗口内部；功能面板和确认框使用更高层级。
  platform.configurePetWindow(window, "character");
  await window.loadURL(`http://127.0.0.1:${address.port}`);
  const getCompactPosition = () => {
    const bounds = window.getBounds();
    return {
      x: bounds.x + bounds.width - windowWidth,
      y: bounds.y + bounds.height - windowHeight,
      layoutVersion: 2,
    };
  };
  let savePositionTimer = null;
  window.on("moved", () => {
    clearTimeout(savePositionTimer);
    savePositionTimer = setTimeout(() => {
      void writeFile(windowStatePath, JSON.stringify(getCompactPosition()), "utf8");
    }, 180);
  });
  window.on("close", () => {
    clearTimeout(savePositionTimer);
    // 关闭阶段同步写入，避免进程退出早于异步文件写入。
    writeFileSync(windowStatePath, JSON.stringify(getCompactPosition()), "utf8");
  });
  window.on("closed", () => server.close());
});

app.on("window-all-closed", () => app.quit());
