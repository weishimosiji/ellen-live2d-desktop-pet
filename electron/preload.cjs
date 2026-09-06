const { contextBridge, ipcRenderer } = require("electron");

// 只暴露语音识别所需的最小接口，避免页面访问 Node.js 和系统能力。
contextBridge.exposeInMainWorld("desktopVoice", {
  transcribe: (wavBytes) => ipcRenderer.invoke("voice:transcribe", wavBytes),
  onHotkey: (fn) => ipcRenderer.on("voice:hotkey", (_event, phase) => fn(phase)),
  forwardHotkey: (phase) => ipcRenderer.send("voice:forward-hotkey", phase),
});

// 页面只能发送文字和清空上下文，无法读取 API Key 或直接访问文件系统。
contextBridge.exposeInMainWorld("desktopAgent", {
  chat: (text) => ipcRenderer.invoke("agent:chat", text),
  reviewSpeech: (text) => ipcRenderer.invoke("agent:review-speech", text),
  clearHistory: () => ipcRenderer.invoke("agent:clear-history"),
});

contextBridge.exposeInMainWorld("desktopWindow", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  openCalendar: () => ipcRenderer.invoke("window:open-calendar"),
  openPanel: (view, options) => ipcRenderer.invoke("window:open-panel", view, options),
  setPanelSize: (width, height) => ipcRenderer.invoke("window:set-panel-size", width, height),
  panelReady: (view) => ipcRenderer.invoke("window:panel-ready", view),
  getPosition: () => ipcRenderer.invoke("window:get-position"),
  setPosition: (x, y) => ipcRenderer.invoke("window:set-position", x, y),
  finishStartup: () => ipcRenderer.invoke("window:finish-startup"),
});
contextBridge.exposeInMainWorld("desktopSpeechConfirm", {
  request: (review) => ipcRenderer.invoke("speech-confirm:request", review),
  respond: (value) => ipcRenderer.invoke("speech-confirm:respond", value),
  onData: (fn) => ipcRenderer.on("speech-confirm:data", (_event, review) => fn(review)),
  onTimeoutWarning: (fn) => ipcRenderer.on("speech-confirm:timeout-warning", () => fn()),
  onResolved: (fn) => ipcRenderer.on("speech-confirm:resolved", (_event, value) => fn(value)),
});
contextBridge.exposeInMainWorld("desktopPanel", {
  runMainAction: (action) => ipcRenderer.invoke("panel:main-action", action),
  updateSettings: (settings) => ipcRenderer.invoke("panel:update-settings", settings),
  onSetView: (fn) => ipcRenderer.on("panel:set-view", (_event, view) => fn(view)),
  onMainAction: (fn) => ipcRenderer.on("panel:main-action", (_event, action) => fn(action)),
  onSettings: (fn) => ipcRenderer.on("panel:update-settings", (_event, settings) => fn(settings)),
  onVisibility: (fn) => ipcRenderer.on("panel:visibility", (_event, state) => fn(state)),
});
contextBridge.exposeInMainWorld("desktopTodos", {
  list: (range) => ipcRenderer.invoke("todo:list", range), add: (data) => ipcRenderer.invoke("todo:add", data),
  update: (id, changes) => ipcRenderer.invoke("todo:update", id, changes), remove: (id) => ipcRenderer.invoke("todo:remove", id),
  onChanged: (fn) => ipcRenderer.on("todo:changed", (_event, change) => fn(change)),
});
contextBridge.exposeInMainWorld("desktopTimers", { list:()=>ipcRenderer.invoke("timer:list"), cancel:(id)=>ipcRenderer.invoke("timer:cancel",id), onChanged:(fn)=>ipcRenderer.on("timer:changed",(_e,v)=>fn(v)), onFired:(fn)=>ipcRenderer.on("timer:fired",(_e,v)=>fn(v)) });
