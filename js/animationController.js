import * as THREE from 'three';

export class AnimationController {
  constructor(mixer, clips, bones) {
    this.mixer = mixer;
    this.clips = clips;
    this.bones = bones;
    this.actions = {};
    this.currentAction = null;
    this.idleAction = null;

    // Head bob state
    this.headBobTime = 0;
    this.isHeadBobbing = false;
    this.headBobIntensity = 0;

    // Blink state
    this.blinkTimer = 0;
    this.nextBlinkTime = this.randomBlinkInterval();
    this.morphTargets = {};

    this._registerClips();
    this._buildUI();
  }

  setMorphTargets(morphTargets) {
    this.morphTargets = morphTargets;
  }

  _registerClips() {
    this.clips.forEach((clip) => {
      const action = this.mixer.clipAction(clip);
      this.actions[clip.name.toLowerCase()] = action;
    });

    // Auto-play idle if exists
    const idleKeys = ['idle', 'breathing', 'stand'];
    for (const key of idleKeys) {
      if (this.actions[key]) {
        this.idleAction = this.actions[key];
        this.idleAction.play();
        this.currentAction = this.idleAction;
        break;
      }
    }
  }

  playAnimation(name, options = {}) {
    const {
      loop = THREE.LoopRepeat,
      fadeIn = 0.3,
      fadeOut = 0.3,
      clampWhenFinished = false,
      returnToIdle = true
    } = options;

    const key = name.toLowerCase();
    const action = this.actions[key];

    if (!action) {
      console.warn(`Animation "${name}" not found. Available:`, Object.keys(this.actions));
      return false;
    }

    // Cross-fade from current
    if (this.currentAction && this.currentAction !== action) {
      this.currentAction.fadeOut(fadeOut);
    }

    action.reset();
    action.setLoop(loop, Infinity);
    action.clampWhenFinished = clampWhenFinished;
    action.fadeIn(fadeIn);
    action.play();
    this.currentAction = action;

    // Return to idle after one-shot animations
    if (returnToIdle && loop === THREE.LoopOnce && this.idleAction) {
      const duration = action.getClip().duration * 1000;
      setTimeout(() => {
        this.returnToIdle();
      }, duration - fadeOut * 1000);
    }

    return true;
  }

  returnToIdle() {
    if (!this.idleAction || this.currentAction === this.idleAction) return;
    this.currentAction?.fadeOut(0.4);
    this.idleAction.reset().fadeIn(0.4).play();
    this.currentAction = this.idleAction;
  }

  startHeadBob(intensity = 1) {
    this.isHeadBobbing = true;
    this.headBobIntensity = intensity;
  }

  stopHeadBob() {
    this.isHeadBobbing = false;
    this.headBobIntensity = 0;
  }

  // Called every frame
  update(delta) {
    this.mixer.update(delta);
    this._updateHeadBob(delta);
    this._updateBlink(delta);
  }

  _updateHeadBob(delta) {
    if (!this.isHeadBobbing) return;

    const headBone = this.bones['head'] || this.bones['mixamorig:head'];
    if (!headBone) return;

    this.headBobTime += delta;
    const bobY = Math.sin(this.headBobTime * 4) * 0.008 * this.headBobIntensity;
    const bobX = Math.sin(this.headBobTime * 2) * 0.005 * this.headBobIntensity;

    headBone.rotation.x += bobX;
    headBone.rotation.z += bobY;
  }

  _updateBlink(delta) {
    this.blinkTimer += delta;

    if (this.blinkTimer >= this.nextBlinkTime) {
      this._triggerBlink();
      this.blinkTimer = 0;
      this.nextBlinkTime = this.randomBlinkInterval();
    }
  }

  _triggerBlink() {
    const blinkKeys = ['blink', 'eyeblinkleft', 'eyeblinkright', 'eyes_blink'];

    // Morph target blink
    blinkKeys.forEach((key) => {
      const mt = this.morphTargets[key];
      if (!mt) return;

      let t = 0;
      const close = setInterval(() => {
        t += 0.1;
        mt.mesh.morphTargetInfluences[mt.index] = Math.min(t, 1);
        if (t >= 1) clearInterval(close);
      }, 16);

      setTimeout(() => {
        let t2 = 1;
        const open = setInterval(() => {
          t2 -= 0.1;
          mt.mesh.morphTargetInfluences[mt.index] = Math.max(t2, 0);
          if (t2 <= 0) clearInterval(open);
        }, 16);
      }, 120);
    });
  }

  randomBlinkInterval() {
    return 2.5 + Math.random() * 3.5; // 2.5–6 seconds
  }

  _buildUI() {
    const ui = document.getElementById('ui');
    if (!ui) return;
    ui.innerHTML = '';

    // Always add idle button
    this._addButton(ui, '😐 Idle', () => this.returnToIdle());

    // Add buttons for each clip
    const iconMap = {
      wave: '👋',
      talk: '🗣️',
      nod: '✅',
      shake: '❌',
      bow: '🙇',
      dance: '💃',
      point: '👉',
      think: '🤔',
      celebrate: '🎉',
      sad: '😢'
    };

    Object.keys(this.actions).forEach((name) => {
      const icon = Object.entries(iconMap).find(([k]) =>
        name.includes(k)
      )?.[1] || '▶️';
      this._addButton(ui, `${icon} ${name}`, () =>
        this.playAnimation(name, { loop: THREE.LoopOnce })
      );
    });

    // Manual test buttons if no clips
    if (Object.keys(this.actions).length === 0) {
      this._addButton(ui, '👋 Wave', () => this._simulateWave());
      this._addButton(ui, '✅ Nod', () => this._simulateNod());
    }
  }

  _addButton(container, label, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    container.appendChild(btn);
  }

  // Fallback procedural animations when no clips exist
  _simulateWave() {
    const armBone =
      this.bones['rightarm'] ||
      this.bones['mixamorig:rightarm'] ||
      this.bones['right_arm'];
    if (!armBone) return;

    let t = 0;
    const wave = setInterval(() => {
      t += 0.15;
      armBone.rotation.z = -Math.PI / 3 + Math.sin(t * 5) * 0.4;
      if (t > Math.PI * 2) {
        clearInterval(wave);
        armBone.rotation.z = 0;
      }
    }, 16);
  }

  _simulateNod() {
    const headBone =
      this.bones['head'] || this.bones['mixamorig:head'];
    if (!headBone) return;

    let t = 0;
    const nod = setInterval(() => {
      t += 0.2;
      headBone.rotation.x = Math.sin(t * 3) * 0.15;
      if (t > Math.PI * 2) {
        clearInterval(nod);
        headBone.rotation.x = 0;
      }
    }, 16);
  }
}