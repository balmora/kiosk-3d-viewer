import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createScene }         from './sceneSetup.js';
import { loadModel }           from './modelLoader.js';
import { AnimationController } from './animationController.js';
import { LipSync }             from './lipSync.js';
import { AIController }        from './aiController.js';
import { CONFIG }              from './config.js';

/**
 * Load character sheet from JSON file.
 * Searches in same folder as model (./models/character.json) first,
 * then falls back to project root (/character.json).
 */
async function loadCharacterSheet() {
  const paths = [
    './models/character.json',
    './character.json'
  ];

  for (const path of paths) {
    try {
      console.log(`Trying to load character sheet from: ${path}`);
      const response = await fetch(`${path}?v=${Date.now()}`);
      console.log(`Response for ${path}:`, response.status, response.ok);
      if (response.ok) {
        const sheet = await response.json();
        console.log(`Character sheet loaded from ${path}:`, sheet.identity?.name);
        return sheet;
      }
    } catch (e) {
      console.error(`Error loading ${path}:`, e.message);
      // Try next path
    }
  }
  console.warn('No character sheet found, using default personality');
  return null;
}

// Set page title to avatar name (will update after character sheet loads)
document.title = CONFIG.avatar.name;

async function init() {
  // Load character sheet before initializing AI
  const characterSheet = await loadCharacterSheet();
  const canvas = document.getElementById('viewer');
  const { scene, camera, renderer } = createScene(canvas, CONFIG.camera.fov);

  // Orbit controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = CONFIG.camera.minDistance;
  controls.maxDistance = CONFIG.camera.maxDistance;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI / 1.8;

  // Set camera start position
  camera.position.set(0, CONFIG.camera.positionY, CONFIG.camera.positionZ);
  camera.lookAt(0, CONFIG.camera.lookAtY, 0);
  controls.target.set(0, CONFIG.camera.lookAtY, 0);
  controls.update();

  // Responsive rendering
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.addEventListener('resize', onWindowResize);
  function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

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

  const lipSync = new LipSync(morphTargets, bones);
  const aiController = new AIController(animController, lipSync, characterSheet);

  // Update page title and input placeholder with character name
  const avatarName = characterSheet?.identity?.name || CONFIG.avatar.name;
  document.title = avatarName;
  const promptInput = document.getElementById('aiPrompt');
  if (promptInput) {
    promptInput.placeholder = `Talk to ${avatarName}...`;
  }

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
      color: cfg.color,
      roughness: 0.8,
      metalness: 0.1
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = cfg.offsetY;
  floor.receiveShadow = true;
  scene.add(floor);

  // Glow ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(cfg.ringInner, cfg.ringOuter, 64),
    new THREE.MeshBasicMaterial({
      color: cfg.ringColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: cfg.ringOpacity
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = cfg.offsetY + 0.001;
  scene.add(ring);
}

init().catch(console.error);
