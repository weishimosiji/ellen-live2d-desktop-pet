const { spawn } = require("node:child_process");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

/**
 * 使用项目内置的 whisper.cpp 将 16kHz WAV 转成中文文字。
 * 整个过程在本机完成，不上传录音，也不需要 API Key。
 */
function createLocalTranscriptionService(projectRoot) {
  const whisperBinary = join(
    projectRoot,
    "vendor/whisper.cpp/build/bin/whisper-cli",
  );
  const whisperModel = join(
    projectRoot,
    "vendor/whisper.cpp/models/ggml-base.bin",
  );

  async function transcribe(wavBytes) {
    if (!wavBytes || wavBytes.byteLength < 44) {
      throw new Error("录音数据为空");
    }

    // 限制单次录音大小，避免异常页面向主进程写入过大的临时文件。
    if (wavBytes.byteLength > 5 * 1024 * 1024) {
      throw new Error("录音过长，请控制在 30 秒以内");
    }

    const tempDirectory = await mkdtemp(join(tmpdir(), "ellen-speech-"));
    const audioPath = join(tempDirectory, "recording.wav");

    try {
      await writeFile(audioPath, Buffer.from(wavBytes));
      const text = await runWhisper(whisperBinary, [
        // 当前系统与 Metal 后端存在兼容问题，使用稳定的 CPU + Accelerate 路径。
        "--no-gpu",
        "-m", whisperModel,
        "-f", audioPath,
        "-l", "zh",
        "-nt",
        "-np",
        "--prompt", "用户经常先称呼艾莲再说命令，例如：艾莲，帮我计算一下；艾莲，提醒我；艾莲，记录一下。桌宠，Live2D，学习助手，打开应用，创建倒计时",
      ]);

      return text.trim();
    } finally {
      // 临时录音识别完成后立即删除。
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  return { transcribe };
}

function runWhisper(binary, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    process.stdout.setEncoding("utf8");
    process.stderr.setEncoding("utf8");
    process.stdout.on("data", (chunk) => { stdout += chunk; });
    process.stderr.on("data", (chunk) => { stderr += chunk; });
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `Whisper 退出码：${code}`));
    });
  });
}

module.exports = { createLocalTranscriptionService };
