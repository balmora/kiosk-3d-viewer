import * as THREE from 'three';

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  scene.fog = new THREE.Fog(0x111111, 20, 80);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.01,
    1000
  );

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

  const glowSystem = new GlowSystem(scene);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, glowSystem };
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

class GlowSystem {
  constructor(scene) {
    this.scene = scene;
    this.glowPlane = null;
    this.spotLights = [];
    this.spotDots = [];
    this.gradientTexture = null;

    this.intensity = 0;
    this.color = new THREE.Color(0x33A0A4);
    this.spotCount = 0;
    this.spotColor = new THREE.Color(0x33A0A4);
    this.spotDirection = 'both';

    this.time = 0;
    this.floorOffsetY = 0;
    this.floorRadius = 1.0;

    this.createGlowPlane();
  }

  createGradientTexture(color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const c = new THREE.Color(color);
    const r = Math.round(c.r * 255);
    const g = Math.round(c.g * 255);
    const b = Math.round(c.b * 255);

    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
    gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.5)`);
    gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.15)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  createGlowPlane() {
    if (this.glowPlane) {
      this.scene.remove(this.glowPlane);
      this.glowPlane.geometry.dispose();
      this.glowPlane.material.dispose();
      if (this.gradientTexture) {
        this.gradientTexture.dispose();
      }
    }

    const glowRadius = this.floorRadius * 1.5;
    const geometry = new THREE.CircleGeometry(glowRadius, 64);
    this.gradientTexture = this.createGradientTexture(this.color);

    const material = new THREE.MeshBasicMaterial({
      map: this.gradientTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.glowPlane = new THREE.Mesh(geometry, material);
    this.glowPlane.rotation.x = -Math.PI / 2;
    this.glowPlane.position.y = this.floorOffsetY + 0.002;
    this.glowPlane.renderOrder = 1;
    this.scene.add(this.glowPlane);
  }

  updateSpotLights() {
    for (const light of this.spotLights) {
      this.scene.remove(light);
    }
    for (const dot of this.spotDots) {
      this.scene.remove(dot);
    }
    this.spotLights = [];
    this.spotDots = [];

    if (this.spotCount <= 0) return;

    const angleStep = (Math.PI * 2) / this.spotCount;
    const radius = this.floorRadius * 0.85;

    for (let i = 0; i < this.spotCount; i++) {
      const angle = angleStep * i;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      if (this.spotDirection === 'upward' || this.spotDirection === 'both') {
        const light = new THREE.PointLight(this.spotColor, 0.5, 3);
        light.position.set(x, this.floorOffsetY + 0.1, z);
        this.scene.add(light);
        this.spotLights.push(light);
      }

      if (this.spotDirection === 'outward' || this.spotDirection === 'both') {
        const light = new THREE.PointLight(this.spotColor, 0.5, 3);
        light.position.set(x * 1.2, this.floorOffsetY + 0.5, z * 1.2);
        this.scene.add(light);
        this.spotLights.push(light);
      }

      const dotGeometry = new THREE.CircleGeometry(0.05, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({
        color: this.spotColor,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      });
      const dot = new THREE.Mesh(dotGeometry, dotMaterial);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(x, this.floorOffsetY + 0.003, z);
      dot.renderOrder = 2;
      this.scene.add(dot);
      this.spotDots.push(dot);
    }
  }

  setIntensity(value) {
    this.intensity = Math.max(0, Math.min(10, value));
  }

  setColor(hexString) {
    this.color.set(hexString);
    if (this.gradientTexture) {
      this.gradientTexture.dispose();
    }
    this.gradientTexture = this.createGradientTexture(this.color);
    this.glowPlane.material.map = this.gradientTexture;
    this.glowPlane.material.needsUpdate = true;

    this.spotColor.copy(this.color);
    for (const dot of this.spotDots) {
      dot.material.color.copy(this.color);
    }
    for (const light of this.spotLights) {
      light.color.copy(this.color);
    }
  }

  setSpotCount(count) {
    this.spotCount = Math.max(0, Math.floor(count));
    this.updateSpotLights();
  }

  setSpotDirection(direction) {
    if (['upward', 'outward', 'both'].includes(direction)) {
      this.spotDirection = direction;
      this.updateSpotLights();
    }
  }

  cycleSpotDirection() {
    const directions = ['upward', 'outward', 'both'];
    const currentIndex = directions.indexOf(this.spotDirection);
    const nextIndex = (currentIndex + 1) % directions.length;
    this.setSpotDirection(directions[nextIndex]);
    return this.spotDirection;
  }

  setFloorParams(offsetY, radius) {
    this.floorOffsetY = offsetY;
    this.floorRadius = radius;
    this.createGlowPlane();
    this.updateSpotLights();
  }

  update(delta) {
    this.time += delta;

    if (this.intensity === 0) {
      this.glowPlane.material.opacity = 0;
      for (const light of this.spotLights) {
        light.intensity = 0;
      }
      for (const dot of this.spotDots) {
        dot.material.opacity = 0;
      }
      return;
    }

    let pulseFactor = 1.0;
    if (this.intensity >= 4 && this.intensity <= 6) {
      pulseFactor = 0.7 + 0.3 * Math.sin(this.time * 1.5);
    } else if (this.intensity >= 7) {
      pulseFactor = 0.5 + 0.5 * Math.sin(this.time * 3);
    }

    const baseOpacity = this.intensity / 20;
    this.glowPlane.material.opacity = baseOpacity * pulseFactor;

    const spotBaseIntensity = 0.3 * (this.intensity / 10);
    for (const light of this.spotLights) {
      light.intensity = spotBaseIntensity * pulseFactor;
    }
    for (const dot of this.spotDots) {
      dot.material.opacity = 0.7 * pulseFactor;
    }
  }
}