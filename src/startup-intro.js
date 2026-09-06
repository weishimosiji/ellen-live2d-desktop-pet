const INTRO_FADE_MS = 420;

/**
 * 管理开屏视频。视频与 Live2D 并行加载；只有视频播放完且模型准备好后，
 * 才将视频透明淡出，避免露出旧 loading 或尚未完成渲染的模型。
 */
export function createStartupIntro({ shell, container, video }) {
  if (!shell || !container || !video) {
    return { finish: async () => {} };
  }

  video.src = new URL("./video/open.mp4", import.meta.url).href;
  shell.classList.add("startup-active");

  const playbackFinished = new Promise((resolve) => {
    let settled = false;
    const finishOnce = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    video.addEventListener("ended", finishOnce, { once: true });
    // 视频文件无法解码时不能让应用永远停留在开屏层。
    video.addEventListener("error", () => {
      console.error("开屏视频加载失败", video.error);
      finishOnce();
    }, { once: true });

    const playResult = video.play();
    playResult?.catch((error) => {
      console.error("开屏视频播放失败", error);
      finishOnce();
    });
  });

  return {
    /** 调用此方法表示 Live2D 已经准备完成，可以在视频结束后交接画面。 */
    async finish() {
      await playbackFinished;
      container.classList.add("is-fading");
      await new Promise((resolve) => window.setTimeout(resolve, INTRO_FADE_MS));
      container.hidden = true;
      // 视频完全透明后再收回左侧开屏区域，避免用户看到窗口裁切过程。
      await window.desktopWindow?.finishStartup?.();
      video.pause();
      video.removeAttribute("src");
      video.load();
      shell.classList.add("startup-revealing");
      shell.classList.remove("startup-active");
      window.setTimeout(() => shell.classList.remove("startup-revealing"), INTRO_FADE_MS);
    },
  };
}
