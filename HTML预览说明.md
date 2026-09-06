# HTML 界面预览

在项目目录运行：

```bash
npm run preview:html
```

浏览器会显示一个 **240 × 300** 的固定 `desktop-shell`。其中 Live2D canvas 固定为 **160 × 240**，艾莲会保持纵横比完整 contain 在该区域内；Electron 窗口与 HTML 预览共用相同尺寸和 Canvas 位置。

## 常用调整位置

- 人物大小和位置：`src/live2d/config.js` 中的 `widthRatio`、`heightRatio`、`positionX`、`positionY`
- 工具按钮大小和位置：`src/styles.css` 末尾的 `.tool-rail`、`.tool-button`
- 回复气泡：`src/styles.css` 末尾的 `.ellen-speech`
- 输入框：`src/styles.css` 末尾的 `.chat-dock`
- Electron 窗口尺寸：暂时不用修改；确定 HTML 尺寸后再同步到 `electron-main.cjs`

HTML 模式可以测试 Live2D、按钮、浮层、文字对话布局和本地待办。大模型、文件工具、窗口控制和本地语音识别使用模拟接口，不会执行真实系统操作。

H5 预览默认启用 UI 展示板模式，所有浮层都会同时显示并分散在人物周围，便于直接调整样式；Electron 中仍按正常交互显示和隐藏。

H5 会强制显示全部浮层，但每个浮层的位置严格模拟 Electron 中点击对应按钮后的真实位置，因此同时展示时可能发生重叠。
