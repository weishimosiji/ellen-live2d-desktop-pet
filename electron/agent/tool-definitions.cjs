/** 提供给大模型的轻量工具定义。 */
const AGENT_TOOL_DEFINITIONS = [
  { type:"function", function:{ name:"resolve_duration", description:"将30分钟、两小时等表达转换为秒。启动计时器前必须调用。", parameters:{type:"object",properties:{expression:{type:"string"}},required:["expression"],additionalProperties:false} } },
  { type:"function", function:{ name:"start_timer", description:"启动倒计时。没有task是纯倒计时，有task是事项倒计时。durationSeconds必须来自resolve_duration。", parameters:{type:"object",properties:{durationSeconds:{type:"number"},task:{type:"string",description:"可选，到点要做的事项"}},required:["durationSeconds"],additionalProperties:false} } },
  { type:"function", function:{ name:"list_timers", description:"列出正在运行的计时器。", parameters:{type:"object",properties:{},additionalProperties:false} } },
  { type:"function", function:{ name:"cancel_timer", description:"取消指定计时器，先用list_timers获取ID。", parameters:{type:"object",properties:{id:{type:"string"}},required:["id"],additionalProperties:false} } },
  { type: "function", function: { name: "resolve_datetime", description: "将用户说的中文相对日期和时间转换为日历格式。添加待办前必须先调用。支持今天、明天、后天、下周几、月日以及上午/下午/晚上几点。", parameters: { type: "object", properties: { expression: { type: "string", description: "用户原话中的日期时间表达，例如：明天下午三点" } }, required: ["expression"], additionalProperties: false } } },
  { type: "function", function: { name: "add_todo", description: "生成待办写入草稿并请求用户确认，本工具本身不会直接写入。日期必须来自 resolve_datetime。用户说出明确日期/时间和计划事项时，即使没有说‘记录’或‘提醒’，也应生成待办草稿。", parameters: { type: "object", properties: { title: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" }, time: { type: "string", description: "可选 HH:mm" }, notes: { type: "string" } }, required: ["title", "date"], additionalProperties: false } } },
  { type: "function", function: { name: "list_todos", description: "按日期范围查询待办。", parameters: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } }, additionalProperties: false } } },
  { type: "function", function: { name: "complete_todo", description: "根据查询得到的 ID 将待办标记完成。", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } } },
  { type: "function", function: { name: "delete_todo", description: "删除待办。只有用户明确要求删除时调用。", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } } },
  {
    type: "function",
    function: {
      name: "control_window",
      description: "控制桌宠窗口。仅当用户明确要求最小化、关闭或退出桌宠时调用。执行前客户端会先完整播放对应告别语音。",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["minimize", "close"],
            description: "minimize=最小化窗口，close=关闭桌宠",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "play_reaction_audio",
      description: "根据艾莲当前情绪播放一段预设角色语音。只在情绪反应明显、任务完成、拒绝不合理要求或用户告别时调用；普通回答不要每次调用。",
      parameters: {
        type: "object",
        properties: {
          audioId: {
            type: "string",
            enum: ["henleyi", "hihiboss", "impatient", "mafan", "no", "seviceforyou", "seeyou", "byebye"],
            description: "角色语音 ID：henleyi=愉快接受，hihiboss=招呼，impatient=略不耐烦或反复纠缠，mafan=觉得麻烦，no=明确拒绝（包括摸、抱等身体接触请求），seviceforyou=愿意帮忙，seeyou/byebye=告别。",
          },
          reason: { type: "string", description: "选择该情绪语音的简短原因" },
        },
        required: ["audioId", "reason"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "classify_intent",
      description: "判断用户请求属于普通对话、数学计算、文件列表、文件读取还是文件写入。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "用户的原始请求" },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "安全计算数学表达式，支持括号以及 + - * / % ^。",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "需要计算的数学表达式" },
        },
        required: ["expression"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "列出 Agent 安全工作区中的文件和目录。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "相对工作区的目录，根目录使用 ." },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取 Agent 安全工作区中的 UTF-8 文本文件。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "相对工作区的文件路径" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "在 Agent 安全工作区创建或覆盖一个文本文件。仅在用户明确要求写文件时使用。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "相对工作区的文件路径" },
          content: { type: "string", description: "要写入的完整文本" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
];

module.exports = { AGENT_TOOL_DEFINITIONS };
