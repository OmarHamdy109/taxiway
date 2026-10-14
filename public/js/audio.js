'use strict';
// ---- Synthesized sound effects (WebAudio, no files) ----
const Sfx = (() => {
  let ac = null, on = true, engG, rainG, master;
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = on ? 0.6 : 0; master.connect(ac.destination);
    // ambient engine rumble
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    engG = ac.createGain(); engG.gain.value = 0; o.connect(f); f.connect(engG); engG.connect(master); o.start();
    // rain noise
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = ac.createBufferSource(); n.buffer = buf; n.loop = true;
    const nf = ac.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2500;
    rainG = ac.createGain(); rainG.gain.value = 0; n.connect(nf); nf.connect(rainG); rainG.connect(master); n.start();
  }
  function tone(f, dur, type = 'sine', vol = 0.2, delay = 0, slide = 0) {
    if (!ac || !on) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.linearRampToValueAtTime(f + slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, fq) {
    if (!ac || !on) return;
    const len = ac.sampleRate * dur, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(); s.buffer = b;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fq;
    const g = ac.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  return {
    init, get on() { return on; },
    toggle() { on = !on; if (master) master.gain.value = on ? 0.6 : 0; return on; },
    click() { tone(660, 0.06, 'square', 0.08); },
    radio() { tone(1800, 0.05, 'square', 0.04); tone(1400, 0.05, 'square', 0.04, 0.07); },
    alert() { tone(880, 0.15, 'square', 0.12); tone(660, 0.15, 'square', 0.12, 0.18); },
    cash() { tone(1200, 0.08, 'triangle', 0.15); tone(1700, 0.14, 'triangle', 0.15, 0.08); },
    touch() { noise(0.25, 0.25, 900); },
    siren() { tone(700, 0.4, 'sawtooth', 0.1, 0, 400); tone(1100, 0.4, 'sawtooth', 0.1, 0.4, -400); },
    thunder() { noise(1.8, 0.7, 300); },
    crash() { noise(1.6, 0.9, 1200); tone(90, 1.2, 'sawtooth', 0.3, 0, -60); },
    ambient(air, rain) {
      if (!ac) return;
      engG.gain.setTargetAtTime(Math.min(0.06, air * 0.02), ac.currentTime, 0.5);
      rainG.gain.setTargetAtTime(rain * 0.05, ac.currentTime, 0.8);
    }
  };
})();
