const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { AGENT_TOOL_DEFINITIONS } = require("./tool-definitions.cjs");
const { ELLEN_SYSTEM_PROMPT } = require("./system-prompt.cjs");
const { createToolExecutor } = require("./tool-executor.cjs");

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";
const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY_MESSAGES = 12;

/**
 * 创建仅运行在 Electron 主进程的轻量 Agent。
 * API Key 不会经由 preload 暴露给网页，也不会写入日志。
 */
async function createDeepSeekAgent(projectRoot, { todoService, timerService } = {}) {
  const configUrl = pathToFileURL(join(projectRoot, "config.js")).href;
  const config = await import(configUrl);
  const apiKey = String(config.dsKey || "").trim();
  const model = String(config.dsModel || DEFAULT_MODEL).trim();

  if (!apiKey) throw new Error("config.js 中没有有效的 dsKey");

  const toolExecutor = createToolExecutor(join(projectRoot, "agent-workspace"), { todoService, timerService });
  await toolExecutor.initialize();
  const history = [];

  async function chat(userText) {
    const text = requireUserText(userText);
    // 先在本地判断意图，使界面无需依赖模型是否主动调用分类工具。
    const intentResult = await toolExecutor.execute("classify_intent", { text });
    const localTodoResult = await createLocalTodoDraft(text, intentResult.intent, toolExecutor);
    if (localTodoResult) {
      rememberConversation(text, localTodoResult.reply);
      return localTodoResult;
    }
    const messages = [
      { role: "system", content: ELLEN_SYSTEM_PROMPT },
      { role: "system", content: `当前日期：${currentDateInChina()}（Asia/Shanghai）。` },
      ...history,
      { role: "user", content: text },
    ];
    const toolResults = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const assistant = await requestCompletion({ apiKey, model, messages });
      messages.push(normalizeAssistantMessage(assistant));

      if (!assistant.tool_calls?.length) {
        const reply = String(assistant.content || "……我暂时没组织好答案。再说一次？").trim();
        appendAutomaticToolReaction(toolResults, reply);
        rememberConversation(text, reply);
        return { reply, intent: intentResult.intent, toolResults };
      }

      for (const call of assistant.tool_calls) {
        const name = call.function?.name;
        let result;
        try {
          const args = JSON.parse(call.function?.arguments || "{}");
          const reactionAlreadyUsed = name === "play_reaction_audio"
            && toolResults.some((item) => item.name === "play_reaction_audio" && item.result.ok);
          if (reactionAlreadyUsed) throw new Error("本轮已经选择过角色语音");
          result = { ok: true, ...(await toolExecutor.execute(name, args)) };
        } catch (error) {
          result = { ok: false, error: error.message };
        }
        toolResults.push({ name, result });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    throw new Error("工具调用次数过多，已停止本次任务");
  }

  /**
   * 检查语音识别文本。该阶段不传入任何工具，因此只能整理文字，不能执行操作。
   */
  async function reviewSpeech(recognizedText) {
    const text = requireUserText(recognizedText);
    const recentContext = history.slice(-6).map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const assistant = await requestCompletion({
      apiKey,
      model,
      tools: undefined,
      responseFormat: { type: "json_object" },
      temperature: 0.1,
      maxTokens: 450,
      messages: [
        {
          role: "system",
          content: `你是中文语音识别文本校对器。需要结合整句语义和最近对话，修复同音字、漏词、断句、错误分词及口语识别错误，不改变用户意图。\n
不能因为识别结果中的每个词都存在，就认为整句话正确。若原句语义不自然，应按照普通话近似发音重新划分词语边界。\n
例如：“我说的是理由手机吗”应理解为“我说的是你有手机吗”；“闹子点爱姆地”在文件语境下可能是“notes.md”。\n
用户是在和桌宠“艾莲”对话。句首称呼可能被识别成“艾琳、爱琳、艾林、爱林、艾玲、爱玲、艾连、爱连、爱莲、艾伦、爱伦”等近音名字；当它位于句首，或跟在“你好、嗨、嘿、喂”之后并明显作为称呼时，必须统一修复为“艾莲”。不要修改正文中具有实际含义的同音词。例如“艾琳，帮我计算一下”应修复为“艾莲，帮我计算一下”。\n
只在具有明显语音和语义依据时修复；存在两个以上合理解释时不要擅自选择。保留疑问、否定、数字和专有名词。\n
必须只返回一个 JSON 对象，字段如下：\n
originalText: 原始文字；\n
correctedText: 最可能的修复文字；\n
isLogical: 原文是否清晰且有逻辑；\n
needsConfirmation: 是否需要用户确认；\n
confidence: 0 到 1；\n
reason: 一句简短中文原因；\n
ellenQuestion: 以艾莲冷静、简短的语气询问用户是否是这个意思。\n
清晰的普通聊天 needsConfirmation 为 false；涉及计算或文件工具操作时必须为 true。\n
如果存在多个合理解释，不要擅自补全，降低 confidence 并要求确认。`,
        },
        ...recentContext,
        { role: "user", content: `以下是新的语音识别原文，请校对：${text}` },
      ],
    });
    const parsed = tryParseJsonObject(assistant.content);
    if (!parsed) {
      // 部分模型偶尔会忽略 JSON 输出要求。此时保留原文并要求确认，不能让语音流程直接失败。
      const correctedText = normalizeEllenVoiceAddress(text);
      return {
        originalText: text,
        correctedText,
        isLogical: false,
        needsConfirmation: true,
        confidence: 0,
        reason: "模型没有返回可解析的语音修复结果",
        ellenQuestion: `这句话我没完全判断准。你说的是“${correctedText}”，对吧？`,
      };
    }
    return normalizeSpeechReview(parsed, text);
  }

  function rememberConversation(userText, assistantText) {
    history.push(
      { role: "user", content: userText },
      { role: "assistant", content: assistantText },
    );
    if (history.length > MAX_HISTORY_MESSAGES) {
      history.splice(0, history.length - MAX_HISTORY_MESSAGES);
    }
  }

  function clearHistory() {
    history.length = 0;
  }

  return { chat, reviewSpeech, clearHistory };
}

/** 计算和文件工具只追加一次固定反馈，不依赖模型自行选择。 */
function appendAutomaticToolReaction(toolResults, reply) {
  const workTools = new Set(["calculate", "list_files", "read_file", "write_file"]);
  const usedWorkTool = toolResults.some((item) => workTools.has(item.name) && item.result.ok);
  const refused = /做不到|不能|无法|不支持|没有.*权限|不允许|拒绝/.test(String(reply || ""));

  if (refused) {
    // 最终结果是拒绝时，即使中途成功列了目录，也不应播放“工作成功”语音。
    removeReactionActions(toolResults);
    toolResults.push({
      name: "automatic_refusal_reaction",
      result: {
        ok: true,
        action: { type: "playMotionReaction", motionIndex: 6, label: "摇头" },
      },
    });
    return;
  }

  if (usedWorkTool) {
    // 工作工具的反馈音是固定行为，移除模型可能额外选择的情绪音，避免一轮连播两段。
    removeReactionActions(toolResults);
    toolResults.push({
      name: "automatic_tool_reaction",
      result: {
        ok: true,
        action: { type: "playReactionAudio", audioId: "hihiboss", reason: "执行计算或文件工具" },
      },
    });
  }
}

function removeReactionActions(toolResults) {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const type = toolResults[index].result?.action?.type;
    if (type === "playReactionAudio" || type === "playMotionReaction") toolResults.splice(index, 1);
  }
}

async function requestCompletion({
  apiKey,
  model,
  messages,
  tools = AGENT_TOOL_DEFINITIONS,
  responseFormat,
  temperature = 0.6,
  maxTokens = 700,
}) {
  let response;
  try {
    response = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
        ...(responseFormat ? { response_format: responseFormat } : {}),
        stream: false,
        temperature,
        max_tokens: maxTokens,
      }),
    });
  } catch {
    throw new Error("无法连接 DeepSeek，请检查网络连接");
  }

  if (!response.ok) {
    const details = await safeReadError(response);
    throw new Error(`DeepSeek 请求失败（${response.status}）：${details}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("DeepSeek 返回了无法识别的数据");
  return message;
}

/** 明确的日期计划由本地确定性编排，不使用思考模式不支持的强制 tool_choice。 */
async function createLocalTodoDraft(text, intent, toolExecutor) {
  if (intent !== "todo" || !isTodoCreationRequest(text)) return null;
  const title = extractTodoTitle(text);
  if (!title) return null;
  try {
    const datetime = await toolExecutor.execute("resolve_datetime", { expression: text });
    const draft = await toolExecutor.execute("add_todo", {
      title,
      date: datetime.date,
      time: datetime.time,
      notes: "",
    });
    return {
      reply: "确认一下。",
      intent,
      toolResults: [
        { name: "resolve_datetime", result: { ok: true, ...datetime } },
        { name: "add_todo", result: { ok: true, ...draft } },
      ],
    };
  } catch {
    // 无法可靠解析时交还模型澄清，不生成可能错误的日历项目。
    return null;
  }
}

function isTodoCreationRequest(text) {
  if (/(?:查看|查询|列出|有哪些|完成|删除|取消).*(?:待办|日程)/.test(text)) return false;
  return /记录|添加|新建|安排|提醒我/.test(text) || looksLikeDatedPlan(text);
}

function extractTodoTitle(text) {
  return String(text)
    .replace(/^\s*(?:艾莲[，,。.!！?？\s]*)?/, "")
    .replace(/(?:帮我|请|记录一下|记录|添加|新建|安排一下|安排|提醒我)/g, "")
    .replace(/(?:今天|明天|后天|大后天|下周|下星期|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}月\d{1,2}[日号]?)/g, "")
    .replace(/(?:凌晨|早上|上午|中午|下午|傍晚|晚上)?[零〇一二两三四五六七八九十\d]{1,3}[点时](?:半|[零〇一二两三四五六七八九十\d]{1,3}分?)?/g, "")
    .replace(/[，,。.!！?？：:\s]+/g, " ")
    .trim();
}

function tryParseJsonObject(content) {
  const source = String(content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const candidates = [source];
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(source.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 尝试下一个候选片段。
    }
  }
  return null;
}

function normalizeSpeechReview(value, originalText) {
  const modelCorrectedText = typeof value.correctedText === "string" && value.correctedText.trim()
    ? value.correctedText.trim()
    : originalText;
  // 语音引擎很容易把角色专名识别成其他近音人名。这里仅纠正称呼位置，
  // 避免依赖大模型是否恰好完成纠正，也不会替换正文中的普通词。
  const correctedText = normalizeEllenVoiceAddress(modelCorrectedText);
  const confidence = Math.max(0, Math.min(1, Number(value.confidence) || 0));
  const isLogical = value.isLogical === true;
  // 只有逻辑不清晰或可能进入工具调用的请求需要确认；普通聊天不因少量错字被拦截。
  const mathRequest = /计算|等于多少|[零一二三四五六七八九十百千万\d.]+\s*(?:加|减|乘|除以?|[-+*/%^])\s*[零一二三四五六七八九十百千万\d.]+/.test(correctedText);
  const fileRequest = /文件|目录|路径|写入|保存到|创建.*(?:文档|文本)|读取|打开.*(?:文档|文本)|列出|覆盖|修改.*(?:文档|文本)|删除/.test(correctedText);
  const todoRequest = /待办|日程|提醒我|安排.*(?:今天|明天|后天|周|月)|标记.*完成/.test(correctedText)
    || looksLikeDatedPlan(correctedText);
  const mayUseTool = mathRequest || fileRequest || todoRequest;
  const needsConfirmation = mayUseTool || !isLogical;
  const nameWasNormalized = correctedText !== modelCorrectedText;

  return {
    originalText,
    correctedText,
    isLogical,
    needsConfirmation,
    confidence,
    reason: String(value.reason || "语音内容需要确认").slice(0, 160),
    ellenQuestion: String(nameWasNormalized
      ? `你想说的是“${correctedText}”，对吧？`
      : value.ellenQuestion || `你想说的是“${correctedText}”，对吧？`).slice(0, 240),
  };
}

function looksLikeDatedPlan(text) {
  const hasDate = /今天|明天|后天|大后天|下周|下星期|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}月\d{1,2}[日号]?/.test(text);
  const hasPlannedAction = /出去|出发|吃饭|聚餐|开会|上课|提交|完成|复习|学习|工作|整理|健身|运动|买|取|拿|送|打电话|看医生|起床|睡觉|办理|参加/.test(text);
  return hasDate && hasPlannedAction;
}

/**
 * 将语音开头对桌宠的近音称呼归一化为“艾莲”。
 * 只匹配句首或问候语后的名字，避免把正文中的真实人名误改。
 */
function normalizeEllenVoiceAddress(text) {
  const prefix = String(text || "");
  const aliases = "艾琳|爱琳|艾林|爱林|艾玲|爱玲|艾连|爱连|爱莲|艾伦|爱伦";
  const addressPattern = new RegExp(
    `^(\\s*(?:(?:你好|嗨|嘿|喂)[，,。.!！?？\\s]*)?)(?:${aliases})(?=[，,。.!！?？\\s]|帮我|请|能不能|可不可以|你|给我|提醒|记录|计算|打开|关闭|退出)`,
  );
  return prefix.replace(addressPattern, "$1艾莲");
}

function normalizeAssistantMessage(message) {
  const normalized = { role: "assistant", content: message.content ?? null };
  if (message.tool_calls?.length) normalized.tool_calls = message.tool_calls;
  return normalized;
}

async function safeReadError(response) {
  try {
    const data = await response.json();
    return String(data.error?.message || "未知错误").slice(0, 300);
  } catch {
    return "未知错误";
  }
}

function requireUserText(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("请输入对话内容");
  if (value.length > 4000) throw new Error("单次输入不能超过 4000 个字符");
  return value.trim();
}

function currentDateInChina() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

module.exports = { createDeepSeekAgent };
