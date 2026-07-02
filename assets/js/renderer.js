// renderer.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// Terrain geometry, materials, colormap shader, matrices, lighting, scene render.
import * as THREE from "three";
import { AMPLITUDE_COLORMAPS, COLORMAP_INDEX, DISTANCE_SPACING_EXPANSION } from "./config.js";
import { ambientLight, colormapColorA, colormapColorB, dummy, fillLight, fpsCounter, keyLight, renderer, runtime, state, waveformGroup } from "./core.js";
import { clamp } from "./utils.js";

// Precomputed 256-entry lookup tables per colormap (perf: replaces per-instance
// per-frame gradient-stop search + THREE.Color lerp with a single indexed read).
const COLORMAP_LUT_SIZE = 256;
const colormapLutCache = new Map();

function sampleAmplitudeColormapExact(name, amount, target) {
  const stops = AMPLITUDE_COLORMAPS[name];

  if (!stops) {
    return target.set(state.peakColor);
  }

  const t = clamp(amount, 0, 1);

  for (let index = 0; index < stops.length - 1; index++) {
    const current = stops[index];
    const next = stops[index + 1];

    if (t <= next[0]) {
      const range = Math.max(0.000001, next[0] - current[0]);
      const localT = (t - current[0]) / range;

      colormapColorA.set(current[1]);
      colormapColorB.set(next[1]);

      return target.copy(colormapColorA).lerp(
        colormapColorB,
        clamp(localT, 0, 1)
      );
    }
  }

  return target.set(stops[stops.length - 1][1]);
}

function getColormapLut(name) {
  let lut = colormapLutCache.get(name);

  if (!lut) {
    lut = new Float32Array(COLORMAP_LUT_SIZE * 3);
    const scratch = colormapColorA.clone();

    for (let index = 0; index < COLORMAP_LUT_SIZE; index++) {
      sampleAmplitudeColormapExact(
        name,
        index / (COLORMAP_LUT_SIZE - 1),
        scratch
      );
      lut[index * 3] = scratch.r;
      lut[index * 3 + 1] = scratch.g;
      lut[index * 3 + 2] = scratch.b;
    }
    colormapLutCache.set(name, lut);
  }
  return lut;
}

export function sampleAmplitudeColormap(name, amount, target) {
  if (!AMPLITUDE_COLORMAPS[name]) {
    // "custom" and unknown names fall through to the peak color, which is
    // user-editable at runtime and therefore must not be baked into a LUT.
    return target.set(state.peakColor);
  }

  const lut = getColormapLut(name);
  const t = clamp(amount, 0, 1) * (COLORMAP_LUT_SIZE - 1);
  const index = t | 0;
  const frac = t - index;
  const a = index * 3;
  const b = Math.min(index + 1, COLORMAP_LUT_SIZE - 1) * 3;

  return target.setRGB(
    lut[a] + (lut[b] - lut[a]) * frac,
    lut[a + 1] + (lut[b + 1] - lut[a + 1]) * frac,
    lut[a + 2] + (lut[b + 2] - lut[a + 2]) * frac
  );
}

export function createGradientUniforms(baseColor) {
  return {
    uEnvelopeBaseColor: {
      value: new THREE.Color(baseColor)
    },
    uEnvelopePeakColor: {
      value: new THREE.Color(state.peakColor)
    },
    uEnvelopeBackgroundColor: {
      value: new THREE.Color(state.backgroundColor)
    },
    uEnvelopeMaximumHeight: {
      value: Math.max(0.0001, state.maxHeight)
    },
    uEnvelopeFadeBrightness: {
      value: 1
    },
    uEnvelopeAmplitudeColor: {
      value: state.amplitudeColor ? 1 : 0
    },
    uEnvelopeColormap: {
      value: COLORMAP_INDEX[state.amplitudeColormap] ?? 0
    },
    uEnvelopeColormapSensitivity: {
      value: state.colormapSensitivity
    },
    uEnvelopeReverseColormap: {
      value: state.reverseColormap ? 1 : 0
    }
  };
}

export function installVerticalColormapShader(material, baseColor) {
  const uniforms = createGradientUniforms(baseColor);
  material.userData.verticalColormapUniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = `
      varying float vEnvelopeWorldHeight;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `
        #include <project_vertex>

        vec4 envelopeInstancePosition = vec4(position, 1.0);

        #ifdef USE_INSTANCING
          envelopeInstancePosition =
            instanceMatrix * envelopeInstancePosition;
        #endif

        vEnvelopeWorldHeight = abs(
          (modelMatrix * envelopeInstancePosition).y
        );
      `
    );

    shader.fragmentShader = `
      varying float vEnvelopeWorldHeight;

      uniform vec3 uEnvelopeBaseColor;
      uniform vec3 uEnvelopePeakColor;
      uniform vec3 uEnvelopeBackgroundColor;
      uniform float uEnvelopeMaximumHeight;
      uniform float uEnvelopeFadeBrightness;
      uniform float uEnvelopeAmplitudeColor;
      uniform int uEnvelopeColormap;
      uniform float uEnvelopeColormapSensitivity;
      uniform float uEnvelopeReverseColormap;

      vec3 envelopeMapFive(
        float t,
        vec3 c0,
        vec3 c1,
        vec3 c2,
        vec3 c3,
        vec3 c4
      ) {
        if (t <= 0.25) {
          return mix(c0, c1, t / 0.25);
        }

        if (t <= 0.50) {
          return mix(c1, c2, (t - 0.25) / 0.25);
        }

        if (t <= 0.75) {
          return mix(c2, c3, (t - 0.50) / 0.25);
        }

        return mix(c3, c4, (t - 0.75) / 0.25);
      }

      vec3 envelopeMapSix(
        float t,
        vec3 c0,
        vec3 c1,
        vec3 c2,
        vec3 c3,
        vec3 c4,
        vec3 c5
      ) {
        if (t <= 0.20) {
          return mix(c0, c1, t / 0.20);
        }

        if (t <= 0.40) {
          return mix(c1, c2, (t - 0.20) / 0.20);
        }

        if (t <= 0.60) {
          return mix(c2, c3, (t - 0.40) / 0.20);
        }

        if (t <= 0.80) {
          return mix(c3, c4, (t - 0.60) / 0.20);
        }

        return mix(c4, c5, (t - 0.80) / 0.20);
      }

      vec3 envelopeSampleColormap(float t) {
        t = clamp(
          t * max(uEnvelopeColormapSensitivity, 0.0001),
          0.0,
          1.0
        );

        if (uEnvelopeReverseColormap > 0.5) {
          t = 1.0 - t;
        }

        if (uEnvelopeAmplitudeColor < 0.5) {
          return uEnvelopeBaseColor;
        }

        if (uEnvelopeColormap == 0) {
          return mix(
            uEnvelopeBaseColor,
            uEnvelopePeakColor,
            t
          );
        }

        if (uEnvelopeColormap == 1) {
          return envelopeMapFive(
            t,
            vec3(0.2667, 0.0039, 0.3294),
            vec3(0.2314, 0.3216, 0.5451),
            vec3(0.1294, 0.5686, 0.5490),
            vec3(0.3686, 0.7882, 0.3843),
            vec3(0.9922, 0.9059, 0.1451)
          );
        }

        if (uEnvelopeColormap == 2) {
          return envelopeMapFive(
            t,
            vec3(0.0510, 0.0314, 0.5294),
            vec3(0.4941, 0.0118, 0.6588),
            vec3(0.8000, 0.2784, 0.4706),
            vec3(0.9725, 0.5843, 0.2510),
            vec3(0.9412, 0.9765, 0.1294)
          );
        }

        if (uEnvelopeColormap == 3) {
          return envelopeMapFive(
            t,
            vec3(0.0000, 0.0000, 0.0157),
            vec3(0.2588, 0.0392, 0.4078),
            vec3(0.5765, 0.1490, 0.4039),
            vec3(0.8667, 0.3176, 0.2275),
            vec3(0.9882, 1.0000, 0.6431)
          );
        }

        if (uEnvelopeColormap == 4) {
          return envelopeMapFive(
            t,
            vec3(0.0000, 0.0000, 0.0157),
            vec3(0.2314, 0.0588, 0.4392),
            vec3(0.5490, 0.1608, 0.5059),
            vec3(0.8706, 0.2863, 0.4078),
            vec3(0.9882, 0.9922, 0.7490)
          );
        }

        if (uEnvelopeColormap == 5) {
          return envelopeMapSix(
            t,
            vec3(0.1882, 0.0706, 0.2314),
            vec3(0.2745, 0.4196, 0.8902),
            vec3(0.1059, 0.8118, 0.8314),
            vec3(0.3804, 0.9882, 0.4235),
            vec3(0.9765, 0.7294, 0.2196),
            vec3(0.4784, 0.0157, 0.0118)
          );
        }

        if (uEnvelopeColormap == 6) {
          return envelopeMapFive(
            t,
            vec3(0.2314, 0.2980, 0.7529),
            vec3(0.5529, 0.6902, 0.9961),
            vec3(0.8667, 0.8667, 0.8667),
            vec3(0.9569, 0.5961, 0.4784),
            vec3(0.7059, 0.0157, 0.1490)
          );
        }

        if (uEnvelopeColormap == 7) {
          return mix(
            vec3(0.0627),
            vec3(1.0),
            t
          );
        }

        if (uEnvelopeColormap == 8) {
          return envelopeMapFive(
            t,
            vec3(0.0000, 0.1333, 0.3059),
            vec3(0.2627, 0.3059, 0.4235),
            vec3(0.4902, 0.4863, 0.4706),
            vec3(0.7373, 0.6824, 0.4235),
            vec3(0.9961, 0.9098, 0.2196)
          );
        }

        if (uEnvelopeColormap == 9) {
          return envelopeMapFive(
            t,
            vec3(0.0000, 0.0000, 0.0000),
            vec3(0.0863, 0.2392, 0.3059),
            vec3(0.6275, 0.4745, 0.2863),
            vec3(0.7804, 0.7020, 0.9294),
            vec3(1.0000, 1.0000, 1.0000)
          );
        }

        if (uEnvelopeColormap == 10) {
          return envelopeMapFive(
            t,
            vec3(0.6196, 0.0039, 0.2588),
            vec3(0.9569, 0.4275, 0.2627),
            vec3(1.0000, 1.0000, 0.7490),
            vec3(0.4000, 0.7608, 0.6471),
            vec3(0.3686, 0.3098, 0.6353)
          );
        }

        if (uEnvelopeColormap == 11) {
          return envelopeMapSix(
            t,
            vec3(0.4314, 0.2510, 0.6667),
            vec3(0.1843, 0.4902, 0.8824),
            vec3(0.1255, 0.7882, 0.5922),
            vec3(0.6588, 0.8824, 0.0471),
            vec3(1.0000, 0.6235, 0.1098),
            vec3(0.8431, 0.0980, 0.1098)
          );
        }

        if (uEnvelopeColormap == 12) {
          return envelopeMapFive(
            t,
            vec3(0.0000, 0.0706, 0.0980),
            vec3(0.0000, 0.3725, 0.4510),
            vec3(0.0392, 0.5765, 0.5882),
            vec3(0.5804, 0.8235, 0.7412),
            vec3(0.9137, 0.8471, 0.6510)
          );
        }

        if (uEnvelopeColormap == 13) {
          return envelopeMapFive(
            t,
            vec3(0.0353, 0.0000, 0.0000),
            vec3(0.4196, 0.0000, 0.0000),
            vec3(0.8431, 0.1882, 0.0000),
            vec3(1.0000, 0.6157, 0.0000),
            vec3(1.0000, 0.9686, 0.6980)
          );
        }

        if (uEnvelopeColormap == 14) {
          return envelopeMapFive(
            t,
            vec3(0.0078, 0.0000, 0.1412),
            vec3(0.0000, 0.2471, 0.5333),
            vec3(0.0000, 0.7059, 0.8471),
            vec3(0.5647, 0.8784, 0.9373),
            vec3(1.0000, 1.0000, 1.0000)
          );
        }

        if (uEnvelopeColormap == 15) {
          return envelopeMapFive(
            t,
            vec3(0.1686, 0.0627, 0.3333),
            vec3(0.4157, 0.0196, 0.4471),
            vec3(0.7882, 0.0941, 0.2902),
            vec3(1.0000, 0.4824, 0.0000),
            vec3(1.0000, 0.8196, 0.4000)
          );
        }

        if (uEnvelopeColormap == 16) {
          return envelopeMapFive(
            t,
            vec3(0.0275, 0.1020, 0.0471),
            vec3(0.0706, 0.3059, 0.1647),
            vec3(0.1765, 0.4902, 0.2745),
            vec3(0.4549, 0.7647, 0.3961),
            vec3(0.9098, 0.9608, 0.7098)
          );
        }

        if (uEnvelopeColormap == 17) {
          return envelopeMapFive(
            t,
            vec3(0.0706, 0.0000, 0.1843),
            vec3(0.4353, 0.0000, 1.0000),
            vec3(1.0000, 0.0000, 0.7843),
            vec3(0.0000, 0.9608, 1.0000),
            vec3(0.8431, 1.0000, 0.0000)
          );
        }

        if (uEnvelopeColormap == 18) {
          return envelopeMapFive(
            t,
            vec3(0.0000, 0.0000, 0.0000),
            vec3(0.1412, 0.2039, 0.2784),
            vec3(0.4353, 0.4980, 0.5020),
            vec3(0.7255, 0.7804, 0.7608),
            vec3(1.0000, 1.0000, 1.0000)
          );
        }

        if (uEnvelopeColormap == 19) {
          return envelopeMapSix(
            t,
            vec3(0.0000, 0.0000, 0.0000),
            vec3(0.0000, 0.0000, 0.8000),
            vec3(0.6000, 0.0000, 0.8000),
            vec3(0.9020, 0.0000, 0.3333),
            vec3(1.0000, 0.6000, 0.0000),
            vec3(1.0000, 1.0000, 0.9020)
          );
        }

        if (uEnvelopeColormap == 20) {
          return envelopeMapSix(
            t,
            vec3(0.1843, 0.0784, 0.2196),
            vec3(0.2392, 0.2980, 0.6039),
            vec3(0.6078, 0.7176, 0.7882),
            vec3(0.8863, 0.8510, 0.8353),
            vec3(0.7843, 0.6039, 0.6157),
            vec3(0.4824, 0.2000, 0.3725)
          );
        }

        if (uEnvelopeColormap == 21) {
          return envelopeMapFive(
            t,
            vec3(0.0000, 0.0000, 0.0000),
            vec3(0.3961, 0.0000, 0.0000),
            vec3(0.8314, 0.0000, 0.0000),
            vec3(1.0000, 0.6902, 0.0000),
            vec3(1.0000, 1.0000, 1.0000)
          );
        }

        if (uEnvelopeColormap == 22) {
          return mix(
            vec3(0.0000, 1.0000, 1.0000),
            vec3(1.0000, 0.0000, 1.0000),
            t
          );
        }

        if (uEnvelopeColormap == 23) {
          if (t <= 0.33) {
            return mix(
              vec3(0.0431, 0.0000, 0.0000),
              vec3(1.0000, 0.0000, 0.0000),
              t / 0.33
            );
          }

          if (t <= 0.66) {
            return mix(
              vec3(1.0000, 0.0000, 0.0000),
              vec3(1.0000, 1.0000, 0.0000),
              (t - 0.33) / 0.33
            );
          }

          return mix(
            vec3(1.0000, 1.0000, 0.0000),
            vec3(1.0000, 1.0000, 1.0000),
            (t - 0.66) / 0.34
          );
        }

        if (uEnvelopeColormap == 24) {
          if (t <= 0.17) {
            return mix(
              vec3(0.0000, 0.0000, 0.5020),
              vec3(0.0000, 0.0000, 1.0000),
              t / 0.17
            );
          }

          if (t <= 0.35) {
            return mix(
              vec3(0.0000, 0.0000, 1.0000),
              vec3(0.0000, 1.0000, 1.0000),
              (t - 0.17) / 0.18
            );
          }

          if (t <= 0.50) {
            return mix(
              vec3(0.0000, 1.0000, 1.0000),
              vec3(0.4980, 1.0000, 0.4980),
              (t - 0.35) / 0.15
            );
          }

          if (t <= 0.65) {
            return mix(
              vec3(0.4980, 1.0000, 0.4980),
              vec3(1.0000, 1.0000, 0.0000),
              (t - 0.50) / 0.15
            );
          }

          if (t <= 0.83) {
            return mix(
              vec3(1.0000, 1.0000, 0.0000),
              vec3(1.0000, 0.0000, 0.0000),
              (t - 0.65) / 0.18
            );
          }

          return mix(
            vec3(1.0000, 0.0000, 0.0000),
            vec3(0.5020, 0.0000, 0.0000),
            (t - 0.83) / 0.17
          );
        }

        if (uEnvelopeColormap == 25) {
          return envelopeMapSix(
            t,
            vec3(0.2000, 0.2000, 0.6000),
            vec3(0.0000, 0.4510, 0.9020),
            vec3(0.1608, 0.6392, 0.1608),
            vec3(0.7216, 0.7020, 0.3529),
            vec3(0.5490, 0.3843, 0.2235),
            vec3(1.0000, 1.0000, 1.0000)
          );
        }

        if (uEnvelopeColormap == 26) {
          return envelopeMapFive(
            t,
            vec3(0.0000, 0.0000, 0.0000),
            vec3(0.3020, 0.1882, 0.1490),
            vec3(0.6039, 0.3765, 0.2980),
            vec3(0.9059, 0.5647, 0.4471),
            vec3(1.0000, 0.7804, 0.4980)
          );
        }

        if (uEnvelopeColormap == 27) {
          return mix(
            vec3(1.0000, 0.0000, 1.0000),
            vec3(1.0000, 1.0000, 0.0000),
            t
          );
        }

        if (uEnvelopeColormap == 28) {
          return mix(
            vec3(1.0000, 0.0000, 0.0000),
            vec3(1.0000, 1.0000, 0.0000),
            t
          );
        }

        if (uEnvelopeColormap == 29) {
          return mix(
            vec3(0.0000, 0.0000, 1.0000),
            vec3(0.0000, 1.0000, 0.5020),
            t
          );
        }

        return uEnvelopeBaseColor;
      }
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "vec4 diffuseColor = vec4( diffuse, opacity );",
      `
        float envelopeVerticalAmount = clamp(
          vEnvelopeWorldHeight /
            max(uEnvelopeMaximumHeight, 0.0001),
          0.0,
          1.0
        );

        vec3 envelopeColor = envelopeSampleColormap(
          envelopeVerticalAmount
        );

        envelopeColor = mix(
          uEnvelopeBackgroundColor,
          envelopeColor,
          uEnvelopeFadeBrightness
        );

        vec4 diffuseColor = vec4(
          envelopeColor,
          opacity
        );
      `
    );

    material.userData.compiledShader = shader;
  };

  material.customProgramCacheKey = () => [
    "vertical-envelope-colormap-v3",
    state.materialType
  ].join(":");

  return material;
}

export function createCubeMaterial(baseColor) {
  const common = {
    color: 0xffffff,
    side: THREE.FrontSide
  };

  let material;

  switch (state.materialType) {
    case "physical":
      material = new THREE.MeshPhysicalMaterial({
        ...common,
        roughness: state.roughness,
        metalness: state.metalness,
        clearcoat: state.clearcoat,
        clearcoatRoughness: state.clearcoatRoughness
      });
      break;

    case "phong":
      material = new THREE.MeshPhongMaterial({
        ...common,
        shininess: state.shininess,
        specular: 0xffffff
      });
      break;

    case "lambert":
      material = new THREE.MeshLambertMaterial(common);
      break;

    case "toon":
      material = new THREE.MeshToonMaterial(common);
      break;

    case "basic":
      material = new THREE.MeshBasicMaterial({
        ...common,
        toneMapped: false,
        fog: true
      });
      break;

    case "standard":
    default:
      material = new THREE.MeshStandardMaterial({
        ...common,
        roughness: state.roughness,
        metalness: state.metalness
      });
      break;
  }

  return installVerticalColormapShader(
    material,
    baseColor
  );
}

export function disposeWaveformMeshes() {
  for (const mesh of [...runtime.upperRowMeshes, ...runtime.undersideRowMeshes]) {
    waveformGroup.remove(mesh);
    mesh.material.dispose();
  }

  runtime.upperRowMeshes = [];
  runtime.undersideRowMeshes = [];

  if (runtime.waveformGeometry) {
    runtime.waveformGeometry.dispose();
    runtime.waveformGeometry = null;
  }
}

export function resetHistoryStorage() {
  runtime.historyData = new Float32Array(state.count * state.historyRows);
  runtime.smoothedSamples = new Float32Array(state.count);
  runtime.historyHead = 0;
  runtime.historyCount = 0;
  runtime.matrixDirty = true;
}

export function configureRowMesh(mesh) {
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = state.shadows;
  mesh.receiveShadow = state.shadows;
  mesh.frustumCulled = false;
  waveformGroup.add(mesh);
}

export function rebuildWaveform() {
  disposeWaveformMeshes();

  runtime.waveformGeometry = new THREE.BoxGeometry(1, 1, 1);

  for (let age = 0; age < state.historyRows; age++) {
    const upperMesh = new THREE.InstancedMesh(
      runtime.waveformGeometry,
      createCubeMaterial(state.cubeColor),
      state.count
    );

    const undersideMesh = new THREE.InstancedMesh(
      runtime.waveformGeometry,
      createCubeMaterial(state.undersideColor),
      state.count
    );

    configureRowMesh(upperMesh);
    configureRowMesh(undersideMesh);

    runtime.upperRowMeshes.push(upperMesh);
    runtime.undersideRowMeshes.push(undersideMesh);
  }

  resetHistoryStorage();
  updateMatrices();
}

export function updateMaterialProperties() {
  const meshes = [...runtime.upperRowMeshes, ...runtime.undersideRowMeshes];

  for (const mesh of meshes) {
    const material = mesh.material;

    if ("roughness" in material) {
      material.roughness = state.roughness;
    }

    if ("metalness" in material) {
      material.metalness = state.metalness;
    }

    if ("clearcoat" in material) {
      material.clearcoat = state.clearcoat;
    }

    if ("clearcoatRoughness" in material) {
      material.clearcoatRoughness = state.clearcoatRoughness;
    }

    if ("shininess" in material) {
      material.shininess = state.shininess;
    }

    material.needsUpdate = true;
  }

  runtime.matrixDirty = true;
}

export function clearHistory(showBlankGrid = false) {
  runtime.forceBlankHistoryGrid = Boolean(showBlankGrid);
  resetHistoryStorage();
  updateMatrices();
}

export function getHistoryValue(age, sampleIndex) {
  if (age >= runtime.historyCount) {
    return 0;
  }

  const rowIndex = (runtime.historyHead + age) % state.historyRows;
  return runtime.historyData[rowIndex * state.count + sampleIndex];
}

export function calculateFade(age) {
  const normalizedAge = state.historyRows <= 1
    ? 0
    : age / (state.historyRows - 1);

  const denominator = Math.max(0.0001, 1 - state.fadeStart);
  const fadeProgress = clamp(
    (normalizedAge - state.fadeStart) / denominator,
    0,
    1
  );

  const curved = Math.pow(fadeProgress, state.fadeCurve);
  const brightness = THREE.MathUtils.lerp(
    1,
    state.minimumBrightness,
    curved
  );

  const scale = 1 - curved * state.scaleFade;

  return { brightness, scale };
}

export function updateMaterialGradientUniforms(
  material,
  baseColor,
  fade
) {
  const uniforms =
    material.userData.verticalColormapUniforms;

  if (!uniforms) {
    return;
  }

  uniforms.uEnvelopeBaseColor.value.set(baseColor);
  uniforms.uEnvelopePeakColor.value.set(state.peakColor);
  uniforms.uEnvelopeBackgroundColor.value.set(
    state.backgroundColor
  );
  uniforms.uEnvelopeMaximumHeight.value = Math.max(
    0.0001,
    state.maxHeight
  );
  uniforms.uEnvelopeFadeBrightness.value = fade.brightness;
  uniforms.uEnvelopeAmplitudeColor.value =
    state.amplitudeColor ? 1 : 0;
  uniforms.uEnvelopeColormap.value =
    COLORMAP_INDEX[state.amplitudeColormap] ?? 0;
  uniforms.uEnvelopeColormapSensitivity.value =
    state.colormapSensitivity;
  uniforms.uEnvelopeReverseColormap.value =
    state.reverseColormap ? 1 : 0;
}

export function updateRowVerticalColors(age, fade) {
  const upperMesh = runtime.upperRowMeshes[age];
  const undersideMesh = runtime.undersideRowMeshes[age];

  if (!upperMesh || !undersideMesh) {
    return;
  }

  updateMaterialGradientUniforms(
    upperMesh.material,
    state.cubeColor,
    fade
  );

  updateMaterialGradientUniforms(
    undersideMesh.material,
    state.undersideColor,
    fade
  );
}

export function setHiddenInstance(mesh, instanceIndex, z) {
  dummy.position.set(0, 0, z);
  dummy.scale.set(0.0001, 0.0001, 0.0001);
  dummy.rotation.set(0, 0, 0);
  dummy.updateMatrix();
  mesh.setMatrixAt(instanceIndex, dummy.matrix);
}

export function getProgressiveHorizontalPosition(sampleIndex, age) {
  const centerIndex = (state.count - 1) / 2;
  const centeredIndex = sampleIndex - centerIndex;
  const maximumAge = Math.max(1, state.historyRows - 1);
  const normalizedDepth = age / maximumAge;
  const horizontalSpacing =
    (state.size + state.gap) *
    (1 + DISTANCE_SPACING_EXPANSION * normalizedDepth);

  return centeredIndex * horizontalSpacing;
}

export function getProgressiveDepthPosition(age) {
  const maximumAge = Math.max(1, state.historyRows - 1);
  const normalizedDistance = age / maximumAge;

  return -age * state.rowSpacing *
    (1 + DISTANCE_SPACING_EXPANSION * normalizedDistance);
}

export function getHistoryBackZ() {
  return getProgressiveDepthPosition(
    Math.max(0, state.historyRows - 1)
  );
}

export function getHistoryDepthCenter() {
  return getHistoryBackZ() / 2;
}

export function updateMatrices() {
  if (
    runtime.upperRowMeshes.length !== state.historyRows ||
    runtime.undersideRowMeshes.length !== state.historyRows ||
    !runtime.matrixDirty
  ) {
    return;
  }

  const frequencyMode =
    state.analysisMode === "frequency";

  for (let age = 0; age < state.historyRows; age++) {
    const upperMesh = runtime.upperRowMeshes[age];
    const undersideMesh = runtime.undersideRowMeshes[age];
    const z = getProgressiveDepthPosition(age);
    const fade = calculateFade(age);

    upperMesh.visible = true;
    undersideMesh.visible = !frequencyMode;

    updateRowVerticalColors(age, fade);

    for (let sampleIndex = 0; sampleIndex < state.count; sampleIndex++) {
      const sample = age >= runtime.historyCount
        ? 0
        : getHistoryValue(age, sampleIndex);
      const magnitude = Math.abs(sample);
      const x = getProgressiveHorizontalPosition(sampleIndex, age);

      const height = Math.max(
        state.minimumHeight,
        magnitude * state.maxHeight
      );

      const horizontalScale = state.size * fade.scale;
      const depthScale = state.cubeDepth * fade.scale;
      const yScale = height * fade.scale;

      if (frequencyMode) {
        // Traditional 3D spectrogram:
        // X = frequency, Z = time/history, Y = magnitude.
        // Anchor each frequency bar to the single Y=0 baseline.
        dummy.position.set(x, yScale / 2, z);
        dummy.scale.set(
          horizontalScale,
          yScale,
          depthScale
        );
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        upperMesh.setMatrixAt(sampleIndex, dummy.matrix);

        setHiddenInstance(
          undersideMesh,
          sampleIndex,
          z
        );
      } else {
        // Preserve the existing mirrored waveform-envelope mode.
        // Center both mirrored blocks on the shared Y=0 seam using
        // their final faded height so no vertical gap can appear.
        const verticalCenter = yScale / 2;

        dummy.position.set(x, verticalCenter, z);
        dummy.scale.set(
          horizontalScale,
          yScale,
          depthScale
        );
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        upperMesh.setMatrixAt(sampleIndex, dummy.matrix);

        dummy.position.set(x, -verticalCenter, z);
        dummy.updateMatrix();
        undersideMesh.setMatrixAt(sampleIndex, dummy.matrix);
      }
    }

    upperMesh.instanceMatrix.needsUpdate = true;
    undersideMesh.instanceMatrix.needsUpdate = true;
  }

  runtime.matrixDirty = false;
}

export function updateLighting() {
  ambientLight.intensity = state.ambientIntensity;
  keyLight.intensity = state.keyIntensity;
  fillLight.intensity = state.fillIntensity;
  keyLight.color.set(state.keyLightColor);
  fillLight.color.set(state.fillLightColor);

  const azimuth = THREE.MathUtils.degToRad(state.lightAzimuth);
  const elevation = THREE.MathUtils.degToRad(state.lightElevation);
  const radius = 125;

  keyLight.position.set(
    Math.cos(elevation) * Math.sin(azimuth) * radius,
    Math.sin(elevation) * radius,
    Math.cos(elevation) * Math.cos(azimuth) * radius
  );

  keyLight.target.position.set(
    0,
    0,
    getHistoryBackZ() * 0.45
  );

  renderer.toneMappingExposure = state.exposure;
  renderer.shadowMap.enabled = state.shadows;
  keyLight.castShadow = state.shadows;

  for (const mesh of [...runtime.upperRowMeshes, ...runtime.undersideRowMeshes]) {
    mesh.castShadow = state.shadows;
    mesh.receiveShadow = state.shadows;
  }

  const resolution = Number(state.shadowResolution);
  keyLight.shadow.mapSize.set(resolution, resolution);

  if (keyLight.shadow.map) {
    keyLight.shadow.map.dispose();
    keyLight.shadow.map = null;
  }
}

export function updateFps(now) {
  runtime.fpsFrames++;

  const elapsed = now - runtime.fpsLastUpdate;

  if (elapsed >= 500) {
    runtime.displayedFps = Math.round((runtime.fpsFrames * 1000) / elapsed);
    fpsCounter.textContent = `FPS ${runtime.displayedFps}`;

    runtime.fpsFrames = 0;
    runtime.fpsLastUpdate = now;
  }
}
