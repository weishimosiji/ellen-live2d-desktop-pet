const TARGET_SAMPLE_RATE = 16000;
const MAX_RECORDING_SECONDS = 30;

/**
 * 浏览器麦克风录音器。
 * 直接生成 Whisper 支持的 16kHz、单声道、16-bit PCM WAV，不依赖 FFmpeg。
 */
export function createMicrophoneRecorder() {
  let stream = null;
  let audioContext = null;
  let source = null;
  let processor = null;
  let silentGain = null;
  let chunks = [];
  let inputSampleRate = TARGET_SAMPLE_RATE;
  let startedAt = 0;

  async function start() {
    if (stream) throw new Error("已经在录音中");

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    audioContext = new AudioContext();
    await audioContext.resume();
    inputSampleRate = audioContext.sampleRate;
    chunks = [];
    startedAt = performance.now();

    source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(samples));

      if ((performance.now() - startedAt) / 1000 >= MAX_RECORDING_SECONDS) {
        // 自动停止由界面定时器处理；这里停止继续累计，防止内存增长。
        processor.onaudioprocess = null;
      }
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);
  }

  async function stop() {
    if (!stream) throw new Error("当前没有录音");

    processor?.disconnect();
    source?.disconnect();
    silentGain?.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await audioContext?.close();

    const combined = mergeChunks(chunks);
    const resampled = resampleLinear(combined, inputSampleRate, TARGET_SAMPLE_RATE);
    const wavBytes = encodePcm16Wav(resampled, TARGET_SAMPLE_RATE);

    stream = null;
    audioContext = null;
    source = null;
    processor = null;
    silentGain = null;
    chunks = [];
    return wavBytes;
  }

  return { start, stop, isRecording: () => Boolean(stream) };
}

function mergeChunks(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function resampleLinear(input, sourceRate, targetRate) {
  if (sourceRate === targetRate) return input;
  const outputLength = Math.round(input.length * targetRate / sourceRate);
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;
    output[i] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}

function encodePcm16Wav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeText(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(view, 8, "WAVE");
  writeText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Uint8Array(buffer);
}

function writeText(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}
