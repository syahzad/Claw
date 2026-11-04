/* =====================================================================
   THE ROYAL CLAW — game logic (v2: real physics + 3D depth)
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
     The pile adapts automatically to the number of balls (up to ~40).      */
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
    // 'PASTE_IMAGE_URL_HERE',      // ← add more balls by pasting links
  ],

  /* ---- THE SPECIAL BALL (always added to the machine) ------------------ */
  SPECIAL_BALL: 'balls/prince-syahzad-of-xi-9.png',   // ← PRINCE image link
  SPECIAL_NAME: 'Prince Syahzad of XI-9',
  SPECIAL_TEXT: "HE'S SO HANDSOME OMG!!",
  HIGHLIGHT_SPECIAL: true,   // faint golden shimmer on his ball (false = he is a surprise)

  /* Shown if an image link fails to load (optional). '' = built-in rune orb */
  PLACEHOLDER_IMAGE: '',

  /* ---- GAMEPLAY -------------------------------------------------------- */
  GRAB_TOLERANCE: 12,         // px: claw this close (sideways AND depth) to a ball's centre = full grip
  GRAB_TOLERANCE_MAX: 24,     // px: further than this it grabs nothing; in between the grip weakens
  MISS_CHANCE: 0.25,          // extra chance a well-aligned grip still slips on the way up
  PRINCE_MISS_CHANCE: 0.90,   // same, but when the Prince ball is the one gripped (0.90 = 90% slips)
  CLAW_SPEED: 170,            // px/s sideways
  CLAW_SPEED_DEPTH: 105,      // px/s towards / away from the glass
  CLAW_SHADOW: true,          // soft shadow of the claw on the pile (natural depth cue)

  /* ---- PHYSICS FEEL ---------------------------------------------------- */
  GRAVITY: 1900,
  BOUNCE: 0.34,               // how lively balls are when they hit things
  ROLL_FRICTION: 2.0,         // higher = balls stop rolling sooner
  JIGGLE: 1,                  // squash & wobble strength (0 = off)
  SHAKE_AFTER_ROUND: true,    // the machine gives the pile a little shake after every round so buried balls surface

  /* ---- RARITY (chance based, independent of which ball is caught) ------ */
  RARITY_WEIGHTS: { COMMON: 60, RARE: 30, LEGENDARY: 10 },

  MISS_MESSAGES: [
    'THE CLAW SLIPPED!', 'SO CLOSE, TRAVELER!', 'THE GODS ARE UNKIND!', 'FORTUNE FROWNS...', 'ALAS, NOTHING!'
  ],
  EMPTY_MESSAGES: [
    'ONLY AIR...', 'MISALIGNED, TRAVELER!', 'THE CLAW FOUND NOTHING!', 'A LITTLE TO THE SIDE...'
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
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* resolves when cond() is true (checked every frame) or after max ms */
const until = (cond, max = 20000) => new Promise((res) => {
  const t0 = performance.now();
  (function chk() { if (cond() || performance.now() - t0 > max) res(); else requestAnimationFrame(chk); })();
});

/* ---- machine geometry (design px, matches style.css) -------------------
   x: left→right 0..W   y: top→bottom 0..H   z: front glass (0) → back wall (D)   */
const W = 536, H = 470, D = 170;              // pit size: width, height, depth
const R = 40;                                 // ball radius
const F = 460;                                // floor height (y)
const WALL_X0 = 112, WALL_X1 = 124, WALL_TOP = F - 240;   // divider wall in front of the prize chute
const CHUTE_X = 56;                           // where the claw lets go over the chute
const MIN_X = 40, MAX_X = W - 40, MIN_Z = R, MAX_Z = D - R;
const HUB_REST = 84, HUB_OFF = 4, HUB_R = 18, CRADLE = 60;
const BRIDGE_Y = 22;
const VX = W / 2, VY = 170, FOC = 700;        // camera: vanishing point + focal length
const RES = 2;                                // canvas pixel density

function proj(x, y, z) { const s = FOC / (FOC + z); return [VX + (x - VX) * s, VY + (y - VY) * s, s]; }

/* =====================================================================
   3. SOUND (tiny WebAudio synth, no audio files needed)
   ===================================================================== */
const Sfx = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false, lastClack = 0;
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
    clack(power) {                                   // ball-on-ball knock, rate limited
      const now = performance.now(); if (now - lastClack < 45) return; lastClack = now;
      const v = clamp(power / 900, 0.05, 0.6);
      tone({ f: rand(170, 260), to: 90, t: 0.07, type: 'triangle', v: 0.09 * v });
      noise({ t: 0.04, v: 0.1 * v, f: 2600, type: 'highpass' });
    },
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
const sceneCv = $('#scene'), chuteEl = $('#chute'), toastEl = $('#toast');
const stickEl = $('#stick'), stickRod = $('#stickRod'), stickKnob = $('#stickKnob');
const btnDrop = $('#btnDrop'), btnSound = $('#btnSound');
const hudTries = $('#hudTries'), hudPrizes = $('#hudPrizes'), socketsEl = $('#sockets');
const reveal = $('#reveal'), card = $('#revealCard'), medalImg = $('#medalImg'), titleEl = $('#revealTitle'), subEl = $('#revealSub'), ribbon = $('#revealRibbon'), btnClaim = $('#btnClaim');
const vfxFlash = $('#vfxFlash'), vfxRays = $('#vfxRays'), vfxVig = $('#vfxVignette');

const state = { busy: false, tries: 0, prizes: 0, prizeTarget: null, keyL: false, keyR: false, keyU: false, keyD: false, stickX: 0, stickZ: 0, dragging: false };
let treasury = [];

/* =====================================================================
   6. PHYSICS — a small 3D sphere simulation (position-based)
   ===================================================================== */
const SUB = 1 / 120, ITER = 5;
const E_BALL = () => CONFIG.BOUNCE, E_FLOOR = () => CONFIG.BOUNCE * 0.9;
const BOXES = [
  { x0: WALL_X0, x1: W + 300, y0: F, y1: F + 600 },              // floor slab (nothing under the chute)
  { x0: WALL_X0, x1: WALL_X1, y0: WALL_TOP, y1: F + 600 },       // divider wall
];
let balls = [];
const _o = { nx: 0, ny: 0 };

function makeBall(src, special) {
  const img = new Image();
  const b = { src, special, img, failed: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, px: 0, py: 0, pz: 0, th: rand(-0.5, 0.5), w: 0, jq: 0, jv: 0, ja: 0,
              active: true, held: false, noClaw: 0, grip: 0, ground: false, touch: false, inHole: false, won: false, seed: rand(0, 100) };
  img.decoding = 'async';
  img.onerror = () => {
    if (CONFIG.PLACEHOLDER_IMAGE && img.src.indexOf(CONFIG.PLACEHOLDER_IMAGE) === -1) { img.src = CONFIG.PLACEHOLDER_IMAGE; return; }
    b.failed = true;
  };
  img.src = src;
  return b;
}

/* sphere (radius rad) vs. an infinite-in-z box; returns penetration depth (>0 when touching) */
function boxPush(b, bx, rad) {
  const cx = b.x < bx.x0 ? bx.x0 : b.x > bx.x1 ? bx.x1 : b.x;
  const cy = b.y < bx.y0 ? bx.y0 : b.y > bx.y1 ? bx.y1 : b.y;
  const dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
  if (d2 >= rad * rad) return 0;
  if (d2 > 1e-8) { const d = Math.sqrt(d2); _o.nx = dx / d; _o.ny = dy / d; return rad - d; }
  const l = b.x - bx.x0, r = bx.x1 - b.x, t = b.y - bx.y0;
  if (t <= l && t <= r) { _o.nx = 0; _o.ny = -1; return t + rad; }
  if (l < r) { _o.nx = -1; _o.ny = 0; return l + rad; }
  _o.nx = 1; _o.ny = 0; return r + rad;
}

function jiggle(b, nx, ny, speed) {
  if (!CONFIG.JIGGLE) return;
  const amp = clamp((speed - 70) * 0.0007, 0, 0.3) * CONFIG.JIGGLE;
  if (amp <= 0) return;
  b.ja = Math.atan2(ny, nx);
  b.jq = Math.max(b.jq, amp * 0.35);
  b.jv += amp * 18;
}

let onFell = () => {};

function physicsStep(dt) {
  const act = []; for (const b of balls) if (b.active) act.push(b);
  const n = act.length, G = CONFIG.GRAVITY;

  /* 1. bounce (restitution) on impact, plus squash/jiggle + knock sounds */
  for (let i = 0; i < n; i++) {
    const a = act[i];
    for (const bx of BOXES) {
      if (boxPush(a, bx, R + 1) > 0) {
        const vn = a.vx * _o.nx + a.vy * _o.ny;
        if (vn < -90) { a.vx -= (1 + E_FLOOR()) * vn * _o.nx; a.vy -= (1 + E_FLOOR()) * vn * _o.ny; jiggle(a, _o.nx, _o.ny, -vn); if (-vn > 260) Sfx.clack(-vn); }
      }
    }
    for (let j = i + 1; j < n; j++) {
      const c = act[j], dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z, d2 = dx * dx + dy * dy + dz * dz, lim = 2 * R + 1;
      if (d2 < lim * lim && d2 > 1e-6) {
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d;
        const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny + (c.vz - a.vz) * nz;
        if (vn < -90) {
          const k = -(1 + E_BALL()) * vn * 0.5;
          a.vx -= k * nx; a.vy -= k * ny; a.vz -= k * nz; c.vx += k * nx; c.vy += k * ny; c.vz += k * nz;
          jiggle(a, nx, ny, -vn); jiggle(c, -nx, -ny, -vn); if (-vn > 260) Sfx.clack(-vn);
        }
      }
    }
  }

  /* 2. the claw softly shoves whatever it touches (prongs, hub) */
  if (claw.cols.length) {
    for (const b of act) {
      if (b.held || b.noClaw > 0) continue;                      // a ball that was just let go slips out of the claw untouched
      for (const c of claw.cols) {
        const dx = b.x - c.x, dy = b.y - c.y, dz = b.z - c.z, rr = R + c.r, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d;
          if (b.vx * nx + b.vy * ny + b.vz * nz > 380) continue;  // never shove faster than a firm nudge
          const k = Math.min((rr - d) * 18, 45);
          b.vx += nx * k; b.vy += ny * k; b.vz += nz * k;
        }
      }
    }
  }

  /* 3. integrate */
  for (const b of act) {
    b.ground = false; b.touch = false; if (b.noClaw > 0) b.noClaw--;
    if (b.held) {                                             // servo towards the claw cradle
      b.grip = Math.min(1, b.grip + dt / 0.5);
      const tx = claw.x + claw.sx, ty = claw.hubY + CRADLE, tz = claw.z + claw.sz, K = 20 * b.grip;
      b.vx = (tx - b.x) * K; b.vy = (ty - b.y) * K + G * dt * (1 - b.grip); b.vz = (tz - b.z) * K;
      const sp = Math.hypot(b.vx, b.vy, b.vz); if (sp > 1100) { const f = 1100 / sp; b.vx *= f; b.vy *= f; b.vz *= f; }
    } else {
      b.vy += G * dt;
      const air = 1 - 0.08 * dt; b.vx *= air; b.vz *= air;
    }
    b.pvx = b.vx; b.pvy = b.vy; b.pvz = b.vz;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  }

  /* 4. solve contacts (walls, floor, other balls) */
  for (let it = 0; it < ITER; it++) {
    for (const b of act) {
      if (b.x < R) b.x = R; else if (b.x > W - R) b.x = W - R;
      if (b.z < R) b.z = R; else if (b.z > D - R) b.z = D - R;
      for (const bx of BOXES) {
        const pen = boxPush(b, bx, R);
        if (pen > 0) {
          b.x += _o.nx * pen; b.y += _o.ny * pen;
          if (_o.ny < -0.5) { b.ground = true; if (bx === BOXES[1]) b.x += (b.x >= (WALL_X0 + WALL_X1) / 2 ? 1 : -1) * 1.4; }   // rounded ridge: balls roll off
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const a = act[i];
      for (let j = i + 1; j < n; j++) {
        const c = act[j], dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z, d2 = dx * dx + dy * dy + dz * dz, lim = 2 * R;
        if (d2 >= lim * lim) continue;
        let d = Math.sqrt(d2), nx, ny, nz;
        if (d < 1e-6) { nx = 0; ny = -1; nz = 0; d = 0; } else { nx = dx / d; ny = dy / d; nz = dz / d; }
        const pen = lim - d, wa = a.held ? 0.2 : 1, wc = c.held ? 0.2 : 1, ws = wa + wc, fa = wa / ws, fc = wc / ws;
        a.x -= nx * pen * fa; a.y -= ny * pen * fa; a.z -= nz * pen * fa;
        c.x += nx * pen * fc; c.y += ny * pen * fc; c.z += nz * pen * fc;
        a.touch = true; c.touch = true;
      }
    }
  }

  /* 5. new velocities from movement, then friction / damping / spin */
  const roll = CONFIG.ROLL_FRICTION;
  for (const b of act) {
    b.vx = (b.x - b.px) / dt; b.vy = (b.y - b.py) / dt; b.vz = (b.z - b.pz) / dt;
    const sp = Math.hypot(b.vx, b.vy, b.vz); if (sp > 1500) { const f = 1500 / sp; b.vx *= f; b.vy *= f; b.vz *= f; }
    if (!b.held) {
      if (b.ground) { const f = 1 - roll * dt; b.vx *= f; b.vz *= f; }
      if (b.touch) { const f = 1 - 0.9 * dt; b.vx *= f; b.vy *= f; b.vz *= f; }
      if ((b.ground || b.touch) && Math.hypot(b.vx, b.vy, b.vz) < 5) { b.vx = b.vy = b.vz = 0; }
    }
    if (b.held) b.w *= 0.9;
    else if (b.ground || b.touch) b.w += (b.vx / R * 0.6 - b.w) * Math.min(1, 8 * dt);
    else b.w *= 1 - 0.6 * dt;
    b.w += -Math.sin(b.th) * 18 * dt; b.w *= 1 - 2.2 * dt;        // weighted base: faces swing back upright
    b.th += b.w * dt;

    if (b.x < WALL_X0 && b.y > F + 20) b.inHole = true;
    if (b.inHole && b.y > H + 80) { b.active = false; b.held = false; onFell(b); }
    if (!(b.x + b.y + b.z === b.x + b.y + b.z)) respawnBall(b);   // NaN guard
  }
}

function jiggleSprings(dt) {
  for (const b of balls) {
    if (!b.active) continue;
    b.jv += (-520 * b.jq - 13 * b.jv) * dt; b.jq += b.jv * dt;
    b.jq = clamp(b.jq, -0.3, 0.3);
  }
}

function seedBalls() {
  const list = shuffle(balls.slice());
  list.forEach((b, k) => {
    const level = Math.floor(k / 10), idx = k % 10, ix = idx % 5, iz = Math.floor(idx / 5);
    b.x = 164 + ix * 83 + rand(-6, 6); b.z = 44 + iz * 82 + rand(-5, 5); b.y = F - R - level * (2 * R + 8) - rand(0, 6);
    b.vx = b.vy = b.vz = 0;
  });
  for (let i = 0; i < 330; i++) physicsStep(SUB);                // let the pile settle before the player sees it
  balls.forEach((b) => { b.vx = b.vy = b.vz = 0; b.w = 0; b.jq = b.jv = 0; });
}

function respawnBall(b) {
  b.x = rand(330, 496); b.z = rand(MIN_Z, MAX_Z); b.y = -50;
  b.vx = rand(-40, 40); b.vy = 0; b.vz = rand(-20, 20);
  b.active = true; b.held = false; b.inHole = false; b.won = false; b.grip = 0;
  b.th = rand(-1, 1); b.w = rand(-2, 2); b.jq = b.jv = 0;
}

/* a little tremor: balls hop and re-settle, so the pile slowly reshuffles (buried balls surface) */
function agitate(power = 380) {
  for (const b of balls) {
    if (!b.active || b.held) continue;
    b.vy -= rand(0.35, 1) * power; b.vx += rand(-70, 70); b.vz += rand(-55, 55);
    jiggle(b, 0, -1, 260);
  }
  Sfx.thud();
  if (!reduceMotion) { cabinet.classList.remove('rumble'); void cabinet.offsetWidth; cabinet.classList.add('rumble'); }
}
function endRound() { if (CONFIG.SHAKE_AFTER_ROUND) agitate(); setBusy(false); }

/* =====================================================================
   7. THE CLAW
   ===================================================================== */
const PR = { r0: 18, y0: 12, L1: 58, L2: 50, aOpen: 48, aClosed: -6, hook: 50, rp: 6 };
const PHI = [Math.PI / 2, Math.PI / 2 + TAU / 3, Math.PI / 2 + 2 * TAU / 3];

function prongLocal(c) {                                         // one prong as 7 points (radial r, drop y) for openness c (0..1)
  const a1 = lerp(PR.aClosed, PR.aOpen, c) * Math.PI / 180, a2 = a1 - PR.hook * Math.PI / 180;
  const pts = [{ r: PR.r0, y: PR.y0 }];
  for (let i = 1; i <= 3; i++) pts.push({ r: PR.r0 + Math.sin(a1) * PR.L1 * i / 3, y: PR.y0 + Math.cos(a1) * PR.L1 * i / 3 });
  const r1 = pts[3].r, y1 = pts[3].y;
  for (let i = 1; i <= 3; i++) pts.push({ r: r1 + Math.sin(a2) * PR.L2 * i / 3, y: y1 + Math.cos(a2) * PR.L2 * i / 3 });
  return pts;
}
const HUB_MAX = F - Math.max(...prongLocal(1).map((p) => p.y)) - PR.rp - 3;   // lowest the open claw may dip

const claw = {
  x: W / 2, z: D / 2, hubY: HUB_REST, vx: 0, vz: 0, pvx: 0, pvz: 0,
  sx: 0, sz: 0, svx: 0, svz: 0,                                   // rope sway
  open: 1, targetOpen: 1,
  mode: 'idle', tx: 0, tz: 0, slipAtY: null, cols: [],
};
const hubPos = () => ({ x: claw.x + claw.sx, y: claw.hubY, z: claw.z + claw.sz });

function clawColliders() {
  const h = hubPos(), cols = [{ x: h.x, y: h.y + HUB_OFF, z: h.z, r: HUB_R }];
  const pts = prongLocal(claw.open);
  for (const phi of PHI) {
    const cs = Math.cos(phi), sn = Math.sin(phi);
    for (const p of pts) cols.push({ x: h.x + cs * p.r, y: h.y + p.y, z: h.z + sn * p.r, r: PR.rp });
  }
  return cols;
}

function hubTouchesBall() {
  const h = hubPos();
  for (const b of balls) {
    if (!b.active || b.held) continue;
    const dx = b.x - h.x, dy = b.y - (h.y + HUB_OFF), dz = b.z - h.z;
    if (dx * dx + dy * dy + dz * dz < (R + HUB_R - 2) * (R + HUB_R - 2)) return true;
  }
  return false;
}

function releaseHeld(b, kick = true) {
  if (!b) return;
  b.held = false; b.noClaw = 110;
  if (kick) { b.vx += rand(-60, 60); b.vz += rand(-40, 40); }
}

function updateClaw(dt) {
  const c = claw, DESC = 230, LIFT = 235, TRAVEL = 280;

  /* player input */
  if (!state.busy) {
    const ix = clamp(state.stickX + (state.keyR ? 1 : 0) - (state.keyL ? 1 : 0), -1, 1);
    const iz = clamp(state.stickZ + (state.keyU ? 1 : 0) - (state.keyD ? 1 : 0), -1, 1);
    const dz = (v) => (Math.abs(v) < 0.14 ? 0 : v);
    c.vx += (dz(ix) * CONFIG.CLAW_SPEED - c.vx) * Math.min(1, 9 * dt);
    c.vz += (dz(iz) * CONFIG.CLAW_SPEED_DEPTH - c.vz) * Math.min(1, 9 * dt);
    c.x = clamp(c.x + c.vx * dt, MIN_X, MAX_X); c.z = clamp(c.z + c.vz * dt, MIN_Z, MAX_Z);
  } else if (c.mode !== 'travel') {
    c.vx *= 1 - Math.min(1, 10 * dt); c.vz *= 1 - Math.min(1, 10 * dt);
  }

  if (c.mode === 'descend') {
    c.hubY += DESC * dt;
    if (c.hubY >= HUB_MAX) { c.hubY = HUB_MAX; c.mode = 'idle'; }
    else if (hubTouchesBall()) c.mode = 'idle';
  } else if (c.mode === 'lift') {
    c.hubY -= LIFT * dt;
    if (c.slipAtY !== null && c.hubY <= c.slipAtY) {              // the grip lets go on the way up
      c.slipAtY = null;
      const held = balls.find((b) => b.held);
      if (held) { releaseHeld(held); c.targetOpen = 0.55; Sfx.slip(); toast(pick(CONFIG.MISS_MESSAGES)); Sfx.miss(); }
    }
    if (c.hubY <= HUB_REST) { c.hubY = HUB_REST; c.mode = 'idle'; }
  } else if (c.mode === 'travel') {
    const dx = c.tx - c.x, dz = c.tz - c.z, dist = Math.hypot(dx, dz);
    if (dist < 1.5) { c.x = c.tx; c.z = c.tz; c.vx = c.vz = 0; c.mode = 'idle'; }
    else {
      const sp = Math.min(TRAVEL, 40 + dist * 4.5), step = Math.min(dist, sp * dt);
      c.vx = dx / dist * sp; c.vz = dz / dist * sp; c.x += dx / dist * step; c.z += dz / dist * step;
    }
  }

  /* rope sway: the claw head lags behind the trolley and swings back */
  const ax = (c.vx - c.pvx) / Math.max(dt, 1e-3), az = (c.vz - c.pvz) / Math.max(dt, 1e-3);
  c.pvx = c.vx; c.pvz = c.vz;
  c.svx += (-40 * c.sx - 4.2 * c.svx - 0.12 * ax) * dt; c.svz += (-40 * c.sz - 4.2 * c.svz - 0.12 * az) * dt;
  c.sx = clamp(c.sx + c.svx * dt, -16, 16); c.sz = clamp(c.sz + c.svz * dt, -12, 12);

  c.open += clamp(c.targetOpen - c.open, -2.2 * dt, 2.2 * dt);
  c.cols = clawColliders();
}

/* how well is the claw lined up with a ball right now? */
function evaluateGrab() {
  const h = hubPos(), hy = h.y + HUB_OFF;
  let best = null, bd = 1e9;
  for (const b of balls) {
    if (!b.active || b.held) continue;
    const dy = b.y - hy; if (dy < 30 || dy > 90) continue;      // must sit inside the claw's cage
    const d = Math.hypot(b.x - h.x, b.z - h.z);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best || bd > CONFIG.GRAB_TOLERANCE_MAX) return { target: null };
  const tol = CONFIG.GRAB_TOLERANCE, q = bd <= tol ? 1 : 1 - 0.75 * (bd - tol) / (CONFIG.GRAB_TOLERANCE_MAX - tol);
  const miss = best.special ? CONFIG.PRINCE_MISS_CHANCE : CONFIG.MISS_CHANCE;
  const slip = Math.random() >= (1 - miss) * q;                  // random chance to lose it (worse when off-centre)
  return { target: best, d: bd, q, slip };
}

/* =====================================================================
   8. RULES / GAME FLOW
   ===================================================================== */
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

function setBusy(v) {
  state.busy = v;
  cabinet.classList.toggle('busy', v);
  btnDrop.disabled = v;
}

const goTo = async (x, z) => { claw.tx = x; claw.tz = z; claw.mode = 'travel'; await until(() => claw.mode === 'idle'); };

onFell = (b) => {
  if (b === state.prizeTarget) { b.won = true; }
  else setTimeout(() => respawnBall(b), 600);                    // something else fell in by accident: put it back
};

async function drop() {
  if (state.busy || !reveal.hidden) return;
  setBusy(true);
  state.tries++; hudTries.textContent = state.tries;
  navigator.vibrate && navigator.vibrate(15);

  await wait(300);                                               // let the rope stop swinging
  Sfx.drop(); claw.targetOpen = 1; claw.mode = 'descend';
  await until(() => claw.mode === 'idle');
  await wait(160);

  /* does the claw really have a ball between its prongs? (precision matters) */
  const g = evaluateGrab();
  claw.targetOpen = 0; Sfx.clunk();
  if (g.target) { g.target.held = true; g.target.grip = 0; }
  await wait(700);

  claw.slipAtY = g.target && g.slip ? lerp(HUB_REST, claw.hubY, rand(0.12, 0.8)) : null;
  claw.mode = 'lift'; Sfx.lift();
  await until(() => claw.mode === 'idle');
  const holding = g.target && g.target.held;

  if (!holding) {                                                // missed: nothing, or it slipped on the way up
    if (!g.target) { Sfx.miss(); toast(pick(CONFIG.EMPTY_MESSAGES)); }
    claw.targetOpen = 1;
    await goTo(W / 2, D / 2);
    await wait(600);
    endRound();
    return;
  }

  /* carry the prize to the chute and let go */
  await goTo(CHUTE_X, claw.z);
  await wait(200);
  state.prizeTarget = g.target;
  claw.targetOpen = 1; Sfx.release(); releaseHeld(g.target, false);
  await until(() => g.target.won, 3600);

  if (!g.target.won) {                                           // it bounced back out of the chute
    state.prizeTarget = null;
    Sfx.miss(); toast('IT ROLLED AWAY!');
    await goTo(W / 2, D / 2);
    await wait(500);
    endRound();
    return;
  }

  Sfx.thud(); navigator.vibrate && navigator.vibrate([30, 40, 60]);
  chuteEl.classList.remove('glow'); void chuteEl.offsetWidth; chuteEl.classList.add('glow');
  state.prizes++; hudPrizes.textContent = state.prizes;
  const homing = goTo(W / 2, D / 2);
  await wait(380);
  openReveal(g.target);
  await homing;
  // setBusy(false) happens when the pop-up is claimed
}

/* =====================================================================
   9. REVEAL POP-UP + VFX
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
    navigator.vibrate && navigator.vibrate([60, 40, 60, 40, 120]);
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
  state.prizeTarget = null;
  respawnBall(ball);                                             // the ball tumbles back into the pile from above
  await wait(1100);
  endRound();
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
   10. RENDERING — painter's algorithm on one canvas, with perspective
   ===================================================================== */
const ctx = sceneCv.getContext('2d');
sceneCv.width = W * RES; sceneCv.height = H * RES;
let backdrop = null;

function buildBackdrop() {
  const cv = document.createElement('canvas'); cv.width = W * RES; cv.height = H * RES;
  const g = cv.getContext('2d'); g.scale(RES, RES);
  const rnd = mulberry32(11);
  const poly = (pts, fill, stroke, lw) => {
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.lineJoin = 'round'; g.stroke(); }
  };
  /* a grid of bricks / planks laid on any plane: map(u,v) -> projected point */
  const grid = (map, u0, u1, v0, v1, rowH, colW, hue, sat, lum, lumVar, mortar) => {
    const rows = Math.ceil((v1 - v0) / rowH);
    for (let r = 0; r < rows; r++) {
      const va = v0 + r * rowH, vb = Math.min(v1, va + rowH), off = (r % 2) * colW / 2;
      for (let ua0 = u0 - off; ua0 < u1; ua0 += colW) {
        const ua = Math.max(u0, ua0), ub = Math.min(u1, ua0 + colW);
        if (ub - ua < 2) continue;
        const l = lum + (rnd() - 0.5) * lumVar;
        poly([map(ua, va), map(ub, va), map(ub, vb), map(ua, vb)], `hsl(${hue + (rnd() - 0.5) * 10},${sat}%,${l}%)`, mortar || 'rgba(0,0,0,.55)', 1.3);
      }
    }
  };
  const shade = (pts, a0, a1, horizontal) => {            // darkening gradient over a polygon
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const gr = horizontal ? g.createLinearGradient(x0, 0, x1, 0) : g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, a0); gr.addColorStop(1, a1);
    poly(pts, gr);
  };

  g.fillStyle = '#07050b'; g.fillRect(0, 0, W, H);

  /* ceiling */
  const ceil = (u, v) => proj(u, 0, v);
  grid(ceil, 0, W, 0, D, 85, 134, 24, 28, 11, 4);
  /* back wall */
  grid((u, v) => proj(u, v, D), 0, W, 0, F, 36, 64, 232, 9, 24, 7);
  /* side walls */
  grid((u, v) => proj(0, v, u), 0, D, 0, F, 36, 56, 232, 9, 25, 7);
  grid((u, v) => proj(W, v, u), 0, D, 0, F, 36, 56, 232, 9, 25, 7);
  /* floor */
  for (let ci = 0, x0 = 0; x0 < W; x0 += 56, ci++) {
    const cut = ci % 2 ? 56 : 112;
    for (const [za, zb] of [[0, cut], [cut, D]]) {
      const l = 17 + rnd() * 6;
      poly([proj(x0, F, za), proj(Math.min(W, x0 + 56), F, za), proj(Math.min(W, x0 + 56), F, zb), proj(x0, F, zb)], `hsl(${26 + rnd() * 6},46%,${l}%)`, 'rgba(0,0,0,.6)', 1.4);
    }
  }

  /* depth shading on every surface (further = darker) */
  shade([proj(0, 0, 0), proj(0, 0, D), proj(0, F, D), proj(0, F, 0)], 'rgba(0,0,0,0)', 'rgba(0,0,0,.55)', true);
  shade([proj(W, 0, D), proj(W, 0, 0), proj(W, F, 0), proj(W, F, D)], 'rgba(0,0,0,.55)', 'rgba(0,0,0,0)', true);
  shade([proj(0, 0, D), proj(W, 0, D), proj(W, F, D), proj(0, F, D)], 'rgba(0,0,0,.3)', 'rgba(0,0,0,.42)', false);
  shade([proj(0, 0, 0), proj(W, 0, 0), proj(W, 0, D), proj(0, 0, D)], 'rgba(0,0,0,.3)', 'rgba(0,0,0,.7)', false);
  shade([proj(0, F, 0), proj(W, F, 0), proj(W, F, D), proj(0, F, D)], 'rgba(0,0,0,.65)', 'rgba(0,0,0,.05)', false);

  /* back wall dressing: arrow slits and hanging banners */
  for (const x of [200, 336]) {
    const a = proj(x, 70, D), b = proj(x + 22, 70, D), c = proj(x + 22, 170, D), d = proj(x, 170, D);
    poly([a, b, c, d], '#0c0a1c', '#25262e', 3);
    const gr = g.createLinearGradient(0, a[1], 0, d[1]); gr.addColorStop(0, 'rgba(90,100,255,.16)'); gr.addColorStop(1, 'rgba(60,60,160,.03)');
    poly([a, b, c, d], gr);
  }
  for (const x of [118, 418]) {
    const a = proj(x, 14, D), b = proj(x + 56, 14, D), c = proj(x + 56, 190, D), m = proj(x + 28, 214, D), d = proj(x, 190, D);
    poly([a, b, c, m, d], '#6d1119', '#d9b052', 2.2);
    const e1 = proj(x + 8, 24, D), e2 = proj(x + 48, 24, D), e3 = proj(x + 48, 180, D), e4 = proj(x + 28, 200, D), e5 = proj(x + 8, 180, D);
    poly([e1, e2, e3, e4, e5], null, 'rgba(224,176,80,.55)', 1);
    const cc = proj(x + 28, 96, D); g.fillStyle = 'rgba(224,176,80,.85)'; g.beginPath(); g.arc(cc[0], cc[1], 9 * cc[2], 0, TAU); g.fill();
    g.fillStyle = '#6d1119'; g.beginPath(); g.arc(cc[0], cc[1], 4.5 * cc[2], 0, TAU); g.fill();
  }

  /* the prize chute: a dark shaft in the floor with a tall stone divider */
  poly([proj(0, F, 0), proj(WALL_X0, F, 0), proj(WALL_X0, F, D), proj(0, F, D)], '#030204');
  const ch = g.createLinearGradient(0, proj(0, F, D)[1], 0, F + 10); ch.addColorStop(0, 'rgba(255,180,80,.0)'); ch.addColorStop(1, 'rgba(255,180,80,.14)');
  poly([proj(0, F, 0), proj(WALL_X0, F, 0), proj(WALL_X0, F, D), proj(0, F, D)], ch);
  grid((u, v) => proj(WALL_X1, v, u), 0, D, WALL_TOP, F, 34, 56, 232, 8, 20, 6);                     // wall: side face
  shade([proj(WALL_X1, WALL_TOP, 0), proj(WALL_X1, WALL_TOP, D), proj(WALL_X1, F, D), proj(WALL_X1, F, 0)], 'rgba(0,0,0,.05)', 'rgba(0,0,0,.5)', true);
  poly([proj(WALL_X0, WALL_TOP, 0), proj(WALL_X1, WALL_TOP, 0), proj(WALL_X1, WALL_TOP, D), proj(WALL_X0, WALL_TOP, D)], '#6a6e7a', '#15161a', 1.5);   // top face
  grid((u, v) => proj(u, v, 0), WALL_X0, WALL_X1, WALL_TOP, F, 34, 12, 232, 8, 30, 6);              // front face
  poly([proj(WALL_X0, WALL_TOP, 0), proj(WALL_X1, WALL_TOP, 0), proj(WALL_X1, WALL_TOP, D), proj(WALL_X0, WALL_TOP, D)], 'rgba(255,255,255,.08)');

  /* iron gantry rails along both walls */
  for (const [x0, x1] of [[0, 16], [W - 16, W]]) {
    poly([proj(x0, BRIDGE_Y - 9, 0), proj(x1, BRIDGE_Y - 9, 0), proj(x1, BRIDGE_Y - 9, D), proj(x0, BRIDGE_Y - 9, D)], '#7a808c', '#101114', 1.2);
    poly([proj(x0, BRIDGE_Y + 9, 0), proj(x1, BRIDGE_Y + 9, 0), proj(x1, BRIDGE_Y + 9, D), proj(x0, BRIDGE_Y + 9, D)], '#2c2f36', '#101114', 1.2);
  }

  /* torch light washing the room */
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, rr] of [[-10, 120, 260], [W + 10, 120, 260], [VX, 20, 240]]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,150,60,.34)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  g.globalCompositeOperation = 'source-over';
  /* ambient occlusion + vignette */
  const vg = g.createRadialGradient(VX, 260, 120, VX, 260, 380); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.62)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  /* the strip of floor edge facing us */
  g.fillStyle = '#2a170a'; g.fillRect(0, F, W, H - F);
  g.fillStyle = 'rgba(255,200,120,.18)'; g.fillRect(0, F, W, 1.5);
  return cv;
}

function drawBall(b, t) {
  const [sx, sy, s] = proj(b.x, b.y, b.z), r = R * s;
  ctx.save();
  ctx.translate(sx, sy);
  if (CONFIG.HIGHLIGHT_SPECIAL && b.special) {                  // royal halo
    const a = 0.32 + 0.14 * Math.sin(t * 3);
    const gr = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.45); gr.addColorStop(0, `rgba(255,215,90,${a})`); gr.addColorStop(1, 'rgba(255,215,90,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
  }
  const q = b.jq;                                               // jiggle: squash along the impact axis
  if (Math.abs(q) > 0.002) { ctx.rotate(b.ja); ctx.scale(1 - q, 1 + q * 0.65); ctx.rotate(-b.ja); }
  ctx.save(); ctx.rotate(b.th);
  const img = b.img;
  if (img.complete && img.naturalWidth > 0 && !b.failed) ctx.drawImage(img, -r, -r, 2 * r, 2 * r);
  else {
    const gr = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r); gr.addColorStop(0, '#79808e'); gr.addColorStop(1, '#262a32');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r * 0.97, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e0b050'; ctx.lineWidth = 3 * s; ctx.stroke();
    ctx.fillStyle = '#e0b050'; ctx.font = `${r * 0.9}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', 0, 0);
  }
  ctx.restore();
  /* sphere shading: soft shadow side + gloss, stronger fog the further back it is */
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.985, 0, TAU); ctx.clip();
  const sh = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  sh.addColorStop(0, 'rgba(255,255,255,.0)'); sh.addColorStop(0.62, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.42)');
  ctx.fillStyle = sh; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  const fog = clamp(0.06 + (b.z / D) * 0.34 + (b.y < F - 3 * R ? 0 : (b.y - (F - 3 * R)) / (3 * R) * 0.12), 0, 0.6);
  ctx.fillStyle = `rgba(8,5,16,${fog})`; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  const gl = ctx.createRadialGradient(-r * 0.38, -r * 0.5, 0, -r * 0.38, -r * 0.5, r * 0.55);
  gl.addColorStop(0, 'rgba(255,255,255,.38)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  ctx.restore();
  ctx.restore();
}

function ellipseShadow(x, y, z, rx, a) {
  const [sx, sy, s] = proj(x, y, z);
  ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.32);
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * s); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rx * s, 0, TAU); ctx.fill(); ctx.restore();
}

function ironGradient(x0, y0, x1, y1) {
  const gr = ctx.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#9aa0ad'); gr.addColorStop(0.45, '#4c505a'); gr.addColorStop(0.55, '#2d3037'); gr.addColorStop(1, '#5d626d');
  return gr;
}

function drawBridge() {                                         // the moving iron beam + trolley at the ceiling
  const cz = claw.z, [lx, ty] = proj(0, BRIDGE_Y - 9, cz), [rx, by, s] = proj(W, BRIDGE_Y + 9, cz);
  ctx.fillStyle = ironGradient(0, ty, 0, by); ctx.fillRect(lx, ty, rx - lx, by - ty);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(lx, by - 1.5 * s, rx - lx, 1.5 * s);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(lx, ty, rx - lx, 1.2 * s);
  ctx.fillStyle = '#d6b05a'; for (let x = 20; x < W; x += 44) { const [px, py] = proj(x, BRIDGE_Y, cz); ctx.beginPath(); ctx.arc(px, py, 1.7 * s, 0, TAU); ctx.fill(); }
  /* soft shadow the beam throws on the back wall */
  const [, sy2] = proj(0, BRIDGE_Y + 30, D);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(proj(0, 0, D)[0], sy2, proj(W, 0, D)[0] - proj(0, 0, D)[0], 6);
  /* trolley */
  const [tx, tyc, ts] = proj(claw.x, BRIDGE_Y + 8, cz);
  ctx.save(); ctx.translate(tx, tyc); ctx.scale(ts, ts);
  ctx.fillStyle = ironGradient(0, -14, 0, 16); ctx.strokeStyle = '#101114'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-30, -14, 60, 32, 5) : ctx.rect(-30, -14, 60, 32); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d6b05a'; for (const x of [-20, 20]) { ctx.beginPath(); ctx.arc(x, 2, 3.4, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function drawRope() {
  const h = hubPos(), [x0, y0, s0] = proj(claw.x, BRIDGE_Y + 24, claw.z), [x1, y1, s1] = proj(h.x, h.y - 30, h.z);
  const w0 = 5.2 * (s0 + s1) / 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a1209'; ctx.lineWidth = w0 + 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = '#8a6a38'; ctx.lineWidth = w0; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = 'rgba(40,24,8,.8)'; ctx.lineWidth = w0; ctx.setLineDash([2.2 * s0, 5 * s0]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
}

function drawHub(t) {
  const h = hubPos(), [sx, sy, s] = proj(h.x, h.y, h.z);
  ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
  ctx.strokeStyle = '#101114'; ctx.lineWidth = 2;
  ctx.fillStyle = ironGradient(-26, 0, 26, 0); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-26, -32, 52, 22, 6) : ctx.rect(-26, -32, 52, 22); ctx.fill(); ctx.stroke();   // top cap
  const bd = ctx.createLinearGradient(-22, 0, 22, 0); bd.addColorStop(0, '#2b2e35'); bd.addColorStop(0.35, '#b8bec9'); bd.addColorStop(0.6, '#5c616c'); bd.addColorStop(1, '#262930');
  ctx.fillStyle = bd; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-22, -14, 44, 36, 9) : ctx.rect(-22, -14, 44, 36); ctx.fill(); ctx.stroke();                            // body
  ctx.fillStyle = '#d6b05a'; for (const x of [-16, 16]) { ctx.beginPath(); ctx.arc(x, -2, 2.6, 0, TAU); ctx.fill(); }
  const pulse = 0.65 + 0.35 * Math.sin(t * 2.6);                // glowing rune gem
  const gm = ctx.createRadialGradient(0, 2, 0, 0, 2, 9); gm.addColorStop(0, `rgba(190,255,245,${pulse})`); gm.addColorStop(0.5, `rgba(70,220,200,${0.8 * pulse})`); gm.addColorStop(1, 'rgba(70,220,200,0)');
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gm; ctx.beginPath(); ctx.arc(0, 2, 11, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#5de3d3'; ctx.beginPath(); ctx.arc(0, 2, 3.6, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawProng(k) {
  const h = hubPos(), pts = prongLocal(claw.open), phi = PHI[k], cs = Math.cos(phi), sn = Math.sin(phi);
  const P = pts.map((p) => proj(h.x + cs * p.r, h.y + p.y, h.z + sn * p.r));
  const w = 9.5 * P[0][2];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = () => { ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
  ctx.strokeStyle = '#0d0e11'; ctx.lineWidth = w + 3.2; path(); ctx.stroke();
  ctx.strokeStyle = '#6c717d'; ctx.lineWidth = w; path(); ctx.stroke();
  ctx.save(); ctx.translate(-w * 0.17, -w * 0.17); ctx.strokeStyle = 'rgba(215,220,230,.9)'; ctx.lineWidth = w * 0.32; path(); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(w * 0.2, w * 0.2); ctx.strokeStyle = 'rgba(10,10,14,.55)'; ctx.lineWidth = w * 0.3; path(); ctx.stroke(); ctx.restore();
  const tip = P[P.length - 1];
  ctx.fillStyle = '#b9bec9'; ctx.strokeStyle = '#0d0e11'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(tip[0], tip[1], w * 0.42, 0, TAU); ctx.fill(); ctx.stroke();
  const pv = P[0]; ctx.fillStyle = '#d6b05a'; ctx.beginPath(); ctx.arc(pv[0], pv[1], w * 0.36, 0, TAU); ctx.fill(); ctx.stroke();
}

function surfaceY(x, z) {                                       // height of the pile under a point
  let top = F;
  for (const b of balls) {
    if (!b.active || b.held) continue;
    const d2 = (b.x - x) * (b.x - x) + (b.z - z) * (b.z - z);
    if (d2 < R * R) top = Math.min(top, b.y - Math.sqrt(R * R - d2));
  }
  return top;
}

function render(t) {
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(backdrop, 0, 0, W, H);

  /* contact shadows under the balls */
  for (const b of balls) {
    if (!b.active || b.inHole) continue;
    const h = F - R - b.y;
    ellipseShadow(b.x, F, b.z, R * 1.05, clamp(0.5 - h / 260, 0, 0.5));
  }
  drawBridge();

  const items = [];
  for (const b of balls) if (b.active) items.push({ k: b.z, f: () => drawBall(b, t) });
  const h = hubPos();
  items.push({ k: h.z + 0.3, f: drawRope });
  items.push({ k: h.z, f: () => drawHub(t) });
  for (let i = 0; i < 3; i++) items.push({ k: h.z + Math.sin(PHI[i]) * 30 + (i === 0 ? 0.2 : 0), f: () => drawProng(i) });
  if (CONFIG.CLAW_SHADOW) {
    const sy = surfaceY(h.x, h.z), height = Math.max(0, sy - h.y);
    items.push({ k: h.z + 0.6, f: () => ellipseShadow(h.x, sy, h.z, 46 + height * 0.05, clamp(0.5 - height / 700, 0.1, 0.5)) });
  }
  items.sort((a, b) => b.k - a.k);                              // far → near
  for (const it of items) it.f();
}

/* =====================================================================
   11. INPUT (joystick, keyboard, buttons)
   ===================================================================== */
const STICK_R = 46, STICK_BASE = 132;
function drawStick(dx, dy) {                                    // dx,dy in design px, within STICK_R
  const ky = dy - 14, len = Math.hypot(dx, ky), ang = Math.atan2(-dx, ky) * 180 / Math.PI;
  stickKnob.style.transform = `translate(${dx - 28}px, ${ky - 28}px)`;
  stickRod.style.height = len + 'px'; stickRod.style.transform = `translateX(-50%) rotate(${ang}deg)`;
}
function stickFromPointer(e) {
  const r = stickEl.getBoundingClientRect(), sc = r.width / STICK_BASE;
  let dx = (e.clientX - (r.left + r.width / 2)) / sc, dy = (e.clientY - (r.top + r.height / 2)) / sc;
  const m = Math.hypot(dx, dy); if (m > STICK_R) { dx *= STICK_R / m; dy *= STICK_R / m; }
  state.stickX = dx / STICK_R; state.stickZ = -dy / STICK_R; drawStick(dx, dy);
}
stickEl.addEventListener('pointerdown', (e) => {
  e.preventDefault(); Sfx.unlock(); state.dragging = true; stickEl.classList.add('drag');
  try { stickEl.setPointerCapture(e.pointerId); } catch (err) {}
  stickFromPointer(e);
});
stickEl.addEventListener('pointermove', (e) => { if (state.dragging) stickFromPointer(e); });
const stickEnd = () => { if (!state.dragging) return; state.dragging = false; stickEl.classList.remove('drag'); state.stickX = state.stickZ = 0; drawStick(0, 0); };
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => stickEl.addEventListener(ev, stickEnd));
stickEl.addEventListener('contextmenu', (e) => e.preventDefault());

btnDrop.addEventListener('click', () => { Sfx.unlock(); drop(); });
btnClaim.addEventListener('click', claim);

const KEYS = { ArrowLeft: 'keyL', a: 'keyL', A: 'keyL', ArrowRight: 'keyR', d: 'keyR', D: 'keyR', ArrowUp: 'keyU', w: 'keyU', W: 'keyU', ArrowDown: 'keyD', s: 'keyD', S: 'keyD' };
addEventListener('keydown', (e) => {
  if (!reveal.hidden) return;                                    // pop-up open: only the Claim button listens
  if (KEYS[e.key]) { state[KEYS[e.key]] = true; e.preventDefault(); }
  else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); Sfx.unlock(); drop(); }
});
addEventListener('keyup', (e) => { if (KEYS[e.key]) state[KEYS[e.key]] = false; });
addEventListener('blur', () => { state.keyL = state.keyR = state.keyU = state.keyD = false; });

btnSound.classList.toggle('off', Sfx.muted);
btnSound.addEventListener('click', () => { Sfx.setMuted(!Sfx.muted); btnSound.classList.toggle('off', Sfx.muted); Sfx.unlock(); });

/* =====================================================================
   12. MAIN LOOP
   ===================================================================== */
let lastT = performance.now(), acc = 0, stickShown = '', tilt = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  tilt.tx = (e.clientX / innerWidth - 0.5) * 2; tilt.ty = (e.clientY / innerHeight - 0.5) * 2;
});

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  updateClaw(dt);
  acc += dt; let n = 0;
  while (acc >= SUB && n < 6) { physicsStep(SUB); acc -= SUB; n++; }
  if (acc > SUB * 6) acc = 0;
  jiggleSprings(dt);
  render(now / 1000);

  if (!state.dragging) {                                         // keyboard also tilts the joystick
    const kx = (state.keyR ? 1 : 0) - (state.keyL ? 1 : 0), kz = (state.keyU ? 1 : 0) - (state.keyD ? 1 : 0), key = kx + ',' + kz;
    if (key !== stickShown) { stickShown = key; drawStick(kx * STICK_R * 0.8, -kz * STICK_R * 0.8); }
  }
  if (!reduceMotion && reveal.hidden) {                          // subtle parallax tilt of the whole cabinet
    tilt.x += (tilt.tx - tilt.x) * Math.min(1, 4 * dt); tilt.y += (tilt.ty - tilt.y) * Math.min(1, 4 * dt);
    cabinet.style.transform = `rotateY(${(tilt.x * 3).toFixed(2)}deg) rotateX(${(-tilt.y * 2).toFixed(2)}deg)`;
  }
  requestAnimationFrame(frame);
}

/* =====================================================================
   13. SET-UP: runes, embers, scaling
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

  balls = [...CONFIG.BALLS.filter(Boolean).map((s) => makeBall(s, false)), makeBall(CONFIG.SPECIAL_BALL, true)];
  backdrop = buildBackdrop();
  seedBalls();
  claw.cols = clawColliders();
  renderTreasury(false);
  drawStick(0, 0);

  fit();
  addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  requestAnimationFrame(frame);
}
init();

/* tiny debug hook: open the page with #debug to poke at the machine from the console */
if (location.hash === '#debug') window.__claw = { claw, get balls() { return balls; }, state, drop, evaluateGrab, physicsStep, CONFIG, render: () => render(0) };

})();
