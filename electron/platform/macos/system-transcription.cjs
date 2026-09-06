const { spawn } = require("node:child_process");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

/**
 * 独立的 macOS 系统语音识别服务。
 * 不引用 whisper.cpp；Swift 进程每次识别后退出，让系统及时回收识别资源。
 */
function createSystemTranscriptionService(projectRoot) {
  const helperAppPath = join(projectRoot, "native/macos/system-speech/bin/EllenSystemSpeech.app");

  async function transcribe(wavBytes) {
    if (!wavBytes || wavBytes.byteLength < 44) throw new Error("录音数据为空");
    const tempDirectory = await mkdtemp(join(tmpdir(), "ellen-system-speech-"));
    const audioPath = join(tempDirectory, "recording.wav");
    const resultPath = join(tempDirectory, "result.json");
    try {
      await writeFile(audioPath, Buffer.from(wavBytes));
      const result = await runHelper(helperAppPath, audioPath, resultPath);
      if (!result.ok || !result.text?.trim()) {
        const error = new Error(result.error || "系统没有识别到文字");
        if (isNoSpeechMessage(error.message)) error.code = "NO_SPEECH";
        throw error;
      }
      return result.text.trim();
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  return { transcribe };
}

function runHelper(appPath, audioPath, resultPath) {
  return new Promise((resolve, reject) => {
    // 必须通过 Launch Services 启动完整 .app。直接 spawn 内部可执行文件时，
    // macOS 会把 TCC 权限归到父 Electron，忽略辅助应用的 Info.plist。
    const child = spawn("/usr/bin/open", ["-W", "-n", appPath, "--args", audioPath, resultPath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", async (code, signal) => {
      try {
        const json = await readFile(resultPath, "utf8");
        resolve(JSON.parse(json));
      } catch (error) {
        const detail = stderr.trim()
          || `系统语音识别应用没有返回结果（${signal || `退出码 ${code}`}）`;
        reject(new Error(detail));
      }
    });
  });
}

function isNoSpeechMessage(message) {
  return /no speech detected|no speech|没有(?:检测|识别)到.*语音|未检测到.*语音|没有识别到文字/i.test(String(message));
}

module.exports = { createSystemTranscriptionService };
