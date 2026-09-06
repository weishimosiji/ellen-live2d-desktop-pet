const { BrowserWindow, ipcMain } = require("electron");
function registerTimerIpc(service, platform) {
  ipcMain.handle("timer:list", () => service.list()); ipcMain.handle("timer:cancel", (_e,id)=>service.cancel(id));
  const send=(channel,data)=>BrowserWindow.getAllWindows().forEach(win=>win.webContents.send(channel,data));
  service.events.on("changed", timers => send("timer:changed", timers));
  service.events.on("fired", timer => { const body=timer.type==="task"?`该${timer.task}了。`:"时间到了。"; platform.showNotification({title:"艾莲提醒",body}); send("timer:fired",timer); });
}
module.exports = { registerTimerIpc };
