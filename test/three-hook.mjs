// Node module-resolution hook: routes "three" imports in the app to the
// test wrapper (stubbed WebGLRenderer), and the wrapper itself to real three.
import { pathToFileURL } from 'url';

const ROOT = new URL('..', import.meta.url);
const REAL_THREE = new URL('node_modules/three/build/three.module.js', ROOT).href;
const REAL_ORBIT = new URL('node_modules/three/examples/jsm/controls/OrbitControls.js', ROOT).href;
const WRAPPER = new URL('three-wrapper.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    if (context.parentURL === WRAPPER || (context.parentURL || '').includes('/node_modules/three/')) {
      return { url: REAL_THREE, shortCircuit: true };
    }
    return { url: WRAPPER, shortCircuit: true };
  }
  if (specifier === 'three/addons/controls/OrbitControls.js') {
    return { url: REAL_ORBIT, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
