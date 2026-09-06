import "./styles.css";
import "./ui-theme.css";
import { initDesktopPreview } from "./app";
import { installBrowserPreviewBridge } from "./browser-bridge";

// 应用入口只负责启动；模型、控件和任务队列业务均由各自模块管理。
// 浏览器打开时先补充模拟接口；Electron 中检测到 preload 接口后不会做任何修改。
installBrowserPreviewBridge();
initDesktopPreview().catch((error) => {
  console.error(error);
  const status = document.querySelector("#status");
  if (status) status.textContent = `应用初始化失败：${error.message}`;
});
