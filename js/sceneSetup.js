import * as THREE from 'three';

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  scene.fog = new THREE.Fog(0x111111, 20, 80);

  const camera = new THREE.PerspectiveCamera(
    50,                                    // ✅ wider FOV to see more
    window.innerWidth / window.innerHeight,
    0.01,                                  // ✅ smaller near plane
    1000                                   // ✅ larger far plane
  );

  // ✅ Default position, will be overridden by fitCameraToModel
  camera.position.set(0, 1.0, 5);
  camera.lookAt(0, 1.0, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  setupLights(scene);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}

function setupLights(scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff5e0, 1.5);
  keyLight.position.set(2, 4, 3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far  = 50;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc0d8ff, 0.6);
  fillLight.position.set(-3, 2, 1);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
  rimLight.position.set(0, 3, -4);
  scene.add(rimLight);

  const groundLight = new THREE.HemisphereLight(0x444466, 0x222233, 0.3);
  scene.add(groundLight);
}