"use strict";
/* =====================================================================
   Interface façon jeu rétro : gros chiffres pixel qui roulent, boîte de
   dialogue avec texte tapé lettre par lettre, icônes pixel.
   ===================================================================== */
const HUD = (() => {
  /* ---------------- Chiffres du compte à rebours (6x9) ---------------- */
  const DIG = {
    '0': ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
    '1': ['..##..', '.###..', '####..', '..##..', '..##..', '..##..', '..##..', '..##..', '######'],
    '2': ['.####.', '##..##', '....##', '...##.', '..##..', '.##...', '##....', '##....', '######'],
    '3': ['.####.', '##..##', '....##', '..###.', '....##', '....##', '....##', '##..##', '.####.'],
    '4': ['...##.', '..###.', '.####.', '##.##.', '##.##.', '######', '...##.', '...##.', '...##.'],
    '5': ['######', '##....', '##....', '#####.', '....##', '....##', '....##', '##..##', '.####.'],
    '6': ['.####.', '##..##', '##....', '#####.', '##..##', '##..##', '##..##', '##..##', '.####.'],
    '7': ['######', '....##', '....##', '...##.', '...##.', '..##..', '..##..', '..##..', '..##..'],
    '8': ['.####.', '##..##', '##..##', '.####.', '##..##', '##..##', '##..##', '##..##', '.####.'],
    '9': ['.####.', '##..##', '##..##', '##..##', '.#####', '....##', '....##', '##..##', '.####.'],
    ':': ['..', '..', '##', '##', '..', '..', '##', '##', '..'],
    ' ': ['..', '..', '..', '..', '..', '..', '..', '..', '..'],
  };
  const TH = {
    work: { hi: '#fff6b8', base: '#ffd34e', lo: '#f2952e', out: '#3a1d1a', sh: '#140a18' },
    break: { hi: '#e0fff8', base: '#5ff0d8', lo: '#1fb0a8', out: '#0e2e34', sh: '#08121c' },
    almost: { hi: '#ffe6d6', base: '#ff9a62', lo: '#ee4a3c', out: '#3a1018', sh: '#14060c' },
    done: { hi: '#ffffff', base: '#ff9ad6', lo: '#a98cff', out: '#2a1040', sh: '#10061c' },
    rest: { hi: '#f2ebff', base: '#bba6ff', lo: '#7a62e0', out: '#1e1440', sh: '#0a0618' },
  };
  const gcache = new Map();
  function glyph(ch, tn) {
    const k = ch + tn;
    let g = gcache.get(k);
    if (g) return g;
    const th = TH[tn], rows = DIG[ch] || DIG[' '];
    const w = rows[0].length, h = rows.length, { c, x } = U.canvas(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (rows[j][i] !== '#') continue;
      let col = j < 3 ? th.hi : j < 6 ? th.base : th.lo;
      if (i === 0 || rows[j][i - 1] !== '#') col = U.light(col, 0.25);
      x.fillStyle = col; x.fillRect(i, j, 1, 1);
    }
    const o = U.outlined(c, th.out), s = U.canvas(o.width, o.height);
    s.x.drawImage(o, 0, 0); s.x.globalCompositeOperation = 'source-in'; s.x.fillStyle = th.sh; s.x.fillRect(0, 0, o.width, o.height);
    g = { g: o, s: s.c, w: o.width, h: o.height };
    gcache.set(k, g);
    return g;
  }

  function Clock(canvas) {
    const x = canvas.getContext('2d');
    let cells = [], tn = 'work', px = 3, mult = 2, cw = 0, chh = 0;
    function layoutSize() {
      let w = 1;
      cells.forEach(c => { w += glyph(c.ch, tn).w; });
      const h = 9 + 2 + 1;
      if (w !== cw || h !== chh) {
        cw = w; chh = h;
        canvas.width = w; canvas.height = h;
        x.imageSmoothingEnabled = false;
        canvas.style.width = w * px * mult + 'px';
        canvas.style.height = h * px * mult + 'px';
      }
    }
    return {
      set(str, theme) {
        const now = performance.now();
        if (theme !== tn) { tn = theme; }
        const next = [];
        for (let i = 0; i < str.length; i++) {
          const old = cells[i];
          if (old && old.ch === str[i]) next.push(old);
          else next.push({ ch: str[i], prev: old ? old.ch : null, t0: old ? now : now - 1000 });
        }
        cells = next;
        layoutSize();
      },
      setScale(p, m) { px = p; mult = m || 2; cw = 0; layoutSize(); },
      draw(now) {
        x.clearRect(0, 0, cw, chh);
        let X = 0;
        for (const c of cells) {
          const g = glyph(c.ch, tn), k = Math.min(1, (now - c.t0) / 240);
          const colon = c.ch === ':';
          if (colon) x.globalAlpha = (now % 1000) < 520 ? 1 : 0.45;
          x.save();
          x.beginPath(); x.rect(X, 0, g.w + 1, g.h + 1); x.clip();
          if (k < 1 && c.prev !== null) {
            const e = U.easeOutBack(k), off = Math.round((1 - e) * 11), offOld = Math.round(-k * 11);
            const go = glyph(c.prev, tn);
            x.drawImage(go.s, X + 1, offOld + 1); x.drawImage(go.g, X, offOld);
            x.drawImage(g.s, X + 1, off + 1); x.drawImage(g.g, X, off);
          } else {
            x.drawImage(g.s, X + 1, 1); x.drawImage(g.g, X, 0);
          }
          x.restore();
          x.globalAlpha = 1;
          X += g.w;
        }
      },
    };
  }

  /* ---------------- Icônes pixel ---------------- */
  const IP = { k: '#1e1430', w: '#ffffff', l: '#fff6dc', y: '#ffd34e', o: '#ff9a3c', r: '#ff5a6e', b: '#4aa3ff', g: '#5fd38a', G: '#9aa0b8', d: '#4a4a66', n: '#9a5b34', N: '#6b3f22', p: '#ff8fb8', c: '#5ff0d8' };
  const ICONS = {
    flag: ['k.........', 'kkkkkkkkk.', 'kwwkkwwkk.', 'kwwkkwwkk.', 'kkkwwkkwwk', 'kkkwwkkwwk', 'kwwkkwwkk.', 'kkkkkkkkk.', 'k.........', 'k.........', 'k.........', 'kk........'],
    cup: ['..w..w....', '...w..w...', '..w..w....', '..........', 'kkkkkkkk..', 'kwwwwwwkkk', 'kwnnnnwk.k', 'kwwwwwwk.k', 'kwwwwwwkkk', '.kwwwwk...', '..kkkk....'],
    bag: ['...kkkk...', '..k....k..', 'kkkkkkkkkk', 'knnnnnnnnk', 'knnnnnnnnk', 'kkkkyykkkk', 'kNNNyyNNNk', 'knnnnnnnnk', 'knnnnnnnnk', 'kkkkkkkkkk'],
    hourglass: ['kkkkkkkkkk', 'kddddddddk', '.kwwwwwwk.', '.kwyyyywk.', '..kwyywk..', '...kyyk...', '...kwwk...', '..kwwywk..', '.kwwyyywk.', '.kwyyyyyk.', 'kddddddddk', 'kkkkkkkkkk'],
    house: ['....kk....', '...kook...', '..kooook..', '.kooooook.', 'kkkkkkkkkk', '.kllllllk.', '.klbblnlk.', '.klbblnlk.', '.kllllnlk.', '.kkkkkkkk.'],
    gear: ['....kkkk....', '..k.kGGk.k..', '.kGkGGGGkGk.', '..kGGddGGk..', 'kkGGdkkdGGkk', 'kGGdk..kdGGk', 'kGGdk..kdGGk', 'kkGGdkkdGGkk', '..kGGddGGk..', '.kGkGGGGkGk.', '..k.kGGk.k..', '....kkkk....'],
    paw: ['...kk..kk...', '..kwwkkwwk..', '..kwwkkwwk..', 'kk.kk..kk.kk', 'kwwk....kwwk', 'kwwk.kk.kwwk', '.kk.kwwk.kk.', '...kwwwwk...', '..kwwwwwwk..', '..kwwwwwwk..', '...kkkkkk...'],
    clock: ['...kkkkkk...', '..kwwwwwwk..', '.kwwwkwwwwk.', 'kwwwwkwwwwwk', 'kwwwwkwwwwwk', 'kwwwwkkkkwwk', 'kwwwwwwwwwwk', '.kwwwwwwwwk.', '..kwwwwwwk..', '...kkkkkk...'],
    bell: ['.....kk.....', '....kyyk....', '...kyyyyk...', '...kyyyyk...', '..kyyyyyyk..', '..kyyyyyyk..', '.kyyyyyyyyk.', 'kkkkkkkkkkkk', '.....kk.....'],
    star: ['.....k.....', '.....k.....', '....kyk....', '....kyk....', '..kkyyykk..', 'kkyyyyyyykk', '..kkyyykk..', '....kyk....', '....kyk....', '.....k.....', '.....k.....'],
    heart: ['.kkk...kkk.', 'krrrk.krrrk', 'krwrrkrrrrk', 'krrrrrrrrrk', 'krrrrrrrrrk', '.krrrrrrrk.', '..krrrrrk..', '...krrrk...', '....krk....', '.....k.....'],
    heartoff: ['.kkk...kkk.', 'kdddk.kdddk', 'kddddkddddk', 'kdddddddddk', 'kdddddddddk', '.kdddddddk.', '..kdddddk..', '...kdddk...', '....kdk....', '.....k.....'],
    moon: ['...kkkk...', '..kyyyk...', '.kyyyk....', 'kyyyk.....', 'kyyyk.....', 'kyyyk.....', 'kyyyyk....', '.kyyyykkk.', '..kyyyyyk.', '...kkkkk..'],
    palm: ['.gg...gg..', 'gggg.gggg.', 'g..ggg..g.', '....n.....', '....n.....', '...nn.....', '...n......', '...n......', '..nn......', 'yyyyyyyyyy'],
    tree: ['...gggg...', '..gggggg..', '.gggggggg.', '.gggggggg.', '..gggggg..', '....nn....', '....nn....', '....nn....', 'gggggggggg'],
    sound: ['....k.....', '...kk..k..', 'kkkwk...k.', 'kwwwk.k.k.', 'kwwwk.k.k.', 'kkkwk...k.', '...kk..k..', '....k.....'],
    zz: ['kkkk......', '...k......', '..k.......', '.k.kkkk...', 'kkkk..k...', '.....k....', '....kkkk..'],
    down: ['kkkkk', '.kkk.', '..k..'],
    drum: ['......kkkk..', '.....konnok.', '....konnnnok', '....knnnnnnk', '...knnnnnnk.', '..kkknnnnk..', '.kwk.kkkk...', 'kwwk........', '.kk.........'],
    smile: ['...kkkkk...', '..kyyyyyk..', '.kyykyykyk.', '.kyyyyyyyk.', '.kykyyykyk.', '.kyykkkyyk.', '..kyyyyyk..', '...kkkkk...'],
    drop: ['....k.....', '...kbk....', '...kbk....', '..kbbbk...', '.kbwbbbk..', '.kbwbbbk..', '.kbbbbbk..', '..kbbbk...', '...kkk....'],
    bubble: ['..kkk......', '.kwccck....', '.kccccck...', '.kccccck.kk', '..kcccckwck', '...kkkk.kck', '.kk......k.', 'kwck.......', '.kk........'],
    ball: ['...kkkk...', '..krrwwk..', '.krrrwwwk.', '.krrrrwwk.', '.kwwrrrrk.', '.kwwwrrrk.', '..kwwrrk..', '...kkkk...'],
    pad: ['.kkkkkkkkkk.', 'kGGGGGGGGGGk', 'kGwGGGGGGrGk', 'kwwwGGGGrGrk', 'kGwGGGGGGrGk', 'kGGGGkkGGGGk', '.kkkk..kkkk.'],
    shop: ['...kkkk...', '..k....k..', '.kkkkkkkk.', '.kppppppk.', '.kpwppppk.', '.kppppppk.', '.kppppppk.', '.kkkkkkkk.'],
  };
  const iconURL = {};
  function icon(name) {
    if (!iconURL[name]) iconURL[name] = U.sprite(ICONS[name] || ICONS.star, IP).toDataURL();
    return iconURL[name];
  }
  function paintIcons(root = document) {
    root.querySelectorAll('[data-ico]').forEach(el => {
      const n = el.getAttribute('data-ico');
      if (el.dataset.done === n) return;
      const rows = ICONS[n] || ICONS.star;
      el.style.backgroundImage = 'url(' + icon(n) + ')';
      el.style.setProperty('--iw', rows[0].length);
      el.style.setProperty('--ih', rows.length);
      el.dataset.done = n;
    });
  }

  /* ---------------- Boîte de dialogue (texte tapé) ---------------- */
  function Dialog(textEl, portrait) {
    const px = portrait.getContext('2d');
    let full = '', shown = 0, last = 0, blip = null, sp = 'cat', fur = 0, acc = '', nextBlink = 0, blinkUntil = 0;
    return {
      say(txt, onBlip) { full = txt.replace(/ ([!?:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0'); shown = 0; last = performance.now(); blip = onBlip || null; textEl.textContent = ''; },
      setPet(s, f, a) { sp = s; fur = f; acc = a || ''; },
      get typing() { return shown < full.length; },
      draw(now) {
        if (shown < full.length && now - last > 26) {
          const n = Math.min(full.length, shown + Math.max(1, Math.floor((now - last) / 26)));
          for (let i = shown; i < n; i++) if (blip && i % 3 === 0 && full[i] !== ' ') blip();
          shown = n; last = now;
          textEl.textContent = full.slice(0, shown);
        }
        if (now > nextBlink) { blinkUntil = now + 130; nextBlink = now + 2200 + Math.random() * 2600; }
        const talking = shown < full.length;
        const f = { hy: Math.floor(now / 700) % 2, tail: [0, 1, 0, -1][Math.floor(now / 260) % 4], eyes: now < blinkUntil ? 'blink' : 'open', mouth: talking && Math.floor(now / 110) % 2 ? 'open' : 'w' };
        px.clearRect(0, 0, portrait.width, portrait.height);
        px.drawImage(Pets.get(sp, fur, f, acc), 0, 0);
      },
    };
  }

  return { Clock, Dialog, icon, paintIcons, TH };
})();
