export class LipSync {
  constructor(morphTargets, bones) {
    this.morphTargets = morphTargets;
    this.bones = bones;
    this.isActive = false;
    this.currentValue = 0;
    this.targetValue = 0;
    this.animFrame = null;

    // Mouth morph target keys to try (covers Ready Player Me, Mixamo, etc.)
    this.mouthKeys = [
      'jawopen', 'jaw_open', 'mouthopen', 'mouth_open',
      'viseme_aa', 'viseme_o', 'a', 'open'
    ];

    // Jaw bone names to try
    this.jawBoneKeys = [
      'jaw', 'mixamorig:jaw', 'cc_base_jawroot',
      'lower_jaw', 'jawbone'
    ];

    // Find active mouth control
    this.activeMorphTarget = this._findMorphTarget();
    this.activeJawBone = this._findJawBone();
  }

  _findMorphTarget() {
    for (const key of this.mouthKeys) {
      if (this.morphTargets[key]) return this.morphTargets[key];
    }
    return null;
  }

  _findJawBone() {
    for (const key of this.jawBoneKeys) {
      if (this.bones[key]) return this.bones[key];
    }
    return null;
  }

  // Start lip sync with Web Audio API analysis
  startFromAudio(audioElement) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaElementSource(audioElement);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    source.connect(analyser);
    analyser.connect(ctx.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    this.isActive = true;

    const animate = () => {
      if (!this.isActive) return;
      this.animFrame = requestAnimationFrame(animate);

      analyser.getByteFrequencyData(dataArray);

      // Average low-mid frequencies (speech range ~80–1000 Hz)
      const speechBins = dataArray.slice(2, 20);
      const avg = speechBins.reduce((a, b) => a + b, 0) / speechBins.length;
      this.targetValue = Math.min(avg / 128, 1.0);

      this._applyMouth(this.targetValue);
    };

    animate();
    return ctx;
  }

  // Simulate lip sync from text (procedural rhythm)
  startFromText(text, durationMs) {
    this.isActive = true;
    const words = text.trim().split(/\s+/).length;
    const syllablesPerWord = 1.8;
    const totalSyllables = Math.round(words * syllablesPerWord);
    const syllableDuration = durationMs / totalSyllables;

    let syllable = 0;

    const nextSyllable = () => {
      if (!this.isActive || syllable >= totalSyllables) {
        this.stop();
        return;
      }

      // Open mouth
      this._animateMouth(0, 0.7 + Math.random() * 0.3, 80, () => {
        // Close mouth
        this._animateMouth(0.7, 0, syllableDuration * 0.4, () => {
          syllable++;
          setTimeout(nextSyllable, syllableDuration * 0.1);
        });
      });
    };

    nextSyllable();
  }

  // Smooth value animation helper
  _animateMouth(from, to, duration, callback) {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const value = from + (to - from) * eased;

      this._applyMouth(value);

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        callback?.();
      }
    };
    requestAnimationFrame(tick);
  }

  _applyMouth(value) {
    // Morph target
    if (this.activeMorphTarget) {
      const { mesh, index } = this.activeMorphTarget;
      mesh.morphTargetInfluences[index] = value;
    }

    // Jaw bone rotation
    if (this.activeJawBone) {
      this.activeJawBone.rotation.x = value * 0.3;
    }
  }

  stop() {
    this.isActive = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this._animateMouth(this.currentValue, 0, 150);
  }
}