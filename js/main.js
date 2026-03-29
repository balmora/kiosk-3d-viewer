import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createScene }         from './sceneSetup.js';
import { loadModel }           from './modelLoader.js';
import { AnimationController } from './animationController.js';
import { LipSync }             from './lipSync.js';
import { AIController }        from './aiController.js';
import { VisibilityManager }   from './VisibilityManager.js';
import { commandExecutor }      from './commandExecutor.js';
import { CONFIG }              from './config.js';
import { modelManager }        from './ModelManager.js';

function getModelConfig(characterSheet) {
  const model = characterSheet?.model || {};
  return {
    heightM: typeof model.heightM === 'number' ? model.heightM : CONFIG.model.heightM,
    scale: typeof model.scale === 'number' ? model.scale : 1.0,
    floorOffsetY: typeof model.floorOffsetY === 'number' ? model.floorOffsetY : CONFIG.model.floorOffsetY,
    cameraDistance: typeof model.cameraDistance === 'number' ? model.cameraDistance : CONFIG.camera.positionZ,
    cameraHeight: typeof model.cameraHeight === 'number' ? model.cameraHeight : CONFIG.camera.positionY,
    floorOffsetY_pos: typeof model.floorOffsetY_pos === 'number' ? model.floorOffsetY_pos : CONFIG.floor.offsetY,
    floorRadius: typeof model.floorRadius === 'number' ? model.floorRadius : CONFIG.floor.radius,
    floorColor: typeof model.floorColor === 'number' ? model.floorColor : CONFIG.floor.color,
    ringInner: typeof model.ringInner === 'number' ? model.ringInner : CONFIG.floor.ringInner,
    ringOuter: typeof model.ringOuter === 'number' ? model.ringOuter : CONFIG.floor.ringOuter,
    ringColor: typeof model.ringColor === 'number' ? model.ringColor : CONFIG.floor.ringColor,
    ringOpacity: typeof model.ringOpacity === 'number' ? model.ringOpacity : CONFIG.floor.ringOpacity,
    glowColor: model.glowColor || CONFIG.glow.color,
    glowIntensity: typeof model.glowIntensity === 'number' ? model.glowIntensity : CONFIG.glow.intensity,
    spotCount: typeof model.spotCount === 'number' ? model.spotCount : CONFIG.spot.count,
    spotColor: model.spotColor || model.glowColor || CONFIG.spot.color,
  };
}

function getVoiceConfig(characterSheet) {
  const validVoices = ['af_sarah', 'af_bella', 'am_adam', 'am_lef', 'bf_emma', 'bf_isabella'];
  const voice = characterSheet?.voice;
  return validVoices.includes(voice) ? voice : CONFIG.tts.voice;
}

function getAnimationConfig(characterSheet) {
  const anim = characterSheet?.animation || {};
  return {
    headBobIntensity: typeof anim.headBobIntensity === 'number' ? anim.headBobIntensity : CONFIG.animation.headBobIntensity,
    blinkRate: typeof anim.blinkRate === 'number' ? anim.blinkRate : CONFIG.animation.idleBlinkInterval
  };
}

document.title = CONFIG.avatar.name;

async function init() {
  console.log('Discovering models...');
  await modelManager.discoverModels();
  
  const defaultModel = modelManager.getDefaultModel();
  if (!defaultModel) {
    console.error('No models found! Please add a model to the /models/ folder.');
    return;
  }
  
  console.log(`Loading model: ${defaultModel.displayName}`);
  
  const { modelPath, characterSheet } = await modelManager.loadModel(defaultModel.name);
  
  const modelConfig = getModelConfig(characterSheet);
  const voiceConfig = getVoiceConfig(characterSheet);
  const animConfig = getAnimationConfig(characterSheet);
  
  console.log('Model config:', modelConfig);
  console.log('Voice:', voiceConfig);
  console.log('Animation config:', animConfig);
  
  const canvas = document.getElementById('viewer');
  const { scene, camera, renderer, glowSystem } = createScene(canvas, CONFIG.camera.fov);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = CONFIG.camera.minDistance;
  controls.maxDistance = CONFIG.camera.maxDistance;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI / 1.8;

  camera.position.set(0, modelConfig.cameraHeight, modelConfig.cameraDistance);
  camera.lookAt(0, CONFIG.camera.lookAtY, 0);
  controls.target.set(0, CONFIG.camera.lookAtY, 0);
  controls.update();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.addEventListener('resize', onWindowResize);
  function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  const cacheBuster = `?v=${Date.now()}`;
  console.log(`Loading model from: ${modelPath}`);
  const { model, mixer, clips, morphTargets, bones } =
    await loadModel(scene, modelPath + cacheBuster, modelConfig.heightM);

  console.log('Model loaded, mesh count:', model.children.length);
  model.position.y += modelConfig.floorOffsetY;
  if (modelConfig.scale !== 1.0) {
    model.scale.multiplyScalar(modelConfig.scale);
  }

  const floorCfg = {
    ...CONFIG.floor,
    color: modelConfig.floorColor,
    ringColor: modelConfig.ringColor,
    ringInner: modelConfig.ringInner,
    ringOuter: modelConfig.ringOuter,
    ringOpacity: modelConfig.ringOpacity,
    radius: modelConfig.floorRadius,
    offsetY: modelConfig.floorOffsetY_pos,
  };
  addFloor(scene, floorCfg);

  glowSystem.setFloorParams(floorCfg.offsetY, floorCfg.radius);
  glowSystem.setColor(modelConfig.glowColor);
  glowSystem.setIntensity(modelConfig.glowIntensity);
  glowSystem.setSpotCount(modelConfig.spotCount);
  glowSystem.setColor(modelConfig.spotColor);

  const animController = new AnimationController(mixer, clips, bones);
  animController.setMorphTargets(morphTargets);
  animController.headBobIntensity = animConfig.headBobIntensity;

  const lipSync = new LipSync(morphTargets, bones);
  const aiController = new AIController(animController, lipSync, characterSheet);
  
  aiController.ttsVoice = voiceConfig;
  aiController.headBobIntensity = animConfig.headBobIntensity;

  // Load visibility/wardrobe configuration
  let visibilityManager = null;
  try {
    const visibilityPath = `./models/${defaultModel.name}/visibility.json?v=${Date.now()}`;
    const visibilityResponse = await fetch(visibilityPath);
    if (visibilityResponse.ok) {
      const visibilityConfig = await visibilityResponse.json();
      visibilityManager = new VisibilityManager(model, visibilityConfig);
      aiController.setVisibilityManager(visibilityManager);
      console.log('VisibilityManager loaded for:', defaultModel.name);
    } else {
      console.log('visibility.json not found for:', defaultModel.name);
    }
  } catch (e) {
    console.log('VisibilityManager error:', e.message);
  }

  if (characterSheet?.facts && characterSheet.facts.length > 0) {
    const characterName = characterSheet.identity?.name || 'unknown';
    for (const fact of characterSheet.facts) {
      aiController.chatMemory.addCharacterFact({
        text: fact.text || fact,
        category: fact.category || 'biographical',
        confidence: fact.confidence || 0.8,
        scope: 'character',
        privacy: fact.privacy || 'public'
      });
    }
    console.log(`Loaded ${characterSheet.facts.length} character facts for ${characterName}`);
  }

  const avatarName = characterSheet?.identity?.name || CONFIG.avatar.name;
  document.title = avatarName;
  const promptInput = document.getElementById('aiPrompt');
  if (promptInput) {
    promptInput.placeholder = `Talk to ${avatarName}...`;
  }

  window.avatar = { 
    animController, 
    lipSync, 
    aiController,
    modelManager,
    visibilityManager,
    glowSystem,
    commandExecutor
  };

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    controls.update();
    animController.update(delta);
    glowSystem.update(delta);
    renderer.render(scene, camera);
  }
  animate();
  console.log('Init complete - avatar ready');
}

function addFloor(scene, cfg) {
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
