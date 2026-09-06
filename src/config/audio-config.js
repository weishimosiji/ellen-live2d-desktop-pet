/**
 * 动作配音配置。
 * key 是 Preview 动作组从 0 开始的下标；音频文件名与 motion3 文件名一致。
 * 动作配音只播放声音，嘴形仍由对应的 motion3 文件控制。
 */
export const MOTION_AUDIO_CONFIG = {
  0: { audioUrl: "/audio/motion_audio/wink.mp3", emotion: null },
  1: { audioUrl: "/audio/motion_audio/sorry.mp3", emotion: null },
  2: { audioUrl: "/audio/motion_audio/sigh.mp3", emotion: null },
  3: { audioUrl: "/audio/motion_audio/exhale.mp3", emotion: null },
  6: { audioUrl: "/audio/motion_audio/shake_head.mp3", emotion: null },
  7: { audioUrl: "/audio/motion_audio/nod.mp3", emotion: null },
  8: { audioUrl: "/audio/motion_audio/thumbs_up.mp3", emotion: null },
};

/**
 * 交互语音配置。
 * 这些语音没有绑定动作，会根据音量自动控制嘴巴；emotion 可设置语气类型。
 */
export const INTERACTION_AUDIO_CONFIG = [
  { id: "henleyi", label: "很乐意", audioUrl: "/audio/henleyi.mp3", emotion: null },
  { id: "hihiboss", label: "Hi Hi Boss", audioUrl: "/audio/hihiboss.mp3", emotion: null },
  { id: "impatient", label: "不耐烦", audioUrl: "/audio/impatient.mp3", emotion: "slightlyAngry" },
  { id: "mafan", label: "麻烦", audioUrl: "/audio/mafan.mp3", emotion: null },
  { id: "no", label: "拒绝", audioUrl: "/audio/no.mp3", emotion: "veryAngry" },
  { id: "seviceforyou", label: "为你服务", audioUrl: "/audio/seviceforyou.mp3", emotion: null },
  { id: "touch", label: "触碰反应", audioUrl: "/audio/touch.mp3", emotion: null },
  { id: "seeyou", label: "再见", audioUrl: "/audio/seeyou.mp3", emotion: null },
  { id: "byebye", label: "拜拜", audioUrl: "/audio/byebye.mp3", emotion: null },
];

/** Agent 只能通过这些预设 ID 选择角色语音，不能传入任意文件路径。 */
export const AGENT_REACTION_AUDIO = Object.fromEntries(
  INTERACTION_AUDIO_CONFIG.map((audio) => [audio.id, audio]),
);
