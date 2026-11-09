export class StadiumAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowd: GainNode | null = null;
  private effects: GainNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private enabled = true;

  start(soundEnabled: boolean, crowdVolume: number, effectsVolume: number): void {
    this.enabled = soundEnabled;
    if (!soundEnabled || this.context) return;
    const Context = window.AudioContext;
    if (!Context) return;
    this.context = new Context();
    this.master = this.context.createGain(); this.master.gain.value = 0.55; this.master.connect(this.context.destination);
    this.crowd = this.context.createGain(); this.crowd.gain.value = crowdVolume * 0.2; this.crowd.connect(this.master);
    this.effects = this.context.createGain(); this.effects.gain.value = effectsVolume * 0.45; this.effects.connect(this.master);
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 5; }
    this.noise = this.context.createBufferSource(); this.noise.buffer = buffer; this.noise.loop = true;
    const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 480;
    this.noise.connect(filter); filter.connect(this.crowd); this.noise.start();
  }

  async resume(): Promise<void> { if (this.context?.state === 'suspended') await this.context.resume(); }
  setEnabled(value: boolean): void { this.enabled = value; if (this.master) this.master.gain.value = value ? 0.55 : 0; }
  kick(strength = 0.7): void { this.tone(92 + strength * 34, 0.055, 'triangle', 0.23 * strength); }
  whistle(): void { this.tone(1850, 0.2, 'sine', 0.14); }
  goal(): void { this.tone(392, 0.18, 'sawtooth', 0.09); window.setTimeout(() => this.tone(523, 0.24, 'sawtooth', 0.08), 150); }
  button(): void { this.tone(640, 0.045, 'sine', 0.08); }
  dispose(): void { this.noise?.stop(); void this.context?.close(); this.context = null; this.master = null; this.crowd = null; this.effects = null; }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.enabled || !this.context || !this.effects) return;
    const oscillator = this.context.createOscillator(); const gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    oscillator.connect(gain); gain.connect(this.effects); oscillator.start(); oscillator.stop(this.context.currentTime + duration);
  }
}
