// export.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// PNG / video / JSON settings export.
import * as THREE from "three";
import { audio, camera, controls, exportFileNameInput, exportVideoButton, hooks, renderer, runtime, state, status, videoBitrateInput, videoExportCancel, videoExportOverlay, videoExportOverlayProgress, videoExportOverlayStatus, videoExportProgress, videoExportStatus, videoFileTypeInput, videoFrameRateInput } from "./core.js";
import { canvasToBlob, clamp, downloadBlob, formatTime, isFirefoxBrowser, nextEventLoopTurn, sanitizeFileName } from "./utils.js";
import { appendOfflineWaveformRow } from "./analysis.js";
import { updateMatrices } from "./renderer.js";
import { prepareExportLogoImage, renderSceneWithHud } from "./hud.js";
import { applyViewportCameraProjection, fitViewport, getViewportResolutionDimensions, getWebpageRenderDimensions, positionSinusoidalCamera } from "./viewport.js";
import { ensureAudioGraph } from "./playback.js";
import { getSelectedLoopRange, hasPartialLoopSelection } from "./loop.js";
import { getSettingsSnapshot } from "./controls.js";

export const videoExportCancelHandlers = new Set();

export function getVideoExportRange() {
  const fullDuration = runtime.decodedAudioBuffer?.duration || 0;

  if (state.audioLoop && hasPartialLoopSelection()) {
    return getSelectedLoopRange();
  }

  return {
    start: 0,
    end: fullDuration,
    duration: fullDuration
  };
}

export function exportSettings() {
  const json = JSON.stringify(getSettingsSnapshot(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "mirrored-envelope-cascade-pro-settings.json";
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export function getExportFileBaseName() {
  const customName = sanitizeFileName(exportFileNameInput.value.trim());

  if (customName) {
    return customName;
  }

  const audioName = sanitizeFileName(runtime.loadedAudioFileName);

  return audioName || "mirrored-envelope-cascade";
}

export function setVideoExportStatus(message, tone = "idle") {
  videoExportStatus.textContent = message;
  videoExportStatus.dataset.tone = tone;
  videoExportOverlayStatus.textContent = message;
}

export function setVideoExportProgress(percent, label = "") {
  const normalized = clamp(Number(percent) || 0, 0, 100);
  const width = `${normalized}%`;

  videoExportProgress.style.width = width;
  videoExportOverlayProgress.style.width = width;

  if (label) {
    videoExportOverlayStatus.textContent = label;
  }
}

export function beginVideoExportUi() {
  try {
    videoExportOverlay.style.backgroundImage =
      `url("${renderer.domElement.toDataURL("image/png")}")`;
  } catch {
    videoExportOverlay.style.backgroundImage = "none";
  }

  videoExportOverlay.hidden = false;
  videoExportCancel.disabled = false;
  videoExportCancel.textContent = "Cancel Export";
  exportVideoButton.disabled = true;
  exportVideoButton.textContent = "Exporting…";
  setVideoExportProgress(0, "Preparing export…");
}

export function endVideoExportUi() {
  videoExportOverlay.hidden = true;
  videoExportOverlay.style.backgroundImage = "none";
  videoExportCancel.disabled = false;
  videoExportCancel.textContent = "Cancel Export";
  exportVideoButton.disabled = !runtime.decodedAudioBuffer;
  exportVideoButton.textContent = "Export Video";
}

export function registerVideoExportCancelHandler(handler) {
  videoExportCancelHandlers.add(handler);
  return () => videoExportCancelHandlers.delete(handler);
}

export async function runVideoExportCancelHandlers() {
  const handlers = [...videoExportCancelHandlers];
  videoExportCancelHandlers.clear();

  await Promise.allSettled(
    handlers.map((handler) => Promise.resolve().then(handler))
  );
}

export function requestVideoExportCancel() {
  if (!runtime.isExportingVideo || runtime.videoExportCancelled) {
    return;
  }

  runtime.videoExportCancelled = true;
  videoExportCancel.disabled = true;
  videoExportCancel.textContent = "Cancelling…";
  exportVideoButton.textContent = "Cancelling…";
  setVideoExportStatus("Cancelling video export…", "active");
  void runVideoExportCancelHandlers();
}

export function throwIfVideoExportCancelled() {
  if (runtime.videoExportCancelled) {
    throw new DOMException("Video export cancelled.", "AbortError");
  }
}

export async function waitForEncoderQueue(encoder, maximumQueueSize) {
  while (
    encoder &&
    encoder.state === "configured" &&
    encoder.encodeQueueSize > maximumQueueSize
  ) {
    throwIfVideoExportCancelled();
    await nextEventLoopTurn();
  }
}

export function getVideoFrameTiming(frameIndex, frameRate) {
  const timestampUs = Math.round(
    (frameIndex * 1_000_000) / frameRate
  );
  const nextTimestampUs = Math.round(
    ((frameIndex + 1) * 1_000_000) / frameRate
  );

  return {
    timestampUs,
    durationUs: Math.max(1, nextTimestampUs - timestampUs),
    timestampSeconds: frameIndex / frameRate,
    durationSeconds: 1 / frameRate
  };
}

export function getEffectiveVideoBitrate(baseBitrateMbps, width, height) {
  const pixelRatio = (width * height) / (1920 * 1080);
  const scaledMbps =
    baseBitrateMbps * Math.sqrt(Math.max(1, pixelRatio));

  return Math.round(scaledMbps * 1_000_000);
}

export async function loadMp4MuxerModule() {
  if (!runtime.Mp4MuxerModule) {
    runtime.Mp4MuxerModule = await import(
      "https://cdn.jsdelivr.net/npm/mp4-muxer@5/+esm"
    );
  }

  return runtime.Mp4MuxerModule;
}

export async function loadMediabunnyModule() {
  if (!runtime.MediabunnyModule) {
    runtime.MediabunnyModule = await import(
      "https://cdn.jsdelivr.net/npm/mediabunny@1.49.0/+esm"
    );
  }

  return runtime.MediabunnyModule;
}

export async function chooseSupportedAvcConfig(
  width,
  height,
  bitrate,
  frameRate
) {
  const candidates = [
    "avc1.640033",
    "avc1.64002A",
    "avc1.4D402A",
    "avc1.42001F"
  ];
  const qualityProfiles = [
    {
      latencyMode: "quality",
      bitrateMode: "variable",
      hardwareAcceleration: "no-preference"
    },
    {
      latencyMode: "quality",
      hardwareAcceleration: "no-preference"
    },
    {
      bitrateMode: "variable",
      hardwareAcceleration: "no-preference"
    }
  ];

  for (const codec of candidates) {
    for (const qualityProfile of qualityProfiles) {
      const config = {
        codec,
        width,
        height,
        bitrate,
        framerate: frameRate,
        avc: { format: "avc" },
        ...qualityProfile
      };
      const result = await VideoEncoder.isConfigSupported(config);

      if (result.supported) {
        return result.config;
      }
    }
  }

  return null;
}

export async function chooseSupportedAacConfig(sampleRate) {
  if (!window.AudioEncoder || !window.AudioData) {
    return null;
  }

  const config = {
    codec: "mp4a.40.2",
    sampleRate,
    numberOfChannels: 2,
    bitrate: 192_000
  };
  const result = await AudioEncoder.isConfigSupported(config);

  return result.supported ? result.config : null;
}

export function createExportAudioBufferSegment(buffer, start, end) {
  const sampleRate = buffer.sampleRate;
  const startFrame = clamp(
    Math.floor(start * sampleRate),
    0,
    buffer.length
  );
  const endFrame = clamp(
    Math.ceil(end * sampleRate),
    startFrame,
    buffer.length
  );
  const frameCount = Math.max(1, endFrame - startFrame);
  const segment = new AudioBuffer({
    length: frameCount,
    numberOfChannels: Math.max(1, buffer.numberOfChannels),
    sampleRate
  });
  const gain = state.muted ? 0 : clamp(state.volume, 0, 1);

  for (
    let channelIndex = 0;
    channelIndex < segment.numberOfChannels;
    channelIndex++
  ) {
    const sourceChannel = buffer.getChannelData(
      Math.min(channelIndex, buffer.numberOfChannels - 1)
    );
    const destinationChannel = segment.getChannelData(channelIndex);

    for (let index = 0; index < frameCount; index++) {
      destinationChannel[index] =
        (sourceChannel[startFrame + index] || 0) * gain;
    }
  }

  return segment;
}

export async function encodeAudioIntoMuxer(
  muxer,
  buffer,
  exportStart,
  exportEnd,
  audioConfig
) {
  if (!audioConfig) {
    return { encoded: false, reason: "AAC encoding unavailable." };
  }

  const sampleRate = audioConfig.sampleRate;
  const startFrame = clamp(
    Math.floor(exportStart * sampleRate),
    0,
    buffer.length
  );
  const endFrame = clamp(
    Math.ceil(exportEnd * sampleRate),
    startFrame,
    buffer.length
  );
  const chunkSize = 2048;
  const gain = state.muted ? 0 : clamp(state.volume, 0, 1);
  let encoderError = null;
  let audioEncoder = null;

  audioEncoder = new AudioEncoder({
    output: (chunk, metadata) => {
      muxer.addAudioChunk(chunk, metadata);
    },
    error: (error) => {
      encoderError = error;
    }
  });
  audioEncoder.configure(audioConfig);

  const unregisterCancel = registerVideoExportCancelHandler(() => {
    if (audioEncoder?.state === "configured") {
      audioEncoder.reset();
    }
  });

  try {
    for (
      let offset = startFrame;
      offset < endFrame;
      offset += chunkSize
    ) {
      throwIfVideoExportCancelled();

      const frameCount = Math.min(chunkSize, endFrame - offset);
      const planarData = new Float32Array(frameCount * 2);

      for (let channelIndex = 0; channelIndex < 2; channelIndex++) {
        const channel = buffer.getChannelData(
          Math.min(channelIndex, buffer.numberOfChannels - 1)
        );
        const destinationOffset = channelIndex * frameCount;

        for (let index = 0; index < frameCount; index++) {
          planarData[destinationOffset + index] =
            (channel[offset + index] || 0) * gain;
        }
      }

      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: frameCount,
        numberOfChannels: 2,
        timestamp: Math.round(
          ((offset - startFrame) / sampleRate) * 1_000_000
        ),
        data: planarData
      });

      audioEncoder.encode(audioData);
      audioData.close();
      await waitForEncoderQueue(audioEncoder, 8);

      if (encoderError) {
        throw encoderError;
      }
    }

    await audioEncoder.flush();

    if (encoderError) {
      throw encoderError;
    }

    return { encoded: true };
  } finally {
    unregisterCancel();

    if (audioEncoder?.state !== "closed") {
      audioEncoder.close();
    }
  }
}

export async function renderVideoExportFrames({
  frameRate,
  totalFrames,
  duration,
  exportStart,
  exportEnd,
  startingCameraPosition,
  startingTarget,
  addFrame
}) {
  let nextRowTime = exportStart;
  const baseOffset = startingCameraPosition
    .clone()
    .sub(startingTarget);
  const rotationAxis = new THREE.Vector3(0, 1, 0);

  for (
    let frameIndex = 0;
    frameIndex < totalFrames;
    frameIndex++
  ) {
    throwIfVideoExportCancelled();

    const elapsedExportTime = Math.min(
      duration,
      frameIndex / frameRate
    );
    const exportTime = Math.min(
      exportEnd,
      exportStart + elapsedExportTime
    );
    state.exportPlaybackTimeOverride = exportTime;
    state.exportFrameRateOverride = frameRate;

    while (nextRowTime <= exportTime + 1e-8) {
      appendOfflineWaveformRow(nextRowTime);
      nextRowTime += 1 / state.cascadeRate;
    }

    if (state.sinusoidalCameraActive) {
      positionSinusoidalCamera(elapsedExportTime);
    } else if (state.autoRotate) {
      const angle =
        -elapsedExportTime * state.autoRotateSpeed * 0.2;
      camera.position
        .copy(baseOffset)
        .applyAxisAngle(rotationAxis, angle)
        .add(startingTarget);
      camera.lookAt(startingTarget);
    }

    updateMatrices();
    renderSceneWithHud();

    // Capture the WebGL frame in the same task that rendered it. The
    // renderer uses the default non-preserved drawing buffer, so yielding
    // before VideoFrame/CanvasSource reads the canvas can expose a cleared
    // or partially composited buffer and produce flickering export frames.
    const gl = renderer.getContext();
    if (typeof gl.finish === "function") {
      gl.finish();
    }

    throwIfVideoExportCancelled();
    await addFrame(frameIndex);
    await nextEventLoopTurn();
    throwIfVideoExportCancelled();

    if (
      frameIndex % Math.max(1, Math.round(frameRate / 3)) === 0
    ) {
      const percent = Math.min(
        90,
        Math.round(((frameIndex + 1) / totalFrames) * 90)
      );
      const frameLabel =
        `Encoding frame ${frameIndex + 1} of ${totalFrames}`;

      setVideoExportStatus(
        `${percent}% · ${frameLabel}`,
        "active"
      );
      setVideoExportProgress(percent, frameLabel);
    }
  }
}

export async function exportMp4({
  resolution,
  frameRate,
  videoBitrate,
  duration,
  exportStart,
  exportEnd,
  totalFrames,
  startingCameraPosition,
  startingTarget
}) {
  const { Muxer, ArrayBufferTarget } =
    await loadMp4MuxerModule();
  throwIfVideoExportCancelled();

  const videoConfig = await chooseSupportedAvcConfig(
    resolution.width,
    resolution.height,
    videoBitrate,
    frameRate
  );

  if (!videoConfig) {
    throw new Error(
      "No supported H.264 configuration was found for this resolution."
    );
  }

  const audioConfig = await chooseSupportedAacConfig(
    runtime.decodedAudioBuffer.sampleRate
  );
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width: resolution.width,
      height: resolution.height
    },
    ...(audioConfig
      ? {
          audio: {
            codec: "aac",
            sampleRate: audioConfig.sampleRate,
            numberOfChannels: 2
          }
        }
      : {}),
    fastStart: "in-memory"
  });

  let encoderError = null;
  let encodedVideoFrameCount = 0;
  let videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => {
      encodedVideoFrameCount++;
      muxer.addVideoChunk(chunk, metadata);
    },
    error: (error) => {
      encoderError = error;
    }
  });

  videoEncoder.configure(videoConfig);

  const unregisterCancel = registerVideoExportCancelHandler(() => {
    if (videoEncoder?.state === "configured") {
      videoEncoder.reset();
    }
  });

  try {
    await renderVideoExportFrames({
      frameRate,
      totalFrames,
      duration,
      exportStart,
      exportEnd,
      startingCameraPosition,
      startingTarget,
      addFrame: async (frameIndex) => {
        throwIfVideoExportCancelled();

        if (encoderError) {
          throw encoderError;
        }

        const timing = getVideoFrameTiming(
          frameIndex,
          frameRate
        );
        const frame = new VideoFrame(renderer.domElement, {
          timestamp: timing.timestampUs,
          duration: timing.durationUs
        });

        videoEncoder.encode(frame, {
          keyFrame:
            frameIndex % Math.max(1, frameRate * 2) === 0
        });
        frame.close();

        await waitForEncoderQueue(videoEncoder, 1);

        if (encoderError) {
          throw encoderError;
        }
      }
    });

    await videoEncoder.flush();

    if (encodedVideoFrameCount !== totalFrames) {
      throw new Error(
        `Video encoder returned ${encodedVideoFrameCount} of ` +
        `${totalFrames} frames. Try a lower resolution.`
      );
    }

    setVideoExportProgress(92, "Encoding audio…");

    if (audioConfig) {
      await encodeAudioIntoMuxer(
        muxer,
        runtime.decodedAudioBuffer,
        exportStart,
        exportEnd,
        audioConfig
      );
    }

    throwIfVideoExportCancelled();
    setVideoExportProgress(98, "Finalizing MP4…");
    muxer.finalize();

    const blob = new Blob([target.buffer], {
      type: "video/mp4"
    });
    downloadBlob(blob, `${getExportFileBaseName()}.mp4`);

    return {
      label: audioConfig ? "MP4 with AAC audio" : "video-only MP4",
      size: blob.size
    };
  } finally {
    unregisterCancel();

    if (videoEncoder?.state !== "closed") {
      videoEncoder.close();
    }

    videoEncoder = null;
  }
}

export async function exportMkv({
  resolution,
  frameRate,
  videoBitrate,
  duration,
  exportStart,
  exportEnd,
  totalFrames,
  startingCameraPosition,
  startingTarget
}) {
  const {
    Output,
    MkvOutputFormat,
    BufferTarget,
    CanvasSource,
    AudioBufferSource,
    getFirstEncodableVideoCodec,
    getFirstEncodableAudioCodec
  } = await loadMediabunnyModule();
  throwIfVideoExportCancelled();

  const preferredVideoCodecs = isFirefoxBrowser
    ? ["vp9", "vp8", "av1", "avc"]
    : ["avc", "vp9", "vp8", "av1"];
  const selectedVideoCodec =
    await getFirstEncodableVideoCodec(preferredVideoCodecs, {
      width: resolution.width,
      height: resolution.height,
      bitrate: videoBitrate
    });

  if (!selectedVideoCodec) {
    throw new Error(
      "No supported MKV video codec was found for this resolution."
    );
  }

  const selectedAudioCodec =
    await getFirstEncodableAudioCodec(["opus", "aac"], {
      numberOfChannels: 2,
      sampleRate: 48_000,
      bitrate: 192_000
    });
  const target = new BufferTarget();
  const output = new Output({
    format: new MkvOutputFormat(),
    target
  });
  const videoSource = new CanvasSource(renderer.domElement, {
    codec: selectedVideoCodec,
    bitrate: videoBitrate,
    bitrateMode: "variable",
    latencyMode: "quality",
    keyFrameInterval: 2,
    hardwareAcceleration: "no-preference"
  });
  const audioSource = selectedAudioCodec
    ? new AudioBufferSource({
        codec: selectedAudioCodec,
        bitrate: 192_000,
        transform: {
          numberOfChannels: 2,
          sampleRate: 48_000
        }
      })
    : null;

  output.addVideoTrack(videoSource, { frameRate });

  if (audioSource) {
    output.addAudioTrack(audioSource);
  }

  await output.start();

  const unregisterCancel = registerVideoExportCancelHandler(async () => {
    try {
      videoSource.close();
      audioSource?.close();
      await output.cancel();
    } catch {
      // The encoder may already be closing.
    }
  });

  try {
    const audioPromise = audioSource
      ? audioSource
          .add(
            createExportAudioBufferSegment(
              runtime.decodedAudioBuffer,
              exportStart,
              exportEnd
            )
          )
          .finally(() => audioSource.close())
      : Promise.resolve();

    await renderVideoExportFrames({
      frameRate,
      totalFrames,
      duration,
      exportStart,
      exportEnd,
      startingCameraPosition,
      startingTarget,
      addFrame: (frameIndex) => {
        const timing = getVideoFrameTiming(
          frameIndex,
          frameRate
        );

        return videoSource.add(
          timing.timestampSeconds,
          timing.durationSeconds,
          {
            keyFrame:
              frameIndex % Math.max(1, frameRate * 2) === 0
          }
        );
      }
    });

    videoSource.close();
    setVideoExportProgress(92, "Finishing MKV audio…");
    await audioPromise;
    throwIfVideoExportCancelled();
    setVideoExportProgress(98, "Finalizing MKV…");
    await output.finalize();

    if (!target.buffer) {
      throw new Error("MKV finalization returned no data.");
    }

    const blob = new Blob([target.buffer], {
      type: "video/x-matroska"
    });
    downloadBlob(blob, `${getExportFileBaseName()}.mkv`);

    return {
      label:
        `MKV with ${selectedVideoCodec.toUpperCase()}` +
        (selectedAudioCodec
          ? ` and ${selectedAudioCodec.toUpperCase()} audio`
          : ""),
      size: blob.size
    };
  } finally {
    unregisterCancel();
  }
}

export async function exportPng() {
  if (runtime.isExportingPng || runtime.isExportingVideo) {
    return;
  }

  const button = document.getElementById("pngButton");
  const resolution = getViewportResolutionDimensions();
  const renderTarget = getWebpageRenderDimensions();

  runtime.isExportingPng = true;
  button.disabled = true;
  button.textContent = "Exporting…";

  try {
    await prepareExportLogoImage();
    renderer.setPixelRatio(1);
    renderer.setSize(
      resolution.width,
      resolution.height,
      false
    );
    applyViewportCameraProjection(renderTarget);
    state.hudLayer = null;
    renderSceneWithHud();

    const blob = await canvasToBlob("image/png");
    downloadBlob(
      blob,
      `${getExportFileBaseName()}-${resolution.width}x` +
      `${resolution.height}.png`
    );
    status.textContent =
      `PNG exported at ${resolution.width} × ${resolution.height}.`;
  } catch (error) {
    console.error(error);
    status.textContent = `PNG export error: ${error.message}`;
  } finally {
    runtime.isExportingPng = false;
    button.disabled = false;
    button.textContent = "Export PNG";
    fitViewport();
    renderSceneWithHud();
  }
}

export async function exportVideo() {
  if (runtime.isExportingVideo) {
    requestVideoExportCancel();
    return;
  }

  if (!runtime.decodedAudioBuffer) {
    setVideoExportStatus(
      "Load and finish analyzing an audio file before exporting video.",
      "error"
    );
    return;
  }

  if (!window.VideoEncoder || !window.VideoFrame) {
    setVideoExportStatus(
      "Video export requires WebCodecs support. Use a current Chromium or Firefox browser.",
      "error"
    );
    return;
  }

  let fileType = videoFileTypeInput.value;

  if (isFirefoxBrowser && fileType === "mp4") {
    fileType = "mkv";
    videoFileTypeInput.value = "mkv";
    state.videoFileType = "mkv";
  }

  const resolution = getViewportResolutionDimensions();
  const renderTarget = getWebpageRenderDimensions();
  const frameRate =
    Number(videoFrameRateInput.value) || state.videoFrameRate;
  const baseBitrate =
    Number(videoBitrateInput.value) || state.videoBitrate;
  const videoBitrate = getEffectiveVideoBitrate(
    baseBitrate,
    resolution.width,
    resolution.height
  );
  const exportRange = getVideoExportRange();
  const duration = exportRange.duration;
  const totalFrames = Math.max(
    1,
    Math.ceil(duration * frameRate)
  );
  const saved = {
    audioTime: audio.currentTime,
    audioWasPlaying: !audio.paused && !audio.ended,
    cameraPosition: camera.position.clone(),
    cameraQuaternion: camera.quaternion.clone(),
    controlsTarget: controls.target.clone(),
    controlsAutoRotate: controls.autoRotate,
    historyData: runtime.historyData.slice(),
    smoothedSamples: runtime.smoothedSamples.slice(),
    historyHead: runtime.historyHead,
    historyCount: runtime.historyCount,
    forceBlankHistoryGrid: runtime.forceBlankHistoryGrid,
    matrixDirty: runtime.matrixDirty,
    exportPlaybackTimeOverride: state.exportPlaybackTimeOverride,
    exportFrameRateOverride: state.exportFrameRateOverride,
    hudSpectrumSmoothed: state.hudSpectrumSmoothed
      ? state.hudSpectrumSmoothed.slice()
      : null,
    hudLevel: state.hudLevel ? { ...state.hudLevel } : null
  };

  runtime.isExportingVideo = true;
  runtime.videoExportCancelled = false;
  beginVideoExportUi();
  audio.pause();
  controls.autoRotate = false;

  try {
    await prepareExportLogoImage();
    renderer.setPixelRatio(1);
    renderer.setSize(
      resolution.width,
      resolution.height,
      false
    );
    applyViewportCameraProjection(renderTarget);

    runtime.historyData.fill(0);
    runtime.smoothedSamples.fill(0);
    runtime.historyHead = 0;
    runtime.historyCount = 0;
    runtime.matrixDirty = true;
    state.hudLayer = null;
    state.hudSpectrumSmoothed = null;
    state.hudLevel = null;
    state.exportFrameRateOverride = frameRate;

    setVideoExportStatus(
      `Preparing ${fileType.toUpperCase()} · ` +
      `${resolution.width} × ${resolution.height} · ` +
      `${frameRate} FPS · ` +
      (hasPartialLoopSelection() && state.audioLoop
        ? `loop ${formatTime(exportRange.start)}–${formatTime(exportRange.end)}`
        : "full track"),
      "active"
    );

    const result = fileType === "mkv"
      ? await exportMkv({
          resolution,
          frameRate,
          videoBitrate,
          duration,
          exportStart: exportRange.start,
          exportEnd: exportRange.end,
          totalFrames,
          startingCameraPosition: saved.cameraPosition,
          startingTarget: saved.controlsTarget
        })
      : await exportMp4({
          resolution,
          frameRate,
          videoBitrate,
          duration,
          exportStart: exportRange.start,
          exportEnd: exportRange.end,
          totalFrames,
          startingCameraPosition: saved.cameraPosition,
          startingTarget: saved.controlsTarget
        });

    throwIfVideoExportCancelled();
    const sizeMb = (result.size / (1024 * 1024)).toFixed(1);

    setVideoExportProgress(100, "Export complete.");
    setVideoExportStatus(
      `${result.label} exported · ${sizeMb} MB`,
      "idle"
    );
  } catch (error) {
    if (
      runtime.videoExportCancelled ||
      error?.name === "AbortError"
    ) {
      setVideoExportStatus("Video export cancelled.", "idle");
    } else {
      console.error(error);
      setVideoExportStatus(
        `Video export error: ${error.message}`,
        "error"
      );
    }
  } finally {
    await runVideoExportCancelHandlers();

    runtime.historyData = saved.historyData;
    runtime.smoothedSamples = saved.smoothedSamples;
    runtime.historyHead = saved.historyHead;
    runtime.historyCount = saved.historyCount;
    runtime.forceBlankHistoryGrid = saved.forceBlankHistoryGrid;
    runtime.matrixDirty = true;
    state.exportPlaybackTimeOverride = saved.exportPlaybackTimeOverride;
    state.exportFrameRateOverride = saved.exportFrameRateOverride;
    state.hudSpectrumSmoothed = saved.hudSpectrumSmoothed;
    state.hudLevel = saved.hudLevel;
    state.hudLayer = null;

    camera.position.copy(saved.cameraPosition);
    camera.quaternion.copy(saved.cameraQuaternion);
    controls.target.copy(saved.controlsTarget);
    controls.autoRotate = saved.controlsAutoRotate;
    controls.update();

    audio.currentTime = Math.min(
      saved.audioTime,
      audio.duration || saved.audioTime
    );
    runtime.nextCaptureAudioTime = audio.currentTime;

    runtime.isExportingVideo = false;
    runtime.videoExportCancelled = false;
    fitViewport();
    updateMatrices();
    renderSceneWithHud();
    endVideoExportUi();

    if (saved.audioWasPlaying) {
      try {
        await ensureAudioGraph();
        await audio.play();
      } catch (error) {
        console.error(error);
      }
    }
  }
}

export function updateVideoExportFormatUi(announce = false) {
  if (isFirefoxBrowser) {
    const mp4Option =
      videoFileTypeInput.querySelector('option[value="mp4"]');

    if (mp4Option) {
      mp4Option.disabled = true;
    }

    if (videoFileTypeInput.value === "mp4") {
      videoFileTypeInput.value = "mkv";
    }
  }

  state.videoFileType = videoFileTypeInput.value;

  if (announce && isFirefoxBrowser) {
    setVideoExportStatus(
      "Firefox uses MKV because its H.264 metadata is not reliable for MP4 muxing.",
      "idle"
    );
  }
}

// Register late-bound implementations on the core hooks registry.
hooks.setVideoExportStatus = setVideoExportStatus;
hooks.updateVideoExportFormatUi = updateVideoExportFormatUi;
