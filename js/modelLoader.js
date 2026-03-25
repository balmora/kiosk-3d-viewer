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

    loader.load(
      modelPath,
      (gltf) => {
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

        console.log('Morph targets found:', Object.keys(morphTargets));
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