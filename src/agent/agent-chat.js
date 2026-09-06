import { createAgentErrorFeedback } from "./error-feedback";

/** 初始化右侧文字对话区。模型请求与工具执行均在 Electron 主进程中完成。 */
export function initAgentChat({
  input, sendButton, clearButton, result, intent, status,
  speechConfirm, speechOriginal, speechCorrected,
  speechAcceptButton, speechOriginalButton, speechRejectButton,
  onAction, historyList,
}) {
  let busy = false;
  let pendingSpeechReview = null;
  renderHistory(historyList, readHistory());
  // 主人物窗口的快捷语音会写入同一个 localStorage；跨窗口 storage 事件
  // 让已经打开的历史面板立即出现新记录。
  window.addEventListener("storage", (event) => {
    if (event.key === "ellen-chat-history") renderHistory(historyList, readHistory());
  });

  async function submit() {
    const text = input.value.trim();
    if (!text || busy || pendingSpeechReview) return;

    busy = true;
    sendButton.disabled = true;
    clearButton.disabled = true;
    result.textContent = "……";
    intent.textContent = "正在判断意图";
    status("艾莲正在思考…");

    try {
      const response = await window.desktopAgent.chat(text);
      result.textContent = response.reply;
      addHistory(historyList, text, response.reply);
      intent.textContent = `意图：${formatIntent(response.intent)}`;
      // 主进程只返回经过白名单校验的动作；真正播放仍进入 Live2D 串行队列。
      for (const toolResult of response.toolResults || []) {
        if (toolResult.result?.ok && toolResult.result.action) {
          const outcome = await onAction?.(toolResult.result.action);
          // 确认类动作以真实执行结果覆盖模型的过程说明，避免重复复述。
          if (outcome?.message) result.textContent = outcome.message;
        }
      }
      status("对话完成");
    } catch (error) {
      // 真实错误只留在开发者控制台；角色界面使用简短、拟人化的反馈。
      console.error(error);
      const feedback = createAgentErrorFeedback(error);
      result.textContent = feedback.message;
      addHistory(historyList, text, feedback.message);
      intent.textContent = "";
      status("艾莲暂时没能完成这次请求");
      // 错误反应也走 Live2D 播放队列，避免和正在播放的动作互相打断。
      await onAction?.(feedback.action);
    } finally {
      busy = false;
      sendButton.disabled = false;
      clearButton.disabled = false;
    }
  }

  sendButton.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });
  clearButton.addEventListener("click", async () => {
    await window.desktopAgent.clearHistory();
    result.textContent = "对话记录已清空。";
    intent.textContent = "";
  });

  speechAcceptButton?.addEventListener("click", () => acceptSpeech("correctedText"));
  speechOriginalButton?.addEventListener("click", () => acceptSpeech("originalText"));
  speechRejectButton?.addEventListener("click", () => {
    pendingSpeechReview = null;
    if (speechConfirm) speechConfirm.hidden = true;
    input.value = "";
    sendButton.disabled = false;
    input.focus();
    result.textContent = "再说一次吧。这次慢一点。";
  });

  function acceptSpeech(field) {
    if (!pendingSpeechReview) return;
    input.value = pendingSpeechReview[field];
    pendingSpeechReview = null;
    if (speechConfirm) speechConfirm.hidden = true;
    sendButton.disabled = false;
    input.focus();
    result.textContent = "好。确认无误后点发送。";
    status("语音内容已确认，等待发送");
  }

  async function reviewSpeech(text) {
    if (busy) return;
    busy = true;
    sendButton.disabled = true;
    result.textContent = "我先确认一下你说的内容……";
    status("正在检查语音识别结果");
    try {
      const review = await window.desktopAgent.reviewSpeech(text);
      input.value = review.correctedText;
      if (review.needsConfirmation) {
        pendingSpeechReview = review;
        result.textContent = review.ellenQuestion;
        intent.textContent = `语音修复置信度：${Math.round(review.confidence * 100)}%`;
        status("等待确认语音内容");
        const choice = await window.desktopSpeechConfirm.request(review);
        pendingSpeechReview = null;
        if (!choice) {
          input.value = "";
          result.textContent = "再说一次吧。这次慢一点。";
          sendButton.disabled = false;
          return;
        }
        input.value = choice === "original" ? review.originalText : review.correctedText;
        result.textContent = "好。确认无误后点发送。";
        sendButton.disabled = false;
        input.focus();
      } else {
        pendingSpeechReview = null;
        if (speechConfirm) speechConfirm.hidden = true;
        result.textContent = review.correctedText === review.originalText
          ? "听清楚了。"
          : `我听到的是：“${review.correctedText}”。`;
        intent.textContent = "语音内容清晰";
        status("语音内容清晰，正在发送");
        sendButton.disabled = false;
        // 清晰的普通聊天无需再次点击确认，直接进入正式对话。
        busy = false;
        await submit();
      }
    } catch (error) {
      console.error(error);
      input.value = text;
      if (speechConfirm) speechConfirm.hidden = true;
      sendButton.disabled = false;
      result.textContent = `语音修复失败：${error.message}`;
      status("已保留识别原文，请手动确认");
    } finally {
      busy = false;
    }
  }

  return {
    setInput(text) {
      input.value = text;
      input.focus();
    },
    reviewSpeech,
    submit,
  };
}

function formatIntent(intent) {
  return ({
    conversation: "普通对话",
    calculation: "运算",
    file_list: "查看文件",
    file_read: "读取文件",
    file_write: "写入文件",
    file_delete: "删除文件",
    todo: "待办事项",
    timer: "番茄钟",
  })[intent] || intent;
}

function addHistory(container, userText, reply) {
  if (!container) return;
  const history = readHistory();
  history.unshift({ at: Date.now(), userText, reply });
  localStorage.setItem("ellen-chat-history", JSON.stringify(history.slice(0, 30)));
  renderHistory(container, history.slice(0, 30));
}

function readHistory() {
  try { return JSON.parse(localStorage.getItem("ellen-chat-history") || "[]"); } catch { return []; }
}

function renderHistory(container, history) {
  if (!container) return;
  container.replaceChildren();
  if (!history.length) { const empty=document.createElement("p"); empty.textContent="暂无对话记录"; container.append(empty); return; }
  for (const item of history) {
    const entry=document.createElement("article"); const time=document.createElement("time");
    time.textContent=new Date(item.at).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
    const user=document.createElement("p"); user.textContent=`你：${item.userText}`; const ellen=document.createElement("p"); ellen.textContent=`艾莲：${item.reply}`;
    entry.append(time,user,ellen); container.append(entry);
  }
}
