// Web Audio API Sound Generator for Classroom Hall Pass Kiosk

class SoundEffects {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
  }

  init() {
    if (!this.audioCtx && (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
  }

  play(type = 'checkout') {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      if (type === 'checkout') {
        this.createTone(587.33, now, 0.15, 'sine', 0.2); // D5
        this.createTone(880.00, now + 0.12, 0.28, 'sine', 0.25); // A5
      } else if (type === 'checkin') {
        this.createTone(523.25, now, 0.12, 'sine', 0.2); // C5
        this.createTone(659.25, now + 0.1, 0.12, 'sine', 0.2); // E5
        this.createTone(783.99, now + 0.2, 0.3, 'sine', 0.25); // G5
      } else if (type === 'next') {
        this.createTone(440.00, now, 0.1, 'sine', 0.25); // A4
        this.createTone(659.25, now + 0.1, 0.1, 'sine', 0.25); // E5
        this.createTone(880.00, now + 0.2, 0.35, 'sine', 0.3); // A5
      } else if (type === 'warning') {
        this.createTone(349.23, now, 0.18, 'triangle', 0.2); // F4
        this.createTone(293.66, now + 0.15, 0.25, 'triangle', 0.2); // D4
      }
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  createTone(freq, startTime, duration, type = 'sine', volume = 0.2) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}

export const sounds = new SoundEffects();
