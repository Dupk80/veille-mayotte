"use strict";
/* =====================================================================
   Mini-jeux passe-temps avec le compagnon (pixel-art original) :
   - Pluie de friandises : attrape les bonnes choses, évite les cailloux
   - Grand saut : saute par-dessus les obstacles (double saut possible)
   - Memory : retrouve les paires de friandises
   ===================================================================== */
const Games = (() => {
  let cv, ctx, W = 150, H = 220, SCALE = 6, DPR = 1;
  let game = null, gameId = '', state = 'idle', running = false, lastTs = 0, env = null, T = 0;
  const hooks = { end: null, sfx: null, hud: null };
  const RND = Math.random;
  const R = (X, Y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(X), Math.round(Y), w, h); };
  const sfx = n => { if (hooks.sfx) hooks.sfx(n); };
  const SP = (rows, pal) => U.outlined(U.sprite(rows, pal), '#2a1d3d');

  /* ---------------- Sprites ---------------- */
  const CRAB = SP(['r.......r', 'rr.e.e.rr', '.rrrrrrr.', 'rrrrrrrrr', '.r.r.r.r.'], { r: '#e8553e', e: '#2a1d3d' });
  const CASTLE = SP(['y.y.....y.y', 'yyy..y..yyy', 'yYy.yyy.yYy', 'yYyyyYyyyYy', 'yYYYYkYYYYy', 'yYYYkkkYYYy', 'yyyyykyyyyy'], { y: '#d9b06a', Y: '#f0cf8a', k: '#7a5a3a' });
  const LOG = SP(['.nnnnnnnnnnn.', 'nNnnnNnnnnnNo', 'nnnnnnnnNnnoO', '.nnnnnnnnnnno'], { n: '#9a6a3a', N: '#7a4a24', o: '#e0b070', O: '#c08a50' });
  const SHROOM = SP(['..rrrr..', '.rwrrwr.', 'rrrrrrrr', '...ww...', '...ww...'], { r: '#e8453e', w: '#fff4e8' });
  const CLOUD = U.sprite(['....wwww........', '..wwwwwwww.ww...', '.wwwwwwwwwwwwww.', 'wwwwwwwwwwwwwwww', 'ssssssssssssssss'], { w: '#ffffff', s: '#d8e8f8' });
  let clouds = [];
  function drawClouds(speed) {
    for (const c of clouds) {
      const span = W + 40, X = Math.round((((c.x - T * c.v * speed) % span) + span) % span) - 20;
      ctx.globalAlpha = c.a; ctx.drawImage(CLOUD, X, c.y); ctx.globalAlpha = 1;
    }
  }
  const HEART = U.sprite(['##.##', '#####', '#####', '.###.', '..#..'], { '#': '#ff5a7a' });
  const HEART0 = U.sprite(['##.##', '#####', '#####', '.###.', '..#..'], { '#': '#4a3a5a' });

  /* ---------------- Décors ---------------- */
  let bgSky = null, farStrip = null, groundTile = null;
  const PW = 256;
  function skyCanvas(top, bottom, groundCol) {
    const { c, x } = U.canvas(W, H), img = x.createImageData(W, H), d = img.data, NB = 7, cols = [];
    for (let i = 0; i <= NB; i++) cols.push(U.hex(U.mix(top, bottom, i / NB)));
    for (let y = 0; y < H; y++) {
      const t = (y / H) * NB, i = Math.min(NB - 1, Math.floor(t)), k = U.clamp((t - i - 0.5) / 0.5, 0, 1);
      for (let X = 0; X < W; X++) { const col = k > U.bayer(X, y) ? cols[i + 1] : cols[i], o = (y * W + X) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
    }
    x.putImageData(img, 0, 0);
    if (groundCol) {
      x.fillStyle = groundCol[0]; x.fillRect(0, H - 6, W, 6);
      x.fillStyle = groundCol[1]; for (let X = 0; X < W; X++) if (U.bayer(X, H - 7) < 0.5) x.fillRect(X, H - 7, 1, 1);
      x.fillStyle = groundCol[2]; for (let X = 0; X < W; X += 3) x.fillRect(X + (X % 2), H - 3, 1, 1);
    }
    return c;
  }
  function buildStrips(lagon) {
    const sh = 46, f = U.canvas(PW, sh);
    for (let i = 0; i < PW; i++) {
      const a = (i / PW) * Math.PI * 2;
      const h = Math.round(lagon ? 10 + Math.sin(a * 2) * 7 + Math.sin(a * 5 + 1) * 3 : 16 + Math.sin(a * 3) * 8 + Math.sin(a * 7 + 2) * 3);
      for (let j = 0; j < h; j++) { f.x.fillStyle = j > h - 2 ? (lagon ? '#94c2cc' : '#c0d0f2') : lagon ? '#6d9cb2' : '#9db2e2'; f.x.fillRect(i, sh - 16 - j, 1, 1); }
      f.x.fillStyle = lagon ? '#3a95d6' : '#7cc45c'; f.x.fillRect(i, sh - 16, 1, 16);
      if (lagon && (i * 7 + 3) % 23 === 0) { f.x.fillStyle = '#d8f4ff'; f.x.fillRect(i, sh - 12 + (i % 3) * 3, 3, 1); }
      if (!lagon && (i * 5) % 17 === 0) { f.x.fillStyle = '#4f9a3e'; f.x.fillRect(i, sh - 18, 2, 3); }
    }
    farStrip = f.c;
    const g = U.canvas(32, 16);
    for (let y = 0; y < 16; y++) for (let X = 0; X < 32; X++) {
      let col = lagon ? (U.bayer(X, y) < y / 16 ? '#e8c58a' : '#f3d9a4') : (U.bayer(X, y) < y / 16 ? '#5aa845' : '#77c45a');
      if (y === 0) col = lagon ? '#fff0cc' : '#a6dd7f';
      if (y < 4 && (X === 5 || X === 21)) col = lagon ? '#c99a64' : '#8a5a36';
      g.x.fillStyle = col; g.x.fillRect(X, y, 1, 1);
    }
    groundTile = g.c;
  }

  /* ---------------- Outils communs ---------------- */
  function label(txt, x, y, col, center = true) {
    const w = U.text3W(txt), X = Math.round(center ? x - w / 2 : x), Y = Math.round(y);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) U.text3(ctx, txt, X + dx, Y + dy, '#2a1d3d');
    U.text3(ctx, txt, X, Y, col);
  }
  function petSprite(f) { return Pets.get(env.sp, env.fur, f, env.acc); }
  let parts = [];
  function burst(x, y, cols, n = 8) {
    for (let i = 0; i < n; i++) { const a = RND() * Math.PI * 2, v = 14 + RND() * 30; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, t: 0, life: 0.5 + RND() * 0.4, c: cols[i % cols.length] }); }
  }
  function updParts(dt) { for (const p of parts) { p.t += dt; p.vy += 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } parts = parts.filter(p => p.t < p.life); }
  function drawParts() { for (const p of parts) { ctx.globalAlpha = 1 - p.t / p.life; R(p.x, p.y, 1, 1, p.c); } ctx.globalAlpha = 1; }
  function hud(g) { if (hooks.hud) hooks.hud(g.score, g.lives, g.info || ''); }

  /* ================= Pluie de friandises ================= */
  function Catch() {
    const g = { score: 0, lives: 3, over: false, info: '' };
    const pet = { x: W / 2, tx: W / 2, dir: 0, happy: 0, hurt: 0, run: 0 };
    let items = [], pops = [], t = 0, spawn = 0.5, combo = 0, shake = 0;
    const fav = Care.FAV[env.sp] || 'fish';
    const GOOD = [['kibble', 1, 5], ['apple', 1, 4], [fav, 2, 3], ['icecream', 2, 1.6], ['cake', 3, 1.2], ['star', 5, 0.5]];
    function pick() {
      if (RND() < Math.min(0.3, 0.1 + t * 0.004)) return { id: RND() < 0.65 ? 'rock' : 'sock', bad: true };
      const tot = GOOD.reduce((a, x) => a + x[2], 0);
      let r = RND() * tot;
      for (const gd of GOOD) { r -= gd[2]; if (r <= 0) return { id: gd[0], pts: gd[1] }; }
      return { id: 'kibble', pts: 1 };
    }
    g.down = x => { pet.tx = x; };
    g.move = x => { pet.tx = x; };
    g.update = dt => {
      t += dt;
      const d = pet.tx - pet.x;
      pet.x = U.clamp(pet.x + Math.sign(d) * Math.min(Math.abs(d), dt * 150), 12, W - 12);
      pet.dir = Math.abs(d) > 1.5 ? Math.sign(d) : 0;
      if (pet.dir) pet.run += dt;
      spawn -= dt;
      if (spawn <= 0) {
        const it = pick();
        it.spr = Care.icon(it.id); it.x = 10 + RND() * (W - 20); it.y = -14; it.v = 0.85 + RND() * 0.3; it.ph = RND() * 6;
        items.push(it);
        spawn = Math.max(0.3, 0.9 - t * 0.011) * (0.75 + RND() * 0.5);
      }
      const sp = Math.min(100, 32 + t * 1.25), mouth = H - 17;
      for (const it of items) {
        it.y += sp * it.v * dt; it.x += Math.sin(t * 2.2 + it.ph) * 5 * dt;
        if (!it.done && Math.abs(it.x - pet.x) < 12 && it.y > mouth - 16 && it.y < mouth + 5) {
          it.done = true;
          if (it.bad) {
            g.lives--; pet.hurt = 0.8; combo = 0; shake = 0.35;
            pops.push({ x: it.x, y: it.y - 8, txt: 'AIE', c: '#ff5a5f', t: 0 });
            burst(it.x, it.y, ['#9aa0b8', '#ffffff'], 6); sfx('hurt');
          } else {
            combo++;
            const m = combo >= 20 ? 3 : combo >= 10 ? 2 : 1;
            g.score += it.pts * m; pet.happy = 0.35;
            pops.push({ x: it.x, y: it.y - 8, txt: '+' + it.pts * m, c: m > 1 ? '#ffd34e' : '#ffffff', t: 0 });
            burst(it.x, it.y, [Care.foodColor(it.id), '#ffffff'], 5);
            sfx(it.id === 'star' ? 'twinkle' : 'blip');
            if (combo === 10 || combo === 20) { pops.push({ x: W / 2, y: H * 0.35, txt: 'COMBO X' + m, c: '#ffd34e', t: 0, big: 1 }); sfx('twinkle'); }
          }
        }
        if (!it.done && it.y > H + 8) { it.done = true; if (!it.bad) combo = 0; }
      }
      items = items.filter(i => !i.done);
      for (const p of pops) { p.t += dt; p.y -= 16 * dt; }
      pops = pops.filter(p => p.t < (p.big ? 1.3 : 0.7));
      pet.happy -= dt; pet.hurt -= dt; shake = Math.max(0, shake - dt);
      g.info = combo >= 3 ? 'Combo ' + combo : '';
      if (g.lives <= 0) g.over = true;
      updParts(dt);
      hud(g);
    };
    g.draw = () => {
      const sx = shake > 0 ? Math.round((RND() - 0.5) * 4) : 0;
      ctx.drawImage(bgSky, sx, 0);
      drawClouds(1);
      for (const it of items) ctx.drawImage(it.spr, Math.round(it.x - it.spr.width / 2) + sx, Math.round(it.y - it.spr.height / 2));
      const f = { feet: pet.dir ? (Math.floor(pet.run * 10) % 2 ? 1 : 2) : 0, hy: pet.dir ? 0 : Math.floor(t * 1.4) % 2, eyeDx: pet.dir, tail: [0, 1, 0, -1][Math.floor(t * 6) % 4],
        eyes: pet.hurt > 0 ? 'closed' : pet.happy > 0 ? 'happy' : 'open', mouth: pet.hurt > 0 ? 'sad' : pet.happy > 0 ? 'open' : 'o' };
      const s = petSprite(f);
      if (!(pet.hurt > 0 && Math.floor(pet.hurt * 12) % 2)) ctx.drawImage(s, Math.round(pet.x - 14) + sx, H - 4 - s.height + 1);
      drawParts();
      for (const p of pops) label(p.txt, p.x, p.y, p.c);
    };
    return g;
  }

  /* ================= Grand saut ================= */
  function Jump() {
    const g = { score: 0, lives: 3, over: false, info: '' };
    const GY = H - 16;
    const pet = { x: 32, y: 0, vy: 0, jumps: 0, hurt: 0, run: 0 };
    let obs = [], coins = [], pops = [], t = 0, speed = 62, dist = 0, nextObs = 1.6, nextCoin = 2.4, bonus = 0, scroll = 0, shake = 0;
    const OBS = env.theme === 'campagne' ? [SHROOM, LOG, Care.icon('rock')] : [CRAB, CASTLE, Care.icon('rock')];
    const STAR = Care.icon('star');
    g.down = () => {
      if (pet.jumps < 2) { pet.vy = pet.jumps ? -130 : -160; pet.jumps++; sfx('jump'); burst(pet.x, GY + pet.y, ['#ffffff', '#fff0cc'], 4); }
    };
    g.update = dt => {
      t += dt; speed = Math.min(165, 62 + t * 2.4); scroll += speed * dt; dist += speed * dt;
      pet.vy += 450 * dt; pet.y += pet.vy * dt;
      if (pet.y >= 0) { pet.y = 0; pet.vy = 0; pet.jumps = 0; }
      pet.run += (dt * speed) / 60; pet.hurt -= dt; shake = Math.max(0, shake - dt);
      nextObs -= (dt * speed) / 62;
      if (nextObs <= 0) {
        const spr = OBS[Math.floor(RND() * OBS.length)];
        obs.push({ spr, x: W + 10 });
        nextObs = 1.05 + RND() * 1.3;
        if (t > 15 && RND() < 0.2) nextObs = 0.42;
      }
      nextCoin -= dt;
      if (nextCoin <= 0) { const n = 1 + Math.floor(RND() * 3), y = GY - 20 - RND() * 22; for (let i = 0; i < n; i++) coins.push({ x: W + 10 + i * 13, y }); nextCoin = 2 + RND() * 2.6; }
      for (const o of obs) o.x -= speed * dt;
      for (const c of coins) c.x -= speed * dt;
      const px0 = pet.x - 7, px1 = pet.x + 7, py1 = GY + pet.y, py0 = py1 - 18;
      for (const o of obs) {
        if (o.hit) continue;
        const w = o.spr.width, h = o.spr.height, ox0 = o.x - w / 2 + 2, ox1 = o.x + w / 2 - 2, oy0 = GY - h + 3;
        if (px1 > ox0 && px0 < ox1 && py1 > oy0 && pet.hurt <= 0) {
          o.hit = true; g.lives--; pet.hurt = 1.3; shake = 0.35; sfx('hurt');
          pops.push({ x: pet.x, y: py0 - 6, txt: 'AIE', c: '#ff5a5f', t: 0 });
        }
      }
      for (const c of coins) if (!c.got && Math.abs(c.x - pet.x) < 9 && Math.abs(c.y - (GY + pet.y - 12)) < 12) {
        c.got = true; bonus += 5; sfx('blip'); burst(c.x, c.y, ['#ffd34e', '#ffffff'], 6);
        pops.push({ x: c.x, y: c.y - 6, txt: '+5', c: '#ffd34e', t: 0 });
      }
      obs = obs.filter(o => o.x > -20);
      coins = coins.filter(c => !c.got && c.x > -10);
      for (const p of pops) { p.t += dt; p.y -= 14 * dt; }
      pops = pops.filter(p => p.t < 0.7);
      g.score = Math.floor(dist / 12) + bonus;
      g.info = Math.floor(dist / 10) + ' m';
      if (g.lives <= 0) g.over = true;
      updParts(dt);
      hud(g);
    };
    g.draw = () => {
      const sx = shake > 0 ? Math.round((RND() - 0.5) * 4) : 0;
      ctx.drawImage(bgSky, 0, 0);
      drawClouds(1 + speed / 40);
      const fy = GY - farStrip.height + 2, fo = -Math.round((scroll * 0.25) % PW);
      for (let X = fo; X < W; X += PW) ctx.drawImage(farStrip, X + sx, fy);
      const go = -Math.round(scroll % 32);
      for (let X = go; X < W; X += 32) ctx.drawImage(groundTile, X + sx, GY + 1);
      R(0, GY + 17, W, H, '#2a1d3d');
      for (const c of coins) ctx.drawImage(STAR, Math.round(c.x - STAR.width / 2) + sx, Math.round(c.y - STAR.height / 2 + Math.sin(T * 6 + c.x) * 1.5));
      for (const o of obs) ctx.drawImage(o.spr, Math.round(o.x - o.spr.width / 2) + sx, GY - o.spr.height + 2);
      const air = pet.y < -0.5;
      const f = air ? { pose: 'jump', eyes: 'happy', mouth: 'open' } : { feet: Math.floor(pet.run * 6) % 2 ? 1 : 2, hy: Math.floor(pet.run * 6) % 2, eyeDx: 1, tail: [0, 1, 0, -1][Math.floor(t * 8) % 4] };
      if (pet.hurt > 0) { f.eyes = 'closed'; f.mouth = 'sad'; }
      const s = petSprite(f);
      if (!(pet.hurt > 0 && Math.floor(pet.hurt * 12) % 2)) ctx.drawImage(s, Math.round(pet.x - 14) + sx, Math.round(GY + pet.y) - s.height + 3);
      drawParts();
      for (const p of pops) label(p.txt, p.x, p.y, p.c);
    };
    return g;
  }

  /* ================= Memory ================= */
  function Memory() {
    const g = { score: 0, lives: -1, over: false, info: '' };
    const ids = ['kibble', 'apple', 'fish', 'bone', 'carrot', 'cake', 'icecream', 'berries'];
    const deck = ids.concat(ids);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(RND() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const m = 8, gap = 4, cs = Math.floor((W - 2 * m - 3 * gap) / 4);
    const gridH = 4 * cs + 3 * gap, top = Math.max(10, Math.round((H - 44 - gridH) / 2));
    const left = Math.round((W - (4 * cs + 3 * gap)) / 2);
    const cards = deck.map((id, i) => ({ id, spr: Care.icon(id), x: left + (i % 4) * (cs + gap), y: top + Math.floor(i / 4) * (cs + gap), open: false, done: false, f: 0 }));
    let sel = [], lock = 0, moves = 0, t = 0, pairs = 0, happy = 0, sad = 0;
    g.down = (x, y) => {
      if (lock > 0) return;
      const c = cards.find(k => x >= k.x && x < k.x + cs && y >= k.y && y < k.y + cs);
      if (!c || c.open || c.done) return;
      c.open = true; sel.push(c); sfx('click');
      if (sel.length === 2) { moves++; lock = sel[0].id === sel[1].id ? 0.35 : 0.9; }
    };
    g.update = dt => {
      t += dt;
      for (const c of cards) { const tg = c.open || c.done ? 1 : 0; c.f += Math.sign(tg - c.f) * Math.min(Math.abs(tg - c.f), dt * 6); }
      if (lock > 0) {
        lock -= dt;
        if (lock <= 0 && sel.length === 2) {
          if (sel[0].id === sel[1].id) {
            sel.forEach(c => { c.done = true; burst(c.x + cs / 2, c.y + cs / 2, ['#ffd34e', '#ffffff', '#5ff0d8'], 8); });
            pairs++; happy = 1; sfx('twinkle');
          } else { sel.forEach(c => { c.open = false; }); sad = 0.8; }
          sel = [];
        }
      }
      happy -= dt; sad -= dt;
      g.score = pairs * 10;
      g.info = moves + ' coups · ' + Math.floor(t) + ' s';
      if (pairs === ids.length && !g.over) { g.over = true; g.score = Math.max(10, 130 - moves * 4 - Math.floor(t)); }
      updParts(dt);
      hud(g);
    };
    g.draw = () => {
      ctx.drawImage(bgSky, 0, 0);
      for (const c of cards) {
        const k = Math.abs(Math.cos(c.f * Math.PI)), w = Math.max(1, Math.round(cs * k)), x0 = Math.round(c.x + (cs - w) / 2);
        const face = c.f > 0.5;
        R(x0 - 1, c.y - 1, w + 2, cs + 2, '#2a1d3d');
        if (face) {
          R(x0, c.y, w, cs, c.done ? '#e8ffe8' : '#fff4dc'); R(x0, c.y, w, 1, '#ffffff'); R(x0, c.y + cs - 1, w, 1, '#e8d2a8');
          const iw = c.spr.width * 2 * k, ih = c.spr.height * 2;
          if (iw >= 1) ctx.drawImage(c.spr, Math.round(c.x + (cs - iw) / 2), Math.round(c.y + (cs - ih) / 2), Math.round(iw), ih);
        } else {
          R(x0, c.y, w, cs, '#6a4ad0'); R(x0, c.y, w, 1, '#8a6af0'); R(x0, c.y + cs - 1, w, 1, '#4a2aa0');
          if (w > 8) { const cx = c.x + cs / 2, cy = c.y + cs / 2; R(cx - 3, cy - 1, 6, 4, '#b9a2ff'); R(cx - 4, cy - 5, 2, 2, '#b9a2ff'); R(cx - 1, cy - 6, 2, 2, '#b9a2ff'); R(cx + 2, cy - 5, 2, 2, '#b9a2ff'); }
        }
      }
      const f = { hy: Math.floor(T * 1.5) % 2, tail: [0, 1, 0, -1][Math.floor(T * 5) % 4], eyes: happy > 0 ? 'happy' : 'open', mouth: happy > 0 ? 'open' : sad > 0 ? 'sad' : 'w', pose: happy > 0.6 ? 'jump' : '' };
      const s = petSprite(f);
      ctx.drawImage(s, Math.round(W / 2 - 14), H - s.height - 2 - (happy > 0.6 ? 4 : 0));
      drawParts();
    };
    return g;
  }

  const LIST = {
    catch: { name: 'Pluie de friandises', desc: 'Glisse le doigt pour attraper les friandises. Évite les cailloux et les chaussettes !', make: Catch, icon: 'cake' },
    jump: { name: 'Grand saut', desc: 'Touche l\'écran pour sauter (deux fois pour un double saut). Ramasse les étoiles !', make: Jump, icon: 'star' },
    memory: { name: 'Memory', desc: 'Retourne les cartes et retrouve les paires de friandises.', make: Memory, icon: 'apple' },
  };

  /* ---------------- Boucle ---------------- */
  function loop(ts) {
    if (!running) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts; T += dt;
    if (game) {
      if (state === 'play') {
        game.update(dt);
        if (game.over) { state = 'over'; running = false; game.draw(); if (hooks.end) hooks.end(gameId, game.score); return; }
      }
      game.draw();
    }
    requestAnimationFrame(loop);
  }
  function toGame(e) {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  return {
    LIST,
    init(canvas) {
      cv = canvas; ctx = cv.getContext('2d');
      cv.addEventListener('pointerdown', e => {
        e.preventDefault();
        const p = toGame(e);
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
        if (state === 'ready') { state = 'play'; if (hooks.hud) hooks.hud(game.score, game.lives, ''); if (hooks.start) hooks.start(); }
        if (state === 'play' && game.down) game.down(p.x, p.y);
      });
      cv.addEventListener('pointermove', e => { if (state === 'play' && game && game.move && e.buttons) { const p = toGame(e); game.move(p.x, p.y); } });
    },
    on(n, fn) { hooks[n] = fn; },
    open(id, e, cssW, cssH) {
      env = e; gameId = id;
      DPR = window.devicePixelRatio || 1;
      const physW = Math.round(cssW * DPR), physH = Math.round(cssH * DPR);
      SCALE = Math.max(2, Math.round(physW / 150));
      W = Math.ceil(physW / SCALE); H = Math.ceil(physH / SCALE);
      cv.width = W; cv.height = H;
      cv.style.width = (W * SCALE) / DPR + 'px'; cv.style.height = (H * SCALE) / DPR + 'px';
      ctx.imageSmoothingEnabled = false;
      const lagon = e.theme !== 'campagne';
      bgSky = id === 'memory' ? skyCanvas('#3a2f6e', '#6a4ad0') : skyCanvas(e.night ? '#1e2652' : '#3f8ce8', e.night ? '#5a4a80' : '#c9ecff', id === 'catch' ? (lagon ? ['#f3d9a4', '#e8c58a', '#d9b07a'] : ['#77c45a', '#5aa845', '#4f9a3e']) : null);
      buildStrips(lagon);
      parts = [];
      clouds = [];
      if (id !== 'memory' && !e.night) for (let i = 0; i < 4; i++) clouds.push({ x: RND() * W, y: 6 + Math.floor(RND() * H * 0.45), v: 4 + RND() * 6, a: 0.75 + RND() * 0.25 });
      game = LIST[id].make();
      state = 'ready'; running = true; lastTs = 0;
      requestAnimationFrame(loop);
    },
    stop() { running = false; state = 'idle'; game = null; },
    get state() { return state; },
  };
})();
