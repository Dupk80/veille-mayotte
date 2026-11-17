"use strict";
/* =====================================================================
   Soins du compagnon : ventre, joie, propreté, amitié (niveaux),
   étoiles gagnées aux mini-jeux, nourriture et accessoires.
   Les besoins baissent doucement avec le temps, même appli fermée,
   mais le compagnon ne tombe jamais malade : il devient juste grognon.
   ===================================================================== */
const Care = (() => {
  /* ---------------- Nourriture (pixel-art 12 px) ---------------- */
  const FP = {
    n: '#b8743a', N: '#7a4a24', b: '#4aa3ff', B: '#2a6fd0', r: '#c8323c', R: '#ff5a5f', w: '#ffffff', g: '#3f9a52', G: '#6cc85a',
    o: '#e8701e', O: '#ff9a3c', k: '#2a1d3d', W: '#fff8ec', s: '#d8cbb8', L: '#9ad66a', l: '#6cb24a', D: '#3f7a32',
    d: '#3a3046', e: '#f4efe6', p: '#b04aa8', P: '#e070d0', y: '#e8b04a', Y: '#ffd88a', c: '#c98a4a', C: '#e8b070',
    m: '#ff8fb8', M: '#ffc0d8', u: '#9aa0b8', U: '#c8ccdc', h: '#6a4a8a',
  };
  const FOOD_MAPS = {
    kibble: ['....nNnNn...', '...NnNnNnN..', '..nNnNnNnNn.', '.bbbbbbbbbb.', '.bBBBBBBBBb.', '..bBBBBBBb..', '...bbbbbb...'],
    apple: ['.....g......', '....gg.GG...', '..rr.g.rr...', '.rRRrrRRRr..', '.rRwRRRRRr..', '.rRRRRRRRr..', '.rRRRRRRRr..', '..rRRRRRr...', '...rr.rr....'],
    fish: ['..bb......b.', '.bBBb....bb.', 'bBwkBb..bBb.', 'bBBBBBbbBBb.', '.bBBBBBBBb..', '..bbBBb.bBb.', '....bb...bb.'],
    bone: ['.ss......ss.', 'sWWs....sWWs', 'sWWWssssWWWs', '.sWWWWWWWWs.', 'sWWWssssWWWs', 'sWWs....sWWs', '.ss......ss.'],
    carrot: ['.......gg.g.', '......gGgg..', '.....ooGg...', '....oOOo....', '...oOOo.....', '..oOOo......', '.oOo........', '.o..........'],
    bamboo: ['....Ll..gg..', '....Ll.gGg..', '....LlgG....', '....DD......', '....Ll......', '....Ll..gG..', '....DD.gGg..', '....Ll.g....', '....Ll......', '....DD......'],
    seeds: ['...d...d....', '..ded.ded...', '..ded.ded...', '..ded.ded...', '...d...d....', '.....d......', '....ded.....', '....ded.....', '....ded.....', '.....d......'],
    berries: ['......gg....', '.....g......', '..pp.g.pp...', '.pPPp.pPPp..', '.pPwp.pPwp..', '..pp...pp...', '....pp......', '...pPPp.....', '...pPwp.....', '....pp......'],
    cake: ['.....rR.....', '.....rw.....', '...WWWWWW...', '..WMMMMMMW..', '..mmmmmmmm..', '..yYYYYYYy..', '..mmmmmmmm..', '..yYYYYYYy..', '..yyyyyyyy..'],
    icecream: ['....MMMM....', '...MmwMMm...', '...MMMMMM...', '..cCcCcCcC..', '...cCcCcC...', '....cCcC....', '....cCcC....', '.....cC.....', '.....c......'],
    star: ['.....y.....', '....yYy....', '....yYy....', 'yyyyYYYyyyy', '.yYYYYYYYy.', '..yYYYYYy..', '..yYYyYYy..', '.yYy...yYy.', '.yy.....yy.'],
    rock: ['...uuuu....', '..uUUUuu...', '.uUUUUUuu..', 'uUUwUUUUuu.', 'uUUUUUUUUuu', 'uuuuuuuuuuu'],
    sock: ['..hhhh..', '..hwwh..', '..hhhh..', '..hwwh..', '..hhhhh.', '..hhhhhh', '.hhhhhhh', '..hhhhh.'],
  };
  const FOODS = {
    kibble: { name: 'Croquettes', art: 'des croquettes', price: 0, food: 22, joy: 1 },
    apple: { name: 'Pomme', art: 'une pomme', price: 0, food: 12, joy: 3 },
    fish: { name: 'Poisson', art: 'du poisson', price: 2, food: 30, joy: 6 },
    bone: { name: 'Os à mâcher', art: 'un os à mâcher', price: 2, food: 28, joy: 6 },
    carrot: { name: 'Carotte', art: 'une carotte', price: 2, food: 26, joy: 6 },
    bamboo: { name: 'Bambou', art: 'du bambou', price: 2, food: 30, joy: 6 },
    seeds: { name: 'Graines', art: 'des graines', price: 2, food: 24, joy: 6 },
    berries: { name: 'Baies', art: 'des baies', price: 2, food: 24, joy: 6 },
    icecream: { name: 'Glace', art: 'une glace', price: 3, food: 10, joy: 15 },
    cake: { name: 'Gâteau', art: 'du gâteau', price: 5, food: 20, joy: 22 },
  };
  const FAV = { cat: 'fish', dog: 'bone', bunny: 'carrot', fox: 'berries', panda: 'bamboo', hamster: 'seeds' };
  const ACCS = [
    { id: 'bow', name: 'Nœud', price: 8 },
    { id: 'flower', name: 'Fleur', price: 8 },
    { id: 'glasses', name: 'Lunettes', price: 12 },
    { id: 'cap', name: 'Casquette', price: 12 },
    { id: 'party', name: 'Chapeau de fête', price: 15, level: 3 },
    { id: 'crown', name: 'Couronne', price: 30, level: 5 },
  ];
  const iconCache = {};
  function icon(id) {
    if (!iconCache[id]) iconCache[id] = U.outlined(U.sprite(FOOD_MAPS[id] || FOOD_MAPS.star, FP), '#2a1d3d');
    return iconCache[id];
  }
  function foodColor(id) {
    return { kibble: '#b8743a', apple: '#ff5a5f', fish: '#4aa3ff', bone: '#fff8ec', carrot: '#ff9a3c', bamboo: '#9ad66a', seeds: '#3a3046', berries: '#e070d0', cake: '#ffc0d8', icecream: '#ff8fb8' }[id] || '#ffffff';
  }

  /* ---------------- État ---------------- */
  let C = null;
  const H = 3600000;
  function defaults() {
    return { food: 75, joy: 75, clean: 85, t: Date.now(), xp: 0, stars: 15, owned: [], wear: '', best: { catch: 0, jump: 0, memory: 0 }, pets: 0, petDay: '' };
  }
  function init(S) {
    if (!S.care || typeof S.care !== 'object') S.care = defaults();
    C = Object.assign(defaults(), S.care);
    C.best = Object.assign({ catch: 0, jump: 0, memory: 0 }, C.best || {});
    if (!Array.isArray(C.owned)) C.owned = [];
    S.care = C;
    update(Date.now());
    return C;
  }
  const clamp = v => Math.max(0, Math.min(100, v));
  // Les besoins baissent avec le temps (deux fois moins vite la nuit, quand il dort)
  function update(now) {
    let dt = (now - C.t) / H;
    if (!(dt > 0)) { C.t = now; return; }
    dt = Math.min(dt, 72);
    const night = h => h >= 22 || h < 6;
    let slow = 0, steps = Math.ceil(dt * 4);
    for (let i = 0; i < steps; i++) if (night(new Date(C.t + ((i + 0.5) / steps) * dt * H).getHours())) slow++;
    const eff = dt * (1 - 0.5 * (slow / Math.max(1, steps)));
    C.food = clamp(C.food - eff * 8);
    C.joy = clamp(C.joy - eff * 5);
    C.clean = clamp(C.clean - eff * 3.5);
    C.t = now;
  }
  const need = n => 25 * n * (n - 1);
  function level() { let n = 1; while (C.xp >= need(n + 1)) n++; return n; }
  function levelProgress() { const n = level(), a = need(n), b = need(n + 1); return (C.xp - a) / (b - a); }
  function addXp(v) { const before = level(); C.xp += v; return level() > before; }

  /* ---------------- Actions ---------------- */
  function menu(sp) {
    return ['kibble', 'apple', FAV[sp] || 'fish', 'icecream', 'cake'];
  }
  // Renvoie {ok, reason, fav, levelUp}
  function feed(id, sp) {
    const f = FOODS[id];
    if (!f) return { ok: false };
    if (C.food >= 95) return { ok: false, reason: 'full' };
    if (C.stars < f.price) return { ok: false, reason: 'stars', missing: f.price - C.stars };
    const fav = FAV[sp] === id;
    C.stars -= f.price;
    C.food = clamp(C.food + f.food);
    C.joy = clamp(C.joy + f.joy + (fav ? 8 : 0));
    const levelUp = addXp(fav ? 6 : 4);
    return { ok: true, fav, levelUp };
  }
  function bathDone() { C.clean = 100; C.joy = clamp(C.joy + 4); return { levelUp: addXp(6) }; }
  function fetchDone() { C.joy = clamp(C.joy + 6); C.food = clamp(C.food - 2); return { levelUp: addXp(3) }; }
  function caress() {
    const today = new Date().toDateString();
    if (C.petDay !== today) { C.petDay = today; C.pets = 0; }
    C.joy = clamp(C.joy + 2);
    let levelUp = false;
    if (C.pets < 30) { C.pets++; levelUp = addXp(1); }
    return { levelUp };
  }
  function reward(game, score) {
    const best = C.best[game] || 0, isBest = score > best && score > 0;
    if (isBest) C.best[game] = score;
    let stars = game === 'catch' ? Math.floor(score / 4) : game === 'jump' ? Math.floor(score / 20) : Math.max(1, Math.round(score / 12));
    stars = Math.min(40, stars) + (isBest ? 2 : 0);
    C.stars += stars;
    C.joy = clamp(C.joy + 15);
    C.food = clamp(C.food - 6);
    C.clean = clamp(C.clean - 4);
    const levelUp = addXp(6 + Math.min(20, stars));
    return { stars, isBest, best: Math.max(best, score), levelUp };
  }
  function buy(id) {
    const a = ACCS.find(x => x.id === id);
    if (!a) return { ok: false };
    if (C.owned.includes(id)) { C.wear = C.wear === id ? '' : id; return { ok: true, worn: C.wear === id }; }
    if (a.level && level() < a.level) return { ok: false, reason: 'level', level: a.level };
    if (C.stars < a.price) return { ok: false, reason: 'stars', missing: a.price - C.stars };
    C.stars -= a.price;
    C.owned.push(id);
    C.wear = id;
    return { ok: true, bought: true, worn: true };
  }
  function dirt() { return C.clean < 20 ? 2 : C.clean < 40 ? 1 : 0; }
  function mood() {
    if (C.food < 30) return 'hungry';
    if (C.clean < 25) return 'dirty';
    if (C.joy < 30) return 'bored';
    return 'ok';
  }

  return {
    init, update, level, levelProgress, menu, feed, bathDone, fetchDone, caress, reward, buy, dirt, mood, icon, foodColor,
    FOODS, FAV, ACCS, get state() { return C; },
  };
})();
