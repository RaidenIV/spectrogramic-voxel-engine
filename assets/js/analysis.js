// analysis.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// FFT, audio analysis, offline sampling, and HUD spectrum/level data.
import * as THREE from "three";
import { HUD_ANALYSIS_FRAMES_PER_SECOND, HUD_ATTACK_MS, HUD_FREQUENCY_DB_MAX, HUD_FREQUENCY_DB_MIN, HUD_FREQUENCY_MAX_HZ, HUD_FREQUENCY_MIN_HZ, HUD_FREQUENCY_POINT_COUNT, HUD_MAX_ANALYSIS_FRAMES, HUD_MIN_DB_RANGE, HUD_RELEASE_MS } from "./config.js";
import { audio, hooks, runtime, state } from "./core.js";
import { clamp } from "./utils.js";

export function applySpatialSmoothing(
  raw,
  requestedRadius = state.spatialSmoothing
) {
  const count = raw.length;
  const radius = Math.round(requestedRadius);

  if (radius <= 0) {
    return raw;
  }

  const spatiallySmoothed = new Float32Array(count);

  for (let index = 0; index < count; index++) {
    const start = Math.max(0, index - radius);
    const end = Math.min(count - 1, index + radius);

    let sum = 0;
    let weightSum = 0;

    for (
      let sampleIndex = start;
      sampleIndex <= end;
      sampleIndex++
    ) {
      const distance = Math.abs(sampleIndex - index);
      const weight = radius + 1 - distance;

      sum += raw[sampleIndex] * weight;
      weightSum += weight;
    }

    spatiallySmoothed[index] = weightSum > 0
      ? sum / weightSum
      : raw[index];
  }

  return spatiallySmoothed;
}

export function sampleTimeDomain(count) {
  const raw = new Float32Array(count);

  if (!runtime.waveformData || runtime.waveformData.length === 0) {
    return raw;
  }

  for (let index = 0; index < count; index++) {
    const normalized = count <= 1 ? 0 : index / (count - 1);
    const sourcePosition =
      normalized * (runtime.waveformData.length - 1);
    const left = Math.floor(sourcePosition);
    const right = Math.min(
      runtime.waveformData.length - 1,
      left + 1
    );
    const interpolation = sourcePosition - left;

    const leftValue = (runtime.waveformData[left] - 128) / 128;
    const rightValue = (runtime.waveformData[right] - 128) / 128;

    raw[index] = THREE.MathUtils.lerp(
      leftValue,
      rightValue,
      interpolation
    ) * state.sensitivity;
  }

  return applySpatialSmoothing(raw);
}

export function sampleFrequencyDomain(count) {
  const raw = new Float32Array(count);

  if (
    !runtime.frequencyData ||
    runtime.frequencyData.length === 0 ||
    !runtime.audioContext
  ) {
    return raw;
  }

  const nyquist = runtime.audioContext.sampleRate / 2;
  const minimumFrequency = 20;
  const maximumFrequency = Math.max(
    minimumFrequency * 1.01,
    nyquist
  );
  const frequencyRatio =
    maximumFrequency / minimumFrequency;

  for (let index = 0; index < count; index++) {
    const lowerPosition = index / count;
    const upperPosition = (index + 1) / count;

    const lowerFrequency =
      minimumFrequency *
      Math.pow(frequencyRatio, lowerPosition);
    const upperFrequency =
      minimumFrequency *
      Math.pow(frequencyRatio, upperPosition);

    const startBin = clamp(
      Math.floor(
        (lowerFrequency / nyquist) *
        runtime.frequencyData.length
      ),
      0,
      runtime.frequencyData.length - 1
    );

    const endBin = clamp(
      Math.max(
        startBin + 1,
        Math.ceil(
          (upperFrequency / nyquist) *
          runtime.frequencyData.length
        )
      ),
      1,
      runtime.frequencyData.length
    );

    let sum = 0;
    let peak = 0;

    for (let bin = startBin; bin < endBin; bin++) {
      const magnitude = runtime.frequencyData[bin];
      sum += magnitude;
      peak = Math.max(peak, magnitude);
    }

    const binCount = Math.max(1, endBin - startBin);
    const average = sum / binCount;

    // Peak-dominant sampling preserves narrow frequency events while
    // retaining a small amount of band energy for visual stability.
    const bandMagnitude =
      peak * 0.82 + average * 0.18;

    raw[index] =
      (bandMagnitude / 255) * state.sensitivity;
  }

  // Frequency mode deliberately uses only a fraction of the waveform
  // smoothing radius so adjacent FFT columns remain visually distinct.
  return applySpatialSmoothing(
    raw,
    state.spatialSmoothing * 0.2
  );
}

export function commitSampledRow(sampled) {
  runtime.forceBlankHistoryGrid = false;

  const previousRowIndex = runtime.historyCount > 0
    ? runtime.historyHead
    : -1;

  for (let index = 0; index < state.count; index++) {
    const minimumTarget =
      state.analysisMode === "frequency" ? 0 : -1;
    const target = clamp(
      sampled[index],
      minimumTarget,
      1
    );
    const previous = runtime.smoothedSamples[index];

    let coefficient = Math.abs(target) > Math.abs(previous)
      ? state.attack
      : state.release;

    if (state.analysisMode === "frequency") {
      coefficient = Math.max(coefficient, 0.55);
    }

    runtime.smoothedSamples[index] = previous +
      (target - previous) * coefficient;
  }

  runtime.historyHead = (runtime.historyHead - 1 + state.historyRows) %
    state.historyRows;

  const destinationOffset = runtime.historyHead * state.count;

  for (let index = 0; index < state.count; index++) {
    let value = runtime.smoothedSamples[index];

    if (
      state.analysisMode !== "frequency" &&
      previousRowIndex >= 0 &&
      state.historyBlend > 0
    ) {
      const previousValue =
        runtime.historyData[previousRowIndex * state.count + index];

      value = THREE.MathUtils.lerp(
        value,
        previousValue,
        state.historyBlend
      );
    }

    runtime.historyData[destinationOffset + index] = value;
  }

  runtime.historyCount = Math.min(state.historyRows, runtime.historyCount + 1);
  runtime.matrixDirty = true;
}

export function appendWaveformRow() {
  if (!runtime.analyser || audio.paused || audio.ended) {
    return;
  }

  let sampled;

  if (state.analysisMode === "frequency") {
    runtime.analyser.smoothingTimeConstant = 0;
    runtime.analyser.getByteFrequencyData(runtime.frequencyData);
    sampled = sampleFrequencyDomain(state.count);
  } else {
    runtime.analyser.smoothingTimeConstant = 0.8;
    runtime.analyser.getByteTimeDomainData(runtime.waveformData);
    sampled = sampleTimeDomain(state.count);
  }

  commitSampledRow(sampled);
}

export function readDecodedSample(buffer, channelIndex, samplePosition) {
  const channel = buffer.getChannelData(
    Math.min(channelIndex, buffer.numberOfChannels - 1)
  );

  if (
    samplePosition < 0 ||
    samplePosition >= channel.length
  ) {
    return 0;
  }

  const lowerIndex = clamp(
    Math.floor(samplePosition),
    0,
    channel.length - 1
  );
  const upperIndex = Math.min(channel.length - 1, lowerIndex + 1);
  const fraction = clamp(samplePosition - lowerIndex, 0, 1);

  return THREE.MathUtils.lerp(
    channel[lowerIndex] || 0,
    channel[upperIndex] || 0,
    fraction
  );
}

export function sampleOfflineTimeDomain(time, count) {
  const raw = new Float32Array(count);

  if (!runtime.decodedAudioBuffer) {
    return raw;
  }

  const sampleRate = runtime.decodedAudioBuffer.sampleRate;
  const windowSize = Math.max(32, state.fftSize);
  const centerSample = time * sampleRate;
  const startSample = centerSample - windowSize / 2;

  for (let index = 0; index < count; index++) {
    const position = count <= 1
      ? startSample
      : startSample + (index / (count - 1)) * (windowSize - 1);
    const left = readDecodedSample(runtime.decodedAudioBuffer, 0, position);
    const right = runtime.decodedAudioBuffer.numberOfChannels > 1
      ? readDecodedSample(runtime.decodedAudioBuffer, 1, position)
      : left;

    raw[index] = ((left + right) * 0.5) * state.sensitivity;
  }

  return applySpatialSmoothing(raw);
}

export function computeOfflineSpectrum(time, fftSizeOverride = state.fftSize) {
  if (!runtime.decodedAudioBuffer) {
    return new Float32Array(0);
  }

  const size = Math.max(32, fftSizeOverride);
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  const sampleRate = runtime.decodedAudioBuffer.sampleRate;
  const startSample = Math.round(time * sampleRate) - Math.floor(size / 2);

  for (let index = 0; index < size; index++) {
    const position = startSample + index;
    const left = readDecodedSample(runtime.decodedAudioBuffer, 0, position);
    const right = runtime.decodedAudioBuffer.numberOfChannels > 1
      ? readDecodedSample(runtime.decodedAudioBuffer, 1, position)
      : left;
    const windowValue = 0.5 -
      0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, size - 1));

    real[index] = ((left + right) * 0.5) * windowValue;
  }

  let swapIndex = 0;

  for (let index = 1; index < size; index++) {
    let bit = size >> 1;

    while (swapIndex & bit) {
      swapIndex ^= bit;
      bit >>= 1;
    }

    swapIndex ^= bit;

    if (index < swapIndex) {
      [real[index], real[swapIndex]] = [real[swapIndex], real[index]];
      [imaginary[index], imaginary[swapIndex]] =
        [imaginary[swapIndex], imaginary[index]];
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const cosineStep = Math.cos(angle);
    const sineStep = Math.sin(angle);

    for (let offset = 0; offset < size; offset += length) {
      let cosine = 1;
      let sine = 0;
      const halfLength = length >> 1;

      for (let index = 0; index < halfLength; index++) {
        const evenIndex = offset + index;
        const oddIndex = evenIndex + halfLength;
        const oddReal =
          real[oddIndex] * cosine - imaginary[oddIndex] * sine;
        const oddImaginary =
          real[oddIndex] * sine + imaginary[oddIndex] * cosine;
        const evenReal = real[evenIndex];
        const evenImaginary = imaginary[evenIndex];

        real[evenIndex] = evenReal + oddReal;
        imaginary[evenIndex] = evenImaginary + oddImaginary;
        real[oddIndex] = evenReal - oddReal;
        imaginary[oddIndex] = evenImaginary - oddImaginary;

        const nextCosine =
          cosine * cosineStep - sine * sineStep;
        sine = sine * cosineStep + cosine * sineStep;
        cosine = nextCosine;
      }
    }
  }

  const magnitudes = new Float32Array(size / 2);

  for (let index = 0; index < magnitudes.length; index++) {
    const magnitude =
      (2 * Math.hypot(real[index], imaginary[index])) / size;
    const decibels = 20 * Math.log10(Math.max(1e-8, magnitude));
    magnitudes[index] = clamp((decibels + 100) / 100, 0, 1);
  }

  return magnitudes;
}

export function sampleOfflineFrequencyDomain(time, count) {
  const raw = new Float32Array(count);
  const magnitudes = computeOfflineSpectrum(time);

  if (!runtime.decodedAudioBuffer || magnitudes.length === 0) {
    return raw;
  }

  const nyquist = runtime.decodedAudioBuffer.sampleRate / 2;
  const minimumFrequency = 20;
  const maximumFrequency = Math.max(
    minimumFrequency * 1.01,
    nyquist
  );
  const frequencyRatio = maximumFrequency / minimumFrequency;

  for (let index = 0; index < count; index++) {
    const lowerFrequency =
      minimumFrequency * Math.pow(frequencyRatio, index / count);
    const upperFrequency =
      minimumFrequency *
      Math.pow(frequencyRatio, (index + 1) / count);
    const startBin = clamp(
      Math.floor((lowerFrequency / nyquist) * magnitudes.length),
      0,
      magnitudes.length - 1
    );
    const endBin = clamp(
      Math.max(
        startBin + 1,
        Math.ceil((upperFrequency / nyquist) * magnitudes.length)
      ),
      1,
      magnitudes.length
    );

    let sum = 0;
    let peak = 0;

    for (let bin = startBin; bin < endBin; bin++) {
      const value = magnitudes[bin];
      sum += value;
      peak = Math.max(peak, value);
    }

    const average = sum / Math.max(1, endBin - startBin);
    raw[index] =
      (peak * 0.82 + average * 0.18) * state.sensitivity;
  }

  return applySpatialSmoothing(
    raw,
    state.spatialSmoothing * 0.2
  );
}

export function appendOfflineWaveformRow(time) {
  const sampled = state.analysisMode === "frequency"
    ? sampleOfflineFrequencyDomain(time, state.count)
    : sampleOfflineTimeDomain(time, state.count);

  commitSampledRow(sampled);
}

export function catmullRomHud(value0, value1, value2, value3, amount) {
  const amount2 = amount * amount;
  const amount3 = amount2 * amount;

  return 0.5 * (
    (2 * value1) +
    (-value0 + value2) * amount +
    (2 * value0 - 5 * value1 + 4 * value2 - value3) * amount2 +
    (-value0 + 3 * value1 - 3 * value2 + value3) * amount3
  );
}

export function sampleHudSpectrogramRow(
  data,
  sourcePosition,
  destination
) {
  if (sourcePosition < 0 || !data || data.length === 0) {
    destination.fill(0);
    return;
  }

  const lastIndex = data.length - 1;
  const position = clamp(sourcePosition, 0, lastIndex);
  const index1 = Math.floor(position);
  const index2 = Math.min(lastIndex, index1 + 1);
  const index0 = Math.max(0, index1 - 1);
  const index3 = Math.min(lastIndex, index2 + 1);
  const amount = position - index1;
  const row0 = data[index0];
  const row1 = data[index1];
  const row2 = data[index2];
  const row3 = data[index3];

  for (let index = 0; index < destination.length; index++) {
    destination[index] = clamp(
      catmullRomHud(
        row0[index],
        row1[index],
        row2[index],
        row3[index],
        amount
      ),
      0,
      1
    );
  }
}

export function smoothHudFrequencyGraph(
  data,
  passes = 1,
  frameDurationSeconds = 1 / HUD_ANALYSIS_FRAMES_PER_SECOND
) {
  let result = data.map((row) => Float32Array.from(row));

  for (let pass = 0; pass < passes; pass++) {
    result = result.map((row) => {
      const next = new Float32Array(row.length);

      for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
        let weightedSum = row[columnIndex] * 6;
        let totalWeight = 6;

        for (let offset = -2; offset <= 2; offset++) {
          if (offset === 0) {
            continue;
          }

          const neighbor = clamp(
            columnIndex + offset,
            0,
            row.length - 1
          );
          const weight = 1 / (1 + Math.abs(offset) * 0.65);
          weightedSum += row[neighbor] * weight;
          totalWeight += weight;
        }

        next[columnIndex] = weightedSum / totalWeight;
      }

      return next;
    });
  }

  if (result.length <= 1) {
    return result;
  }

  const safeFrameDuration = Math.max(
    1 / 240,
    frameDurationSeconds
  );
  const attackAlpha =
    1 - Math.exp(-safeFrameDuration / (HUD_ATTACK_MS / 1000));
  const releaseAlpha =
    1 - Math.exp(-safeFrameDuration / (HUD_RELEASE_MS / 1000));
  const smoothed = result.map(
    (row) => new Float32Array(row.length)
  );

  smoothed[0].set(result[0]);

  for (let rowIndex = 1; rowIndex < result.length; rowIndex++) {
    const source = result[rowIndex];
    const previous = smoothed[rowIndex - 1];
    const destination = smoothed[rowIndex];

    for (
      let columnIndex = 0;
      columnIndex < source.length;
      columnIndex++
    ) {
      const alpha = source[columnIndex] >= previous[columnIndex]
        ? attackAlpha
        : releaseAlpha;

      destination[columnIndex] =
        previous[columnIndex] +
        (source[columnIndex] - previous[columnIndex]) * alpha;
    }
  }

  return smoothed;
}

export function computeHudFftMagnitudesAtTime(time, fftSize) {
  if (!runtime.decodedAudioBuffer) {
    return new Float32Array(0);
  }

  const size = Math.max(32, fftSize);
  const levels = Math.log2(size);

  if (!Number.isInteger(levels)) {
    throw new Error("FFT size must be a power of two.");
  }

  const real = new Float32Array(size);
  const imaginary = new Float32Array(size);
  const sampleRate = runtime.decodedAudioBuffer.sampleRate;
  const centerSample = Math.round(time * sampleRate);
  const startSample = centerSample - Math.floor(size / 2);

  function reverseBits(value, bitCount) {
    let reversed = 0;

    for (let bit = 0; bit < bitCount; bit++) {
      reversed = (reversed << 1) | (value & 1);
      value >>>= 1;
    }

    return reversed;
  }

  for (let index = 0; index < size; index++) {
    const position = startSample + index;
    const left = readDecodedSample(runtime.decodedAudioBuffer, 0, position);
    const right = runtime.decodedAudioBuffer.numberOfChannels > 1
      ? readDecodedSample(runtime.decodedAudioBuffer, 1, position)
      : left;
    const sample = (left + right) * 0.5;
    const windowValue =
      0.5 -
      0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, size - 1));

    real[reverseBits(index, levels)] = sample * windowValue;
  }

  for (let blockSize = 2; blockSize <= size; blockSize *= 2) {
    const halfBlock = blockSize / 2;
    const phaseStep = (-2 * Math.PI) / blockSize;

    for (
      let blockStart = 0;
      blockStart < size;
      blockStart += blockSize
    ) {
      for (let offset = 0; offset < halfBlock; offset++) {
        const angle = phaseStep * offset;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const evenIndex = blockStart + offset;
        const oddIndex = evenIndex + halfBlock;
        const oddReal =
          real[oddIndex] * cosine - imaginary[oddIndex] * sine;
        const oddImaginary =
          real[oddIndex] * sine + imaginary[oddIndex] * cosine;

        real[oddIndex] = real[evenIndex] - oddReal;
        imaginary[oddIndex] = imaginary[evenIndex] - oddImaginary;
        real[evenIndex] += oddReal;
        imaginary[evenIndex] += oddImaginary;
      }
    }
  }

  const magnitudes = new Float32Array(size / 2 + 1);

  for (let index = 0; index < magnitudes.length; index++) {
    magnitudes[index] = Math.hypot(real[index], imaginary[index]);
  }

  return magnitudes;
}

export function sampleHudMagnitudeAtFrequencyRaw(
  magnitudes,
  frequencyHz,
  sampleRate,
  fftSize
) {
  const maximumBin = magnitudes.length - 1;
  const binPosition = clamp(
    (frequencyHz * fftSize) / sampleRate,
    0,
    maximumBin
  );
  const lowerBin = Math.floor(binPosition);
  const upperBin = Math.min(maximumBin, lowerBin + 1);
  const amount = binPosition - lowerBin;

  return (
    magnitudes[lowerBin] +
    (magnitudes[upperBin] - magnitudes[lowerBin]) * amount
  );
}

export function ensureHudAudioBuffers() {
  if (
    !state.hudSpectrumBuffer ||
    state.hudSpectrumBuffer.length !== HUD_FREQUENCY_POINT_COUNT
  ) {
    state.hudSpectrumBuffer =
      new Float32Array(HUD_FREQUENCY_POINT_COUNT);
  }

  if (
    !state.hudSpectrumSmoothed ||
    state.hudSpectrumSmoothed.length !== HUD_FREQUENCY_POINT_COUNT
  ) {
    state.hudSpectrumSmoothed =
      new Float32Array(HUD_FREQUENCY_POINT_COUNT);
  }

  if (!state.hudWaveformBuffer || state.hudWaveformBuffer.length !== 128) {
    state.hudWaveformBuffer = new Float32Array(128);
  }
}

export function getHudSpectrumData() {
  ensureHudAudioBuffers();
  const source = state.hudSpectrumBuffer;
  const smoothed = state.hudSpectrumSmoothed;
  const data = state.frequencySpectrogramData;

  if (!data || data.length === 0 || !runtime.decodedAudioBuffer) {
    source.fill(0);
    smoothed.fill(0);
    return smoothed;
  }

  const analysisDuration =
    runtime.decodedAudioBuffer.duration || audio.duration;
  const playbackProgress =
    Number.isFinite(analysisDuration) && analysisDuration > 0
      ? clamp(
          hooks.currentHudPlaybackTime() / analysisDuration,
          0,
          1
        )
      : 0;
  const sourcePosition =
    playbackProgress * (data.length - 1);

  sampleHudSpectrogramRow(
    data,
    sourcePosition,
    source
  );

  let sourcePeak = 0;

  for (let index = 0; index < source.length; index++) {
    sourcePeak = Math.max(sourcePeak, source[index]);
  }

  if (sourcePeak > 1e-5) {
    for (let index = 0; index < source.length; index++) {
      source[index] /= sourcePeak;
    }
  } else {
    source.fill(0);
  }

  const smoothing = audio.paused ? 1 : 0.72;

  for (let index = 0; index < source.length; index++) {
    smoothed[index] +=
      (source[index] - smoothed[index]) * smoothing;
  }

  let smoothedPeak = 0;

  for (let index = 0; index < smoothed.length; index++) {
    smoothedPeak = Math.max(smoothedPeak, smoothed[index]);
  }

  if (smoothedPeak > 1e-5) {
    for (let index = 0; index < smoothed.length; index++) {
      smoothed[index] /= smoothedPeak;
    }
  }

  return smoothed;
}

export function getHudWaveformData() {
  ensureHudAudioBuffers();
  const destination = state.hudWaveformBuffer;
  const buffer = runtime.decodedAudioBuffer;

  if (!buffer || buffer.length === 0) {
    destination.fill(0);
    return destination;
  }

  const sampleRate = buffer.sampleRate;
  const centerSample = Math.round(
    clamp(hooks.currentHudPlaybackTime(), 0, buffer.duration) * sampleRate
  );
  const windowSamples = Math.min(
    buffer.length,
    Math.max(256, Math.round(sampleRate * 0.12))
  );
  const startSample = clamp(
    centerSample - Math.floor(windowSamples * 0.5),
    0,
    Math.max(0, buffer.length - windowSamples)
  );
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channelIndex) => buffer.getChannelData(channelIndex)
  );
  const samplesPerPoint = windowSamples / destination.length;

  for (let pointIndex = 0; pointIndex < destination.length; pointIndex++) {
    const pointStart = Math.floor(startSample + pointIndex * samplesPerPoint);
    const pointEnd = Math.min(
      buffer.length,
      Math.max(
        pointStart + 1,
        Math.floor(startSample + (pointIndex + 1) * samplesPerPoint)
      )
    );
    const step = Math.max(1, Math.floor((pointEnd - pointStart) / 10));
    let strongestSample = 0;

    for (
      let sampleIndex = pointStart;
      sampleIndex < pointEnd;
      sampleIndex += step
    ) {
      let mixedSample = 0;
      for (const channel of channels) {
        mixedSample += (channel[sampleIndex] || 0) / channels.length;
      }

      if (Math.abs(mixedSample) > Math.abs(strongestSample)) {
        strongestSample = mixedSample;
      }
    }

    destination[pointIndex] = clamp(strongestSample, -1, 1);
  }

  return destination;
}

export function getHudLevelData() {
  const level = state.hudLevel ||
    (state.hudLevel = { peak: 0, rms: 0, peakHold: 0 });
  const buffer = runtime.decodedAudioBuffer;

  if (!buffer || buffer.length === 0) {
    level.peak += (0 - level.peak) * 0.2;
    level.rms += (0 - level.rms) * 0.2;
    level.peakHold = Math.max(0, level.peakHold - 0.01);
    return level;
  }

  const sampleRate = buffer.sampleRate;
  const centerSample = Math.round(
    clamp(hooks.currentHudPlaybackTime(), 0, buffer.duration) * sampleRate
  );
  const windowSamples = Math.min(
    buffer.length,
    Math.max(256, Math.round(sampleRate * 0.08))
  );
  const startSample = clamp(
    centerSample - (windowSamples >> 1),
    0,
    Math.max(0, buffer.length - windowSamples)
  );
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channelIndex) => buffer.getChannelData(channelIndex)
  );
  const step = Math.max(1, Math.floor(windowSamples / 1024));
  let peak = 0;
  let sumSquares = 0;
  let count = 0;

  for (
    let sampleIndex = startSample;
    sampleIndex < startSample + windowSamples;
    sampleIndex += step
  ) {
    let mixed = 0;
    for (const channel of channels) {
      mixed += (channel[sampleIndex] || 0) / channels.length;
    }
    peak = Math.max(peak, Math.abs(mixed));
    sumSquares += mixed * mixed;
    count++;
  }

  const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
  const paused = audio.paused &&
    !Number.isFinite(state.exportPlaybackTimeOverride);
  level.peak +=
    (peak - level.peak) * (paused ? 1 : peak > level.peak ? 0.6 : 0.25);
  level.rms += (rms - level.rms) * (paused ? 1 : 0.3);

  if (peak >= level.peakHold) {
    level.peakHold = peak;
  } else if (!paused) {
    level.peakHold = Math.max(level.peak, level.peakHold - 0.012);
  }

  return level;
}

export function sampleHudMagnitudeAtFrequency(
  magnitudes,
  frequencyHz,
  sampleRate,
  fftSize
) {
  if (!magnitudes.length) {
    return 0;
  }

  const exactBin = (frequencyHz * fftSize) / sampleRate;
  const lower = clamp(Math.floor(exactBin), 0, magnitudes.length - 1);
  const upper = Math.min(magnitudes.length - 1, lower + 1);
  return THREE.MathUtils.lerp(
    magnitudes[lower] || 0,
    magnitudes[upper] || 0,
    clamp(exactBin - lower, 0, 1)
  );
}

export async function rebuildHudFrequencySpectrogram({
  onProgress = null,
  shouldCancel = null
} = {}) {
  if (!runtime.decodedAudioBuffer || runtime.decodedAudioBuffer.duration <= 0) {
    state.frequencySpectrogramData = null;
    state.hudSpectrumBuffer = null;
    state.hudSpectrumSmoothed = null;
    state.hudLiveFrequencyDb = null;
    return;
  }

  const duration = runtime.decodedAudioBuffer.duration;
  const fftSize = Math.max(32, state.fftSize);
  const maximumFrequency = Math.min(
    HUD_FREQUENCY_MAX_HZ,
    runtime.decodedAudioBuffer.sampleRate * 0.5
  );
  const frameCount = Math.min(
    HUD_MAX_ANALYSIS_FRAMES,
    Math.max(
      state.historyRows * 8,
      Math.round(
        duration * HUD_ANALYSIS_FRAMES_PER_SECOND
      )
    )
  );
  const rawRows = Array.from(
    { length: frameCount },
    () => new Float32Array(HUD_FREQUENCY_POINT_COUNT)
  );
  let graphMaximumDb = -Infinity;
  const yieldInterval =
    fftSize >= 16384 ? 2 :
    fftSize >= 8192 ? 4 :
    fftSize >= 4096 ? 8 :
    16;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    if (shouldCancel?.()) {
      throw new DOMException(
        "HUD analysis cancelled.",
        "AbortError"
      );
    }

    const progress = frameCount === 1
      ? 0
      : frameIndex / (frameCount - 1);
    const time = progress * duration;
    const magnitudes = computeHudFftMagnitudesAtTime(
      time,
      fftSize
    );
    const row = rawRows[frameIndex];

    for (
      let graphIndex = 0;
      graphIndex < HUD_FREQUENCY_POINT_COUNT;
      graphIndex++
    ) {
      const amount =
        graphIndex / (HUD_FREQUENCY_POINT_COUNT - 1);
      const frequencyHz =
        HUD_FREQUENCY_MIN_HZ *
        Math.pow(
          Math.max(
            HUD_FREQUENCY_MIN_HZ,
            maximumFrequency
          ) / HUD_FREQUENCY_MIN_HZ,
          amount
        );
      const magnitude = sampleHudMagnitudeAtFrequencyRaw(
        magnitudes,
        frequencyHz,
        runtime.decodedAudioBuffer.sampleRate,
        fftSize
      );
      const db = 20 * Math.log10(
        Math.max(magnitude, 1e-12)
      );

      row[graphIndex] = db;
      graphMaximumDb = Math.max(graphMaximumDb, db);
    }

    const completed = frameIndex + 1;

    if (
      completed === frameCount ||
      completed % yieldInterval === 0
    ) {
      onProgress?.(completed / frameCount);
      await new Promise((resolve) => {
        window.setTimeout(resolve, 0);
      });
    }
  }

  if (shouldCancel?.()) {
    throw new DOMException(
      "HUD analysis cancelled.",
      "AbortError"
    );
  }

  const dynamicRangeDb =
    HUD_FREQUENCY_DB_MAX - HUD_FREQUENCY_DB_MIN;
  const silenceThresholdDb =
    graphMaximumDb - HUD_MIN_DB_RANGE;
  const normalizedRows = rawRows.map((row) => {
    const normalized =
      new Float32Array(HUD_FREQUENCY_POINT_COUNT);
    let rowPeakDb = -Infinity;

    for (let index = 0; index < row.length; index++) {
      rowPeakDb = Math.max(rowPeakDb, row[index]);
    }

    if (
      !Number.isFinite(rowPeakDb) ||
      rowPeakDb <= silenceThresholdDb
    ) {
      return normalized;
    }

    const rowFloorDb = rowPeakDb - dynamicRangeDb;

    for (let index = 0; index < row.length; index++) {
      normalized[index] = clamp(
        (row[index] - rowFloorDb) / dynamicRangeDb,
        0,
        1
      );
    }

    return normalized;
  });

  const frameDuration =
    duration / Math.max(1, frameCount - 1);

  state.frequencySpectrogramData =
    smoothHudFrequencyGraph(
      normalizedRows,
      1,
      frameDuration
    );
  state.hudSpectrumBuffer = null;
  state.hudSpectrumSmoothed = null;
  state.hudLiveFrequencyDb = null;
  state.hudWaveformBuffer = null;
  state.hudLevel = null;
}
