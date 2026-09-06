/**
 * 创建“音量驱动”的口型控制器。
 *
 * 它不会识别具体发音，只读取音频每一帧的响度：
 * 声音越大，ParamMouthOpenY 越接近 fullMouthOpenValue；安静时嘴巴回到初始值。
 * 当前艾莲模型与常见模型方向相反：1 是闭嘴，0 是完全张嘴。
 */
export function createAudioLipSync({
  core,
  mouthParameterId,
  neutralValue = 0,
  audioUrl,
  fullMouthOpenValue = 0,
  voiceNoiseFloor = 0.008,
  voiceFullLevel = 0.075,
}) {
  const audio = new Audio(audioUrl);
  audio.preload = "auto";

  let audioContext = null;
  let analyser = null;
  let samples = null;
  let currentMouthOpen = neutralValue;
  let finishPlayback = null;
  let mouthControlEnabled = false;

  function settlePlayback(reason) {
    if (!finishPlayback) return;
    const resolve = finishPlayback;
    finishPlayback = null;
    resolve(reason);
  }

  /**
   * Web Audio 节点只能为同一个 audio 元素创建一次，
   * 因此等用户第一次点击播放时再初始化并重复使用。
   */
  function initializeAudioGraph() {
    if (audioContext) return;

    audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(audio);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.45;
    samples = new Uint8Array(analyser.fftSize);

    source.connect(analyser);
    analyser.connect(audioContext.destination);
  }

  /** 从头播放测试音频。必须由按钮点击等用户操作触发。 */
  async function play() {
    initializeAudioGraph();
    await audioContext.resume();
    audio.currentTime = 0;
    mouthControlEnabled = true;
    await audio.play();
  }

  /**
   * 播放音频，并在播放完毕或被 stop() 停止后才结束。
   * controlMouth=false 时只播放声音，绝不修改嘴部参数。
   */
  async function playAndWait(
    nextAudioUrl = audioUrl,
    { controlMouth = true } = {},
  ) {
    initializeAudioGraph();
    await audioContext.resume();
    mouthControlEnabled = controlMouth;

    // 同一个 Audio 元素可以切换文件，便于队列以后播放不同语音。
    if (audio.src !== new URL(nextAudioUrl, window.location.href).href) {
      audio.src = nextAudioUrl;
      audio.load();
    }
    audio.currentTime = 0;

    const completion = new Promise((resolve) => {
      finishPlayback = resolve;
    });

    try {
      await audio.play();
      return await completion;
    } catch (error) {
      settlePlayback("failed");
      throw error;
    }
  }

  /** 停止播放，并让嘴形回到模型初始值。 */
  function stop() {
    audio.pause();
    audio.currentTime = 0;
    currentMouthOpen = neutralValue;
    core.setParameterValueById(mouthParameterId, neutralValue);
    settlePlayback("stopped");
  }

  /**
   * 每帧分析音频响度并更新嘴巴开合。
   * deltaSeconds 用于让张嘴快、闭嘴稍慢，而且不同帧率下表现一致。
   */
  function update(deltaSeconds) {
    if (!mouthControlEnabled) return;

    let target = neutralValue;

    if (!audio.paused && !audio.ended && analyser && samples) {
      analyser.getByteTimeDomainData(samples);

      // 计算波形的均方根音量（RMS）。静音约为 0，普通人声通常为 0.02～0.2。
      let squareSum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        squareSum += normalized * normalized;
      }
      const rms = Math.sqrt(squareSum / samples.length);

      // 对人声区间提高灵敏度，并用小于 1 的曲线指数放大轻声部分。
      // 这样语气词或低音量对白也有清晰口型，但底噪仍保持闭嘴。
      const linearVolume = Math.max(
        0,
        Math.min(1, (rms - voiceNoiseFloor) / (voiceFullLevel - voiceNoiseFloor)),
      );
      const enhancedVolume = Math.pow(linearVolume, 0.68);
      target = neutralValue + enhancedVolume * (fullMouthOpenValue - neutralValue);
    }

    // 不假设参数增大就是张嘴，同时兼容 0→1 和 1→0 两种模型方向。
    const opening = Math.abs(target - neutralValue) > Math.abs(currentMouthOpen - neutralValue);
    const speed = opening ? 24 : 13;
    const smoothing = 1 - Math.exp(-speed * deltaSeconds);
    currentMouthOpen += (target - currentMouthOpen) * smoothing;

    core.setParameterValueById(mouthParameterId, currentMouthOpen);
  }

  audio.addEventListener("ended", () => {
    // 组合动作中的音频不拥有嘴部控制权，结束时也不能覆盖动作参数。
    if (mouthControlEnabled) {
      currentMouthOpen = neutralValue;
      core.setParameterValueById(mouthParameterId, neutralValue);
    }
    mouthControlEnabled = false;
    settlePlayback("ended");
  });

  return {
    play,
    playAndWait,
    stop,
    update,
    isPlaying: () => !audio.paused && !audio.ended,
    isMouthControlActive: () => mouthControlEnabled && !audio.paused && !audio.ended,
  };
}
