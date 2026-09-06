# 艾莲动作清单

动作调试面板已经从正式界面移除。本文件记录模型当前导出的动作顺序，供 Agent、交互规则和后续 Electron 程序调用。

模型配置：`public/model/ellen_preview.model3.json`

动作组：`Preview`

## 动作索引

| 程序索引 | 动作 | Motion 文件 | 时长 | 配套音频 |
| ---: | --- | --- | ---: | --- |
| 0 | 眨眼 / Wink | `wink.motion3.json` | 1.633 秒 | `wink.mp3` |
| 1 | 不好意思 / Sorry | `sorry.motion3.json` | 3.367 秒 | `sorry.mp3` |
| 2 | 叹气 / Sigh | `sigh.motion3.json` | 2.000 秒 | `sigh.mp3` |
| 3 | 哈气 / Exhale | `exhale.motion3.json` | 1.667 秒 | `exhale.mp3` |
| 4 | 微笑 / Smile | `smile.motion3.json` | 1.733 秒 | 暂无 |
| 5 | 打瞌睡 / Doze | `doze.motion3.json` | 9.233 秒 | 暂无 |
| 6 | 摇头 / Shake head | `shake_head.motion3.json` | 3.333 秒 | `shake_head.mp3` |
| 7 | 点头 / Nod | `nod.motion3.json` | 3.333 秒 | `nod.mp3` |
| 8 | 点赞 / Thumbs up | `thumbs_up.motion3.json` | 2.367 秒 | `thumbs_up.mp3` |
| 9 | 生气跺脚 / Angry stomp | `angry_stomp.motion3.json` | 4.900 秒 | 暂无 |

配套音频目录：`public/audio/motion_audio/`

## 程序调用规则

- 动作索引从 `0` 开始，与 `model3.json` 中 `Preview` 数组的顺序完全一致。
- 有配套音频时，使用播放队列的 `enqueueMotionWithAudio`，让动作和声音同时开始。
- 没有配套音频时，使用 `enqueueMotion`。
- 动作配套音频不驱动自动口型，嘴部变化只遵循 motion 文件。
- 普通对话音频才使用音量口型。
- 所有动作继续进入统一播放队列，避免动作互相中断后遗留眼睛或表情参数。

## 配置位置

- 动作与音频对应关系：`src/config/audio-config.js`
- 播放队列：`src/live2d/playback-queue.js`
- Live2D 模型配置：`public/model/ellen_preview.model3.json`
- 动作源文件：`public/model/motions/`

后续增加动作时，需要同时更新 `model3.json` 的 `Preview` 数组、本文件的动作表，以及存在配音时的 `MOTION_AUDIO_CONFIG`。
