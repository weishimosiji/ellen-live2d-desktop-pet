/**
 * Live2D 预览程序的统一配置。
 * 后续需要调整模型路径、显示比例、跟随幅度或眨眼速度时，只改这里即可。
 */
export const LIVE2D_CONFIG = {
  modelPath: "/model/ellen_preview.model3.json",

  // 模型在窗口中占用的最大宽高比例。
  // 模型导出边界包含较多透明留白，因此按约 1.5 倍补偿，
  // 让可见人物在 160×240 canvas 中占据约 90%。
  // 画布由 160px 向右扩为 170px；同步折算比例，保持人物尺寸不变。
  widthRatio: 1.337,
  heightRatio: 1.42,
  // 人物中心仍位于原来的第 80px，不随新增的右侧空间移动。
  positionX: 80 / 170,
  positionY: 0.5,

  // 鼠标触碰区域使用 160×240 canvas 的归一化坐标（0～1）。
  // 当前模型居中显示；多个较窄椭圆贴合头、身体、双臂和双腿，排除右侧尾巴。
  interactionRegions: [
    { name: "头部", x: 0.45 * 160 / 170, y: 0.23, radiusX: 0.19 * 160 / 170, radiusY: 0.18 },
    { name: "躯干", x: 0.45 * 160 / 170, y: 0.47, radiusX: 0.16 * 160 / 170, radiusY: 0.17 },
    { name: "左臂", x: 0.29 * 160 / 170, y: 0.49, radiusX: 0.075 * 160 / 170, radiusY: 0.17 },
    { name: "右臂", x: 0.61 * 160 / 170, y: 0.49, radiusX: 0.075 * 160 / 170, radiusY: 0.17 },
    { name: "左腿", x: 0.39 * 160 / 170, y: 0.74, radiusX: 0.065 * 160 / 170, radiusY: 0.19 },
    { name: "右腿", x: 0.52 * 160 / 170, y: 0.74, radiusX: 0.065 * 160 / 170, radiusY: 0.19 },
  ],

  // 鼠标移到窗口边缘时，头部 X/Y 角度的最大值。
  trackingAngle: 20,

  // 当前模型的眼睛参数：0 是睁眼，1 是闭眼。
  eyeOpenValue: 0,
  eyeClosedValue: 1,
  blinkCloseSeconds: 0.11,
  blinkOpenSeconds: 0.11,
  blinkWaitMinSeconds: 4.5,
  blinkWaitRandomSeconds: 4,
};

/** Preview 动作组中各动作对应的按钮名称。 */
export const MOTION_NAMES = [
  "动作 01",
  "动作 02",
  "动作 03",
  "动作 04",
  "动作 05",
  "动作 06",
  "动作 07",
  "动作 08",
  "动作 09",
  "动作 10",
];
