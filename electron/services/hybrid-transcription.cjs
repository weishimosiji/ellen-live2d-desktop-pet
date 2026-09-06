const { createLocalTranscriptionService } = require("./local-transcription.cjs");

/**
 * 语音识别路由层：优先 macOS 系统识别，失败时回退原 Whisper Base。
 * 两个实现保持独立，后续可单独替换系统提供者或关闭回退策略。
 */
function createHybridTranscriptionService(projectRoot, platform) {
  const system = platform.createSystemTranscriptionService();
  const whisper = createLocalTranscriptionService(projectRoot);

  async function transcribe(wavBytes) {
    if (!platform.supportsSystemTranscription || !system) {
      const text = await whisper.transcribe(wavBytes);
      return isNoSpeechMessage(text) ? "" : text;
    }

    try {
      const text = await system.transcribe(wavBytes);
      return isNoSpeechMessage(text) ? "" : text;
    } catch (systemError) {
      // 无语音不是识别引擎故障。直接返回空结果，禁止 Whisper 猜测环境声，
      // 也禁止后续把幻觉文字提交给大模型判断意图。
      if (systemError.code === "NO_SPEECH" || isNoSpeechMessage(systemError.message)) return "";
      console.warn("[SystemSpeech] 系统识别失败，回退 Whisper Base：", systemError.message);
      const text = await whisper.transcribe(wavBytes);
      return isNoSpeechMessage(text) ? "" : text;
    }
  }

  return { transcribe };
}

function isNoSpeechMessage(message) {
  return /no speech detected|no speech|没有(?:检测|识别)到.*语音|未检测到.*语音|没有识别到文字/i.test(String(message));
}

module.exports = { createHybridTranscriptionService };
