/**
 * 将技术错误转换为用户能看懂的艾莲反馈。
 * 真实错误仍由调用方记录到控制台，这里不向界面暴露 API、IPC 或堆栈信息。
 */
export function createAgentErrorFeedback(error) {
  const details = String(error?.message || error || "").toLowerCase();

  if (matches(details, ["dskey", "api key", "unauthorized", "401", "authentication"])) {
    return feedback("通行凭证好像失效了。换一个再试吧。", 6, "摇头");
  }

  if (matches(details, ["429", "rate limit", "too many requests", "请求过于频繁"])) {
    return feedback("请求太多了……稍等一下再叫我。", 2, "叹气");
  }

  if (matches(details, ["fetch failed", "无法连接", "network", "enotfound", "econnreset", "econnrefused", "timeout", "timed out"])) {
    return feedback("网络好像断了……我暂时联系不上那边。", 2, "叹气");
  }

  if (matches(details, ["500", "502", "503", "504", "service unavailable", "insufficient_system_resource"])) {
    return feedback("那边暂时没回应……过一会儿再试吧。", 2, "叹气");
  }

  if (matches(details, ["model", "400", "bad request", "参数"])) {
    return feedback("这次的设置不太对。我没法继续处理。", 6, "摇头");
  }

  return feedback("出了点小问题……这次没处理好。", 6, "摇头");
}

function feedback(message, motionIndex, label) {
  return {
    message,
    action: { type: "playMotionReaction", motionIndex, label },
  };
}

function matches(text, fragments) {
  return fragments.some((fragment) => text.includes(fragment));
}
