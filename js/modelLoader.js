import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export async function loadModel(scene, modelPath = './models/avatar.gltf') {
  return new Promise((resolve, reject) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./libs/three/examples/jsm/libs/draco/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    const loadingEl = createLoadingIndicator();

    const timeout = setTimeout(() => {
      console.warn('Model loading timeout - showing placeholder');
      loadingEl.remove();
      resolve(createPlaceholder(scene));
    }, 60000);

    loader.load(
      modelPath,
      (gltf) => {
        clearTimeout(timeout);
        loadingEl.remove();
        const model = gltf.scene;

        // OK Get raw size first before any scaling
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());

        console.log('Raw model size:', size);

        // OK Auto detect unit scale
        // If model height is > 3 it is likely in cm, scale to meters
        const targetHeight = 1.75; // average human height in meters
        const currentHeight = size.y;
        const scaleFactor = targetHeight / currentHeight;

        console.log('Scale factor applied:', scaleFactor);

        model.scale.setScalar(scaleFactor);

        // OK Recalculate box after scaling
        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());

        console.log('Scaled model size:', scaledSize);

        // OK Place feet at y=0
        model.position.y = -scaledBox.min.y;

        console.log('Feet position (min.y):', scaledBox.min.y);
        console.log('Model placed at y:', model.position.y);

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              // Ensure material is visible
              if (!child.material.color) {
                child.material.color = new THREE.Color(0xffccaa); // skin tone
              }
              child.material.envMapIntensity = 0.8;
              child.material.needsUpdate = true;
            } else {
              // Add a basic material if missing
              child.material = new THREE.MeshStandardMaterial({
                color: 0xffccaa,
                roughness: 0.5,
                metalness: 0.0
              });
            }
          }
        });

        scene.add(model);

        const morphTargets = extractMorphTargets(model);
        const bones = extractBones(model);

        // Enhanced morph target debug output
        logMorphTargets(model, morphTargets);
        console.log('Bones found:', Object.keys(bones));

        const mixer = new THREE.AnimationMixer(model);
        const clips = gltf.animations;

        console.log('Animations found:', clips.map(c => c.name));

        resolve({ model, mixer, clips, morphTargets, bones });
      },
      (progress) => {
        if (progress.total > 0) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          loadingEl.textContent = `Loading model... ${pct}%`;
        }
      },
      (error) => {
        clearTimeout(timeout);
        loadingEl.remove();
        console.error('Model load error:', error);
        const placeholder = createPlaceholder(scene);
        resolve(placeholder);
      }
    );
  });
}

function extractMorphTargets(model) {
  const morphTargets = {};
  model.traverse((child) => {
    if (child.isMesh && child.morphTargetDictionary) {
      Object.keys(child.morphTargetDictionary).forEach((key) => {
        morphTargets[key.toLowerCase()] = {
          mesh: child,
          index: child.morphTargetDictionary[key]
        };
      });
    }
  });
  return morphTargets;
}

function logMorphTargets(model, morphTargets) {
  console.log('%c=== MORPH TARGET ANALYSIS ===', 'color: #00ff00; font-weight: bold; font-size: 14px');
  
  const keys = Object.keys(morphTargets);
  if (keys.length === 0) {
    console.log('%cNo morph targets found in this model.', 'color: #ff9900');
    console.log('%cTip: Add blend shapes in Blender to enable facial expressions.', 'color: #888888');
  } else {
    console.log(`%cFound ${keys.length} morph target(s):`, 'color: #00ff00', keys.join(', '));
    
    // Categorize morph targets
    const categories = {
      mouth: keys.filter(k => /mouth|viseme|phoneme|a_|e_|i_|o_|u_/.test(k)),
      eye: keys.filter(k => /eye|blink|brow|lash/.test(k)),
      expression: keys.filter(k => /smile|frown|happy|sad|angry|surprise|confuse/.test(k)),
      face: keys.filter(k => /cheek|jaw|chin|nose|forehead|head/.test(k)),
      other: keys.filter(k => !/mouth|viseme|phoneme|a_|e_|i_|o_|u_|eye|blink|brow|lash|smile|frown|happy|sad|angry|surprise|confuse|cheek|jaw|chin|nose|forehead|head/.test(k))
    };
    
    console.log('%c--- Categorized Morph Targets ---', 'color: #888888');
    for (const [category, targets] of Object.entries(categories)) {
      if (targets.length > 0) {
        console.log(`%c${category}: %c${targets.join(', ')}`, 'color: #ff9900', 'color: #ffffff');
      }
    }
    
    // Lip-sync readiness
    console.log('%c--- Lip-Sync Readiness ---', 'color: #888888');
    const hasMouthShapes = categories.mouth.length > 0;
    console.log(hasMouthShapes 
      ? `%cMouth shapes: %c✓ ${categories.mouth.length} phoneme(s) available` 
      : '%cMouth shapes: %c✗ None - add mouth_A, mouth_E, etc. in Blender',
      'color: #00ff00', 'color: #ffffff', 'color: #ff0000');
    
    // Expression readiness  
    console.log('%cExpression ready: %c' + (categories.expression.length > 0 ? '✓ Yes' : '✗ No - add smile, frown, etc. in Blender'), 
      categories.expression.length > 0 ? 'color: #00ff00' : 'color: #ff9900');
    
    // Blink readiness
    const hasBlink = categories.eye.some(k => /blink/.test(k));
    console.log(hasBlink 
      ? '%cBlink shapes: %c✓ Found' 
      : '%cBlink shapes: %c✗ None - add blink_left, blink_right in Blender',
      'color: #00ff00', 'color: #ffffff', 'color: #ff9900');
    
    console.log('%c================================', 'color: #00ff00');
  }
  
  // Also log per-mesh details
  model.traverse((child) => {
    if (child.isMesh && child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
      console.log(`%cMesh "${child.name}" has ${child.morphTargetInfluences.length} morph influences`, 'color: #888888');
    }
  });
}

function extractBones(model) {
  const bones = {};
  model.traverse((child) => {
    if (child.isBone || child.type === 'Bone') {
      bones[child.name.toLowerCase()] = child;
    }
  });
  return bones;
}

function createPlaceholder(scene) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4488cc });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), mat);
  head.position.y = 1.7;
  group.add(head);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 0.6, 16), mat
  );
  body.position.y = 1.2;
  group.add(body);

  [-0.35, 0.35].forEach((x) => {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), mat
    );
    arm.position.set(x, 1.1, 0);
    arm.rotation.z = x > 0 ? -0.3 : 0.3;
    group.add(arm);
  });

  [-0.1, 0.1].forEach((x) => {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), mat
    );
    leg.position.set(x, 0.6, 0);
    group.add(leg);
  });

  scene.add(group);

  const jaw = new THREE.Object3D();
  jaw.name = 'jaw';
  group.add(jaw);

  return {
    model: group,
    mixer: new THREE.AnimationMixer(group),
    clips: [],
    morphTargets: {},
    bones: { jaw },
    isPlaceholder: true // indicates fallback model was used
  };
}

function createLoadingIndicator() {
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    color: white; font-size: 18px;
    background: rgba(0,0,0,0.7);
    padding: 20px 40px; border-radius: 10px;
    z-index: 999;
  `;
  el.textContent = 'Loading model...';
  document.body.appendChild(el);
  return el;
}