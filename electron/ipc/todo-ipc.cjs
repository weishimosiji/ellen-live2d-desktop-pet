const { BrowserWindow, ipcMain } = require("electron");
function registerTodoIpc(service) {
  ipcMain.handle("todo:list", (_e, range) => service.list(range));
  const notifyChanged = (change) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) window.webContents.send("todo:changed", change);
    });
  };
  ipcMain.handle("todo:add", async (_e, data) => {
    const item = await service.add(data);
    notifyChanged({ type: "add", item });
    return item;
  });
  ipcMain.handle("todo:update", async (_e, id, changes) => {
    const item = await service.update(id, changes);
    notifyChanged({ type: "update", item });
    return item;
  });
  ipcMain.handle("todo:remove", async (_e, id) => {
    const result = await service.remove(id);
    notifyChanged({ type: "remove", id });
    return result;
  });
}
module.exports = { registerTodoIpc };
