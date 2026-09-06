/**
 * 宣传片临时配置。
 *
 * 这份配置不属于桌宠正式业务。宣传片录制完成后，将 enabled 改为 false，
 * 或删除整个 src/promo 目录以及 app.js 中对应的 import / start 调用即可。
 */
export const PROMO_MOTION_SHOWCASE = {
  enabled: true,
  initialDelayMs: 1200,
  intervalMs: 0,
  motions: [
    { index: 2, label: "宣传演示：叹气" },
    { index: 9, label: "宣传演示：生气跺脚" },
    { index: 3, label: "宣传演示：哈气" },
  ],
};
