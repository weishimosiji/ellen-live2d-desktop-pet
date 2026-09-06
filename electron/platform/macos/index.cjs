const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { Notification } = require("electron");
const { createSystemTranscriptionService } = require("./system-transcription.cjs");

const WINDOW_LEVELS = {
  character: ["floating", 1],
  panel: ["floating", 2],
  confirmation: ["pop-up-menu", 1],
};

/** macOS 平台实现：Dock、跨工作区窗口层级与 Apple 系统语音。 */
function createMacOSPlatformAdapter(projectRoot) {
  return {
    id: "macos",
    supportsSystemTranscription: true,

    configureApp(app, assetRoot) {
      const iconPath = join(assetRoot, "icon/ellen-app-icon.png");
      if (existsSync(iconPath)) app.dock?.setIcon(iconPath);
    },

    configureMediaPermissions(electronSession) {
      electronSession.defaultSession.setPermissionRequestHandler(
        (_webContents, permission, callback, details) => {
          const wantsAudio = permission === "media" && details.mediaTypes?.includes("audio");
          callback(Boolean(wantsAudio));
        },
      );
    },

    configurePetWindow(window, role = "character") {
      const [level, relativeLevel] = WINDOW_LEVELS[role] || WINDOW_LEVELS.character;
      window.setAlwaysOnTop(true, level, relativeLevel);
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    },

    createSystemTranscriptionService() {
      return createSystemTranscriptionService(projectRoot);
    },

    showNotification({ title, body }) {
      if (Notification.isSupported()) new Notification({ title, body }).show();
    },
  };
}

module.exports = { createMacOSPlatformAdapter };
