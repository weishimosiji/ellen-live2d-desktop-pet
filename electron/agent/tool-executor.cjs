const { mkdir, readFile, readdir, stat, writeFile } = require("node:fs/promises");
const { dirname, extname, resolve, sep } = require("node:path");

const ALLOWED_FILE_EXTENSIONS = new Set([".txt", ".md", ".json", ".csv"]);
const MAX_FILE_BYTES = 100 * 1024;
const REACTION_AUDIO_IDS = new Set([
  "henleyi", "hihiboss", "impatient", "mafan", "no", "seviceforyou", "seeyou", "byebye",
]);

/** 创建带目录沙箱和参数校验的工具执行器。 */
function createToolExecutor(workspaceRoot, { todoService, timerService } = {}) {
  const normalizedRoot = resolve(workspaceRoot);

  async function initialize() {
    await mkdir(normalizedRoot, { recursive: true });
  }

  async function execute(name, args) {
    switch (name) {
      case "classify_intent":
        return classifyIntent(requireString(args.text, "text"));
      case "calculate":
        return { result: calculate(requireString(args.expression, "expression")) };
      case "play_reaction_audio": {
        const audioId = requireString(args.audioId, "audioId");
        if (!REACTION_AUDIO_IDS.has(audioId)) throw new Error("不支持的角色语音 ID");
        return {
          action: {
            type: "playReactionAudio",
            audioId,
            reason: requireString(args.reason, "reason").slice(0, 120),
          },
        };
      }
      case "control_window": {
        const action = requireString(args.action, "action");
        if (action !== "minimize" && action !== "close") throw new Error("不支持的窗口操作");
        return { action: { type: "windowControl", action } };
      }
      case "resolve_datetime": return resolveDateTime(requireString(args.expression, "expression"));
      case "resolve_duration": return resolveDuration(requireString(args.expression, "expression"));
      case "start_timer": return timerService.start(args);
      case "list_timers": return { timers: timerService.list() };
      case "cancel_timer": return timerService.cancel(requireString(args.id, "id"));
      case "add_todo": return {
        pendingConfirmation: true,
        action: { type: "confirmTodoCreate", todo: validateTodoDraft(args) },
      };
      case "list_todos": return { items: await todoService.list({ from: args.from, to: args.to }) };
      case "complete_todo": return todoService.update(requireString(args.id, "id"), { completed: true });
      case "delete_todo": return todoService.remove(requireString(args.id, "id"));
      case "list_files":
        return listFiles(resolveSafePath(args.path || "."));
      case "read_file":
        return readTextFile(resolveSafeFile(args.path));
      case "write_file":
        return writeTextFile(resolveSafeFile(args.path), requireString(args.content, "content"));
      default:
        throw new Error(`不支持的工具：${name}`);
    }
  }

  function resolveSafePath(relativePath) {
    const safeInput = requireString(relativePath, "path");
    const target = resolve(normalizedRoot, safeInput);
    if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${sep}`)) {
      throw new Error("文件路径超出 Agent 安全工作区");
    }
    return target;
  }

  function resolveSafeFile(relativePath) {
    const target = resolveSafePath(relativePath);
    if (!ALLOWED_FILE_EXTENSIONS.has(extname(target).toLowerCase())) {
      throw new Error("只允许操作 txt、md、json、csv 文本文件");
    }
    return target;
  }

  async function listFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return {
      entries: entries.slice(0, 100).map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
      })),
    };
  }

  async function readTextFile(path) {
    const fileStat = await stat(path);
    if (!fileStat.isFile()) throw new Error("目标不是文件");
    if (fileStat.size > MAX_FILE_BYTES) throw new Error("文件超过 100KB 限制");
    return { content: await readFile(path, "utf8") };
  }

  async function writeTextFile(path, content) {
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
      throw new Error("写入内容超过 100KB 限制");
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
    return { success: true, bytes: Buffer.byteLength(content, "utf8") };
  }

  return { initialize, execute };
}

function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} 必须是非空字符串`);
  return value.trim();
}

function classifyIntent(text) {
  if (/倒计时|番茄钟|\d+\s*(?:分钟|小时|秒).*提醒/.test(text)) return { intent: "timer" };
  if (/待办|日程|提醒|今天.*要做|明天.*要做/.test(text) || looksLikeDatedPlan(text)) {
    return { intent: "todo" };
  }
  // 删除属于文件请求，必须先于运算判断，避免“删除”中的“除”被误识别。
  if (/删除|删掉|清空|移除.*文件/.test(text)) return { intent: "file_delete" };
  if (/计算|等于|加上|减去|乘以|除以|\d\s*[-+*/%^]\s*\d/.test(text)) return { intent: "calculation" };
  if (/写入|保存|创建.*文件|修改.*文件/.test(text)) return { intent: "file_write" };
  if (/读取|打开.*文件|看看.*文件|文件内容/.test(text)) return { intent: "file_read" };
  if (/列出|有哪些文件|目录/.test(text)) return { intent: "file_list" };
  return { intent: "conversation" };
}

/** “明天下午三点出去吃饭”这类时间明确的计划，也属于待办录入。 */
function looksLikeDatedPlan(text) {
  const hasDate = /今天|明天|后天|大后天|下周|下星期|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}月\d{1,2}[日号]?/.test(text);
  const hasPlannedAction = /出去|出发|吃饭|聚餐|开会|上课|提交|完成|复习|学习|工作|整理|健身|运动|买|取|拿|送|打电话|看医生|起床|睡觉|办理|参加/.test(text);
  return hasDate && hasPlannedAction;
}

/** Agent 只能生成待确认草稿，不能直接把待办写入本地数据。 */
function validateTodoDraft(args) {
  const title = requireString(args.title, "title").slice(0, 200);
  const date = requireString(args.date, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("待办日期必须为 YYYY-MM-DD");
  const time = args.time ? requireString(args.time, "time") : "";
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("待办时间必须为 HH:mm");
  return { title, date, time, notes: String(args.notes || "").trim().slice(0, 1000) };
}

/** 把常见中文日期时间表达转换成日历使用的固定格式。 */
function resolveDateTime(expression, now = new Date()) {
  const text = expression.replace(/\s+/g, "");
  const chinaParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  let date = new Date(Date.UTC(chinaParts[0], chinaParts[1] - 1, chinaParts[2]));
  let matchedDate = false;
  const offsetNames = [["大后天", 3], ["后天", 2], ["明天", 1], ["今天", 0]];
  for (const [name, offset] of offsetNames) {
    if (text.includes(name)) { date.setUTCDate(date.getUTCDate() + offset); matchedDate = true; break; }
  }
  const explicit = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/);
  if (explicit) {
    let year = explicit[1] ? Number(explicit[1]) : date.getUTCFullYear();
    const month = Number(explicit[2]); const day = Number(explicit[3]);
    if (!explicit[1] && month < date.getUTCMonth() + 1) year += 1;
    date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("日期不存在");
    matchedDate = true;
  }
  const weekday = text.match(/(下周|下星期|周|星期)([一二三四五六日天])/);
  if (weekday) {
    const target = "日一二三四五六".indexOf(weekday[2] === "天" ? "日" : weekday[2]);
    const current = date.getUTCDay();
    let offset = weekday[1].startsWith("下") ? 7 - current + target : (target - current + 7) % 7;
    if (!weekday[1].startsWith("下") && offset === 0) offset = 7;
    date.setUTCDate(date.getUTCDate() + offset); matchedDate = true;
  }
  if (!matchedDate) throw new Error("没有识别到明确日期，请询问用户具体是哪一天");

  let time = "";
  const timeMatch = text.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上)?([零〇一二两三四五六七八九十\d]{1,3})[点时](半|([零〇一二两三四五六七八九十\d]{1,3})分?)?/);
  if (timeMatch) {
    let hour = chineseNumber(timeMatch[2]);
    const period = timeMatch[1] || "";
    if (["下午", "傍晚", "晚上"].includes(period) && hour < 12) hour += 12;
    if (period === "中午" && hour < 11) hour += 12;
    if (period === "凌晨" && hour === 12) hour = 0;
    const minute = timeMatch[3] === "半" ? 30 : timeMatch[4] ? chineseNumber(timeMatch[4]) : 0;
    if (hour > 23 || minute > 59) throw new Error("时间超出有效范围");
    time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return { date: date.toISOString().slice(0, 10), time, hasTime: Boolean(time), originalExpression: expression };
}

function chineseNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.includes("十")) { const [a, b] = value.split("十"); return (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0); }
  return digits[value];
}

function resolveDuration(expression) {
  const text=expression.replace(/\s+/g,""); let seconds=0; let matched=false;
  for(const match of text.matchAll(/([零〇一二两三四五六七八九十百\d]+)(小时|钟头|分钟|分|秒钟|秒)/g)){ const n=chineseNumber(match[1]); if(!Number.isFinite(n)) continue; matched=true; if(["小时","钟头"].includes(match[2])) seconds+=n*3600; else if(["分钟","分"].includes(match[2])) seconds+=n*60; else seconds+=n; }
  if(!matched||seconds<1) throw new Error("没有识别到有效时长"); if(seconds>604800) throw new Error("倒计时最长7天"); return {durationSeconds:seconds,displayText:expression};
}

/** 递归下降解析器，避免使用 eval 执行模型提供的表达式。 */
function calculate(expression) {
  const tokens = expression.replace(/\s+/g, "").match(/\d+(?:\.\d+)?|[()+\-*/%^]/g) || [];
  if (tokens.join("") !== expression.replace(/\s+/g, "")) throw new Error("表达式包含不支持的字符");
  let index = 0;

  function parseExpression() {
    let value = parseTerm();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++];
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm() {
    let value = parsePower();
    while (["*", "/", "%"].includes(tokens[index])) {
      const operator = tokens[index++];
      const right = parsePower();
      if ((operator === "/" || operator === "%") && right === 0) throw new Error("不能除以零");
      if (operator === "*") value *= right;
      else if (operator === "/") value /= right;
      else value %= right;
    }
    return value;
  }

  function parsePower() {
    let value = parseUnary();
    if (tokens[index] === "^") {
      index += 1;
      value **= parsePower();
    }
    return value;
  }

  function parseUnary() {
    if (tokens[index] === "+") { index += 1; return parseUnary(); }
    if (tokens[index] === "-") { index += 1; return -parseUnary(); }
    return parsePrimary();
  }

  function parsePrimary() {
    if (tokens[index] === "(") {
      index += 1;
      const value = parseExpression();
      if (tokens[index++] !== ")") throw new Error("括号不匹配");
      return value;
    }
    const value = Number(tokens[index++]);
    if (!Number.isFinite(value)) throw new Error("表达式格式错误");
    return value;
  }

  const result = parseExpression();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("表达式格式错误");
  return result;
}

module.exports = { createToolExecutor };
