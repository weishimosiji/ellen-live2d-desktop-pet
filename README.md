# 艾莲 Live2D 桌宠

基于 Electron、Live2D 和轻量 Agent 制作的 macOS 桌面助手。项目包含 Live2D 展示、动作与音频队列、语音识别、待办日历、倒计时以及 DeepSeek 对话能力。

> 本仓库包含当前使用的角色配音和开场视频，但不包含应用图标、API Key、本地语音识别运行时及其模型。首次运行前需要配置大模型 Key；需要语音输入时，还需根据自己的操作系统安装识别方案。

## 当前版本

- 应用版本：`0.1.0`
- 开发状态：预览版
- Electron：`43.4.1`
- Vite：`8.2.2`
- Live2D 模型导出目标：Cubism 5.3
- 当前主要运行平台：macOS
- Node.js：`22.12.0` 或更高版本

当前项目支持生成前端运行资源，但尚未配置 `.app`、`.dmg` 或其他安装包。执行 `npm run build` 得到的是 `dist/`，不是可分发安装程序。

## 平台支持与代码隔离

项目采用“通用业务层 + 平台适配层”的结构。Live2D、Agent、待办、番茄钟和界面代码不直接依赖 macOS；需要操作系统能力时，统一通过 `electron/platform/` 调用。

```text
electron/platform/
├── index.cjs                 # 唯一的平台判断入口
├── macos/                    # macOS 专属实现
│   ├── index.cjs
│   └── system-transcription.cjs
└── fallback/                 # 尚未适配的平台使用安全降级
    └── index.cjs

native/                       # 本地自备，不提交到仓库
└── <platform>/               # 对应系统的原生语音程序
```

业务模块不应自行添加 `process.platform` 判断，也不应直接调用 macOS 命令。新增系统能力时，应先在平台适配器中定义统一接口，再分别提供平台实现。

### 当前兼容情况

| 功能 | macOS | Windows / 其他平台 |
| --- | --- | --- |
| Live2D 模型与动作 | 支持 | 架构可用，尚未完整验证 |
| Agent 对话 | 支持 | 架构可用，尚未完整验证 |
| 待办与番茄钟 | 支持 | 架构可用，尚未完整验证 |
| 本地语音识别 | 需要自行安装 | 需要自行安装对应平台版本 |
| 系统语音识别 | 可接入 Apple Speech | 需要自行提供平台实现 |
| 桌宠窗口置顶 | macOS 专用层级 | 使用 Electron 通用置顶降级 |
| 跨工作区显示 | 支持 | 暂未实现 |
| Dock 图标 | 支持 | 不适用或等待平台实现 |
| 系统通知 | 支持 | 使用 Electron 通用通知接口 |

在非 macOS 平台启动时，平台入口会选择 `fallback`：不会加载 Apple Speech，也不会调用 Dock 和 macOS 工作区接口；其余通用功能仍按正常流程运行。需要注意，本项目目前仍以 macOS 为主要开发和测试环境，不能将降级运行视为已经完成 Windows 适配。

未来适配 Windows 时，建议新增：

```text
electron/platform/windows/
native/windows/
```

然后在 `electron/platform/index.cjs` 中注册 `win32` 实现，无需修改 Live2D、Agent 和业务界面。

## 安装与运行

```bash
npm install
npm start
```

开发网页界面时可以运行：

```bash
npm run dev:web
```

`npm start` 会先重新构建页面，再启动 Electron。

## 配置大模型

在项目根目录新建 `config.js`：

```js
export const dsKey = "填写你的 DeepSeek API Key";

// 可选；不填写时使用项目内置的默认模型名称。
export const dsModel = "deepseek-v4-flash";
```

最终文件位置应为：

```text
desktop-preview/config.js
```

`config.js` 已被 Git 忽略，不要把真实 Key 写入 README、源代码或提交历史。如果 Key 曾经被提交到远程仓库，应立即在服务商后台作废并重新生成。

### 使用其他大模型 API

当前 Agent 默认连接 DeepSeek，相关实现位于：

```text
electron/agent/deepseek-agent.cjs
```

其中包含以下 DeepSeek 专属配置：

```js
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";
```

#### 兼容 OpenAI Chat Completions 格式的服务

如果目标服务兼容 `POST /chat/completions`、Bearer Token、`messages` 和 `tools` 格式，至少需要调整：

1. 将 `DEEPSEEK_ENDPOINT` 改为服务商提供的接口地址。
2. 将 `DEFAULT_MODEL` 或 `config.js` 中的 `dsModel` 改为正确的模型名称。
3. 在 `config.js` 中填写该服务商的 API Key。
4. 确认模型支持 Tool Calling；不支持工具调用的模型无法完整使用计算、文件、待办和计时器能力。
5. 检查服务商是否支持当前使用的 `tool_choice`、JSON 输出和多轮工具消息格式。

为了尽量少改现有代码，可以暂时继续使用 `dsKey` 和 `dsModel` 这两个配置名：

```js
export const dsKey = "其他服务商的 API Key";
export const dsModel = "其他服务商的模型名称";
```

这里的变量名只是当前项目的历史命名，不会限制 Key 必须来自 DeepSeek。

#### 接口格式不兼容的服务

如果服务商使用不同的请求结构，例如字段名称、鉴权方式、流式事件或工具调用格式不同，不建议直接在 `deepseek-agent.cjs` 中继续增加大量条件判断。应新增模型 Provider 适配层：

```text
electron/agent/providers/
├── index.cjs
├── deepseek.cjs
├── openai-compatible.cjs
└── custom-provider.cjs
```

每个 Provider 负责：

- API 地址和鉴权请求头
- 模型请求参数转换
- 工具定义格式转换
- 工具调用结果解析
- 错误信息标准化

Agent 上层仍只接收统一的助手消息和工具调用结果，这样切换模型时不需要修改待办、计算、文件操作或角色回复逻辑。

建议未来将 `config.js` 扩展为：

```js
export const llm = {
  provider: "deepseek",
  apiKey: "填写 API Key",
  model: "deepseek-v4-flash",
  baseUrl: "https://api.deepseek.com",
};
```

上面是推荐的后续配置结构，当前代码尚未读取 `llm` 对象。未完成 Provider 改造前，仍应使用现有的 `dsKey` 和 `dsModel`。

## 角色音频

仓库已经包含以下音频目录：

```text
public/audio/
public/audio/motion_audio/
```

### 交互音频

交互语音位于 `public/audio/`：

| 文件名 | 使用场景 |
| --- | --- |
| `henleyi.mp3` | 很乐意 |
| `hihiboss.mp3` | 执行计算或文件工具 |
| `impatient.mp3` | 不耐烦 |
| `mafan.mp3` | 遇到困难 |
| `no.mp3` | 拒绝或点击反应 |
| `seviceforyou.mp3` | 启动问候 |
| `touch.mp3` | 触碰反应 |
| `seeyou.mp3` | 最小化前播放 |
| `byebye.mp3` | 关闭前播放 |

这些音频没有绑定 Motion，播放时会根据音量控制嘴部开合。

### 动作配音

动作音频位于 `public/audio/motion_audio/`：

```text
wink.mp3
sorry.mp3
sigh.mp3
exhale.mp3
shake_head.mp3
nod.mp3
thumbs_up.mp3
```

动作配音不会驱动自动口型，嘴部变化以对应的 `motion3.json` 为准。需要增删音频时，同时修改 `src/config/audio-config.js`。

音频建议使用 MP3，文件名必须与配置完全一致，包括大小写。

## 开场视频

当前开场视频随仓库提供，路径为：

```text
src/video/open.mp4
```

当前代码固定读取这个路径和文件名。替换视频时推荐使用：

- MP4 格式
- H.264 视频编码
- 1:1 画面比例
- 4 秒左右时长
- 不依赖透明视频编码

视频播放结束后会淡出，再显示 Live2D 人物并播放启动问候。不要直接删除 `open.mp4`，否则构建阶段可能无法找到资源。

## 本地语音识别

仓库不提交完整的本地语音识别系统，包括：

- Whisper 源码和编译产物
- Whisper 模型文件
- macOS Apple Speech 辅助应用
- 其他操作系统的原生语音识别程序

需要语音输入功能时，请根据自己的操作系统和 CPU 架构安装合适的识别运行时。只使用文字对话时，不需要安装这部分内容。

### Whisper 接入位置

当前通用 Whisper 服务位于 `electron/services/local-transcription.cjs`，默认查找：

```text
vendor/whisper.cpp/build/bin/whisper-cli
vendor/whisper.cpp/models/ggml-base.bin
```

使用者需要自行完成：

1. 从可信来源获取 `whisper.cpp`。
2. 按照当前操作系统和 CPU 架构编译命令行程序。
3. 下载自己需要的模型，例如 Base、Small 或其他兼容模型。
4. 将可执行文件和模型放到上述默认位置，或者修改 `local-transcription.cjs` 中的路径。
5. Windows 可执行文件通常带有 `.exe` 后缀，需要同步调整路径；不要直接使用 macOS 编译产物。

### macOS 系统语音接入位置

macOS 平台适配代码默认查找：

```text
native/macos/system-speech/bin/EllenSystemSpeech.app
```

如果要启用 Apple Speech，需要自行提供具有语音识别权限说明的辅助应用，并保持输出格式与 `electron/platform/macos/system-transcription.cjs` 一致。也可以替换该服务实现，接入其他 macOS 语音识别方案。

### 其他平台

非 macOS 平台目前会进入 `fallback`，跳过 Apple Speech 并尝试调用本地 Whisper。Windows 或 Linux 用户需要提供对应系统的 Whisper 可执行文件；如果希望使用系统级识别，应新增对应的 `electron/platform/<platform>/` 实现。

如果系统识别和 Whisper 都没有配置，录音后的转文字功能不可用，但 Live2D、文字对话、待办和番茄钟仍可继续使用。

macOS 首次使用语音识别和麦克风时，需要在“系统设置 → 隐私与安全性”中授予对应权限，并确保 Siri 与听写功能已开启。

## 构建说明

生成页面资源：

```bash
npm run build
```

输出目录：

```text
dist/
```

本地启动 Electron：

```bash
npm start
```

当前版本没有接入 Electron Builder 或 Electron Forge，因此暂时没有正式安装包命令。后续发布 macOS 应用时，还需要补充：

1. `.app` 和 `.dmg` 打包配置。
2. Apple Developer 签名与公证。
3. 麦克风、语音识别等权限说明。
4. 音频、视频、Live2D 模型和 Cubism Core 的发布授权检查。
5. Apple Silicon 与 Intel 架构的构建策略。

## 不会提交的本地文件

以下内容由 `.gitignore` 排除：

- `config.js` 和真实 API Key
- 应用图标和宣传设计稿
- `vendor/whisper.cpp/` 下的 Whisper 源码、程序和模型
- `native/` 下的各平台原生语音识别程序
- `node_modules/`、`dist/`、缓存与日志

## 素材与版权

这是非官方的学习与演示项目。角色形象、模型、语音、视频、Live2D 运行库及其他第三方素材仍受各自权利方许可约束。当前仓库包含音频和开场视频；将仓库设为公开或发布安装包前，请先确认这些素材允许再分发。
