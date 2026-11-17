"use strict";
/* =====================================================================
   Le décor pixel-art vivant : ciel selon l'heure, parallaxe, lumières de
   nuit, critters, feux d'artifice… et le compagnon qui fait le trajet
   du bureau jusqu'à la maison au fil de la journée.
   ===================================================================== */
const Scene = (() => {
  let cv, ctx, W = 150, H = 170, SCALE = 6, DPR = 1;
  let WW = 450, theme = 'lagon', petSp = 'cat', petFur = 0;
  const L = {};
  let sky, world, wmask, petL, layers = {}, trees = [];
  let T = 0, lastTs = 0, running = false, hourForce = null, built = false;
  let tod = null, todT = -99;
  const cam = { x: 0, tx: 0, manualUntil: 0, drag: null };
  let st = { kind: 'work', eff: 0, breaks: [], inBreak: -1, almost: false, endedAgo: 9e9, hours: [] };
  let prevKind = null, propsSig = '';
  let parts = [], stars = [], clouds = [], birds = [], crits = [], rockets = [], sparks = [], shoots = [];
  let dolphin = null, nextDolphin = 12, nextBird = 4, flash = 0, nextRocket = 0, sea = null;
  const hooks = { tapPet: null, sfx: null };
  const RND = Math.random;

  /* ---------------- Outils de dessin ---------------- */
  const R = (x, X, Y, w, h, c) => { x.fillStyle = c; x.fillRect(X, Y, w, h); };
  const P1 = (x, X, Y, c) => { x.fillStyle = c; x.fillRect(X, Y, 1, 1); };
  function disc(x, cx, cy, r, c) {
    x.fillStyle = c;
    for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y))); x.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
  }
  function oval(x, cx, cy, rx, ry, c) {
    x.fillStyle = c;
    for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); x.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
  }

  /* ---------------- Heure du jour ---------------- */
  const KEYS = [
    // heure, haut du ciel, milieu, horizon, lumière ambiante, nuit (0..1)
    [0.0, '#0b1031', '#151d4a', '#2a3372', '#5a64ad', 1],
    [4.7, '#0e1538', '#1f2a5c', '#3a3e7f', '#5d67ae', 1],
    [5.4, '#22357a', '#5d5aa0', '#c9849c', '#9a94c4', 0.7],
    [5.9, '#3a62b8', '#c08ab8', '#ffb98a', '#e2c0c4', 0.35],
    [6.5, '#4a86da', '#a6c8ee', '#ffe2b0', '#fbe6d8', 0.05],
    [7.3, '#3f8ce8', '#7cc0f5', '#c9ecff', '#ffffff', 0],
    [16.4, '#3f8ce8', '#7cc0f5', '#c9ecff', '#ffffff', 0],
    [17.1, '#4485dc', '#9cc6f0', '#ffe6b4', '#fff2e0', 0],
    [17.6, '#4a6fc4', '#d9a8c8', '#ffc98a', '#ffe0c0', 0.05],
    [18.1, '#3d4c9e', '#e0809a', '#ff9e6a', '#f0b4a8', 0.25],
    [18.6, '#2a3274', '#8a5a9e', '#e0786e', '#b89cc0', 0.55],
    [19.2, '#161d4c', '#33366e', '#5a4a80', '#6f74b4', 0.85],
    [19.8, '#0e1438', '#1e2652', '#37396f', '#5b63aa', 1],
    [24.0, '#0b1031', '#151d4a', '#2a3372', '#5a64ad', 1],
  ];
  function computeTod(h) {
    let i = 1;
    while (i < KEYS.length - 1 && KEYS[i][0] < h) i++;
    const a = KEYS[i - 1], b = KEYS[i], t = U.clamp((h - a[0]) / (b[0] - a[0] || 1), 0, 1);
    return { h, top: U.mix(a[1], b[1], t), mid: U.mix(a[2], b[2], t), hor: U.mix(a[3], b[3], t), amb: U.mix(a[4], b[4], t), night: U.lerp(a[5], b[5], t) };
  }
  function hourNow() {
    if (hourForce !== null) return hourForce;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  /* ---------------- Mise en page ---------------- */
  function layout() {
    const lagon = theme === 'lagon';
    L.hz = Math.round(H * (lagon ? 0.47 : 0.5));
    L.shore = Math.round(H * 0.655);
    L.ground = lagon ? L.shore : Math.round(H * 0.6);
    L.path = H - 13;
    L.base = L.path - 4;
    WW = Math.max(Math.round(W * 3), 420);
    L.offX = 6; L.offW = 46; L.offH = Math.min(60, L.base - 8);
    L.houW = 60; L.houH = 48; L.houX = WW - L.houW - 10;
    L.startX = L.offX + 23; L.endX = L.houX + 30;
  }
  const pathX = f => L.startX + U.clamp(f, 0, 1) * (L.endX - L.startX);
  const layerW = f => W + Math.ceil((WW - W) * f) + 2;

  /* ---------------- Thèmes ---------------- */
  const THEMES = {
    lagon: {
      farF: 0.12, midF: 0.3, fgF: 1.25,
      offWall: '#9fdcd0', offTrim: '#fbfdf8', awning: ['#ff6b6b', '#fff4e8'],
      houWall: '#fde3ad', roof: '#e0643c', shutter: '#3fa7c9', door: '#9a5b34', planks: true,
      far(x, w) {
        const base = L.hz, x0 = Math.round(w * 0.58);
        const hgt = i => Math.max(
          26 * Math.exp(-Math.pow((i - x0) / 7, 2)),
          15 * Math.exp(-Math.pow((i - x0 + 16) / 20, 2)),
          11 * Math.exp(-Math.pow((i - x0 - 22) / 16, 2)),
          7 * Math.exp(-Math.pow((i - x0 + 52) / 14, 2)),
          9 * Math.exp(-Math.pow((i - w * 0.14) / 13, 2)),
          6 * Math.exp(-Math.pow((i - w * 0.9) / 10, 2)));
        for (let i = 0; i < w; i++) {
          const h = Math.round(hgt(i) + Math.sin(i * 0.7) * 0.5);
          if (h <= 0) continue;
          const lit = hgt(i + 1) - hgt(i - 1) > 0.25;
          for (let j = 0; j < h; j++) {
            const y = base - 1 - j;
            let c = lit ? '#7ba9ba' : '#5d88a2';
            if (j >= h - 2 && lit) c = '#94c2cc';
            if (j > 3 && j < h - 3 && U.bayer(i, y) < 0.12) c = lit ? '#6b9c8a' : '#557f86';
            if (j < 3 && U.bayer(i, y) < (3 - j) / 4) c = '#a9d3de';
            P1(x, i, y, c);
          }
        }
        // petit phare sur l'îlot de droite
        const lx = Math.round(w * 0.9), ly = base - 6;
        R(x, lx, ly - 7, 2, 7, '#f4f1ea'); R(x, lx, ly - 5, 2, 1, '#e0533d'); R(x, lx, ly - 2, 2, 1, '#e0533d');
        R(x, lx - 1, ly - 9, 4, 2, '#5d6170');
        L.lighthouse = { x: lx + 1, y: ly - 8 };
      },
      back(x) {
        const top = L.shore;
        for (let y = top; y < H; y++) {
          const t = (y - top) / (H - top);
          for (let X = 0; X < WW; X++) {
            let c = t < 0.5 ? (U.bayer(X, y) < t * 2 ? '#f1d9a6' : '#f6e3b8') : (U.bayer(X, y) < (t - 0.5) * 2 ? '#ebcb92' : '#f1d9a6');
            if (y < top + 3) c = U.bayer(X, y) < (y - top) / 3 ? '#e9cf98' : '#d9b97f';
            P1(x, X, y, c);
          }
        }
        const r = U.rng(42);
        for (let i = 0; i < WW * (H - top) / 9; i++) P1(x, Math.floor(r() * WW), top + 3 + Math.floor(r() * (H - top - 3)), r() < 0.5 ? '#e1bf86' : '#fff3d2');
        // coquillages, étoiles de mer, rochers, herbes de plage
        for (let i = 0; i < WW / 18; i++) {
          const X = Math.floor(r() * WW), Y = top + 5 + Math.floor(r() * (L.path - top - 12));
          const k = r();
          if (k < 0.35) { P1(x, X, Y, '#fff8f0'); P1(x, X + 1, Y, '#ffc6c6'); P1(x, X, Y + 1, '#d9b080'); }
          else if (k < 0.5) { const c = '#ff8a5c'; P1(x, X, Y - 1, c); R(x, X - 1, Y, 3, 1, c); P1(x, X - 1, Y + 1, c); P1(x, X + 1, Y + 1, c); P1(x, X, Y, '#ffb48a'); }
          else if (k < 0.65) { oval(x, X, Y, 3, 1, '#8d8a96'); R(x, X - 2, Y - 1, 3, 1, '#b2afba'); }
          else { for (let b = -1; b <= 1; b++) { R(x, X + b * 2, Y - 2 - (b === 0 ? 1 : 0), 1, 3 + (b === 0 ? 1 : 0), b ? '#7fb35a' : '#94c66a'); } }
        }
        // une pirogue à balancier échouée
        const px = Math.round(WW * 0.43), py = top + 9;
        R(x, px + 4, py - 4, 1, 4, '#6b4a2e'); R(x, px + 16, py - 4, 1, 4, '#6b4a2e'); R(x, px + 2, py - 5, 18, 1, '#c8b08a');
        R(x, px, py, 22, 2, '#8a4f2a'); R(x, px + 1, py + 2, 20, 1, '#5e3420'); P1(x, px - 1, py - 1, '#8a4f2a'); P1(x, px + 22, py - 1, '#8a4f2a');
        R(x, px + 2, py, 18, 1, '#b56a3a'); R(x, px + 6, py + 1, 10, 1, '#e8c25a');
      },
      fg(x, w) {
        const r = U.rng(99), y0 = H - 7;
        for (let y = y0; y < H; y++) for (let X = 0; X < w; X++) P1(x, X, y, U.bayer(X, y) < (y - y0) / 7 ? '#dfb779' : '#e8c58a');
        for (let i = 0; i < w / 26; i++) {
          const X = Math.floor(r() * w), k = r();
          if (k < 0.55) { // feuilles tropicales
            for (let l = 0; l < 3; l++) {
              const a = -Math.PI / 2 + (l - 1) * 0.7, len = 6 + Math.floor(r() * 4);
              for (let s = 0; s < len; s++) {
                const fx = Math.round(X + Math.cos(a) * s), fy = Math.round(H - 1 + Math.sin(a) * s + (s * s) / 14);
                R(x, fx - 1, fy, 3, 1, s % 2 ? '#2f8f4e' : '#3fae5a');
                P1(x, fx, fy, '#62c46e');
              }
            }
          } else { oval(x, X, H - 2, 4, 2, '#8d8a96'); R(x, X - 3, H - 4, 4, 1, '#b2afba'); }
        }
      },
      trees() {
        const out = [], r = U.rng(5);
        let X = L.offX + L.offW + 14;
        while (X < L.houX - 16) {
          const hgt = 34 + Math.floor(r() * 16), lean = Math.round((r() * 2 - 1) * 8);
          const depth = Math.floor(r() * 9);
          out.push({ x: X, y: L.path - 6 - depth, frames: palmFrames(hgt, lean), ph: r() * 8 });
          X += 38 + Math.floor(r() * 42);
        }
        out.push({ x: L.houX + L.houW + 4, y: L.path - 7, frames: palmFrames(44, -6), ph: 3 });
        out.push({ x: L.offX - 2, y: L.path - 9, frames: palmFrames(40, 7), ph: 5 });
        return out.sort((a, b) => a.y - b.y);
      },
    },
    campagne: {
      farF: 0.1, midF: 0.3, fgF: 1.25,
      offWall: '#c97b5a', offTrim: '#efe3d0', awning: ['#3f8f5e', '#f4efe2'],
      houWall: '#f4e6d0', roof: '#c8473a', shutter: '#5b8f4a', door: '#7a4a2a', planks: false, chimney: true,
      far(x, w) {
        const base = L.hz + 4;
        for (let i = 0; i < w; i++) {
          const f = k => 16 + Math.sin(k * 0.031) * 7 + Math.sin(k * 0.083 + 1.3) * 4 + Math.sin(k * 0.17) * 1.5;
          const h = Math.round(f(i)), lit = f(i + 1) > f(i - 1);
          for (let j = 0; j < h; j++) {
            const y = base - j;
            let c = lit ? '#a6b9e6' : '#8fa3d6';
            if (j >= h - 1) c = lit ? '#c0d0f2' : '#a6b9e6';
            if (j < 4 && U.bayer(i, y) < (4 - j) / 5) c = '#b8c8ee';
            P1(x, i, y, c);
          }
        }
      },
      mid(x, w) {
        const base = L.ground + 2, r = U.rng(11);
        const f = k => 13 + Math.sin(k * 0.045 + 2) * 6 + Math.sin(k * 0.11) * 2.5;
        for (let i = 0; i < w; i++) {
          const h = Math.round(f(i)), lit = f(i + 1) > f(i - 1);
          for (let j = 0; j < h; j++) {
            const y = base - j;
            let c = lit ? '#8fcf6f' : '#76b85e';
            if (j >= h - 1) c = '#a6dd7f';
            if (j < 5 && U.bayer(i, y) < (5 - j) / 6) c = '#68a856';
            P1(x, i, y, c);
          }
          if (r() < 0.07) { const ty = base - h + 1; oval(x, i, ty - 2, 2, 2, '#3f8a45'); P1(x, i - 1, ty - 3, '#5aa857'); P1(x, i, ty, '#5e4630'); }
        }
        // moulin à vent sur une colline
        const mx = Math.round(w * 0.62), my = base - Math.round(f(mx)) + 1;
        for (let j = 0; j < 15; j++) { const half = 2 + Math.floor(j / 6); R(x, mx - half, my - j, half * 2 + 1, 1, j % 4 === 0 ? '#e5dccb' : '#f6efe2'); }
        R(x, mx - 3, my - 17, 7, 3, '#b8584a'); R(x, mx - 1, my - 4, 2, 4, '#7a4a2a');
        L.mill = { x: mx, y: my - 15 };
      },
      back(x) {
        const top = L.ground;
        for (let y = top; y < H; y++) {
          const t = (y - top) / (H - top);
          for (let X = 0; X < WW; X++) {
            const c = t < 0.5 ? (U.bayer(X, y) < t * 2 ? '#7cc45c' : '#8bd06a') : (U.bayer(X, y) < (t - 0.5) * 2 ? '#6ab450' : '#7cc45c');
            P1(x, X, y, c);
          }
        }
        const r = U.rng(23), fl = ['#ffffff', '#ffe35a', '#ff8fb1', '#b9a2ff', '#ff6b6b'];
        for (let i = 0; i < WW * (H - top) / 14; i++) {
          const X = Math.floor(r() * WW), Y = top + 1 + Math.floor(r() * (H - top - 1));
          if (r() < 0.82) { P1(x, X, Y, '#5aa245'); P1(x, X, Y - 1, '#5aa245'); }
          else P1(x, X, Y, fl[Math.floor(r() * fl.length)]);
        }
        // une petite mare
        const px = Math.round(WW * 0.45), py = top + 8;
        oval(x, px, py, 14, 3, '#5aa0d8'); oval(x, px, py - 1, 12, 2, '#7cc0f0'); R(x, px - 6, py - 2, 4, 1, '#cfeeff');
        for (const d of [-13, -9, 10, 14]) { R(x, px + d, py - 5, 1, 4, '#3f8a45'); P1(x, px + d, py - 6, '#8a5a36'); }
      },
      fg(x, w) {
        const r = U.rng(77), y0 = H - 7;
        for (let y = y0; y < H; y++) for (let X = 0; X < w; X++) P1(x, X, y, U.bayer(X, y) < (y - y0) / 7 ? '#4f9a3e' : '#5aa845');
        for (let X = 0; X < w; X++) {
          if (r() < 0.45) { const h = 2 + Math.floor(r() * 5); R(x, X, H - 7 - h, 1, h, r() < 0.5 ? '#3f8a35' : '#4f9a3e'); }
          if (r() < 0.03) { const c = ['#ffe35a', '#ff8fb1', '#ffffff'][Math.floor(r() * 3)]; R(x, X, H - 12, 1, 5, '#3f8a35'); P1(x, X, H - 13, c); P1(x, X - 1, H - 12, c); P1(x, X + 1, H - 12, c); }
        }
      },
      trees() {
        const out = [], r = U.rng(8);
        let X = L.offX + L.offW + 16;
        while (X < L.houX - 18) {
          const pine = r() < 0.4, s = 7 + Math.floor(r() * 4);
          out.push({ x: X, y: L.path - 6 - Math.floor(r() * 8), frames: pine ? pineFrames(s + 4) : treeFrames(s, Math.floor(r() * 1000)), ph: r() * 8 });
          X += 34 + Math.floor(r() * 40);
        }
        out.push({ x: L.houX + L.houW + 6, y: L.path - 7, frames: treeFrames(10, 4), ph: 2 });
        out.push({ x: L.offX - 3, y: L.path - 8, frames: pineFrames(12), ph: 1 });
        return out.sort((a, b) => a.y - b.y);
      },
    },
  };

  /* ---------------- Arbres pré-dessinés (plusieurs images de balancement) ---------------- */
  function palmFrames(hgt, lean) {
    const frames = [];
    for (let k = 0; k < 8; k++) {
      const sway = Math.sin((k / 8) * Math.PI * 2) * 0.09;
      const cw = 66, ch = hgt + 24, { c, x } = U.canvas(cw, ch);
      const bx = 33, by = ch - 1, tx = bx + lean + Math.round(sway * 12), ty = by - hgt;
      for (let i = 0; i <= hgt; i++) {
        const s = i / hgt, a = 1 - s;
        const px = a * a * bx + 2 * a * s * (bx + lean * 0.1) + s * s * tx;
        const py = a * a * by + 2 * a * s * (by - hgt * 0.55) + s * s * ty;
        const X = Math.round(px), Y = Math.round(py), w = s < 0.25 ? 4 : 3;
        R(x, X - 1, Y, w, 1, i % 3 === 0 ? '#7a5434' : '#9b6d45');
        P1(x, X - 1, Y, '#b98a5a'); P1(x, X - 2 + w, Y, '#5e3f27');
      }
      const fr = [[-1.65, 10, 1], [-2.05, 13, 3], [-1.25, 13, 3], [-2.55, 16, 6], [-0.65, 16, 6], [-3.05, 15, 8], [-0.1, 15, 8]];
      for (const [a0, len, droop] of fr) {
        const a = a0 + sway * (1 + Math.abs(a0 + 1.6) * 0.4), ca = Math.cos(a), sa = Math.sin(a);
        for (let s = 0; s <= len; s++) {
          const t = s / len, X = Math.round(tx + ca * s), Y = Math.round(ty + sa * s + droop * t * t);
          P1(x, X, Y, '#2f8f4e');
          if (s > 1 && s < len) {
            const ll = Math.max(1, Math.round((1 - t) * 3 + 1));
            for (let q = 1; q <= ll; q++) P1(x, X + (s % 2 ? 0 : ca > 0 ? -1 : 1), Y + q, q === 1 ? '#3fae5a' : '#2a8048');
            P1(x, X, Y - 1, '#62c46e');
          }
        }
      }
      disc(x, tx - 2, ty + 2, 1, '#6b4426'); disc(x, tx + 1, ty + 3, 1, '#7a4f2c'); P1(x, tx - 2, ty + 1, '#a5774a');
      frames.push({ c, ox: bx, oy: by });
    }
    return frames;
  }
  function treeFrames(s, seed) {
    const frames = [];
    for (let k = 0; k < 8; k++) {
      const sway = Math.round(Math.sin((k / 8) * Math.PI * 2) * 1);
      const cw = s * 3 + 8, ch = s * 3 + 14, { c, x } = U.canvas(cw, ch);
      const bx = Math.floor(cw / 2), by = ch - 1, cy = by - s * 2 - 2;
      R(x, bx - 1, cy, 3, by - cy + 1, '#7a5434'); P1(x, bx - 1, by - 2, '#9b6d45'); R(x, bx + 1, cy, 1, by - cy + 1, '#5e3f27');
      const r = U.rng(seed), blobs = [[0, 0, s]];
      for (let i = 0; i < 5; i++) { const a = r() * Math.PI * 2; blobs.push([Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.45 - s * 0.2, s * (0.45 + r() * 0.25)]); }
      for (let y = 0; y < ch; y++) for (let X = 0; X < cw; X++) {
        const dx = X - bx - sway * (y < cy ? 1 : 0), dy = y - cy;
        if (!blobs.some(([bx2, by2, rr]) => (dx - bx2) ** 2 + (dy - by2) ** 2 <= rr * rr)) continue;
        const d = (dx + dy) / s;
        let col = '#4fa04a';
        if (d < -0.55 || (d < -0.25 && U.bayer(X, y) < 0.5)) col = '#74c25e';
        if (d > 0.7 || (d > 0.4 && U.bayer(X, y) < 0.5)) col = '#357a3a';
        if (U.bayer(X * 3, y * 7) < 0.06) col = '#8fd46e';
        P1(x, X, y, col);
      }
      frames.push({ c, ox: bx, oy: by });
    }
    return frames;
  }
  function pineFrames(s) {
    const frames = [];
    for (let k = 0; k < 8; k++) {
      const sway = Math.round(Math.sin((k / 8) * Math.PI * 2));
      const cw = s * 2 + 6, ch = s * 3 + 8, { c, x } = U.canvas(cw, ch);
      const bx = Math.floor(cw / 2), by = ch - 1;
      R(x, bx - 1, by - 5, 2, 5, '#6b4a2e');
      for (let tier = 0; tier < 3; tier++) {
        const top = by - 5 - s * (tier + 1) + tier * 2, bot = top + s + 1;
        for (let y = top; y <= bot; y++) {
          const half = Math.round(((y - top) / (bot - top)) * (s - tier * 1.5));
          const off = tier === 2 ? sway : 0;
          for (let X = -half; X <= half; X++) P1(x, bx + X + off, y, X < -half / 3 ? '#3f8a55' : X > half / 2 ? '#24623a' : '#2f7646');
          if (y === bot) for (let X = -half; X <= half; X += 2) P1(x, bx + X + off, y, '#24623a');
        }
      }
      frames.push({ c, ox: bx, oy: by });
    }
    return frames;
  }

  /* ---------------- Bâtiments et accessoires (calque avant) ---------------- */
  function win(x, X, Y, w, h, frame, glass) {
    R(x, X - 1, Y - 1, w + 2, h + 2, frame);
    R(x, X, Y, w, h, glass);
    R(x, X, Y, w, 1, U.light(glass, 0.3));
    P1(x, X + 1, Y + 2, U.light(glass, 0.6)); P1(x, X + 2, Y + 1, U.light(glass, 0.6));
    R(x, X - 1, Y + h + 1, w + 2, 1, U.dark(frame, 0.35));
  }
  function drawOffice(x, th) {
    const ox = L.offX, w = L.offW, h = L.offH, by = L.base, oy = by - h;
    const wall = th.offWall, wS = U.dark(wall, 0.2), wL = U.light(wall, 0.3), trim = th.offTrim;
    R(x, ox + 4, by, w + 2, 2, 'rgba(70,40,30,.25)');
    R(x, ox + 2, oy + 8, w - 4, h - 8, wall);
    if (theme === 'campagne') for (let yy = oy + 10; yy < by; yy += 3) for (let xx = ox + 2 + ((yy / 3) % 2 ? 0 : 2); xx < ox + w - 2; xx += 5) { R(x, xx, yy, 4, 1, U.light(wall, 0.12)); P1(x, xx + 4, yy, U.dark(wall, 0.15)); }
    R(x, ox + w - 7, oy + 8, 5, h - 8, wS);
    R(x, ox + 2, oy + 8, 1, h - 8, wL);
    R(x, ox, oy + 6, w, 3, trim); R(x, ox, oy + 8, w, 1, U.dark(trim, 0.25));
    R(x, ox + 6, oy + 2, 10, 4, '#cfd5df'); R(x, ox + 6, oy + 2, 10, 1, '#eef1f6');
    for (let i = 0; i < 4; i++) R(x, ox + 7 + i * 2, oy + 3, 1, 2, '#8d94a3');
    R(x, ox + 36, oy - 7, 1, 13, '#5a5f70'); R(x, ox + 34, oy - 3, 5, 1, '#5a5f70'); R(x, ox + 35, oy, 3, 1, '#5a5f70');
    L.antenna = { x: ox + 36, y: oy - 8 };
    R(x, ox + 8, oy + 10, 30, 9, '#2a2440'); R(x, ox + 8, oy + 10, 30, 1, '#4a4466'); R(x, ox + 8, oy + 18, 30, 1, '#1a1630');
    L.sign = { x: ox + 8, y: oy + 10, w: 30, h: 9 };
    L.offWins = [];
    const rows = Math.max(1, Math.min(3, Math.floor((h - 34) / 9)));
    for (let r = 0; r < rows; r++) for (let c = 0; c < 3; c++) {
      if (r === rows - 1 && c === 1 && rows === 3) continue;
      const X = ox + 7 + c * 12, Y = oy + 22 + r * 9;
      win(x, X, Y, 8, 6, trim, '#7fb3e0');
      L.offWins.push({ x: X, y: Y, w: 8, h: 6 });
    }
    // entrée
    R(x, ox + 16, by - 14, 14, 14, '#3d4a66');
    R(x, ox + 17, by - 13, 5, 13, '#7fb3e0'); R(x, ox + 24, by - 13, 5, 13, '#7fb3e0');
    R(x, ox + 17, by - 13, 5, 1, '#b8dcf6'); R(x, ox + 24, by - 13, 5, 1, '#b8dcf6');
    R(x, ox + 21, by - 7, 1, 3, '#e0e6ef'); R(x, ox + 24, by - 7, 1, 3, '#e0e6ef');
    for (let i = 0; i < 18; i++) { const c = Math.floor(i / 3) % 2 ? th.awning[1] : th.awning[0]; R(x, ox + 14 + i, by - 17, 1, 3, c); if (i % 2 === 0) P1(x, ox + 14 + i, by - 14, c); }
    R(x, ox + 14, by - 1, 18, 1, '#b8b0a8');
    for (const px of [ox + 10, ox + 33]) { R(x, px, by - 5, 4, 5, '#c0603a'); R(x, px, by - 5, 4, 1, '#e07a52'); disc(x, px + 2, by - 8, 3, '#3f9a52'); P1(x, px + 1, by - 10, '#62c46e'); P1(x, px + 3, by - 7, '#2a7a40'); }
  }
  function drawHouse(x, th) {
    const hx = L.houX, w = L.houW, h = L.houH, by = L.base, oy = by - h;
    const wall = th.houWall, wS = U.dark(wall, 0.18), trim = '#fff8ec';
    R(x, hx + 4, by, w, 2, 'rgba(70,40,30,.25)');
    R(x, hx + 5, oy + 18, w - 10, h - 18, wall);
    if (th.planks) for (let yy = oy + 21; yy < by; yy += 3) R(x, hx + 5, yy, w - 10, 1, U.dark(wall, 0.07));
    else for (let i = 0; i < 40; i++) { const r = U.rng(i + 3); R(x, hx + 6 + Math.floor(r() * (w - 14)), oy + 20 + Math.floor(r() * (h - 22)), 3, 1, U.dark(wall, 0.08)); }
    R(x, hx + w - 9, oy + 18, 4, h - 18, wS);
    // cheminée (campagne)
    if (th.chimney) { R(x, hx + 42, oy + 3, 5, 11, '#a85a44'); R(x, hx + 41, oy + 2, 7, 2, '#7a3f30'); for (let j = 0; j < 11; j += 3) R(x, hx + 42, oy + 4 + j, 5, 1, '#8a4636'); L.chimney = { x: hx + 44, y: oy + 1 }; }
    // toit
    const roof = th.roof, rS = U.dark(roof, 0.25), rL = U.light(roof, 0.25);
    for (let j = 0; j <= 18; j++) {
      const y = oy + 2 + j, inset = Math.round((18 - j) * 0.9), x0 = hx + inset - 1, x1 = hx + w - inset + 1;
      R(x, x0, y, x1 - x0, 1, j % 3 === 2 ? rS : roof);
      if (j % 3 !== 2) for (let X = x0 + ((j / 3) % 2 ? 1 : 3); X < x1; X += 4) P1(x, X, y, U.dark(roof, 0.1));
      P1(x, x0, y, rL); P1(x, x1 - 1, y, rS);
    }
    R(x, hx + 15, oy + 1, w - 30, 1, rL);
    R(x, hx + 5, oy + 21, w - 10, 2, U.dark(wall, 0.3));
    disc(x, hx + 30, oy + 10, 3, trim); disc(x, hx + 30, oy + 10, 2, '#5a7fa8'); P1(x, hx + 29, oy + 9, '#9cc0e0');
    L.attic = { x: hx + 30, y: oy + 10 };
    // fenêtres à volets
    L.houWins = [];
    for (const X of [hx + 11, hx + 40]) {
      const Y = oy + 27;
      R(x, X - 4, Y - 1, 3, 9, th.shutter); R(x, X + 10, Y - 1, 3, 9, th.shutter);
      for (let j = 0; j < 9; j += 2) { R(x, X - 4, Y - 1 + j, 3, 1, U.dark(th.shutter, 0.2)); R(x, X + 10, Y - 1 + j, 3, 1, U.dark(th.shutter, 0.2)); }
      win(x, X, Y, 9, 7, trim, '#5a7fa8');
      R(x, X + 4, Y, 1, 7, trim); R(x, X, Y + 3, 9, 1, trim);
      R(x, X - 1, Y + 9, 11, 2, '#8a5a36'); for (let i = 0; i < 11; i += 2) P1(x, X - 1 + i, Y + 8, ['#ff5a7a', '#ffd34e', '#ff8fb1'][i % 3]);
      L.houWins.push({ x: X, y: Y, w: 9, h: 7 });
    }
    // porte (le battant est dessiné à part, il s'ouvre)
    R(x, hx + 25, by - 18, 11, 18, trim);
    L.door = { x: hx + 26, y: by - 17, w: 9, h: 17 };
    R(x, hx + 2, by - 1, w - 4, 2, theme === 'lagon' ? '#b98a5a' : '#a8a29a');
    R(x, hx + 26, by - 1, 9, 1, '#d0563c');
    // boîte aux lettres
    R(x, hx + w + 1, by - 9, 1, 9, '#6b4a2e'); R(x, hx + w - 1, by - 13, 5, 4, '#e8553e'); R(x, hx + w - 1, by - 13, 5, 1, '#ff7a5e'); R(x, hx + w + 4, by - 15, 1, 3, '#ffd34e');
    // plantes
    if (theme === 'lagon') {
      for (const px of [hx + 3, hx + 50]) { for (let l = 0; l < 4; l++) { const a = -Math.PI / 2 + (l - 1.5) * 0.6; for (let s = 0; s < 8; s++) R(x, Math.round(px + Math.cos(a) * s) - 1, Math.round(by - 2 + Math.sin(a) * s + s * s / 18), 3, 1, s % 3 ? '#3fae5a' : '#2f8f4e'); } P1(x, px + 1, by - 6, '#ff5a7a'); P1(x, px - 2, by - 5, '#ff5a7a'); }
    } else {
      for (const px of [hx + 4, hx + 51]) { disc(x, px, by - 4, 4, '#4f9a3e'); for (let i = 0; i < 5; i++) P1(x, px - 3 + i * 2, by - 6 + (i % 2) * 2, ['#ff5a7a', '#ffffff', '#ffd34e'][i % 3]); }
    }
  }
  const PARASOLS = [['#ff5a5f', '#fff4e8'], ['#3fb6e0', '#fff4e8'], ['#ffc23d', '#fff4e8'], ['#7bd389', '#fff4e8']];
  function drawRestStop(x, th, cx, i, long) {
    const by = L.base;
    if (theme === 'lagon') {
      const cols = PARASOLS[i % PARASOLS.length];
      oval(x, cx, by + 1, 9, 1, 'rgba(120,80,40,.25)');
      R(x, cx - 13, by - 1, 10, 2, cols[0]); for (let k = 0; k < 10; k += 3) R(x, cx - 13 + k, by - 1, 1, 2, cols[1]);
      R(x, cx, by - 19, 1, 19, '#8a6a4a');
      const wd = [2, 5, 7, 8, 9];
      for (let j = 0; j < 5; j++) for (let k = -wd[j]; k <= wd[j]; k++) {
        let c = Math.floor((k + 9) / 3) % 2 ? cols[0] : cols[1];
        if (j < 2 && k < 0) c = U.light(c, 0.2);
        if (k > wd[j] - 2) c = U.dark(c, 0.15);
        P1(x, cx + k, by - 23 + j, c);
      }
      for (let k = -9; k <= 9; k += 2) P1(x, cx + k, by - 18, cols[0]);
      P1(x, cx, by - 24, '#8a6a4a');
      if (long) { R(x, cx + 3, by - 6, 7, 1, '#c99a64'); R(x, cx + 4, by - 5, 1, 5, '#8a6040'); R(x, cx + 8, by - 5, 1, 5, '#8a6040'); disc(x, cx + 6, by - 8, 1, '#7a4f2c'); P1(x, cx + 7, by - 11, '#ff5a7a'); P1(x, cx + 7, by - 10, '#ff5a7a'); }
    } else {
      oval(x, cx, by + 1, 9, 1, 'rgba(40,60,20,.25)');
      R(x, cx - 7, by - 5, 15, 2, '#b07a48'); R(x, cx - 7, by - 5, 15, 1, '#cf9a62');
      R(x, cx - 7, by - 10, 15, 2, '#a06a3a'); R(x, cx - 7, by - 10, 15, 1, '#c08a52');
      for (const lx of [cx - 6, cx + 6]) { R(x, lx, by - 10, 1, 10, '#5e3f27'); }
      if (long) { R(x, cx + 9, by - 4, 6, 4, '#c08a40'); R(x, cx + 9, by - 4, 6, 1, '#e0aa5a'); R(x, cx + 10, by - 6, 4, 1, '#8a5a2a'); P1(x, cx + 10, by - 5, '#8a5a2a'); P1(x, cx + 13, by - 5, '#8a5a2a'); R(x, cx - 16, by, 8, 2, '#e8553e'); for (let k = 0; k < 8; k += 2) P1(x, cx - 16 + k, by, '#ffffff'); }
    }
  }
  function drawFront(x, th) {
    x.clearRect(0, 0, WW, H);
    drawOffice(x, th);
    drawHouse(x, th);
    L.stops = st.breaks.map((b, i) => ({ x: Math.round(pathX(b.f)), long: b.long }));
    L.stops.forEach((s, i) => drawRestStop(x, th, s.x, i, s.long));
    // poteaux des heures
    const taken = L.stops.map(s => s.x);
    for (const hm of st.hours) {
      const X = Math.round(pathX(hm.f));
      if (taken.some(t => Math.abs(t - X) < 14) || X < L.startX + 18 || X > L.endX - 18) continue;
      taken.push(X);
      R(x, X, L.path - 12, 1, 9, '#7a5434');
      R(x, X - 5, L.path - 20, 11, 8, '#6b4426'); R(x, X - 4, L.path - 19, 9, 6, '#d9aa74'); R(x, X - 4, L.path - 19, 9, 1, '#efc590');
      U.text3(x, hm.label, X - Math.floor(U.text3W(hm.label) / 2), L.path - 18, '#4a2c1a');
    }
    // lampadaires
    L.lamps = [];
    for (let X = L.startX + 46; X < L.endX - 40; X += 86) {
      if (taken.some(t => Math.abs(t - X) < 12)) continue;
      R(x, X, L.path - 27, 1, 23, '#3a3546'); R(x, X - 1, L.path - 5, 3, 1, '#3a3546');
      R(x, X, L.path - 27, 4, 1, '#3a3546'); R(x, X + 2, L.path - 26, 3, 3, '#3a3546'); R(x, X + 3, L.path - 25, 1, 2, '#f7efc4');
      L.lamps.push({ x: X + 3, y: L.path - 24 });
    }
    // chemin
    const x0 = L.startX - 16, x1 = L.endX + 16, y = L.path - 2;
    if (theme === 'lagon') {
      for (let X = x0; X < x1; X++) {
        const k = X - x0, plank = Math.floor(k / 4), gap = k % 4 === 3;
        R(x, X, y, 1, 4, gap ? '#7a5236' : ['#c4935f', '#b98a5a', '#c99a66'][plank % 3]);
        P1(x, X, y, gap ? '#8a6040' : '#ddb07a');
        R(x, X, y + 4, 1, 2, gap ? '#4e3220' : '#8a6040');
        if (k % 4 === 1) P1(x, X, y + 2, '#8a6040');
      }
      for (let X = x0 + 2; X < x1; X += 14) R(x, X, L.path + 4, 2, H - L.path - 4, '#5e3d26');
    } else {
      const r = U.rng(31);
      for (let X = x0; X < x1; X++) for (let j = -1; j <= 4; j++) {
        const Y = y + j;
        let c = j === -1 || j === 4 ? (U.bayer(X, Y) < 0.5 ? '#c9a06a' : null) : '#d6ae76';
        if (c && j === 3) c = '#c79e66';
        if (c && r() < 0.05) c = r() < 0.5 ? '#b8925e' : '#ead0a0';
        if (c) P1(x, X, Y, c);
      }
    }
  }

  /* ---------------- Ciel, mer, nuages ---------------- */
  function renderSky() {
    const img = sky.x.createImageData(W, H), d = img.data, hz = L.hz + 6, NB = 8, cols = [];
    for (let i = 0; i <= NB; i++) { const t = i / NB; cols.push(U.hex(t < 0.6 ? U.mix(tod.top, tod.mid, t / 0.6) : U.mix(tod.mid, tod.hor, (t - 0.6) / 0.4))); }
    for (let y = 0; y < H; y++) {
      const t = Math.min(1, y / hz) * NB, i = Math.min(NB - 1, Math.floor(t)), k = U.clamp((t - i - 0.5) / 0.5, 0, 1);
      for (let X = 0; X < W; X++) {
        const c = k > U.bayer(X, y) ? cols[i + 1] : cols[i], o = (y * W + X) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    sky.x.putImageData(img, 0, 0);
  }
  function buildSea() {
    if (theme !== 'lagon') { sea = null; return; }
    const h = L.shore - L.hz + 2, s = U.canvas(W, h), img = s.x.createImageData(W, h), d = img.data;
    const stops = [[0, U.mix('#a9dcef', tod.hor, 0.5)], [0.12, '#4a9ad6'], [0.45, '#2b8fcf'], [0.74, '#2cb8c4'], [1, '#7fe2d0']];
    const NB = 9, cols = [];
    for (let i = 0; i <= NB; i++) cols.push(U.hex(U.mix(U.grad(stops, i / NB), tod.hor, 0.2)));
    for (let y = 0; y < h; y++) {
      const t = (y / (h - 1)) * NB, i = Math.min(NB - 1, Math.floor(t)), k = U.clamp((t - i - 0.4) / 0.6, 0, 1);
      for (let X = 0; X < W; X++) {
        const c = k > U.bayer(X, y) ? cols[i + 1] : cols[i], o = (y * W + X) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    s.x.putImageData(img, 0, 0);
    sea = s;
  }
  function makeCloud(seed, w) {
    const r = U.rng(seed), h = Math.round(w * 0.42) + 4, { c, x } = U.canvas(w, h);
    const blobs = [];
    let px = 3;
    while (px < w - 4) { const rr = 2.5 + r() * (w / 6); blobs.push([px + rr * 0.6, h - 3 - rr * 0.6, rr]); px += rr * 0.9 + 1; }
    const lite = U.mix(U.mix('#ffffff', tod.hor, 0.3), tod.top, tod.night * 0.75);
    const base = U.mix(lite, tod.mid, 0.2), shade = U.mix(lite, tod.mid, 0.48);
    const m = new Uint8Array(w * h);
    for (let y = 0; y <= h - 3; y++) for (let X = 0; X < w; X++) if (blobs.some(([bx, by, rr]) => (X - bx) ** 2 + (y - by) ** 2 <= rr * rr)) m[y * w + X] = 1;
    const inside = (X, y) => y >= 0 && y < h && m[y * w + X] === 1;
    const img = x.createImageData(w, h), d = img.data, C = { l: U.hex(lite), b: U.hex(base), s: U.hex(shade) };
    for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) {
      if (!inside(X, y)) continue;
      let col = C.b;
      if (!inside(X, y - 2)) col = C.l;
      if (y >= h - 5 || !inside(X, y + 2)) col = (U.bayer(X, y) < 0.5 || y >= h - 4) ? C.s : C.b;
      const o = (y * w + X) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function rebuildClouds() {
    if (!clouds.length) {
      const r = U.rng(3);
      for (let i = 0; i < 6; i++) clouds.push({ seed: 100 + i, w: 22 + Math.floor(r() * 26), x: r() * (W + 60), y: 6 + Math.floor(r() * Math.max(10, L.hz - 34)), v: 0.6 + r() * 1.6, par: 0.04 + r() * 0.08 });
    }
    clouds.forEach(cl => { cl.spr = makeCloud(cl.seed, cl.w); });
  }
  let todKey = '';
  function updateTod(force) {
    tod = computeTod(hourNow());
    todT = T;
    const key = tod.top + tod.mid + tod.hor + tod.night.toFixed(3) + W + 'x' + H + theme;
    if (!force && key === todKey) return;   // rien n'a changé : pas de redessin coûteux
    todKey = key;
    renderSky();
    buildSea();
    rebuildClouds();
  }

  /* ---------------- Construction de la scène ---------------- */
  function build() {
    layout();
    sky = U.canvas(W, H); world = U.canvas(W, H); wmask = U.canvas(W, H); petL = U.canvas(W, H);
    const th = THEMES[theme];
    layers.far = U.canvas(layerW(th.farF), H); th.far(layers.far.x, layers.far.c.width);
    layers.mid = null;
    if (th.mid) { layers.mid = U.canvas(layerW(th.midF), H); th.mid(layers.mid.x, layers.mid.c.width); }
    layers.back = U.canvas(WW, H); th.back(layers.back.x);
    layers.front = U.canvas(WW, H); drawFront(layers.front.x, th);
    layers.fg = U.canvas(layerW(th.fgF), H); th.fg(layers.fg.x, layers.fg.c.width);
    trees = th.trees();
    const r = U.rng(9);
    stars = [];
    for (let i = 0; i < (W * L.hz) / 70; i++) stars.push({ x: Math.floor(r() * W), y: Math.floor(r() * (L.hz - 6)), b: r(), ph: r() * 6, big: r() < 0.12 });
    clouds = [];
    crits = [];
    if (theme === 'lagon') for (let i = 0; i < 3; i++) crits.push({ type: 'crab', x: L.startX + 40 + r() * (L.endX - L.startX - 80), y: L.shore + 6 + Math.floor(r() * Math.max(2, L.path - L.shore - 16)), dir: 1, t: r() * 3, state: 'pause', hide: 0 });
    for (let i = 0; i < 4; i++) crits.push({ type: 'fly', cx: L.startX + r() * (L.endX - L.startX), cy: L.path - 16 - r() * 10, ph: r() * 9, col: ['#ffe35a', '#ffffff', '#8fd3ff', '#ff9fd0'][i] });
    for (let i = 0; i < 9; i++) crits.push({ type: 'firefly', cx: L.startX + r() * (L.endX - L.startX), cy: L.path - 8 - r() * 22, ph: r() * 9 });
    updateTod(true);
    built = true;
  }

  /* ---------------- Particules ---------------- */
  const HEART = U.sprite(['##.##', '#####', '#####', '.###.', '..#..'], { '#': '#ff5a7a' });
  const NOTE = U.sprite(['..##', '..#.', '..#.', '###.', '##..'], { '#': '#ffffff' });
  function addP(p) { if (parts.length < 260) parts.push(Object.assign({ t: 0, vx: 0, vy: 0, g: 0, drag: 1 }, p)); }
  function dust(x, n) {
    const c = theme === 'lagon' ? '#fff0cc' : '#e8d8a8';
    for (let i = 0; i < n; i++) addP({ k: 'px', x: x + (RND() * 10 - 5), y: L.path, vx: (RND() - 0.5) * 14, vy: -RND() * 8, g: 18, life: 0.4 + RND() * 0.3, c });
  }
  function hearts(x, y, n = 5) {
    for (let i = 0; i < n; i++) addP({ k: 'heart', x: x + (RND() * 16 - 8), y: y - RND() * 6, vx: (RND() - 0.5) * 10, vy: -14 - RND() * 10, life: 1 + RND() * 0.5 });
  }
  function sparkle(x, y, n = 8, cols = ['#fff6b0', '#ffffff', '#ffd34e']) {
    for (let i = 0; i < n; i++) { const a = RND() * Math.PI * 2, v = 10 + RND() * 22; addP({ k: 'glow', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.92, life: 0.5 + RND() * 0.5, c: cols[i % cols.length] }); }
  }
  function updateParts(dt) {
    for (const p of parts) { p.t += dt; p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    parts = parts.filter(p => p.t < p.life);
  }
  function drawParts(x, camX, glowPass) {
    for (const p of parts) {
      if (p.sea) continue;
      const glowy = p.k === 'glow';
      if (glowy !== glowPass) continue;
      const a = 1 - p.t / p.life, X = Math.round(p.x - camX), Y = Math.round(p.y);
      x.globalAlpha = Math.min(1, a * 1.5);
      if (p.k === 'heart') x.drawImage(HEART, X - 2, Y - 2);
      else if (p.k === 'note') x.drawImage(NOTE, X - 2, Y - 2);
      else if (p.k === 'z') U.text3(x, 'Z', X, Y, '#ffffff');
      else if (p.k === 'smoke') { x.globalAlpha = a * 0.55; const s = 1 + Math.floor(p.t * 3); R(x, X - (s >> 1), Y - (s >> 1), s, s, p.c); }
      else R(x, X, Y, p.s || 1, p.s || 1, p.c);
    }
    x.globalAlpha = 1;
  }

  /* ---------------- Le compagnon ---------------- */
  const pet = {
    x: 0, y: 0, dir: 1, hop: null, landT: -9, jumpT: 0, jumpDur: 0.55, happyUntil: 0, wander: 0, wanderT: 0, restUntil: 0,
    tx: null, txUntil: 0, blinkUntil: 0, nextBlink: 2, earUntil: 0, nextEar: 4, look: 0, nextLook: 3, emote: null,
    emoteUntil: 0, nextEmote: 7, awakeUntil: 0, nextZ: 0, nextNom: 3, nomUntil: 0, nextJump: 0, placed: false, trick: null,
  };
  let nextShoot = 8;
  const celebrating = () => st.kind === 'done' && st.endedAgo < 20 * 60;
  function anchor() {
    if (st.kind === 'work') {
      if (st.inBreak >= 0 && L.stops && L.stops[st.inBreak]) return L.stops[st.inBreak].x + 10;
      return pathX(st.eff);
    }
    return L.endX + (st.kind === 'done' ? 0 : -1);
  }
  function wantsSleep() {
    if (T < pet.awakeUntil) return false;
    const night = tod.night > 0.6;
    if (st.kind === 'before') return true;
    if (st.kind === 'off') return night || (tod.h > 13 && tod.h < 15);
    if (st.kind === 'done') return !celebrating() && night;
    return false;
  }
  function emote(type, dur = 2.2) { pet.emote = type; pet.emoteUntil = T + dur; }
  function updatePet(dt) {
    const a = anchor();
    if (!pet.placed) { pet.x = a; pet.placed = true; }
    const near = Math.abs(a - pet.x) < 3;
    const sleeping = wantsSleep() && near && !pet.hop && pet.tx === null;
    pet.sleeping = sleeping;
    if (!sleeping && !pet.hop && T > pet.wanderT) {
      const range = st.kind === 'work' ? (st.inBreak >= 0 ? 2 : 7) : 22;
      pet.wander = (RND() * 2 - 1) * range;
      pet.wanderT = T + 3 + RND() * 5;
    }
    let goal = a + (sleeping || celebrating() ? 0 : pet.wander);
    if (pet.tx !== null) { if (T < pet.txUntil) goal = pet.tx; else pet.tx = null; }
    goal = U.clamp(goal, L.startX - 12, L.endX + 14);
    if (pet.hop) {
      const h = pet.hop;
      h.t += dt / h.dur;
      if (h.t >= 1) { pet.x = h.x1; pet.y = 0; pet.hop = null; pet.landT = T; dust(pet.x, 2); }
      else { pet.x = U.lerp(h.x0, h.x1, h.t); pet.y = -Math.sin(h.t * Math.PI) * h.h; }
    } else if (pet.jumpT > 0) {
      pet.jumpT -= dt;
      const k = 1 - Math.max(0, pet.jumpT) / pet.jumpDur;
      pet.y = -Math.sin(k * Math.PI) * 11;
      if (pet.jumpT <= 0) { pet.y = 0; pet.landT = T; dust(pet.x, 4); if (pet.trick) sparkle(pet.x, L.path - 6, 6); pet.trick = null; }
    } else if (!sleeping) {
      const d = goal - pet.x;
      if (Math.abs(d) > 1.5 && T > pet.restUntil) {
        const far = Math.abs(d) > 30;
        pet.hop = { x0: pet.x, x1: pet.x + Math.sign(d) * Math.min(Math.abs(d), far ? 9 : 5), t: 0, dur: far ? 0.24 : 0.34, h: far ? 4 : 3 };
        pet.dir = Math.sign(d);
        if (!far) pet.restUntil = T + 0.12 + RND() * 0.3;
      } else if (celebrating() && T > pet.nextJump) {
        pet.jumpT = pet.jumpDur; pet.nextJump = T + 0.9 + RND() * 0.7;
        hearts(pet.x, L.path - 30, 2);
      }
    }
    // petites animations de vie
    if (T > pet.nextBlink) { pet.blinkUntil = T + 0.13; pet.nextBlink = T + 2 + RND() * 3.5; }
    if (T > pet.nextEar) { pet.earUntil = T + 0.25; pet.nextEar = T + 4 + RND() * 6; }
    if (T > pet.nextLook) { pet.look = RND() < 0.6 ? 0 : RND() < 0.5 ? -1 : 1; pet.nextLook = T + 1.5 + RND() * 3; }
    if (sleeping && T > pet.nextZ) { addP({ k: 'z', x: pet.x + 6, y: L.path - 26, vx: 4, vy: -7, life: 2.2 }); pet.nextZ = T + 1.3; }
    if (st.kind === 'work' && st.inBreak >= 0 && near && T > pet.nextNom) { pet.nomUntil = T + 0.5; pet.nextNom = T + 2.5 + RND() * 2; if (RND() < 0.35) addP({ k: 'note', x: pet.x + 8, y: L.path - 30, vx: 3, vy: -9, life: 1.6 }); }
    if (T > pet.nextEmote && !sleeping) {
      pet.nextEmote = T + 9 + RND() * 9;
      if (st.kind === 'work' && st.inBreak >= 0) emote(RND() < 0.5 ? 'coffee' : 'heart');
      else if (st.almost) emote('excl');
      else if (celebrating()) emote('heart');
      else if (RND() < 0.5) emote(RND() < 0.5 ? 'note' : 'heart');
    }
  }
  function petFrame() {
    const f = { hy: 0, feet: 0, tail: 0, ear: 0, eyes: 'open', eyeDx: 0, mouth: 'w' };
    if (pet.sleeping) { f.pose = 'sleep'; f.hy = (T % 3.2) < 1.6 ? 3 : 2; f.eyes = 'closed'; f.mouth = 'sleep'; return f; }
    f.hy = Math.floor(T / 0.75) % 2;
    f.tail = [0, 1, 0, -1][Math.floor(T * (st.almost || celebrating() ? 9 : 3)) % 4];
    if (pet.hop) { f.hy = 0; f.feet = pet.hop.t < 0.5 ? 1 : 2; f.eyeDx = pet.dir > 0 ? 1 : -1; }
    else f.eyeDx = pet.look;
    if (T - pet.landT < 0.09) f.hy = 1;
    if (T < pet.earUntil) f.ear = 1;
    if (st.almost) f.eyes = 'star';
    if (T < pet.blinkUntil) f.eyes = 'blink';
    if (T < pet.nomUntil) { f.hy = 1; f.mouth = 'o'; f.eyes = 'happy'; }
    if (celebrating()) f.mouth = 'open';
    if (pet.jumpT > 0) { f.pose = 'jump'; f.eyes = 'happy'; f.mouth = 'open'; f.hy = 0; }
    if (T < pet.happyUntil) { f.eyes = 'happy'; f.mouth = 'open'; }
    return f;
  }
  const BUBBLE = U.sprite([
    '..#########..', '.#.........#.', '#...........#', '#...........#', '#...........#',
    '#...........#', '#...........#', '.#.........#.', '..####.####..', '......#......'],
    { '#': '#2a1d3d', '.': '#ffffff' });
  const EMO = {
    heart: [['.#.#.', '#####', '#####', '.###.', '..#..'], '#ff5a7a'],
    note: [['..##.', '..#.#', '..#..', '###..', '##...'], '#5a6cff'],
    excl: [['..#..', '..#..', '..#..', '.....', '..#..'], '#ff5a3c'],
    coffee: [['.#.#.', '####.', '#..##', '#..#.', '####.'], '#8a5a36'],
    star: [['..#..', '.###.', '#####', '.###.', '.#.#.'], '#ffb800'],
  };
  const EMOS = {};
  for (const k in EMO) EMOS[k] = U.sprite(EMO[k][0], { '#': EMO[k][1] });
  function drawPetShadow(x, camX) {
    const sx = Math.round(pet.x - camX), sw = Math.max(5, 10 - Math.round(-pet.y / 2));
    x.globalAlpha = 0.28; oval(x, sx, L.path + 1, sw, 1, '#2a1a20'); x.globalAlpha = 1;
  }
  function drawPet(x, camX) {
    const sx = Math.round(pet.x - camX), lift = Math.round(pet.y);
    if (st.kind === 'work' && st.inBreak >= 0 && L.stops && L.stops[st.inBreak]) {
      const dx = sx + 12, dy = L.path - 1;
      if (theme === 'lagon') { disc(x, dx, dy - 2, 2, '#7a4f2c'); P1(x, dx - 1, dy - 3, '#a5774a'); R(x, dx + 1, dy - 8, 1, 4, '#ff5a7a'); P1(x, dx + 2, dy - 8, '#ff5a7a'); }
      else { R(x, dx - 2, dy - 4, 5, 4, '#ffffff'); R(x, dx - 2, dy - 4, 5, 1, '#8a5a36'); P1(x, dx + 3, dy - 3, '#ffffff'); }
    }
    const spr = Pets.get(petSp, petFur, petFrame());
    if (pet.trick && pet.jumpT > 0) {
      const k = 1 - pet.jumpT / pet.jumpDur;
      x.save();
      x.translate(sx, L.path - 14 + lift);
      if (pet.trick === 'flip') x.rotate(-pet.dir * U.easeInOut(k) * Math.PI * 2);
      else { const c = Math.cos(k * Math.PI * 4); x.scale(Math.abs(c) < 0.15 ? 0.15 * Math.sign(c || 1) : c, 1); }
      x.drawImage(spr, -14, -15);
      x.restore();
    } else x.drawImage(spr, sx - 14, L.path - 29 + lift);
  }
  function drawEmote(camX) {
    if (!pet.emote || T > pet.emoteUntil || pet.sleeping) return;
    const sx = Math.round(pet.x - camX) - 6, sy = L.path - 42 + Math.round(pet.y) + (Math.floor(T * 3) % 2);
    const age = pet.emoteUntil - T;
    if (age < 0.15) return;
    ctx.drawImage(BUBBLE, sx, sy);
    ctx.drawImage(EMOS[pet.emote], sx + 4, sy + 2);
  }

  /* ---------------- Critters & ciel animé ---------------- */
  const CRAB = [U.sprite(['r.....r', 'rr.e.rr', '.rrrrr.', 'r.rrr.r', '.r...r.'], { r: '#e8553e', e: '#2a1d3d' }),
    U.sprite(['r.....r', 'rr.e.rr', '.rrrrr.', '.rrrrr.', 'r.r.r.r'], { r: '#e8553e', e: '#2a1d3d' })];
  const BIRD = [U.sprite(['#...#', '.#.#.', '..#..'], { '#': '#3a3a4e' }), U.sprite(['.....', '##.##', '..#..'], { '#': '#3a3a4e' })];
  const DOLPH = U.sprite(['....#.....', '..######..', '.########d', '#..####...'], { '#': '#5a7fa8', d: '#4a6a90' });
  const BOAT = U.sprite(['...#...', '...##..', '...###.', '...####', '...#...', 'wwwwwww', '.bbbbb.'], { '#': '#ffffff', w: '#e8553e', b: '#8a4f2a' });

  function updateCritters(dt) {
    const day = tod.night < 0.3;
    // oiseaux
    if (day && T > nextBird) {
      nextBird = T + 7 + RND() * 14;
      const dir = RND() < 0.5 ? 1 : -1, n = 1 + Math.floor(RND() * 3), y = 10 + RND() * Math.max(8, L.hz - 30);
      for (let i = 0; i < n; i++) birds.push({ x: dir > 0 ? -8 - i * 7 : W + 8 + i * 7, y: y + i * 3, v: dir * (12 + RND() * 5), ph: RND() * 2 });
    }
    birds.forEach(b => { b.x += b.v * dt; });
    birds = birds.filter(b => b.x > -40 && b.x < W + 40);
    for (const c of crits) {
      if (c.type !== 'crab') continue;
      c.t -= dt;
      if (c.state === 'walk') c.x += c.dir * 9 * dt;
      if (c.t <= 0) {
        const r = RND();
        if (c.state === 'hide') { c.state = 'pause'; c.t = 1 + RND() * 2; }
        else if (r < 0.15) { c.state = 'hide'; c.t = 5 + RND() * 8; }
        else if (c.state === 'walk') { c.state = 'pause'; c.t = 0.8 + RND() * 2.5; }
        else { c.state = 'walk'; c.dir = RND() < 0.5 ? -1 : 1; c.t = 0.5 + RND() * 1.2; }
      }
    }
    if (theme === 'lagon' && day) {
      if (!dolphin && T > nextDolphin) { dolphin = { x: 10 + RND() * (W - 30), y: L.hz + 6 + RND() * Math.max(2, (L.shore - L.hz) * 0.4), t: 0, dir: RND() < 0.5 ? 1 : -1 }; nextDolphin = T + 18 + RND() * 30; }
      if (dolphin) {
        dolphin.t += dt / 1.3;
        if (dolphin.t >= 1) { splash(dolphin.x + dolphin.dir * 14, dolphin.y); dolphin = null; }
        else if (dolphin.t < 0.05 && !dolphin.s) { dolphin.s = 1; splash(dolphin.x, dolphin.y); }
      }
    }
    // fumée de cheminée
    if (L.chimney && RND() < dt * 2.5) addP({ k: 'smoke', x: L.chimney.x + RND() * 2, y: L.chimney.y, vx: 3 + RND() * 2, vy: -6 - RND() * 3, life: 2.4, c: '#e8e4ee' });
    // feuilles d'automne
    if (theme === 'campagne') {
      const m = new Date().getMonth();
      if ((m >= 8 && m <= 10) && RND() < dt * 1.2) {
        const t = trees[Math.floor(RND() * trees.length)];
        if (t) addP({ k: 'px', x: t.x + (RND() * 16 - 8), y: t.y - 20 - RND() * 8, vx: 4 + RND() * 4, vy: 3, g: 2, drag: 0.99, life: 4, c: ['#e8a33d', '#d9572b', '#f2c94c'][Math.floor(RND() * 3)] });
      }
    }
  }
  function splash(x, y) {
    for (let i = 0; i < 7; i++) parts.push({ k: 'px', sea: 1, x: x + Math.round(cam.x), y, vx: (RND() - 0.5) * 16, vy: -12 - RND() * 10, g: 40, drag: 1, t: 0, life: 0.6, c: '#e8fbff' });
  }
  function drawSea(x, camX) {
    if (!sea) return;
    x.drawImage(sea.c, 0, L.hz);
    const sh = L.shore - L.hz, off = camX * 0.3;
    // lignes de vagues qui glissent
    for (let j = 3; j < sh; j += 3) {
      const sp = 2 + j * 0.25, len = 2 + Math.floor(j / 6), gap = 9 + (j % 5) * 3;
      const shift = ((T * sp + off * (1 + j / sh)) % gap + gap) % gap;
      x.fillStyle = j % 2 ? 'rgba(255,255,255,.28)' : 'rgba(20,70,120,.18)';
      for (let X = -gap + shift; X < W; X += gap) x.fillRect(Math.round(X + (j * 7) % gap), L.hz + j, len, 1);
    }
    // paillettes de lumière
    const seed = Math.floor(T * 5);
    for (let i = 0; i < 14; i++) {
      const r = U.rng(seed * 31 + i * 7);
      const X = Math.floor(r() * W), Y = L.hz + 2 + Math.floor(r() * (sh - 3));
      x.fillStyle = 'rgba(255,255,255,.75)'; x.fillRect(X, Y, 1 + Math.floor(r() * 3), 1);
    }
    // bateau à l'horizon
    const bx = Math.round((((T * 0.6 + 40) - camX * 0.12) % (W + 40) + W + 40) % (W + 40)) - 20;
    x.drawImage(BOAT, bx, L.hz - 4 + (Math.floor(T * 1.5) % 2));
    if (dolphin) {
      const t = dolphin.t, px = dolphin.x + dolphin.dir * t * 14, py = dolphin.y - Math.sin(t * Math.PI) * 7;
      const k = (0.5 - t) * 1.2 * dolphin.dir;
      for (let i = 0; i < DOLPH.width; i++) {
        const col = dolphin.dir > 0 ? i : DOLPH.width - 1 - i;
        x.drawImage(DOLPH, col, 0, 1, DOLPH.height, Math.round(px + i - 5), Math.round(py - 2 + (i - 5) * -k), 1, DOLPH.height);
      }
    }
    for (const p of parts) if (p.sea) { x.globalAlpha = 1 - p.t / p.life; R(x, Math.round(p.x - Math.round(cam.x)), Math.round(p.y), 1, 1, p.c); }
    x.globalAlpha = 1;
  }
  function drawFoam(x, camX) {
    if (theme !== 'lagon') return;
    for (let X = 0; X < W; X++) {
      const wx = X + camX;
      const y = L.shore + Math.round(Math.sin(wx / 9 + T * 1.4) * 0.8 + Math.sin(T * 0.6 + wx / 31) * 1.2);
      P1(x, X, y, '#f4fffd');
      if ((wx + Math.floor(T * 3)) % 7 === 0) P1(x, X, y - 1, '#d8f7f2');
      P1(x, X, y + 1, '#cdb07a');
    }
  }
  function drawTrees(x, camX) {
    for (const t of trees) {
      const fr = t.frames[Math.floor(T * 1.6 + t.ph) % t.frames.length];
      const X = Math.round(t.x - camX) - fr.ox;
      if (X > W || X + fr.c.width < 0) continue;
      x.drawImage(fr.c, X, t.y - fr.oy);
    }
  }
  function drawCritters(x, camX, layer) {
    for (const c of crits) {
      if (c.type === 'crab' && layer === 'back' && c.state !== 'hide') {
        const X = Math.round(c.x - camX);
        if (X < -8 || X > W) continue;
        x.drawImage(CRAB[c.state === 'walk' ? Math.floor(T * 8) % 2 : 0], X - 3, c.y - 4);
      }
      if (c.type === 'fly' && layer === 'front' && tod.night < 0.4) {
        const X = Math.round(c.cx - camX + Math.sin(T * 0.7 + c.ph) * 14), Y = Math.round(c.cy + Math.sin(T * 1.9 + c.ph) * 4 + Math.sin(T * 6 + c.ph));
        if (X < -3 || X > W) continue;
        const open = Math.floor(T * 9 + c.ph) % 2;
        if (open) { P1(x, X - 1, Y, c.col); P1(x, X + 1, Y, c.col); P1(x, X - 1, Y + 1, c.col); P1(x, X + 1, Y + 1, c.col); }
        else { P1(x, X - 1, Y, c.col); P1(x, X + 1, Y, c.col); }
        P1(x, X, Y, '#3a2a2a');
      }
    }
  }
  function drawDynamic(x, camX) {
    // porte de la maison
    if (L.door) {
      const d = L.door, X = d.x - camX;
      if (X > -12 && X < W) {
        const open = st.kind === 'done' && celebrating();
        if (open) { R(x, X, d.y, d.w, d.h, '#3a2420'); R(x, X, d.y, 2, d.h, THEMES[theme].door); }
        else {
          const dc = THEMES[theme].door;
          R(x, X, d.y, d.w, d.h, dc); R(x, X + 1, d.y + 2, d.w - 2, 5, U.light(dc, 0.15)); R(x, X + 1, d.y + 9, d.w - 2, 6, U.light(dc, 0.15));
          R(x, X + d.w - 2, d.y + 8, 1, 2, '#ffd34e'); R(x, X, d.y, d.w, 1, U.dark(dc, 0.3));
        }
      }
    }
    // pales du moulin
    if (L.mill) {
      const mx = Math.round(L.mill.x - camX * THEMES[theme].midF), my = L.mill.y;
      if (mx > -12 && mx < W + 12) {
        const a0 = T * 0.9;
        for (let k = 0; k < 4; k++) {
          const a = a0 + (k * Math.PI) / 2;
          for (let s = 1; s <= 8; s++) {
            P1(x, Math.round(mx + Math.cos(a) * s), Math.round(my + Math.sin(a) * s), '#6b4a2e');
            if (s > 2) P1(x, Math.round(mx + Math.cos(a) * s - Math.sin(a) * 1.5), Math.round(my + Math.sin(a) * s + Math.cos(a) * 1.5), '#f6efe2');
          }
        }
        P1(x, mx, my, '#3a2a2a');
      }
    }
  }
  function drawSkyStuff(camX) {
    const n = tod.night;
    // étoiles
    if (n > 0.05) {
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(T * (1.5 + s.b) + s.ph);
        ctx.globalAlpha = n * (0.35 + 0.65 * s.b) * tw;
        R(ctx, s.x, s.y, 1, 1, '#ffffff');
        if (s.big && tw > 0.8) { ctx.globalAlpha *= 0.5; R(ctx, s.x - 1, s.y, 3, 1, '#ffffff'); R(ctx, s.x, s.y - 1, 1, 3, '#ffffff'); }
      }
      ctx.globalAlpha = 1;
    }
    // soleil / lune
    const h = tod.h;
    const arc = (f) => ({ x: Math.round(U.lerp(14, W - 14, f)), y: Math.round(L.hz + 6 - Math.sin(f * Math.PI) * (L.hz - 4)) });
    if (h > 5.5 && h < 18.7) {
      const p = arc((h - 5.5) / 13.2);
      const sunset = U.clamp(1 - Math.min(h - 5.5, 18.7 - h) / 1.6, 0, 1);
      L.sun = p;
      ctx.globalAlpha = 0.25; disc(ctx, p.x, p.y, 11, U.mix('#fff4b0', '#ff9a5a', sunset)); ctx.globalAlpha = 0.35; disc(ctx, p.x, p.y, 8, U.mix('#fff4b0', '#ff9a5a', sunset));
      ctx.globalAlpha = 1; disc(ctx, p.x, p.y, 6, U.mix('#ffe066', '#ff7a3c', sunset)); disc(ctx, p.x - 1, p.y - 1, 4, U.mix('#fff6b8', '#ffb36a', sunset));
      P1(ctx, p.x - 2, p.y - 3, '#ffffff');
    } else L.sun = null;
    if (h > 18.2 || h < 6) {
      const p = arc(((h - 18.2 + 24) % 24) / 11.8);
      L.moon = p;
      ctx.globalAlpha = 0.18; disc(ctx, p.x, p.y, 9, '#dfe6ff'); ctx.globalAlpha = 1;
      disc(ctx, p.x, p.y, 5, '#f4f2e8'); P1(ctx, p.x - 2, p.y - 1, '#d6d2c4'); R(ctx, p.x + 1, p.y + 1, 2, 2, '#d6d2c4'); P1(ctx, p.x - 1, p.y + 3, '#d6d2c4');
    } else L.moon = null;
    // nuages
    for (const cl of clouds) {
      const span = W + cl.w + 40;
      const X = Math.round((((cl.x + T * cl.v - camX * cl.par) % span) + span) % span) - cl.w - 20;
      ctx.drawImage(cl.spr, X, cl.y);
    }
    // oiseaux
    for (const b of birds) ctx.drawImage(BIRD[Math.floor(T * 5 + b.ph) % 2], Math.round(b.x - (b.v > 0 ? 0 : 4)), Math.round(b.y));
    // étoiles filantes
    ctx.globalCompositeOperation = 'lighter';
    for (const s of shoots) {
      s.t += 1 / 60;
      for (let i = 0; i < 10; i++) { ctx.globalAlpha = (1 - i / 10) * (1 - s.t / s.life); R(ctx, Math.round(s.x - s.vx * i * 0.012), Math.round(s.y - s.vy * i * 0.012), 1, 1, '#fffbe0'); }
      s.x += s.vx / 60; s.y += s.vy / 60;
    }
    shoots = shoots.filter(s => s.t < s.life);
    // feux d'artifice
    for (const r of rockets) { ctx.globalAlpha = 1; R(ctx, Math.round(r.x - camX), Math.round(r.y), 1, 2, '#fff6c0'); }
    for (const s of sparks) {
      const a = 1 - s.t / s.life;
      ctx.globalAlpha = a;
      R(ctx, Math.round(s.x - camX), Math.round(s.y), s.t < 0.15 ? 2 : 1, s.t < 0.15 ? 2 : 1, s.c);
      if (a > 0.4) { ctx.globalAlpha = a * 0.4; R(ctx, Math.round(s.px - camX), Math.round(s.py), 1, 1, s.c); }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (flash > 0) { ctx.globalAlpha = flash * 0.18; R(ctx, 0, 0, W, L.hz, '#ffffff'); ctx.globalAlpha = 1; }
  }
  const FW_COLS = [['#ff5a7a', '#ffd34e'], ['#5ff0d8', '#ffffff'], ['#b98cff', '#ff8fd0'], ['#ffd34e', '#ff8a3c'], ['#7cf27c', '#e8ff8a']];
  function rocket(wx) {
    rockets.push({ x: wx !== undefined ? wx : L.endX + (RND() * 90 - 45), y: L.base - 30, vy: -(60 + RND() * 22), top: 8 + RND() * (L.hz * 0.55), cols: FW_COLS[Math.floor(RND() * FW_COLS.length)] });
  }
  function burst(x, y, cols) {
    const n = 34 + Math.floor(RND() * 14);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + RND() * 0.2, v = 16 + RND() * 16;
      sparks.push({ x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 1 + RND() * 0.7, c: cols[i % 2] });
    }
    flash = 1;
    if (hooks.sfx) hooks.sfx('pop');
  }
  function updateFireworks(dt) {
    if (celebrating() && T > nextRocket) { rocket(); nextRocket = T + 0.8 + RND() * 1.6; }
    for (const r of rockets) { r.y += r.vy * dt; r.vy += 34 * dt; if (RND() < 0.6) sparks.push({ x: r.x, y: r.y + 2, px: r.x, py: r.y, vx: 0, vy: 6, t: 0, life: 0.3, c: '#ffcf7a' }); }
    rockets = rockets.filter(r => { if (r.y <= r.top || r.vy > -8) { burst(r.x, r.y, r.cols); return false; } return true; });
    for (const s of sparks) { s.t += dt; s.px = s.x; s.py = s.y; s.vx *= 0.975; s.vy = s.vy * 0.975 + 16 * dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    sparks = sparks.filter(s => s.t < s.life);
    if (sparks.length > 900) sparks.splice(0, sparks.length - 900);
    flash = Math.max(0, flash - dt * 4);
    if (tod.night > 0.8 && T > nextShoot) { nextShoot = T + 10 + RND() * 18; shoots.push({ x: W * (0.4 + RND() * 0.6), y: 4 + RND() * L.hz * 0.4, vx: -80 - RND() * 30, vy: 30 + RND() * 15, t: 0, life: 0.9 }); }
  }

  /* ---------------- Lumières (après l'éclairage ambiant) ---------------- */
  const glowCache = new Map();
  function glowSprite(r, col) {
    const k = r + col;
    let g = glowCache.get(k);
    if (g) return g;
    const s = U.canvas(r * 2 + 1, r * 2 + 1), img = s.x.createImageData(r * 2 + 1, r * 2 + 1), [cr, cg, cb] = U.hex(col);
    for (let y = 0; y <= r * 2; y++) for (let x = 0; x <= r * 2; x++) {
      const d = Math.hypot(x - r, y - r) / r;
      if (d > 1) continue;
      const a = Math.round((1 - d) * (1 - d) * 4) / 4;
      const o = (y * (r * 2 + 1) + x) * 4;
      img.data[o] = cr; img.data[o + 1] = cg; img.data[o + 2] = cb; img.data[o + 3] = Math.round(a * 150);
    }
    s.x.putImageData(img, 0, 0);
    glowCache.set(k, s.c);
    return s.c;
  }
  function glow(cx, cy, r, col, a) { ctx.globalAlpha = a; ctx.drawImage(glowSprite(r, col), Math.round(cx - r), Math.round(cy - r)); }
  function drawLights(camX) {
    const n = tod.night;
    // enseigne lumineuse du bureau (horloge une fois sur deux)
    if (L.sign) {
      const s = L.sign, X = s.x - camX;
      if (X > -s.w && X < W) {
        const d = new Date(), showTime = Math.floor(T / 4) % 2 === 1;
        const txt = showTime ? String(d.getHours()).padStart(2, '0') + (Math.floor(T * 2) % 2 ? ':' : ' ') + String(d.getMinutes()).padStart(2, '0') : 'BUREAU';
        const tw = U.text3W(txt);
        U.text3(ctx, txt, Math.round(X + (s.w - tw) / 2), s.y + 2, '#ffd34e');
        if (n > 0.1) { ctx.globalCompositeOperation = 'lighter'; glow(X + s.w / 2, s.y + 4, 14, '#ffb84a', n * 0.5); ctx.globalCompositeOperation = 'source-over'; }
      }
    }
    if (n < 0.04) { ctx.globalAlpha = 1; return; }
    ctx.globalCompositeOperation = 'lighter';
    const slot = Math.floor(Date.now() / 600000);
    (L.offWins || []).forEach((w, i) => {
      const X = w.x - camX;
      if (X < -10 || X > W) return;
      if (U.rng(slot * 13 + i * 7)() > 0.45) return;
      ctx.globalAlpha = n * 0.9; R(ctx, X, w.y, w.w, w.h, '#a07a30');
      glow(X + w.w / 2, w.y + w.h / 2, 7, '#ffcf6a', n * 0.5);
    });
    const homeLit = n > 0.2;
    if (homeLit) {
      for (const w of L.houWins || []) {
        const X = w.x - camX;
        if (X < -12 || X > W) continue;
        ctx.globalAlpha = n; R(ctx, X, w.y, w.w, w.h, '#b8823a');
        glow(X + w.w / 2, w.y + w.h / 2, 9, '#ffb44a', n * 0.65);
      }
      if (L.attic) { ctx.globalAlpha = n * 0.8; disc(ctx, L.attic.x - camX, L.attic.y, 2, '#a07030'); }
    }
    if (L.door && st.kind === 'done' && celebrating()) {
      const d = L.door, X = d.x - camX;
      ctx.globalAlpha = 0.9; R(ctx, X + 2, d.y + 1, d.w - 2, d.h - 1, '#c08a3a');
      glow(X + d.w / 2, d.y + d.h - 3, 12, '#ffc45a', 0.6 + n * 0.4);
    }
    for (const l of L.lamps || []) {
      const X = l.x - camX;
      if (X < -16 || X > W + 16) continue;
      ctx.globalAlpha = n; R(ctx, X, l.y, 1, 2, '#fff2b0');
      glow(X, l.y + 1, 7, '#ffd27a', n * 0.8);
      ctx.globalAlpha = n * 0.22; oval(ctx, X, L.path, 8, 1, '#ffd27a');
    }
    if (L.antenna && Math.floor(T * 1.2) % 2) { const X = L.antenna.x - camX; ctx.globalAlpha = n; R(ctx, X, L.antenna.y, 1, 1, '#ff4a3a'); glow(X, L.antenna.y, 3, '#ff4a3a', n * 0.8); }
    if (L.lighthouse && theme === 'lagon') {
      const X = L.lighthouse.x - Math.round(camX * THEMES.lagon.farF), on = Math.sin(T * 2) > 0.2;
      if (on) { ctx.globalAlpha = n; R(ctx, X - 1, L.lighthouse.y, 2, 1, '#fff6c0'); glow(X, L.lighthouse.y, 5, '#fff6c0', n * 0.8); }
    }
    if (L.moon && theme === 'lagon') {
      const seed = Math.floor(T * 4);
      for (let j = 2; j < L.shore - L.hz; j += 2) {
        const r = U.rng(seed * 17 + j);
        ctx.globalAlpha = n * (0.35 + r() * 0.3);
        R(ctx, L.moon.x - 2 + Math.floor(r() * 3) - Math.floor(j / 6), L.hz + j, 2 + Math.floor(r() * 3) + Math.floor(j / 5), 1, '#dfe6ff');
      }
    }
    if (n > 0.5) for (const c of crits) {
      if (c.type !== 'firefly') continue;
      const X = Math.round(c.cx - camX + Math.sin(T * 0.5 + c.ph) * 10), Y = Math.round(c.cy + Math.sin(T * 0.8 + c.ph * 2) * 5);
      const a = (0.5 + 0.5 * Math.sin(T * 2.4 + c.ph)) * n;
      if (X < -4 || X > W + 4) continue;
      ctx.globalAlpha = a; R(ctx, X, Y, 1, 1, '#eaff8a'); glow(X, Y, 3, '#c8ff6a', a * 0.8);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------- Boucle de rendu ---------------- */
  function update(dt) {
    if (T - todT > 2) updateTod();
    if (prevKind !== st.kind) {
      if (prevKind === 'work' && st.kind === 'done') { nextRocket = T + 0.3; if (hooks.sfx) hooks.sfx('fanfare'); }
      prevKind = st.kind;
    }
    updatePet(dt);
    updateParts(dt);
    updateCritters(dt);
    updateFireworks(dt);
    if (!cam.drag && T > cam.manualUntil) cam.tx = U.clamp(pet.x - W / 2, 0, WW - W);
    if (!cam.drag && T > cam.manualUntil) cam.x += (cam.tx - cam.x) * Math.min(1, dt * 2.2);
    cam.x = U.clamp(cam.x, 0, WW - W);
  }
  function render() {
    const camX = Math.round(cam.x), th = THEMES[theme];
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(sky.c, 0, 0);
    drawSkyStuff(camX);
    const w = world.x;
    w.clearRect(0, 0, W, H);
    w.drawImage(layers.far.c, -Math.round(camX * th.farF), 0);
    if (layers.mid) w.drawImage(layers.mid.c, -Math.round(camX * th.midF), 0);
    drawSea(w, camX);
    w.drawImage(layers.back.c, -camX, 0);
    drawFoam(w, camX);
    drawCritters(w, camX, 'back');
    drawTrees(w, camX);
    w.drawImage(layers.front.c, -camX, 0);
    drawDynamic(w, camX);
    drawPetShadow(w, camX);
    drawCritters(w, camX, 'front');
    w.drawImage(layers.fg.c, -Math.round(camX * th.fgF), 0);
    // éclairage ambiant (aube, crépuscule, nuit)
    if (tod.amb !== '#ffffff') {
      wmask.x.clearRect(0, 0, W, H); wmask.x.drawImage(world.c, 0, 0);
      w.globalCompositeOperation = 'multiply'; w.fillStyle = tod.amb; w.fillRect(0, 0, W, H);
      w.globalCompositeOperation = 'destination-in'; w.drawImage(wmask.c, 0, 0);
      w.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(world.c, 0, 0);
    drawLights(camX);
    // le compagnon a son propre calque : un peu mieux éclairé la nuit pour rester lisible
    const p = petL.x;
    p.clearRect(0, 0, W, H);
    drawPet(p, camX);
    drawParts(p, camX, false);
    if (tod.amb !== '#ffffff') {
      wmask.x.clearRect(0, 0, W, H); wmask.x.drawImage(petL.c, 0, 0);
      p.globalCompositeOperation = 'multiply'; p.fillStyle = U.mix(tod.amb, '#ffffff', 0.45); p.fillRect(0, 0, W, H);
      p.globalCompositeOperation = 'destination-in'; p.drawImage(wmask.c, 0, 0);
      p.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(petL.c, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    drawParts(ctx, camX, true);
    ctx.globalCompositeOperation = 'source-over';
    drawEmote(camX);
  }
  function loop(ts) {
    if (!running) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    T += dt;
    if (built) { update(dt); render(); }
    requestAnimationFrame(loop);
  }

  /* ---------------- Interactions ---------------- */
  function toScene(e) {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function tap(p) {
    const camX = Math.round(cam.x), wx = p.x + camX;
    if (Math.abs(wx - pet.x) <= 13 && p.y >= L.path - 32 + pet.y && p.y <= L.path + 3) {
      if (pet.sleeping) { pet.awakeUntil = T + 6; emote('excl', 1.5); }
      else { pet.jumpT = pet.jumpDur; const r = RND(); pet.trick = r < 0.3 ? 'flip' : r < 0.55 ? 'spin' : null; emote(pet.trick ? 'star' : 'heart'); }
      pet.happyUntil = T + 1.3;
      hearts(pet.x, L.path - 28, 6);
      if (hooks.tapPet) hooks.tapPet();
      return;
    }
    if (p.y >= L.ground - 2) {
      pet.tx = U.clamp(wx, L.startX - 10, L.endX + 12); pet.txUntil = T + 6; pet.awakeUntil = T + 7;
      sparkle(wx, p.y, 5, ['#ffffff', '#fff0cc']);
      if (hooks.sfx) hooks.sfx('step');
      return;
    }
    if (celebrating()) { burst(wx, p.y, FW_COLS[Math.floor(RND() * FW_COLS.length)]); return; }
    if (tod.night > 0.5) { shoots.push({ x: p.x, y: p.y, vx: -70 - RND() * 30, vy: 34 + RND() * 14, t: 0, life: 0.8 }); if (hooks.sfx) hooks.sfx('twinkle'); return; }
    sparkle(wx, p.y, 10);
    if (hooks.sfx) hooks.sfx('twinkle');
  }
  function bindInput() {
    cv.addEventListener('pointerdown', e => {
      cam.drag = { x0: e.clientX, y0: e.clientY, cam0: cam.x, moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
    });
    cv.addEventListener('pointermove', e => {
      const d = cam.drag;
      if (!d) return;
      const dx = e.clientX - d.x0;
      if (!d.moved && Math.abs(dx) > 8) d.moved = true;
      if (d.moved) { cam.x = U.clamp(d.cam0 - (dx * DPR) / SCALE, 0, WW - W); cam.manualUntil = T + 3.5; }
    });
    const end = e => {
      const d = cam.drag;
      cam.drag = null;
      if (d && !d.moved && e.type === 'pointerup') tap(toScene(e));
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  /* ---------------- API publique ---------------- */
  return {
    init(canvas) { cv = canvas; ctx = cv.getContext('2d'); bindInput(); },
    resize(cssW, cssH) {
      DPR = window.devicePixelRatio || 1;
      const physW = Math.round(cssW * DPR), physH = Math.round(cssH * DPR);
      SCALE = Math.max(2, Math.round(physW / 150));
      const nw = Math.ceil(physW / SCALE), nh = Math.ceil(physH / SCALE);
      cv.style.width = (nw * SCALE) / DPR + 'px';
      cv.style.height = (nh * SCALE) / DPR + 'px';
      if (nw !== W || nh !== H || !built) {
        W = nw; H = nh; cv.width = W; cv.height = H;
        ctx.imageSmoothingEnabled = false;
        build();
        cam.x = U.clamp(L.endX - W / 2, 0, WW - W);
        pet.placed = false;
      }
      return { px: SCALE / DPR, W, H };
    },
    setTheme(t) { if (THEMES[t] && t !== theme) { theme = t; if (built) { build(); pet.placed = false; } } },
    setPet(sp, fur) { petSp = sp; petFur = fur; },
    setState(s) {
      Object.assign(st, s);
      const sig = JSON.stringify([st.breaks, st.hours]);
      if (sig !== propsSig) { propsSig = sig; if (built) drawFront(layers.front.x, THEMES[theme]); }
    },
    setHour(h) { hourForce = h; todT = -99; },
    start() { if (!running) { running = true; lastTs = 0; requestAnimationFrame(loop); } },
    stop() { running = false; },
    on(name, fn) { hooks[name] = fn; },
    celebrate() { for (let i = 0; i < 3; i++) setTimeout(() => rocket(), i * 350); },
    cheer() {
      if (pet.sleeping) return;
      pet.jumpT = pet.jumpDur; pet.trick = 'flip'; pet.happyUntil = T + 1.5; emote('star', 2.5);
      sparkle(pet.x, L.path - 30, 14, ['#ffd34e', '#ffffff', '#ff9ad6', '#5ff0d8']);
      if (hooks.sfx) hooks.sfx('twinkle');
    },
    get night() { return tod ? tod.night : 0; },
    get skyTop() { return tod ? tod.top : '#3f8ce8'; },
  };
})();
