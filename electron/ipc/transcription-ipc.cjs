const { ipcMain } = require("electron");

/** 注册语音转写 IPC；渲染页面不能直接执行本地程序。 */
function registerTranscriptionIpc(transcriptionService) {
  ipcMain.handle("voice:transcribe", async (_event, wavBytes) => {
    return transcriptionService.transcribe(wavBytes);
  });
}

module.exports = { registerTranscriptionIpc };
