"use strict";
/* =====================================================================
   Utilitaires pixel-art : couleurs, canvas, hasard reproductible, polices
   ===================================================================== */
const U = (() => {
  const cache = new Map();
  function hex(c) {
    let v = cache.get(c);
    if (!v) {
      const n = parseInt(c.slice(1), 16);
      v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      cache.set(c, v);
    }
    return v;
  }
  const byte = v => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  const rgb = (r, g, b) => '#' + ((1 << 24) | (byte(r) << 16) | (byte(g) << 8) | byte(b)).toString(16).slice(1);
  function mix(a, b, t) {
    const A = hex(a), B = hex(b);
    return rgb(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  // ombres froides et lumières chaudes : rendu plus "pro" qu'un simple noir/blanc
  const dark = (c, t) => mix(c, '#1e1236', t);
  const light = (c, t) => mix(c, '#fff6dc', t);
  const lum = c => { const [r, g, b] = hex(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return { c, x };
  }
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutBack = t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  // Dégradé multi-arrêts : stops = [[t, '#couleur'], ...]
  function grad(stops, t) {
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        return mix(c0, c1, (t - t0) / (t1 - t0 || 1));
      }
    }
    return stops[stops.length - 1][1];
  }

  // Matrice de Bayer 4x4 pour le tramage (dithering) rétro
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  // Carte de pixels (tableau de chaînes) → canvas
  function sprite(rows, pal, scale = 1) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const { c, x } = canvas(w * scale, h * scale);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < rows[j].length; i++) {
        const col = pal[rows[j][i]];
        if (col) { x.fillStyle = col; x.fillRect(i * scale, j * scale, scale, scale); }
      }
    }
    return c;
  }

  // Ajoute un contour d'1 pixel autour d'un canvas (contour "sélectif" teinté)
  function outlined(src, col = '#1a0f2e') {
    const w = src.width + 2, h = src.height + 2;
    const { c, x } = canvas(w, h);
    x.drawImage(src, 1, 1);
    const d = x.getImageData(0, 0, w, h), p = d.data, o = new Uint8ClampedArray(p);
    const [r, g, b] = hex(col);
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      const k = (y * w + i) * 4;
      if (p[k + 3] > 0) continue;
      const n = (i > 0 && p[k - 1] > 0) || (i < w - 1 && p[k + 7] > 0) ||
                (y > 0 && p[k - w * 4 + 3] > 0) || (y < h - 1 && p[k + w * 4 + 3] > 0);
      if (n) { o[k] = r; o[k + 1] = g; o[k + 2] = b; o[k + 3] = 255; }
    }
    d.data.set(o);
    x.putImageData(d, 0, 0);
    return c;
  }

  /* ---------- Petite police 3x5 pour les enseignes du décor ---------- */
  const F3 = {
    '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '2': ['###', '..#', '###', '#..', '###'], '3': ['###', '..#', '.##', '..#', '###'],
    '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
    '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'],
    '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '###'],
    ':': ['.', '#', '.', '#', '.'], ' ': ['.', '.', '.', '.', '.'],
    'A': ['.#.', '#.#', '###', '#.#', '#.#'], 'B': ['##.', '#.#', '##.', '#.#', '##.'],
    'E': ['###', '#..', '##.', '#..', '###'], 'R': ['##.', '#.#', '##.', '#.#', '#.#'],
    'U': ['#.#', '#.#', '#.#', '#.#', '###'], 'Z': ['###', '..#', '.#.', '#..', '###'],
    'H': ['#.#', '#.#', '###', '#.#', '#.#'], 'O': ['###', '#.#', '#.#', '#.#', '###'],
    'M': ['#.#', '###', '###', '#.#', '#.#'], 'I': ['###', '.#.', '.#.', '.#.', '###'],
    'S': ['###', '#..', '###', '..#', '###'], 'N': ['##.', '#.#', '#.#', '#.#', '#.#'],
  };
  function text3W(s) { let w = 0; for (const ch of s) w += (F3[ch] || F3[' '])[0].length + 1; return Math.max(0, w - 1); }
  function text3(ctx, s, x, y, col) {
    ctx.fillStyle = col;
    for (const ch of s) {
      const g = F3[ch] || F3[' '];
      for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '#') ctx.fillRect(x + i, y + j, 1, 1);
      x += g[0].length + 1;
    }
  }

  return { hex, rgb, mix, dark, light, lum, canvas, rng, lerp, clamp, easeOut, easeInOut, easeOutBack, grad, bayer, sprite, outlined, text3, text3W };
})();
