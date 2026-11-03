/* =====================================================================
   THE ROYAL CLAW — game logic
   No build step, no dependencies. Edit CONFIG below to customise the game.
   ===================================================================== */
(() => {
'use strict';

/* =====================================================================
   1. CONFIG  ← everything you may want to change lives here
   ===================================================================== */
const CONFIG = {

  /* ---- BALL IMAGES ------------------------------------------------------
     Replace / add image links here. Local paths ("balls/x.png") and
     full URLs ("https://example.com/me.png") both work.
     Square (1:1) images with a transparent background look best.
     The pile adapts automatically to the number of balls (up to ~31).      */
  BALLS: [
    'balls/aisyah.png',
    'balls/amira.png',
    'balls/arva.png',
    'balls/arya.png',
    'balls/asiyah.png',
    'balls/athar.png',
    'balls/azfar.png',
    'balls/bilal.png',
    'balls/cupin.png',
    'balls/dhan.png',
    'balls/dio.png',
    'balls/fathir.png',
    'balls/fish.png',
    'balls/hiro.png',
    'balls/icad.png',
    'balls/jey.png',
    'balls/miko.png',
    'balls/nahda.png',
    'balls/naufal.png',
    'balls/raffa.png',
    'balls/raish.png',
    'balls/rasyiq.png',
    'balls/rifqi.png',
    'balls/rizal.png',
    'balls/syahid.png',
  ],

  /* ---- THE SPECIAL BALL (always added to the machine) ------------------ */
  SPECIAL_BALL: 'balls/prince-syahzad-of-xi-9.png',   // ← PRINCE image link
  SPECIAL_NAME: 'Prince Syahzad of XI-9',
  SPECIAL_TEXT: "HE'S SO HANDSOME OMG!!",
  HIGHLIGHT_SPECIAL: true,   // subtle golden shimmer on his ball (set false to make him a surprise)

  /* Shown if an image link fails to load (optional). '' = built-in rune orb */
  PLACEHOLDER_IMAGE: '',

  /* ---- GAMEPLAY -------------------------------------------------------- */
  MISS_CHANCE: 0.35,          // 0.35 = 35% of drops that WOULD have gripped a normal ball slip away
  PRINCE_MISS_CHANCE: 0.90,   // 0.60 = 60% chance to miss specifically if the Prince ball is targeted
  CATCH_RADIUS: 46,           // px: how far from the claw a ball may be and still be reachable
  CLAW_SPEED: 230,            // px per second while a move button is held
  EMPTY_DEPTH: 150,           // how deep the claw dips when nothing is below it

  /* ---- RARITY (chance based, independent of which ball is caught) ------ */
  RARITY_WEIGHTS: { COMMON: 60, RARE: 30, LEGENDARY: 10 },

  MISS_MESSAGES: [
    'THE CLAW SLIPPED!', 'SO CLOSE, TRAVELER!', 'ONLY AIR...', 'FORTUNE FROWNS...', 'THE GODS ARE UNKIND!', 'ALAS, NOTHING!'
  ],
  FLAVOR: {
    COMMON: 'A humble find',
    RARE: 'A fine prize, adventurer',
    LEGENDARY: 'A relic of legend'
  },
};

/* =====================================================================
   2. HELPERS
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

const ease = {
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  bounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
function tween(ms, fn, easing = ease.inOut) {
  return new Promise((res) => {
    const t0 = performance.now();
    (function step(now) {
      const p = clamp((now - t0) / ms, 0, 1);
      fn(easing(p), p);
      if (p < 1) requestAnimationFrame(step); else res();
    })(t0);
  });
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* machine geometry (px, matches style.css) */
const W = 536, H = 470, R = 36;               // pit size, ball radius
const MIN_X = 34, MAX_X = W - 34;             // claw travel range
const CHUTE_X = 54;                           // centre of the prize chute
const ROW_H = 50, SPACING = 68;

/* =====================================================================
   3. SOUND (tiny WebAudio synth, no audio files needed)
   ===================================================================== */
const Sfx = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false;
  try { muted = localStorage.getItem('claw-muted') === '1'; } catch (e) {}

  function ok() {
    if (muted) return false;
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { return false; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  function tone({ f = 440, t = 0.2, type = 'sine', v = 0.15, d = 0, to = null }) {
    if (!ok()) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + d;
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + t);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
    o.connect(g).connect(master); o.start(t0); o.stop(t0 + t + 0.05);
  }
  function noise({ t = 0.12, v = 0.2, d = 0, f = 1200, type = 'lowpass' }) {
    if (!ok()) return;
    const s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = ctx.currentTime + d;
    s.buffer = noiseBuf; flt.type = type; flt.frequency.value = f;
    g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
    s.connect(flt).connect(g).connect(master); s.start(t0); s.stop(t0 + t + 0.05);
  }
  const arp = (notes, step, o = {}) => notes.forEach((f, i) => tone({ f, t: o.t || 0.45, type: o.type || 'triangle', v: o.v || 0.13, d: i * step }));

  return {
    unlock() { ok(); },
    get muted() { return muted; },
    setMuted(m) { muted = m; try { localStorage.setItem('claw-muted', m ? '1' : '0'); } catch (e) {} },
    drop() { tone({ f: 200, to: 95, t: 0.7, type: 'sawtooth', v: 0.05 }); },
    lift() { tone({ f: 90, to: 170, t: 0.7, type: 'sawtooth', v: 0.05 }); },
    clunk() { noise({ t: 0.14, v: 0.35, f: 900 }); tone({ f: 110, to: 50, t: 0.18, v: 0.25 }); },
    release() { noise({ t: 0.08, v: 0.15, f: 2200, type: 'highpass' }); },
    thud() { noise({ t: 0.2, v: 0.4, f: 500 }); tone({ f: 80, to: 40, t: 0.25, v: 0.3 }); },
    slip() { noise({ t: 0.1, v: 0.12, f: 3000, type: 'highpass' }); },
    miss() { tone({ f: 330, to: 200, t: 0.4, type: 'triangle', v: 0.14 }); tone({ f: 247, to: 120, t: 0.5, type: 'triangle', v: 0.14, d: 0.25 }); },
    win(r) {
      if (r === 'LEGENDARY') { arp([392, 523, 659, 784, 1047, 1319, 1568], 0.08, { t: 0.7, v: 0.14 }); noise({ t: 1.2, v: 0.05, d: 0.5, f: 6000, type: 'highpass' }); }
      else if (r === 'RARE') arp([523, 659, 784, 1047, 1319], 0.09, { t: 0.5 });
      else arp([523, 659, 784], 0.1, { t: 0.35 });
    },
    prince() {
      arp([262, 330, 392, 523, 659, 784, 1047, 1319, 1568, 2093], 0.055, { t: 0.7, v: 0.12, type: 'sawtooth' });
      [523, 659, 784, 1047].forEach((f) => tone({ f, t: 1.8, type: 'triangle', v: 0.1, d: 0.6 }));
      arp([1568, 2093, 2637, 3136], 0.12, { t: 1.2, v: 0.06, type: 'sine' });
      noise({ t: 1.8, v: 0.07, d: 0.55, f: 5000, type: 'highpass' });
      setTimeout(() => { arp([784, 1047, 1319, 1568], 0.07, { t: 0.8, v: 0.1 }); }, 1400);
    },
  };
})();

/* =====================================================================
   4. PARTICLE FX (sparkles, confetti) on a full-screen canvas
   ===================================================================== */
const FX = (() => {
  const cv = $('#fx'), c = cv.getContext('2d');
  let w = 0, h = 0, dpr = 1, parts = [], streams = new Set(), running = false, last = 0;
  const PAL = { gold: [255, 200, 70], white: [255, 255, 255], amber: [255, 150, 40], blue: [90, 180, 255], cyan: [140, 240, 255], pink: [255, 120, 200], violet: [180, 130, 255], cream: [255, 235, 190] };
  const sprites = {};
  const CONF = ['#ffd24d', '#fff3b0', '#ff9d00', '#ff6aa8', '#7ff0e0', '#ffffff', '#ffe27a'];

  function sprite(name) {
    if (sprites[name]) return sprites[name];
    const [r, g, b] = PAL[name] || PAL.gold;
    const s = document.createElement('canvas'); s.width = s.height = 64;
    const x = s.getContext('2d');
    const rg = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.14, `rgba(${r},${g},${b},.9)`);
    rg.addColorStop(0.5, `rgba(${r},${g},${b},.22)`); rg.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = rg; x.fillRect(0, 0, 64, 64);
    x.fillStyle = 'rgba(255,255,255,.96)'; x.beginPath();
    x.moveTo(32, 1); x.quadraticCurveTo(34, 30, 63, 32); x.quadraticCurveTo(34, 34, 32, 63);
    x.quadraticCurveTo(30, 34, 1, 32); x.quadraticCurveTo(30, 30, 32, 1); x.fill();
    return (sprites[name] = s);
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1); w = innerWidth; h = innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function kick() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
  function add(p) { if (parts.length < 900) parts.push(p); kick(); }
  function spark(o) {
    return { x: o.x, y: o.y, vx: o.vx, vy: o.vy, g: o.g ?? 260, drag: o.drag ?? 0.985, life: 0, max: o.max, size: o.size, rot: rand(0, TAU), vr: rand(-4, 4), spr: o.spr, tw: rand(0, TAU), conf: o.conf, color: o.color };
  }
  function burst({ x, y, n = 60, colors = ['gold', 'white'], speed = [100, 500], size = [14, 34], life = [0.8, 1.8], gravity = 260, confetti = 0 }) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(speed[0], speed[1]);
      add(spark({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: gravity, max: rand(life[0], life[1]), size: rand(size[0], size[1]), spr: pick(colors) }));
    }
    for (let i = 0; i < confetti; i++) {
      const a = rand(0, TAU), s = rand(speed[0] * 0.6, speed[1]);
      add(spark({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, g: 520, drag: 0.97, max: rand(2, 3.6), size: rand(8, 15), conf: true, color: pick(CONF) }));
    }
  }
  function stream(rate, make) { const s = { rate, make, acc: 0 }; streams.add(s); kick(); return s; }
  function stopStreams() { streams.clear(); }
  function clear() { parts.length = 0; streams.clear(); c.clearRect(0, 0, w, h); }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    c.clearRect(0, 0, w, h);
    for (const s of streams) { s.acc += s.rate * dt; while (s.acc >= 1) { s.acc -= 1; add(spark(s.make())); } }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt;
      if (p.life >= p.max || p.y > h + 60) { parts.splice(i, 1); continue; }
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k; p.vy = p.vy * k + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const t = p.life / p.max, a = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      if (p.conf) {
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = clamp(a * 1.4, 0, 1);
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(1, Math.cos(p.life * 9 + p.tw));
        c.fillStyle = p.color; c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6); c.restore();
      } else {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = clamp(a, 0, 1) * (0.7 + 0.3 * Math.sin(p.life * 14 + p.tw));
        const s = p.size * (0.6 + 0.4 * a);
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.drawImage(sprite(p.spr), -s / 2, -s / 2, s, s); c.restore();
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    if (parts.length || streams.size) requestAnimationFrame(loop); else { running = false; c.clearRect(0, 0, w, h); }
  }
  addEventListener('resize', resize); resize();
  return { burst, stream, stopStreams, clear };
})();

/* =====================================================================
   5. DOM REFERENCES + STATE
   ===================================================================== */
const stage = $('#stage'), wrap = $('#stageWrap'), cabinet = $('#cabinet');
const carriage = $('#carriage'), rope = $('#rope'), claw = $('#claw'), ballsEl = $('#balls'), chuteEl = $('#chute'), toastEl = $('#toast');
const btnLeft = $('#btnLeft'), btnRight = $('#btnRight'), btnDrop = $('#btnDrop'), btnSound = $('#btnSound');
const hudTries = $('#hudTries'), hudPrizes = $('#hudPrizes'), socketsEl = $('#sockets');
const reveal = $('#reveal'), card = $('#revealCard'), medalImg = $('#medalImg'), titleEl = $('#revealTitle'), subEl = $('#revealSub'), ribbon = $('#revealRibbon'), btnClaim = $('#btnClaim');
const vfxFlash = $('#vfxFlash'), vfxRays = $('#vfxRays'), vfxVig = $('#vfxVignette');

const state = { x: W / 2, rope: 0, dir: 0, busy: false, tries: 0, prizes: 0, carry: null, keyL: false, keyR: false, btnL: false, btnR: false };
let balls = [];
let treasury = [];

/* =====================================================================
   6. THE PILE OF BALLS
   ===================================================================== */
function layoutSlots(n) {
  const slots = [], pileCenter = (118 + W - 8) / 2;
  let row = 0;
  while (slots.length < n) {
    const cap = row % 2 === 0 ? 6 : 5;
    const count = Math.min(cap, n - slots.length);
    const y = H - 40 - row * ROW_H;
    const startX = count === cap ? (cap === 6 ? 152 : 186) : pileCenter - ((count - 1) * SPACING) / 2;
    for (let i = 0; i < count; i++) {
      slots.push({ x: startX + i * SPACING + rand(-6, 6), y: y + rand(-5, 5), rot: rand(-16, 16) });
    }
    row++;
  }
  slots.forEach((s) => { s.z = Math.round(100 + (H - s.y)); });  // higher in the pile = in front
  return slots;
}

function placeBall(b) {
  const s = b.slot;
  b.el.style.zIndex = s.z;
  b.el.style.transform = `translate(${s.x - R}px, ${s.y - R}px) rotate(${s.rot}deg)`;
}

function buildBalls() {
  const list = CONFIG.BALLS.filter(Boolean).map((src) => ({ src, special: false }));
  list.push({ src: CONFIG.SPECIAL_BALL, special: true });
  const slots = layoutSlots(list.length);
  const order = shuffle(slots.map((_, i) => i));
  balls = list.map((it, i) => {
    const el = document.createElement('div');
    el.className = 'ball' + (it.special && CONFIG.HIGHLIGHT_SPECIAL ? ' special' : '');
    const img = new Image();
    img.alt = ''; img.draggable = false; img.decoding = 'async';
    img.onerror = () => {
      if (CONFIG.PLACEHOLDER_IMAGE && img.src.indexOf(CONFIG.PLACEHOLDER_IMAGE) === -1) { img.src = CONFIG.PLACEHOLDER_IMAGE; return; }
      img.remove(); el.classList.add('fallback'); el.textContent = '✦';
    };
    img.src = it.src;
    el.appendChild(img);
    ballsEl.appendChild(el);
    const b = { el, src: it.src, special: it.special, slot: slots[order[i]], inPit: true };
    placeBall(b);
    return b;
  });
}

function jostle(n = 3) {
  const present = balls.filter((b) => b.inPit);
  for (let i = 0; i < n; i++) {
    const a = pick(present), b = pick(present);
    if (a === b) continue;
    [a.slot, b.slot] = [b.slot, a.slot];
    placeBall(a); placeBall(b);
  }
}

function respawn(b) {
  const el = b.el, s = b.slot;
  el.classList.add('no-trans'); el.classList.remove('hidden');
  el.style.zIndex = s.z;
  el.style.transform = `translate(${s.x - R}px, -120px) rotate(${s.rot}deg)`;
  void el.offsetWidth;
  el.classList.remove('no-trans'); el.classList.add('dropin');
  b.inPit = true;
  placeBall(b);
  setTimeout(() => el.classList.remove('dropin'), 950);
}

/* which balls can the claw reach from where it hangs right now? */
function getCandidates() {
  const reach = balls.filter((b) => b.inPit && Math.abs(b.slot.x - state.x) <= CONFIG.CATCH_RADIUS);
  if (!reach.length) return [];
  const top = Math.min(...reach.map((b) => b.slot.y));
  return reach.filter((b) => b.slot.y <= top + 30);            // only the exposed top layer
}
function updateReach() {
  const set = state.busy ? [] : getCandidates();
  balls.forEach((b) => b.el.classList.toggle('reach', set.includes(b)));
}

/* =====================================================================
   7. CLAW MECHANICS
   ===================================================================== */
function setX(x) {
  state.x = x;
  carriage.style.transform = `translateX(${x}px)`;
  placeCarried();
}
function setRope(len) {
  state.rope = len;
  rope.style.height = len + 'px';
  claw.style.transform = `translateY(${len}px)`;
  placeCarried();
}
function setArms(open) { claw.style.setProperty('--arm', open ? 32 : -6); }
function placeCarried() {
  const b = state.carry; if (!b) return;
  b.el.style.transform = `translate(${state.x - R}px, ${80 + state.rope - R}px) rotate(0deg)`;
}
function attach(b) {
  b.el.classList.add('no-trans'); b.el.style.zIndex = 900;
  state.carry = b; placeCarried();
}

const goHome = () => { const x0 = state.x; return tween(600 + Math.abs(x0 - W / 2) * 1.2, (v) => setX(x0 + (W / 2 - x0) * v)); };
const ropeUp = () => { const r0 = state.rope; return tween(450 + r0 * 2.4, (v) => setRope(r0 * (1 - v))); };

function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function rollRarity() {                                        // independent of the ball!
  const entries = Object.entries(CONFIG.RARITY_WEIGHTS);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of entries) { if ((r -= w) < 0) return name; }
  return entries[0][0];
}

function weightedPick(list) {                                  // slight bias to the ball nearest the claw
  const ws = list.map((b) => 1.2 - Math.abs(b.slot.x - state.x) / CONFIG.CATCH_RADIUS);
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { if ((r -= ws[i]) < 0) return list[i]; }
  return list[0];
}

function setBusy(v) {
  state.busy = v;
  cabinet.classList.toggle('busy', v);
  btnDrop.disabled = v;
  updateReach();
}

async function drop() {
  if (state.busy || !reveal.hidden) return;
  setBusy(true);
  state.tries++; hudTries.textContent = state.tries;

  // ---- decide the outcome up-front -------------------------------------
  const cands = getCandidates();
  const target = cands.length ? weightedPick(cands) : null;
  
  let slipped = false;
  if (target) {
    // Check if the targeted ball is the Prince, and use the 60% chance if so
    const missRate = target.special ? CONFIG.PRINCE_MISS_CHANCE : CONFIG.MISS_CHANCE;
    slipped = Math.random() < missRate;
  }
  
  const caught = !!target && !slipped;
  const depth = target ? Math.max(40, target.slot.y - 80) : CONFIG.EMPTY_DEPTH;

  // ---- descend ----------------------------------------------------------
  Sfx.drop(); setArms(true);
  await tween(380 + depth * 2.4, (v) => setRope(depth * v));
  await wait(140);
  setArms(false); Sfx.clunk();
  await wait(520);

  if (caught) await catchSequence(target);
  else await missSequence(target);
}

async function missSequence(target) {
  if (target) {                                                // grips, lifts, then the ball slips free
    target.el.classList.add('no-trans'); target.el.style.zIndex = 900;
    state.carry = target; placeCarried(); Sfx.lift();
    const r0 = state.rope, lift = r0 * 0.5;
    await tween(520, (v) => setRope(r0 - lift * v));
    await wait(160);
    setArms(true); Sfx.slip(); state.carry = null;
    const x0 = state.x, y0 = 80 + state.rope, s = target.slot;
    await tween(650, (v, p) => {
      target.el.style.transform = `translate(${x0 + (s.x - x0) * p - R}px, ${y0 + (s.y - y0) * v - R}px) rotate(${s.rot * p}deg)`;
    }, ease.bounce);
    placeBall(target);
    requestAnimationFrame(() => target.el.classList.remove('no-trans'));
  } else {
    await wait(260);
  }
  Sfx.lift();
  await ropeUp();
  setArms(true);
  Sfx.miss(); toast(pick(CONFIG.MISS_MESSAGES));
  jostle(3);
  await goHome();
  await wait(500);
  setBusy(false);
}

async function catchSequence(target) {
  target.inPit = false;
  attach(target); Sfx.lift();
  await ropeUp();
  await wait(80);
  const x0 = state.x;
  await tween(520 + Math.abs(x0 - CHUTE_X) * 1.5, (v) => setX(x0 + (CHUTE_X - x0) * v));
  await wait(140);

  // release into the prize chute
  setArms(true); Sfx.release(); state.carry = null;
  const y0 = 80 + state.rope, y1 = H - 36;
  await tween(430, (v) => { target.el.style.transform = `translate(${CHUTE_X - R}px, ${y0 + (y1 - y0) * v - R}px) rotate(0deg)`; }, ease.in);
  Sfx.thud();
  chuteEl.classList.remove('glow'); void chuteEl.offsetWidth; chuteEl.classList.add('glow');
  target.el.classList.add('hidden');
  state.prizes++; hudPrizes.textContent = state.prizes;

  const homing = goHome();                                      // claw returns while the pop-up opens
  await wait(380);
  openReveal(target);
  await homing;
  // setBusy(false) happens when the pop-up is claimed
}

/* =====================================================================
   8. REVEAL POP-UP + VFX
   ===================================================================== */
let current = null;

function openReveal(ball) {
  const prince = ball.special;
  const rarity = prince ? null : rollRarity();                 // special ball ignores rarity entirely
  current = { ball, prince, rarity };

  card.className = 'reveal-card ' + (prince ? 'PRINCE' : rarity);
  medalImg.src = ball.src;
  titleEl.textContent = '';

  if (prince) {
    titleEl.className = 'reveal-title prince-title';
    titleEl.setAttribute('aria-label', CONFIG.SPECIAL_TEXT);
    let i = 0;
    CONFIG.SPECIAL_TEXT.split(' ').forEach((word, wi, arr) => {
      const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
      [...word].forEach((ch) => { const l = document.createElement('span'); l.className = 'l'; l.style.setProperty('--i', i++); l.textContent = ch; w.appendChild(l); });
      titleEl.appendChild(w);
      if (wi < arr.length - 1) titleEl.appendChild(document.createTextNode(' '));
    });
    subEl.textContent = `~ ${CONFIG.SPECIAL_NAME} ~`;
    ribbon.textContent = 'ROYAL TREASURE';
  } else {
    titleEl.className = 'reveal-title';
    titleEl.removeAttribute('aria-label');
    const top = document.createElement('span'); top.className = 't-top'; top.textContent = "CONGRATS YOU'VE GOT A";
    const rar = document.createElement('span'); rar.className = 't-rarity'; rar.textContent = rarity;
    const bang = document.createElement('span'); bang.className = 't-bang'; bang.textContent = '!';
    titleEl.append(top, ' ', rar, bang);
    subEl.textContent = CONFIG.FLAVOR[rarity] || '';
    ribbon.textContent = 'TREASURE CLAIMED';
  }

  reveal.hidden = false;
  startVfx(prince ? 'PRINCE' : rarity);
  btnClaim.focus({ preventScroll: true });
}

function startVfx(kind) {
  const cx = innerWidth / 2, cy = innerHeight / 2 - 30, m = reduceMotion ? 0.35 : 1;
  FX.clear();
  [vfxFlash, vfxRays, vfxVig].forEach((e) => e.classList.remove('on', 'soft', 'rare'));
  void reveal.offsetWidth;

  if (kind === 'PRINCE') {
    Sfx.prince();
    vfxFlash.classList.add('on'); vfxRays.classList.add('on'); vfxVig.classList.add('on');
    FX.burst({ x: cx, y: cy, n: Math.round(240 * m), colors: ['gold', 'white', 'amber', 'cream'], speed: [160, 900], size: [18, 48], life: [1, 2.4], gravity: 200, confetti: Math.round(80 * m) });
    setTimeout(() => FX.burst({ x: cx, y: cy, n: Math.round(140 * m), colors: ['white', 'gold', 'pink', 'cyan'], speed: [100, 700], size: [14, 40], life: [1, 2], gravity: 160 }), 420);
    FX.stream(60 * m, () => ({ x: rand(0, innerWidth), y: -20, vx: rand(-30, 30), vy: rand(90, 240), g: 70, drag: 1, max: rand(3, 5), size: rand(14, 32), spr: pick(['gold', 'white', 'cream', 'amber']) }));
    FX.stream(80 * m, () => ({ x: cx + rand(-60, 60), y: cy + 90, vx: rand(-280, 280), vy: -rand(320, 760), g: 720, drag: 0.992, max: rand(1.2, 2.2), size: rand(12, 30), spr: pick(['gold', 'white', 'amber']) }));
    FX.stream(26 * m, () => { const left = Math.random() < 0.5; return { x: left ? -10 : innerWidth + 10, y: innerHeight * rand(0.4, 0.9), vx: (left ? 1 : -1) * rand(300, 700), vy: -rand(350, 800), g: 520, drag: 0.98, max: rand(2.4, 3.8), size: rand(8, 15), conf: true, color: pick(['#ffd24d', '#fff3b0', '#ff9d00', '#ff6aa8', '#7ff0e0', '#ffffff']) }; });
    FX.stream(34 * m, () => ({ x: rand(0, innerWidth), y: rand(0, innerHeight), vx: 0, vy: 0, g: 0, drag: 1, max: rand(0.6, 1.3), size: rand(22, 54), spr: pick(['white', 'gold', 'cream']) }));
    if (!reduceMotion) {
      setTimeout(() => document.body.classList.add('shake'), 650);
      setTimeout(() => document.body.classList.remove('shake'), 650 + 1800);
    }
  } else if (kind === 'LEGENDARY') {
    Sfx.win('LEGENDARY');
    vfxRays.classList.add('on', 'soft');
    FX.burst({ x: cx, y: cy, n: Math.round(150 * m), colors: ['gold', 'amber', 'white'], speed: [140, 700], size: [16, 40], life: [1, 2.2], gravity: 240, confetti: Math.round(30 * m) });
    FX.stream(24 * m, () => ({ x: cx + rand(-80, 80), y: cy + 100, vx: rand(-120, 120), vy: -rand(200, 460), g: 420, drag: 0.99, max: rand(1.2, 2), size: rand(10, 24), spr: pick(['gold', 'amber', 'white']) }));
  } else if (kind === 'RARE') {
    Sfx.win('RARE');
    vfxRays.classList.add('on', 'soft', 'rare');
    FX.burst({ x: cx, y: cy, n: Math.round(80 * m), colors: ['blue', 'cyan', 'white'], speed: [120, 560], size: [14, 32], life: [0.9, 1.8], gravity: 220 });
  } else {
    Sfx.win('COMMON');
    FX.burst({ x: cx, y: cy, n: Math.round(36 * m), colors: ['cream', 'gold'], speed: [100, 420], size: [12, 26], life: [0.7, 1.4], gravity: 260 });
  }
}

function stopVfx() {
  FX.stopStreams();
  [vfxFlash, vfxRays, vfxVig].forEach((e) => e.classList.remove('on', 'soft', 'rare'));
  document.body.classList.remove('shake');
}

async function claim() {
  if (!current) return;
  const { ball, prince, rarity } = current; current = null;
  stopVfx();
  reveal.hidden = true;
  addToTreasury(ball, prince ? 'ROYAL' : rarity);
  respawn(ball);
  jostle(3);
  await wait(650);
  setBusy(false);
}

/* treasury (last 6 prizes) */
function addToTreasury(ball, cls) {
  treasury.unshift({ src: ball.src, cls });
  treasury = treasury.slice(0, 6);
  renderTreasury(true);
}
function renderTreasury(popFirst) {
  socketsEl.textContent = '';
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('div'); s.className = 'socket';
    const t = treasury[i];
    if (t) {
      s.classList.add(t.cls); if (popFirst && i === 0) s.classList.add('pop');
      const img = new Image(); img.alt = ''; img.src = t.src; img.draggable = false; s.appendChild(img);
    }
    socketsEl.appendChild(s);
  }
}

/* =====================================================================
   9. INPUT
   ===================================================================== */
function refreshDir() {
  state.dir = (state.keyR || state.btnR ? 1 : 0) - (state.keyL || state.btnL ? 1 : 0);
  btnLeft.classList.toggle('down', state.keyL || state.btnL);
  btnRight.classList.toggle('down', state.keyR || state.btnR);
}
function holdButton(btn, side) {
  const on = (e) => { e.preventDefault(); state['btn' + side] = true; Sfx.unlock(); refreshDir(); };
  const off = () => { state['btn' + side] = false; refreshDir(); };
  btn.addEventListener('pointerdown', on);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, off));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
holdButton(btnLeft, 'L'); holdButton(btnRight, 'R');
btnDrop.addEventListener('click', () => { Sfx.unlock(); drop(); });
btnClaim.addEventListener('click', claim);

addEventListener('keydown', (e) => {
  if (!reveal.hidden) return;                                    // pop-up open: only the Claim button listens
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { state.keyL = true; refreshDir(); e.preventDefault(); }
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') { state.keyR = true; refreshDir(); e.preventDefault(); }
  else if ((k === ' ' || k === 'Enter') && !e.repeat) { e.preventDefault(); Sfx.unlock(); drop(); }
});
addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = false;
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = false;
  refreshDir();
});
addEventListener('blur', () => { state.keyL = state.keyR = state.btnL = state.btnR = false; refreshDir(); });

btnSound.classList.toggle('off', Sfx.muted);
btnSound.addEventListener('click', () => { Sfx.setMuted(!Sfx.muted); btnSound.classList.toggle('off', Sfx.muted); Sfx.unlock(); });

/* main loop: horizontal claw movement */
let lastT = performance.now();
(function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (!state.busy && state.dir) { setX(clamp(state.x + state.dir * CONFIG.CLAW_SPEED * dt, MIN_X, MAX_X)); updateReach(); }
  requestAnimationFrame(frame);
})(lastT);

/* =====================================================================
   10. SET-UP: runes, embers, scaling
   ===================================================================== */
function makeRunes(el, n) {
  const ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < n; i++) {
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 10 20');
    const use = document.createElementNS(ns, 'use'); use.setAttribute('href', '#r' + Math.floor(rand(0, 10)));
    svg.appendChild(use); svg.style.animationDelay = (i * 0.37).toFixed(2) + 's'; el.appendChild(svg);
  }
}
function makeEmbers(n) {
  const host = $('#embers');
  for (let i = 0; i < n; i++) {
    const e = document.createElement('i');
    e.style.left = rand(0, 100) + '%'; e.style.setProperty('--dx', rand(-80, 80) + 'px');
    e.style.animationDuration = rand(7, 15) + 's'; e.style.animationDelay = -rand(0, 15) + 's';
    e.style.width = e.style.height = rand(2, 5) + 'px';
    host.appendChild(e);
  }
}
function fit() {
  const stageW = 684, stageH = stage.offsetHeight;
  const s = clamp(Math.min((innerWidth - 16) / stageW, (innerHeight - 16) / stageH), 0.4, 1.25);
  stage.style.transform = `scale(${s})`;
  wrap.style.width = stageW * s + 'px'; wrap.style.height = stageH * s + 'px';
}

function init() {
  makeRunes($('#runesTop'), 11); makeRunes($('#runesLeft'), 7); makeRunes($('#runesRight'), 7);
  makeEmbers(reduceMotion ? 0 : 24);

  const total = Object.values(CONFIG.RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  $('#odds').textContent = 'FORTUNE · ' + Object.entries(CONFIG.RARITY_WEIGHTS).map(([k, w]) => `${k} ${Math.round((w / total) * 100)}%`).join(' · ');

  buildBalls();
  renderTreasury(false);
  setX(state.x); setRope(0); setArms(true);
  updateReach();

  fit();
  addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
}
init();

})();
