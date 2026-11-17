"use strict";
/* =====================================================================
   Compagnons en pixel-art (créations originales).
   Chaque sprite est construit à partir de formes simples, puis reçoit
   automatiquement ombrage, lignes de contact et contour, comme un vrai
   sprite dessiné à la main. Toutes les couleurs de pelage fonctionnent.
   ===================================================================== */
const Pets = (() => {
  const W = 29, H = 31, N = W * H, CX = 14.5, PAD = 6;

  const INFO = {
    cat: { name: 'Chat', cry: 'Miaou', furs: [
      { fur: '#f4a259', belly: '#fff3e2', stripes: true },
      { fur: '#a3a3b8', belly: '#f4f4fa', stripes: true },
      { fur: '#4a4560', belly: '#f6f4fb' },
      { fur: '#f1dfbf', belly: '#fffaf0', stripes: true },
      { fur: '#b97a4d', belly: '#f8e6cf', stripes: true }] },
    dog: { name: 'Chien', cry: 'Wouf', furs: [
      { fur: '#c68b59', dark: '#8a5a36', belly: '#fff1de' },
      { fur: '#ecd09e', dark: '#c4955a', belly: '#fffaf0' },
      { fur: '#7a5a40', dark: '#4c3524', belly: '#f3dcc0' },
      { fur: '#f6f2ec', dark: '#c68b59', belly: '#ffffff', patch: true },
      { fur: '#e2a04b', dark: '#b8742c', belly: '#fff6e8' }] },
    bunny: { name: 'Lapin', cry: 'Pouic', furs: [
      { fur: '#f4f0f2', belly: '#ffffff' }, { fur: '#d9c2a7', belly: '#fff6ea' }, { fur: '#a9a5b4', belly: '#f2f0f6' },
      { fur: '#f5c4d2', belly: '#fff4f7' }, { fur: '#8a7060', belly: '#f0e2d6' }] },
    fox: { name: 'Renard', cry: 'Yip yip', furs: [
      { fur: '#f07b3f', belly: '#fff8f0' }, { fur: '#d9572b', belly: '#fff4ea' }, { fur: '#eaa56e', belly: '#fffaf2' },
      { fur: '#b9b7c8', belly: '#ffffff' }, { fur: '#8e5b3b', belly: '#f6e8da' }] },
    panda: { name: 'Panda', cry: 'Mrrr', furs: [
      { fur: '#ffffff', dark: '#2c2a3a' }, { fur: '#fff1dc', dark: '#2c2a3a' }, { fur: '#eef0fb', dark: '#2c2a3a' },
      { fur: '#fde4ee', dark: '#3a2a3a' }, { fur: '#f5efe6', dark: '#6b4f3a' }] },
    hamster: { name: 'Hamster', cry: 'Couic', furs: [
      { fur: '#f2b880', belly: '#fff8f0' }, { fur: '#d6c6b8', belly: '#ffffff' }, { fur: '#c9a27e', belly: '#fff6ec' },
      { fur: '#e9d2a8', belly: '#fffcf4' }, { fur: '#9c7a5b', belly: '#f6eadc' }] },
  };

  function pal(sp, fi) {
    const list = INFO[sp].furs, f = list[((fi % list.length) + list.length) % list.length];
    const fur = f.fur, belly = f.belly || '#fff3e2', dk = f.dark || U.dark(fur, 0.35);
    return {
      fur, furS: U.dark(fur, 0.26), furL: U.light(fur, 0.4),
      belly, bellyS: U.dark(belly, 0.15),
      dark: dk, darkS: U.dark(dk, 0.3), darkL: U.light(dk, 0.2),
      inner: U.mix('#ff9fb6', fur, 0.25),
      eye: '#2a1d3d', shine: '#ffffff', mouth: '#4a2440', tongue: '#ff6f8e',
      nose: sp === 'bunny' || sp === 'hamster' ? '#ff7f9e' : '#3a2438',
      stripes: !!f.stripes, patch: !!f.patch,
    };
  }

  /* ---------------- Masques de formes ---------------- */
  const M = () => new Uint8Array(N);
  function ell(cx, cy, rx, ry, rot = 0) {
    const m = M(), c = Math.cos(rot), s = Math.sin(rot), R = Math.max(rx, ry) + 1;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
      if (u * u + v * v <= 1) m[y * W + x] = 1;
    }
    return m;
  }
  function tri(ax, ay, bx, by, cx, cy) {
    const m = M(), area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      if (w0 >= 0 && w1 >= 0 && 1 - w0 - w1 >= 0) m[y * W + x] = 1;
    }
    return m;
  }
  function line(pts, r) {
    const m = M();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - px, qy = ay + dy * t - py;
        if (qx * qx + qy * qy <= r * r) { m[y * W + x] = 1; break; }
      }
    }
    return m;
  }
  const or = (...ms) => { const m = M(); for (const a of ms) for (let i = 0; i < N; i++) if (a[i]) m[i] = 1; return m; };
  const and = (a, b) => { const m = M(); for (let i = 0; i < N; i++) if (a[i] && b[i]) m[i] = 1; return m; };
  const mir = a => { const m = M(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[y * W + x]) m[y * W + (W - 1 - x)] = 1; return m; };
  const sym = a => or(a, mir(a));
  const above = yy => { const m = M(); for (let y = 0; y < H; y++) if (y + 0.5 < yy) m.fill(1, y * W, y * W + W); return m; };

  /* ---------------- Peintre de sprite ---------------- */
  function painter() {
    let col = new Array(N).fill(null);
    const z = new Int8Array(N).fill(-1);
    let zc = 0;
    const api = {
      // Remplit une forme : couleur de base, ombre en bas/à droite, lumière en haut/à gauche
      part(m, base, shade, lite) {
        const zz = zc++;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!m[i]) continue;
          const dn = y < H - 1 && m[i + W], up = y > 0 && m[i - W];
          const lf = x > 0 && m[i - 1], rt = x < W - 1 && m[i + 1];
          let c = base;
          if (!dn) c = shade;
          else if (!rt && x + 0.5 > CX + 1) c = shade;
          else if (lite && !up && x + 0.5 < CX + 2) c = lite;
          else if (lite && !lf && y < 20) c = lite;
          col[i] = c; z[i] = zz;
        }
        return zz;
      },
      // Recolore une zone d'une partie existante (ventre, museau, taches…)
      mark(m, base, shade, host) {
        const inside = i => m[i] && col[i] !== null && z[i] === host;
        const out = col.slice();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!inside(i)) continue;
          out[i] = shade && !(y < H - 1 && inside(i + W)) ? shade : base;
        }
        col = out;
      },
      px(x, y, c) { if (x >= 0 && y >= 0 && x < W && y < H) col[y * W + x] = c; },
      get(x, y) { return x >= 0 && y >= 0 && x < W && y < H ? col[y * W + x] : null; },
      zAt(x, y) { return z[y * W + x]; },
      // Lignes de contact entre les parties (menton, pattes, oreilles…)
      contacts() {
        const out = col.slice();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (col[i] === null) continue;
          const zi = z[i];
          const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
          for (const j of nb) if (j >= 0 && col[j] !== null && z[j] > zi) { out[i] = U.dark(col[i], 0.45); break; }
        }
        col = out;
      },
      // Contour extérieur d'un pixel, teinté selon la couleur voisine
      outline() {
        const out = col.slice();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (col[i] !== null) continue;
          const nb = [y < H - 1 ? i + W : -1, y > 0 ? i - W : -1, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1];
          for (const j of nb) if (j >= 0 && col[j] !== null) { out[i] = U.mix(col[j], '#160b26', 0.8); break; }
        }
        col = out;
      },
      canvas() {
        const { c, x } = U.canvas(W, H);
        const img = x.createImageData(W, H);
        for (let i = 0; i < N; i++) {
          const cc = col[i];
          if (!cc) continue;
          const [r, g, b] = U.hex(cc);
          img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
        }
        x.putImageData(img, 0, 0);
        return c;
      },
    };
    return api;
  }

  /* ---------------- Morphologie commune ---------------- */
  function common(f, sp) {
    const sleep = f.pose === 'sleep', jump = f.pose === 'jump';
    const hy = f.hy || 0, by = sleep ? 1 : 0;
    const body = sp === 'hamster' ? ell(CX, 24 + by, 8.4, sleep ? 4.4 : 5) : ell(CX, 24.2 + by, 7.2, sleep ? 4.2 : 4.8);
    let feet = M();
    if (!sleep) {
      const fy = jump ? 27.4 : 28.6, rx = sp === 'bunny' ? 2.8 : 2.4;
      feet = or(ell(11.2, fy - (f.feet === 1 ? 1 : 0), rx, 1.6), ell(17.8, fy - (f.feet === 2 ? 1 : 0), rx, 1.6));
    }
    return { hy, by, sleep, jump, body, feet };
  }

  /* ---------------- Les six compagnons ---------------- */
  const BUILD = {
    cat(f, P, p, b) {
      const hy = b.hy, w = (f.tail || 0) * 1.2;
      const tail = b.sleep
        ? line([[20.5, 27.6], [17.6, 29.0], [13.2, 29.1], [10.6, 28.2]], 1.25)
        : line([[20, 26.5], [23.2, 25.2], [25.2 + w * 0.4, 22], [25.6 + w * 0.8, 18.4], [24.6 + w * 1.2, 16]], 1.25);
      const paintTail = () => {
        const tz = p.part(tail, P.fur, P.furS, P.furL);
        if (P.stripes) {
          const st = M();
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tail[y * W + x] && (x + y) % 3 === 0) st[y * W + x] = 1;
          p.mark(st, P.furS, null, tz);
        }
      };
      if (!b.sleep) paintTail();
      const bz = p.part(b.body, P.fur, P.furS, P.furL);
      p.mark(and(ell(CX, 25.4 + b.by, 4.2, 3), b.body), P.belly, P.bellyS, bz);
      p.part(b.feet, P.belly, P.bellyS, null);
      const earN = tri(4.6, 12.5 + hy, 5.6, 3 + hy, 12, 7.6 + hy);
      const earL = f.ear === 1 ? tri(4.6, 12.5 + hy, 4.0, 4.4 + hy, 12, 7.6 + hy) : earN;
      const ez = p.part(or(earL, mir(earN)), P.fur, P.furS, P.furL);
      p.mark(sym(tri(6.2, 10.8 + hy, 6.8, 5.8 + hy, 10, 8.4 + hy)), P.inner, null, ez);
      const head = ell(CX, 14.6 + hy, 10.4, 8.3);
      const hz = p.part(head, P.fur, P.furS, P.furL);
      p.mark(and(ell(CX, 19.2 + hy, 3.9, 2.4), head), P.belly, null, hz);
      if (P.stripes) {
        const st = M();
        for (const [x, y] of [[12, 7], [12, 8], [14, 7], [14, 8], [14, 9], [16, 7], [16, 8]]) st[(y + hy) * W + x] = 1;
        p.mark(st, P.furS, null, hz);
      }
      if (b.sleep) paintTail();
    },
    dog(f, P, p, b) {
      const hy = b.hy, w = (f.tail || 0) * 1.6;
      p.part(line([[20.2, 25.6], [22.4, 23.6], [23.8 + w * 0.6, 20.6], [24.2 + w, 18.4]], 1.3), P.fur, P.furS, P.furL);
      const bz = p.part(b.body, P.fur, P.furS, P.furL);
      p.mark(and(ell(CX, 25.4 + b.by, 4.2, 3), b.body), P.belly, P.bellyS, bz);
      p.part(b.feet, P.belly, P.bellyS, null);
      const head = ell(CX, 14.6 + hy, 10.5, 8.2);
      const hz = p.part(head, P.fur, P.furS, P.furL);
      p.mark(and(ell(CX, 19.4 + hy, 4.7, 3), head), P.belly, null, hz);
      if (P.patch) p.mark(and(ell(9.8, 14.8 + hy, 3.2, 3), head), P.dark, null, hz);
      const earN = ell(5.3, 13.4 + hy, 2.7, 5.6, 0.28);
      const earL = f.ear === 1 ? ell(5.0, 13.0 + hy, 2.7, 5.6, 0.55) : earN;
      p.part(or(earL, mir(earN)), P.dark, P.darkS, P.darkL);
    },
    bunny(f, P, p, b) {
      const hy = b.hy;
      p.part(ell(22.6, 26, 2.7, 2.5), P.belly, P.bellyS, null);
      const bz = p.part(b.body, P.fur, P.furS, P.furL);
      p.mark(and(ell(CX, 25.4 + b.by, 4.2, 3), b.body), P.belly, P.bellyS, bz);
      p.part(b.feet, P.furL, P.furS, null);
      const rotL = f.ear === 1 ? -0.45 : -0.14, dyL = f.ear === 1 ? 1 : 0;
      const earN = ell(10.2, 7.6 + hy, 2.5, 6.2, -0.14);
      const ez = p.part(or(ell(10.2, 7.6 + hy + dyL, 2.5, 6.2, rotL), mir(earN)), P.fur, P.furS, P.furL);
      p.mark(or(ell(10.2, 8.2 + hy + dyL, 1.05, 4.4, rotL), mir(ell(10.2, 8.2 + hy, 1.05, 4.4, -0.14))), P.inner, null, ez);
      const head = ell(CX, 15.4 + hy, 9.7, 7.9);
      const hz = p.part(head, P.fur, P.furS, P.furL);
      p.mark(and(ell(CX, 20.2 + hy, 3.4, 2.2), head), P.belly, null, hz);
    },
    fox(f, P, p, b) {
      const hy = b.hy;
      const tail = ell(22.6, 21.8, 3.5, 7, 0.4 + (f.tail || 0) * 0.14);
      const tz = p.part(tail, P.fur, P.furS, P.furL);
      p.mark(and(tail, above(16.4)), '#fffaf2', '#e6d8cb', tz);
      const bz = p.part(b.body, P.fur, P.furS, P.furL);
      p.mark(and(ell(CX, 25.2 + b.by, 4.4, 3.4), b.body), P.belly, P.bellyS, bz);
      p.part(b.feet, '#4a3030', '#33201f', null);
      const earN = tri(4, 12.8 + hy, 4.4, 1.8 + hy, 12.4, 7.2 + hy);
      const earL = f.ear === 1 ? tri(4, 12.8 + hy, 3.2, 3.0 + hy, 12.4, 7.2 + hy) : earN;
      const ears = or(earL, mir(earN));
      const ez = p.part(ears, P.fur, P.furS, P.furL);
      p.mark(sym(tri(5.9, 10.6 + hy, 5.9, 4.6 + hy, 10.4, 7.8 + hy)), '#fff1dc', null, ez);
      p.mark(and(ears, above(4.8 + hy)), '#3d2a2a', null, ez);
      const head = or(ell(CX, 14.8 + hy, 10.6, 7.8), sym(tri(3.6, 15.5 + hy, 4.8, 21.6 + hy, 9.6, 19.4 + hy)));
      const hz = p.part(head, P.fur, P.furS, P.furL);
      p.mark(and(ell(CX, 21.8 + hy, 9.8, 4.9), head), P.belly, P.bellyS, hz);
    },
    panda(f, P, p, b) {
      const hy = b.hy;
      p.part(ell(22.4, 27, 1.6, 1.5), P.fur, P.furS, null);
      const bz = p.part(b.body, P.fur, P.furS, '#ffffff');
      p.mark(and(b.body, above(22.4 + b.by)), P.dark, P.darkS, bz);
      p.part(b.feet, P.dark, P.darkS, P.darkL);
      p.part(sym(ell(10.6, 24.4 + b.by, 2, 2.8)), P.dark, P.darkS, P.darkL);
      const earN = ell(6.6, 8.2 + hy, 3.3, 3.3);
      p.part(or(f.ear === 1 ? ell(6.0, 8.8 + hy, 3.3, 3.0) : earN, mir(earN)), P.dark, P.darkS, P.darkL);
      const head = ell(CX, 14.6 + hy, 10.4, 8.3);
      const hz = p.part(head, P.fur, P.furS, '#ffffff');
      p.mark(and(sym(ell(10, 15.6 + hy, 2.7, 3.5, 0.5)), head), P.dark, null, hz);
    },
    hamster(f, P, p, b) {
      const hy = b.hy;
      const bz = p.part(b.body, P.fur, P.furS, P.furL);
      p.mark(and(ell(CX, 25.6 + b.by, 5.6, 3.4), b.body), P.belly, P.bellyS, bz);
      p.part(b.feet, '#f6a9b5', '#d9849a', null);
      const earN = ell(7.6, 9.2 + hy, 2.5, 2.5);
      const ez = p.part(or(f.ear === 1 ? ell(7.0, 9.8 + hy, 2.5, 2.2) : earN, mir(earN)), P.furS, U.dark(P.fur, 0.4), P.fur);
      p.mark(sym(ell(7.6, 9.4 + hy, 1.2, 1.2)), P.inner, null, ez);
      const head = or(ell(CX, 15.6 + hy, 10.8, 8), sym(ell(5.6, 18.6 + hy, 3.4, 3)));
      const hz = p.part(head, P.fur, P.furS, P.furL);
      p.mark(and(ell(CX, 21.6 + hy, 9.4, 4.8), head), P.belly, P.bellyS, hz);
      p.part(sym(ell(12.2, 23.6 + b.by, 1.4, 1.1)), '#f6a9b5', '#d9849a', null);
    },
  };

  /* ---------------- Visage : yeux, nez, bouche, joues ---------------- */
  function face(p, f, P, sp, b) {
    const hy = b.hy, panda = sp === 'panda', dog = sp === 'dog';
    const ey = 14 + hy + (sp === 'bunny' || sp === 'hamster' ? 1 : 0);
    const E = P.eye, lineCol = panda ? '#f2eeff' : E;
    const dx = f.eyeDx || 0;
    const eyes = f.eyes || 'open';
    for (const x of [9 + dx, 18 + dx]) {
      if (eyes === 'open' || eyes === 'star') {
        if (panda) {
          for (let j = 1; j < 3; j++) { p.px(x, ey + j, E); p.px(x + 1, ey + j, E); }
          p.px(x, ey + 1, P.shine);
        } else {
          for (let j = 0; j < 3; j++) { p.px(x, ey + j, E); p.px(x + 1, ey + j, E); }
          p.px(x, ey, P.shine);
          if (eyes === 'star') p.px(x + 1, ey + 2, P.shine);
        }
      } else if (eyes === 'blink') {
        p.px(x, ey + 2, lineCol); p.px(x + 1, ey + 2, lineCol);
      } else if (eyes === 'closed') {
        p.px(x - 1, ey + 1, lineCol); p.px(x, ey + 2, lineCol); p.px(x + 1, ey + 2, lineCol); p.px(x + 2, ey + 1, lineCol);
      } else if (eyes === 'happy') {
        p.px(x - 1, ey + 2, lineCol); p.px(x, ey + 1, lineCol); p.px(x + 1, ey + 1, lineCol); p.px(x + 2, ey + 2, lineCol);
      }
    }
    // joues roses
    const cy = ey + 3;
    for (const x of [7, 8, 20, 21]) {
      const c = p.get(x, cy);
      if (c) p.px(x, cy, U.mix(c, '#ff6f91', 0.45));
    }
    // nez
    const ny = ey + 3, nc = P.nose;
    p.px(13, ny, nc); p.px(14, ny, nc); p.px(15, ny, nc);
    if (dog) { p.px(13, ny + 1, nc); p.px(14, ny + 1, nc); p.px(15, ny + 1, nc); p.px(13, ny, '#8a7890'); }
    else p.px(14, ny + 1, nc);
    // bouche
    const mc = P.mouth, mouth = f.mouth || 'w', my = ny + 2;
    if (mouth === 'w') {
      if (dog) { p.px(14, my, mc); p.px(13, my + 1, mc); p.px(15, my + 1, mc); }
      else { p.px(12, my, mc); p.px(14, my, mc); p.px(16, my, mc); p.px(13, my + 1, mc); p.px(15, my + 1, mc); }
    } else if (mouth === 'open') {
      p.px(13, my, mc); p.px(14, my, mc); p.px(15, my, mc);
      p.px(13, my + 1, mc); p.px(14, my + 1, P.tongue); p.px(15, my + 1, mc);
      p.px(14, my + 2, mc);
    } else if (mouth === 'o') {
      p.px(14, my, mc); p.px(13, my + 1, mc); p.px(15, my + 1, mc); p.px(14, my + 2, mc);
    } else if (mouth === 'sleep') {
      p.px(14, my, mc);
    } else if (mouth === 'sad') {
      p.px(13, my + 1, mc); p.px(14, my, mc); p.px(15, my + 1, mc);
    }
    // moustaches du chat
    if (sp === 'cat') {
      const wc = U.mix(P.fur, '#160b26', 0.8);
      for (const y of [ny - 1, ny + 1]) { p.px(2, y, wc); p.px(3, y, wc); p.px(25, y, wc); p.px(26, y, wc); }
    }
  }

  /* ---------------- Accessoires (boutique) ---------------- */
  const AP = { p: '#ff7aa8', P: '#ffb3cf', K: '#c8467a', r: '#ff4a5a', R: '#ff8a8a', y: '#ffd34e', Y: '#fff2a8', k: '#2a1d3d',
    w: '#ffffff', d: '#3a4a6a', b: '#3f7fe0', B: '#2a5ab0', g: '#5fd38a', o: '#ff9a3c', c: '#5ff0d8', v: '#b98cff' };
  const ACC = {
    bow: { kind: 'side', map: ['pp...pp', 'pPp.pPp', 'pPPKPPp', 'pPp.pPp', 'pp...pp'] },
    flower: { kind: 'side', map: ['..r.r..', '.rRrRr.', 'rRRyRRr', '.rRrRr.', '..r.r..'] },
    glasses: { kind: 'eyes', map: ['kkkk.....kkkk', 'kwdkkkkkkkwdk', 'kddk.....kddk', '.kk.......kk.'] },
    cap: { kind: 'hat', map: ['....bbbbb....', '...bwbbbbb...', '..bbbbbbbbb..', '..BBBBBBBBBBB'] },
    party: { kind: 'hat', map: ['...Y...', '..YyY..', '...p...', '..pPp..', '..vvv..', '.pPpPp.', '.vvvvv.', 'pPpPpPp'] },
    crown: { kind: 'hat', map: ['y...y...y', 'yy.yYy.yy', 'yyyyyyyyy', 'yryycyyry', 'YYYYYYYYY'] },
  };
  const BRIM = { cat: 8, dog: 8, bunny: 9, fox: 8, panda: 8, hamster: 9 };
  const accCache = {};
  function accSprite(id) {
    if (!accCache[id]) accCache[id] = U.outlined(U.sprite(ACC[id].map, AP), '#1e1236');
    return accCache[id];
  }
  function drawAcc(x, id, sp, f) {
    const a = ACC[id];
    if (!a) return;
    const s = accSprite(id), hy = f.hy || 0;
    if (a.kind === 'hat') x.drawImage(s, Math.round(CX - s.width / 2), PAD + BRIM[sp] + hy + 1 - s.height);
    else if (a.kind === 'eyes') x.drawImage(s, 7, PAD + 13 + hy + (sp === 'bunny' || sp === 'hamster' ? 1 : 0));
    else x.drawImage(s, 17, PAD + BRIM[sp] + hy - 5);
  }
  // Taches de saleté (quand il a besoin d'un bain)
  const SPOTS = [[9, 23], [19, 25], [12, 11], [18, 13], [15, 26], [8, 17], [21, 19], [11, 27]];
  function drawDirt(x, base, level, hy) {
    const d = base.getContext('2d').getImageData(0, 0, W, H).data;
    const n = level >= 2 ? SPOTS.length : 4;
    for (let i = 0; i < n; i++) {
      const [sx, sy0] = SPOTS[i], sy = sy0 < 21 ? sy0 + hy : sy0;
      if (sy < 0 || sy >= H || d[(sy * W + sx) * 4 + 3] === 0) continue;
      x.fillStyle = '#7a5a3a'; x.fillRect(sx, PAD + sy, 2, 1);
      x.fillStyle = '#9a7a52'; x.fillRect(sx, PAD + sy + 1, 1, 1);
    }
  }

  /* ---------------- Construction + cache ---------------- */
  const cache = new Map();
  function build(sp, fi, f) {
    const P = pal(sp, fi), p = painter(), b = common(f, sp);
    BUILD[sp](f, P, p, b);
    p.contacts();
    p.outline();
    face(p, f, P, sp, b);
    return p.canvas();
  }
  // Sprite final : 29 x 37 (6 pixels de marge en haut pour les chapeaux)
  function get(sp, fi, f = {}, acc = '', dirt = 0) {
    if (!INFO[sp]) sp = 'cat';
    const key = [sp, fi, f.pose || '', f.hy || 0, f.feet || 0, f.tail || 0, f.ear || 0, f.eyes || 'open', f.eyeDx || 0, f.mouth || 'w', acc || '', dirt | 0].join('|');
    let c = cache.get(key);
    if (!c) {
      const base = build(sp, fi, f), out = U.canvas(W, H + PAD);
      out.x.drawImage(base, 0, PAD);
      if (dirt) drawDirt(out.x, base, dirt, f.hy || 0);
      if (acc) drawAcc(out.x, acc, sp, f);
      c = out.c;
      cache.set(key, c);
      if (cache.size > 1200) cache.delete(cache.keys().next().value);
    }
    return c;
  }

  // Grande image du compagnon (icône de notification, partage…)
  function portraitPNG(sp, fi, scale = 8, acc = '') {
    const s = get(sp, fi, { eyes: 'happy', mouth: 'open' }, acc);
    const pad = 2, { c, x } = U.canvas((s.width + pad * 2) * scale, (s.height + pad * 2) * scale);
    x.drawImage(s, pad * scale, pad * scale, s.width * scale, s.height * scale);
    return c.toDataURL('image/png');
  }

  return { W, H: H + PAD, PAD, INFO, get, pal, portraitPNG, names: Object.keys(INFO), ACC: Object.keys(ACC) };
})();
