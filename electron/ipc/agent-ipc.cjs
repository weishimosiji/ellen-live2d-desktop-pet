const { ipcMain } = require("electron");

/** 注册页面可调用的最小 Agent 接口。 */
function registerAgentIpc(agent) {
  ipcMain.handle("agent:chat", (_event, text) => agent.chat(text));
  ipcMain.handle("agent:review-speech", (_event, text) => agent.reviewSpeech(text));
  ipcMain.handle("agent:clear-history", () => {
    agent.clearHistory();
    return { success: true };
  });
}

module.exports = { registerAgentIpc };
