/**
 * 平台能力统一入口。
 *
 * 业务代码只能通过这里使用系统能力，不直接判断 process.platform。
 * 新增 Windows 支持时，只需要补充 windows 实现并在这里注册。
 */
function createPlatformAdapter(projectRoot) {
  if (process.platform === "darwin") {
    return require("./macos/index.cjs").createMacOSPlatformAdapter(projectRoot);
  }

  return require("./fallback/index.cjs").createFallbackPlatformAdapter(projectRoot);
}

module.exports = { createPlatformAdapter };
