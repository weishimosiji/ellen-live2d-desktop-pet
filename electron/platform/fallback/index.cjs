const { Notification } = require("electron");

/**
 * 尚未提供专用实现的平台使用此降级适配器。
 * Live2D、Agent、待办和计时器仍可运行；语音识别直接回退 Whisper。
 */
function createFallbackPlatformAdapter() {
  return {
    id: "fallback",
    supportsSystemTranscription: false,
    configureApp() {},

    configureMediaPermissions(electronSession) {
      electronSession.defaultSession.setPermissionRequestHandler(
        (_webContents, permission, callback, details) => {
          const wantsAudio = permission === "media" && details.mediaTypes?.includes("audio");
          callback(Boolean(wantsAudio));
        },
      );
    },

    configurePetWindow(window) {
      window.setAlwaysOnTop(true);
    },

    createSystemTranscriptionService() {
      return null;
    },

    showNotification({ title, body }) {
      if (Notification.isSupported()) new Notification({ title, body }).show();
    },
  };
}

module.exports = { createFallbackPlatformAdapter };
