import { Application, extensions, Point } from "pixi.js";
import {
  Live2DModel,
  Live2DPlugin,
  config as engineConfig,
  configureCubismSDK,
} from "untitled-pixi-live2d-engine/cubism";

let engineInitialized = false;

/** 初始化一次 Pixi 与 Cubism 引擎。 */
function initializeEngine() {
  if (engineInitialized) return;

  extensions.add(Live2DPlugin);
  configureCubismSDK({ memorySizeMB: 32 });

  // 模型动作结束后立即交还参数，避免额外淡出导致动作看起来没有播完。
  engineConfig.motionFadingDuration = 0;
  engineConfig.idleMotionFadingDuration = 0;
  engineInitialized = true;
}

/**
 * 创建模型并返回主程序需要的操作接口。
 * 初始化细节全部留在本文件，main.js 只需要调用这个方法。
 */
export async function initLive2DModel({ canvas, stage, config }) {
  initializeEngine();

  const isBrowserPreview = document.documentElement.classList.contains("browser-preview");
  const initialWidth = canvas.clientWidth || 160;
  const initialHeight = canvas.clientHeight || 240;
  // 桌宠视口只有 160×240 CSS 像素，1 倍画布在 Electron 的透明窗口中
  // 很容易被系统合成器再次缩放。至少用 2 倍内部像素可保持线稿清晰。
  const renderResolution = isBrowserPreview
    ? 1
    : Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  const app = new Application();
  await app.init({
    canvas,
    // 直接使用 CSS 中确定的 viewport 尺寸，避免 resizeTo 指向 canvas 自身后
    // Pixi 在初始化阶段回退为默认的 800×600。
    width: initialWidth,
    height: initialHeight,
    backgroundAlpha: 0,
    antialias: true,

    // Electron 在 Retina 屏上通常是 2 倍像素密度。
    // 必须让 Pixi 按设备像素渲染，否则 CSS 会把 1 倍画布放大，模型就会发糊。
    // HTML 调试时让 DOM 属性也严格保持 160×240；Electron 再使用 Retina 分辨率。
    resolution: renderResolution,
    autoDensity: true,
    powerPreference: "high-performance",
  });

  const model = await Live2DModel.from(config.modelPath, {
    autoInteract: false,
    breathDepth: 0,
    eyeBlink: false,
    texture: { resourceOptions: { lodLevel: 0 } },
  });

  model.anchor.set(0.5, 0.5);
  model.scale.set(1);
  app.stage.addChild(model);

  const internalModel = model.internalModel;
  const core = internalModel.coreModel;

  // 缓存 Cubism 参数句柄，避免每一帧重复查找字符串 ID。
  const parameterIds = {
    angleX: internalModel.getIdSafe("ParamAngleX"),
    angleY: internalModel.getIdSafe("ParamAngleY"),
    eyeLOpen: internalModel.getIdSafe("ParamEyeLOpen"),
    eyeROpen: internalModel.getIdSafe("ParamEyeROpen"),
    eyeLSmile: internalModel.getIdSafe("ParamEyeLSmile"),
    eyeRSmile: internalModel.getIdSafe("ParamEyeRSmile"),
    browLY: internalModel.getIdSafe("ParamBrowLY"),
    browRY: internalModel.getIdSafe("ParamBrowRY"),
    mouthOpenY: internalModel.getIdSafe("ParamMouthOpenY"),
  };

  // 记录模型导出时的初始值，重置和视线回正都会使用这些值。
  const neutralValues = {};
  for (const [name, id] of Object.entries(parameterIds)) {
    neutralValues[name] = core.getParameterValueById(id);
  }

  // 眼睛微笑可能被动作中途遗留；按模型设计，默认状态必须固定为 0。
  neutralValues.eyeLSmile = 0;
  neutralValues.eyeRSmile = 0;

  // 保存模型全部参数的初始状态。动作不仅会修改脸部，也可能修改手臂、身体、
  // 尾巴和部件切换，因此回正过渡必须覆盖所有参数。
  const parameterCount = core.getParameterCount();
  const neutralParameterValues = new Float32Array(parameterCount);
  for (let index = 0; index < parameterCount; index += 1) {
    neutralParameterValues[index] = core.getParameterValueByIndex(index);
  }
  for (const [name, id] of Object.entries(parameterIds)) {
    const index = core.getParameterIndex(id);
    if (index >= 0 && index < parameterCount) neutralParameterValues[index] = neutralValues[name];
  }

  let defaultTransitionVersion = 0;

  function applyNeutralParameters() {
    for (let index = 0; index < parameterCount; index += 1) {
      core.setParameterValueByIndex(index, neutralParameterValues[index]);
    }
    core.saveParameters();
  }

  const naturalSize = {
    width: model.width,
    height: model.height,
  };

  /** 根据 canvas 实际尺寸做 contain 缩放并定位模型。 */
  function fitToStage() {
    const viewportWidth = canvas.clientWidth;
    const viewportHeight = canvas.clientHeight;
    if (!viewportWidth || !viewportHeight) return;
    if (app.screen.width !== viewportWidth || app.screen.height !== viewportHeight) {
      app.renderer.resize(viewportWidth, viewportHeight, renderResolution);
    }
    const widthScale = (viewportWidth * config.widthRatio) / naturalSize.width;
    const heightScale = (viewportHeight * config.heightRatio) / naturalSize.height;
    const scale = Math.min(widthScale, heightScale);

    model.scale.set(scale);
    model.position.set(
      viewportWidth * config.positionX,
      viewportHeight * config.positionY,
    );
  }

  /** 停止动作，并把所有参数恢复为模型加载时的初始值。 */
  function restoreDefaults() {
    defaultTransitionVersion += 1;
    internalModel.motionManager.stopAllMotions();
    applyNeutralParameters();
  }

  /** 停止当前动作，并以缓入缓出曲线平滑回到模型初始参数。 */
  function transitionToDefaults(durationSeconds = 0.25) {
    const transitionVersion = ++defaultTransitionVersion;
    internalModel.motionManager.stopAllMotions();
    const startValues = new Float32Array(parameterCount);
    for (let index = 0; index < parameterCount; index += 1) {
      startValues[index] = core.getParameterValueByIndex(index);
    }
    const durationMs = Math.max(0, Number(durationSeconds) || 0) * 1000;
    if (!durationMs) {
      applyNeutralParameters();
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const startedAt = performance.now();
      const update = (now) => {
        if (transitionVersion !== defaultTransitionVersion) {
          resolve(false);
          return;
        }
        const progress = Math.min(1, (now - startedAt) / durationMs);
        // smoothstep：起点和终点速度均为 0，避免突然启动或急停。
        const eased = progress * progress * (3 - 2 * progress);
        for (let index = 0; index < parameterCount; index += 1) {
          const value = startValues[index]
            + (neutralParameterValues[index] - startValues[index]) * eased;
          core.setParameterValueByIndex(index, value);
        }
        core.saveParameters();
        if (progress < 1) requestAnimationFrame(update);
        else {
          applyNeutralParameters();
          resolve(true);
        }
      };
      requestAnimationFrame(update);
    });
  }

  /**
   * 判断页面坐标是否落在任意可见 ArtMesh 三角形内。
   * 这比使用模型画布矩形更准确，不会把人物周围的透明区域当成人物身体。
   */
  function hitTestVisible(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const globalPoint = new Point(
      ((clientX - rect.left) / rect.width) * canvas.clientWidth,
      ((clientY - rect.top) / rect.height) * canvas.clientHeight,
    );
    const modelPoint = model.toModelPosition(globalPoint);
    const drawableCount = core.getDrawableCount();

    for (let drawableIndex = drawableCount - 1; drawableIndex >= 0; drawableIndex -= 1) {
      if (core.getDrawableOpacity(drawableIndex) <= 0.01) continue;
      const vertices = internalModel.getDrawableVertices(drawableIndex);
      const indices = core.getDrawableVertexIndices(drawableIndex);
      for (let i = 0; i + 2 < indices.length; i += 3) {
        if (pointInTriangle(modelPoint.x, modelPoint.y, vertices, indices[i], indices[i + 1], indices[i + 2])) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 使用配置中的人体轮廓做第二层限制。
   * 某些 PSD 导出的 ArtMesh 覆盖整张画布，这层可以排除透明区域和尾巴。
   */
  function hitTestInteractionRegion(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    return (config.interactionRegions || []).some((region) => {
      const normalizedX = (x - region.x) / region.radiusX;
      const normalizedY = (y - region.y) / region.radiusY;
      return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
    });
  }

  function hitTestBody(clientX, clientY) {
    return hitTestInteractionRegion(clientX, clientY) && hitTestVisible(clientX, clientY);
  }

  fitToStage();
  const resizeObserver = new ResizeObserver(fitToStage);
  resizeObserver.observe(canvas);

  return {
    app,
    model,
    internalModel,
    core,
    parameterIds,
    neutralValues,
    fitToStage,
    restoreDefaults,
    transitionToDefaults,
    hitTestVisible,
    hitTestBody,
    destroy() {
      resizeObserver.disconnect();
      model.destroy();
      app.destroy();
    },
  };
}

function pointInTriangle(px, py, vertices, ia, ib, ic) {
  const ax = vertices[ia * 2];
  const ay = vertices[ia * 2 + 1];
  const bx = vertices[ib * 2];
  const by = vertices[ib * 2 + 1];
  const cx = vertices[ic * 2];
  const cy = vertices[ic * 2 + 1];
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

function sign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}
