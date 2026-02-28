import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createScene }         from './sceneSetup.js';
import { loadModel }           from './modelLoader.js';
import { AnimationController } from './animationController.js';
import { LipSync }             from './lipSync.js';
import { AIController }        from './aiController.js';

// ============================================================
//  MANUAL SETTINGS — adjust these values to fit your model
// ============================================================
const CONFIG = {
  model: {
    path:        './models/avatar.gltf', // path to your model
    heightM:      1.75,                  // target height in meters
    floorOffsetY: 0.85,                   // raise/lower model from floor  (+/-)
  },

  camera: {
    fov:          50,                    // field of view (degrees)
    positionZ:    3.5,                   // how far back camera starts
    positionY:    1.0,                   // camera height
    lookAtY:      0.9,                   // where camera looks (head/chest)
    minDistance:  1.0,                   // how close you can zoom in
    maxDistance:  8.0,                   // how far you can zoom out
  },

  floor: {
    offsetY:      0.0,                   // raise/lower floor (+/-)
    radius:       1.0,                   // floor disc radius
    color:        0x222233,              // floor color
    ringColor:    0x4488ff,              // glow ring color
    ringOpacity:  0.6,                   // glow ring opacity 0-1
    ringInner:    0.4,                   // glow ring inner radius
    ringOuter:    0.45,                  // glow ring outer radius
  }
};
// ============================================================

async function init() {
  const canvas = document.getElementById('viewer');
  const { scene, camera, renderer } = createScene(canvas, CONFIG.camera.fov);

  // Orbit controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan    = false;
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.08;
  controls.minDistance    = CONFIG.camera.minDistance;
  controls.maxDistance    = CONFIG.camera.maxDistance;
  controls.minPolarAngle  = 0;
  controls.maxPolarAngle  = Math.PI / 1.8;

  // Set camera start position
  camera.position.set(0, CONFIG.camera.positionY, CONFIG.camera.positionZ);
  camera.lookAt(0, CONFIG.camera.lookAtY, 0);
  controls.target.set(0, CONFIG.camera.lookAtY, 0);
  controls.update();

  // Load model
  const { model, mixer, clips, morphTargets, bones } =
    await loadModel(scene, CONFIG.model.path, CONFIG.model.heightM);

  // Apply manual floor offset to model
  model.position.y += CONFIG.model.floorOffsetY;

  // Add floor
  addFloor(scene, CONFIG.floor);

  // Controllers
  const animController = new AnimationController(mixer, clips, bones);
  animController.setMorphTargets(morphTargets);

  const lipSync      = new LipSync(morphTargets, bones);
  const aiController = new AIController(animController, lipSync);

  window.avatar = { animController, lipSync, aiController };

  // Render loop
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    controls.update();
    animController.update(delta);
    renderer.render(scene, camera);
  }
  animate();
}

function addFloor(scene, cfg) {
  // Floor disc
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(cfg.radius, 64),
    new THREE.MeshStandardMaterial({
      color:     cfg.color,
      roughness: 0.8,
      metalness: 0.1
    })
  );
  floor.rotation.x  = -Math.PI / 2;
  floor.position.y  = cfg.offsetY;
  floor.receiveShadow = true;
  scene.add(floor);

  // Glow ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(cfg.ringInner, cfg.ringOuter, 64),
    new THREE.MeshBasicMaterial({
      color:       cfg.ringColor,
      side:        THREE.DoubleSide,
      transparent: true,
      opacity:     cfg.ringOpacity
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = cfg.offsetY + 0.001;
  scene.add(ring);
}

init().catch(console.error);