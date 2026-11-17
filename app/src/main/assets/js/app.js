"use strict";
/* =====================================================================
   Application : réglages, calcul du temps, branchement décor + HUD,
   sons 8-bit et pont avec Android (notifications).
   ===================================================================== */
const $ = s => document.querySelector(s);
const bridge = window.Android || null;

/* ================= Réglages ================= */
const DEFAULTS = {
  pet: 'cat', petName: 'Minou', fur: 0, start: '08:00', end: '17:00',
  days: [false, true, true, true, true, true, false],
  perDay: false, week: null,
  breaks: [{ label: 'Pause café', start: '10:00', dur: 15 }, { label: 'Déjeuner', start: '12:00', dur: 60 }, { label: 'Pause', start: '15:30', dur: 15 }],
  notif: { style: 'pet', start: true, breakStart: true, breakEnd: true, beforeEnd: true, beforeMin: 15, end: true, periodic: 60 },
  showSeconds: true, vibrate: true, sound: true, ambiance: 'auto', theme: 'lagon',
};
function load() {
  let raw = '';
  try { raw = bridge ? bridge.getSettings() : (localStorage.getItem('maison') || ''); } catch (e) { /* stockage indisponible */ }
  let s = {};
  try { s = raw ? JSON.parse(raw) : {}; } catch (e) { s = {}; }
  const out = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), s);
  out.notif = Object.assign({}, DEFAULTS.notif, s.notif || {});
  if (!Array.isArray(out.days) || out.days.length !== 7) out.days = DEFAULTS.days.slice();
  if (!Array.isArray(out.breaks)) out.breaks = [];
  if (!Array.isArray(out.week) || out.week.length !== 7) out.week = [0, 1, 2, 3, 4, 5, 6].map(() => ({ start: out.start, end: out.end }));
  if (!Pets.INFO[out.pet]) out.pet = 'cat';
  if (out.theme !== 'lagon' && out.theme !== 'campagne') out.theme = 'lagon';
  out.perDay = !!out.perDay;
  return { s: out, fresh: !raw };
}
let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const j = JSON.stringify(S);
    try { if (bridge) bridge.saveSettings(j); else localStorage.setItem('maison', j); } catch (e) { /* rien */ }
    refreshStatus();
  }, 250);
}
const LD = load();
let S = LD.s;
Care.init(S);
if (LD.fresh) save();

/* ================= Calcul du temps ================= */
const MIN = 60000, HOUR = 3600000;
const hm = s => { const [h, m] = (s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const at = (day, minutes) => { const x = new Date(day); x.setHours(0, minutes, 0, 0); return x.getTime(); };
const dayOff = (base, off) => { const d = new Date(base); d.setDate(d.getDate() + off); return d; };
function shiftFor(day) {
  if (!S.days[day.getDay()]) return null;
  const Hh = S.perDay ? S.week[day.getDay()] : S;
  const st = at(day, hm(Hh.start));
  let en = at(day, hm(Hh.end));
  if (en <= st) en += 24 * HOUR;
  const breaks = S.breaks.map(b => {
    let bs = at(day, hm(b.start));
    if (bs < st) bs += 24 * HOUR;
    return { label: b.label || 'Pause', bs, be: Math.min(en, bs + Math.max(1, +b.dur || 0) * MIN) };
  }).filter(b => b.bs >= st && b.bs < en).sort((a, b) => a.bs - b.bs);
  return { st, en, breaks };
}
function computeState(now) {
  const today = midnight(now);
  for (const o of [-1, 0]) { const sh = shiftFor(dayOff(today, o)); if (sh && now >= sh.st && now < sh.en) return { kind: 'work', sh }; }
  let ended = null;
  for (const o of [-1, 0]) { const sh = shiftFor(dayOff(today, o)); if (sh && sh.en <= now) ended = sh; }
  let next = null;
  for (let o = 0; o <= 8; o++) { const sh = shiftFor(dayOff(today, o)); if (sh && sh.st > now) { next = sh; break; } }
  if (ended && now - ended.en < 5 * HOUR) return { kind: 'done', sh: ended, next };
  if (next && midnight(next.st).getTime() === today.getTime()) return { kind: 'before', sh: next, next };
  return { kind: 'off', sh: next, next };
}
// progression "effective" : le temps de pause ne fait pas avancer le compagnon
function breakBefore(sh, t) { return sh.breaks.reduce((a, b) => a + Math.max(0, Math.min(t, b.be) - b.bs), 0); }
function effAt(sh, t) {
  const total = sh.en - sh.st - breakBefore(sh, sh.en);
  if (total <= 0) return 0;
  const tt = U.clamp(t, sh.st, sh.en);
  return U.clamp((tt - sh.st - breakBefore(sh, tt)) / total, 0, 1);
}
function hourMarks(sh) {
  const out = [], d = new Date(sh.st);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  while (d.getTime() < sh.en && out.length < 30) {
    const t = d.getTime();
    if (!sh.breaks.some(b => t >= b.bs && t < b.be)) out.push({ f: +effAt(sh, t).toFixed(4), label: String(d.getHours()) });
    d.setHours(d.getHours() + 1);
  }
  return out;
}

/* ================= Formatage ================= */
const pad = n => String(n).padStart(2, '0');
const hhmm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function dur(ms) {
  const m = Math.max(0, Math.round(ms / MIN)), h = Math.floor(m / 60), r = m % 60;
  if (h >= 24) { const j = Math.floor(h / 24); return j + ' j ' + (h % 24) + ' h'; }
  return h ? (r ? h + ' h ' + pad(r) : h + ' h') : r + ' min';
}
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function whenLabel(t) {
  const diff = Math.round((midnight(t).getTime() - midnight(Date.now()).getTime()) / 86400000);
  const day = diff === 0 ? "aujourd'hui" : diff === 1 ? 'demain' : JOURS[new Date(t).getDay()];
  return day + ' à ' + hhmm(t);
}
function clockText(ms) {
  const t = Math.max(0, ms), h = Math.floor(t / HOUR), m = Math.floor((t % HOUR) / MIN), s = Math.floor((t % MIN) / 1000);
  return pad(h) + ':' + pad(m) + (S.showSeconds ? ':' + pad(s) : '');
}

/* ================= Sons 8-bit (générés, aucun fichier) ================= */
const SFX = (() => {
  let ac = null, master = null;
  function ctx() {
    if (!S.sound) return null;
    try {
      if (!ac) {
        const A = window.AudioContext || window.webkitAudioContext;
        if (!A) return null;
        ac = new A(); master = ac.createGain(); master.gain.value = 0.16; master.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { return null; }
    return ac;
  }
  function tone(f, d, type = 'square', vol = 0.4, slide = 0, delay = 0) {
    const a = ctx();
    if (!a) return;
    const t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t0 + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + d + 0.03);
  }
  return {
    unlock() { ctx(); },
    blip() { tone(620 + Math.random() * 160, 0.03, 'square', 0.1); },
    boing() { tone(280, 0.18, 'square', 0.3, 420); tone(560, 0.12, 'triangle', 0.22, 260, 0.06); },
    step() { tone(200, 0.07, 'triangle', 0.35, -80); },
    twinkle() { [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.1, 'triangle', 0.16, 0, i * 0.05)); },
    pop() { tone(110 + Math.random() * 40, 0.22, 'square', 0.18, -60); tone(1800, 0.05, 'triangle', 0.06, -900, 0.02); },
    click() { tone(480, 0.03, 'square', 0.15); },
    hurt() { tone(160, 0.18, 'sawtooth', 0.22, -90); },
    jump() { tone(420, 0.1, 'square', 0.16, 380); },
    over() { [[523, 0], [440, 0.12], [349, 0.24]].forEach(([f, t]) => tone(f, 0.16, 'triangle', 0.25, 0, t)); },
    fanfare() { [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.36], [784, 0.52], [1046, 0.64]].forEach(([f, t]) => tone(f, t >= 0.6 ? 0.45 : 0.14, 'square', 0.22, 0, t)); },
  };
})();

/* ================= Messages du compagnon ================= */
const FLAVOR = {
  cat: ['Je ronronne pour toi…', 'Je garde le canapé bien au chaud.', 'Je vais dormir sur ton clavier !'],
  dog: ['Je remue la queue rien que d\'y penser !', 'J\'ai déjà rapporté tes chaussons !', 'Je t\'attends derrière la porte !'],
  bunny: ['Je grignote une carotte en t\'attendant.', 'Mes oreilles frétillent d\'impatience !', 'Petits bonds de joie !'],
  fox: ['Rusé comme un renard, tu vas finir à l\'heure.', 'Ma queue touffue est prête pour un câlin !', 'Je guette ton retour.'],
  panda: ['Je mâchouille du bambou en attendant.', 'Une petite roulade pour t\'encourager !', 'Câlin de panda en approche…'],
  hamster: ['Je cours dans ma roue pour faire passer le temps !', 'J\'ai rempli mes joues de graines pour toi.', 'La roue tourne, le temps aussi !'],
};
let lastInfo = null;
function petLines(st) {
  const P = Pets.INFO[S.pet], cri = P.cry, now = Date.now(), I = lastInfo || {};
  const fl = FLAVOR[S.pet] || [];
  switch (st) {
    case 'work': return [
      `${cri} ! Plus que ${dur(I.rem)} avant la maison !`,
      `On a déjà fait ${I.pct} % du trajet. Continue comme ça !`,
      I.nextB ? `Prochaine pause à ${hhmm(I.nextB.bs)}. Tiens bon !` : 'Plus de pause aujourd\'hui, mais on approche !',
      'Je compte les minutes avec toi.', 'Pense à boire un peu d\'eau !', `${cri}… J'ai hâte qu'on rentre !`, ...fl];
    case 'break': return [
      `C'est la pause ! Reprise à ${I.inB ? hhmm(I.inB.be) : '…'}.`, 'Étire-toi un peu, ça fait du bien !',
      `${cri} ! Pas de travail pendant la pause, promis ?`, 'Un petit verre, les pattes dans le sable…', ...fl];
    case 'almost': return [
      `${cri} ${cri} ! Plus que ${dur(I.rem)} !`, 'Prépare ton sac, on rentre bientôt !', 'J\'aperçois déjà la maison au bout du chemin !'];
    case 'done': return [
      `${cri} !!! On est rentrés ! Bravo pour ta journée !`, 'Touche le ciel pour lancer des feux d\'artifice !',
      'Repose-toi bien, tu l\'as bien mérité.', ...fl];
    case 'night': return [
      'Zzz… Bonne nuit !', I.next ? `Demain, on reprend la route à ${hhmm(I.next.st)}.` : 'Je garde la maison, dors bien.',
      'Regarde les étoiles avec moi !', 'Touche le ciel, il y a des étoiles filantes…'];
    case 'before': return [
      `Zzz… ta journée commence à ${I.next ? hhmm(I.next.st) : '…'}.`, 'Encore un peu de dodo avant le travail…', 'Touche-moi pour me réveiller !'];
    default: return [
      'Zzz… c\'est repos aujourd\'hui !', I.next ? `Prochain trajet ${whenLabel(I.next.st)}. Profite !` : 'Règle tes horaires dans les réglages !',
      'Pas de boulot, que des câlins !', ...fl];
  }
}
const NEED_LINES = {
  hungry: ['Mon ventre gargouille… On mange ?', 'J\'ai un petit creux ! Tu as des croquettes ?', 'Je rêve d\'un bon repas…'],
  dirty: ['Je suis tout crotté… Un petit bain ?', 'Un bain avec plein de mousse, ça te dit ?', 'Hum… je ne sens pas très bon.'],
  bored: ['Je m\'ennuie… On fait un mini-jeu ?', 'Tu me lances la balle ?', 'On joue ensemble ?'],
};
let curMood = '', lastSay = 0;
function say(force, withSound) {
  const need = Care.mood();
  let pool = petLines(curMood);
  if (need !== 'ok' && !force && Math.random() < 0.55) pool = NEED_LINES[need];
  const txt = pool[Math.floor(Math.random() * pool.length)];
  dialog.say(txt, withSound && S.sound ? () => SFX.blip() : null);
  lastSay = Date.now();
}

/* ================= Interface ================= */
const clock = HUD.Clock($('#clock'));
const dialog = HUD.Dialog($('#dlgText'), $('#portrait'));
let insetTop = 0, px = 3;

function layoutScene() {
  const cssW = document.documentElement.clientWidth || window.innerWidth;
  const cssH = Math.round(Math.min(window.innerHeight * 0.5, cssW * 1.2)) + insetTop;
  const r = Scene.resize(cssW, cssH);
  px = r.px;
  document.documentElement.style.setProperty('--px', px + 'px');
  $('#sceneWrap').style.height = cssH + 'px';
  clock.setScale(px, cssW < 340 ? 1.6 : 2);
}
window.setInsets = (top, bottom) => {
  const t = Math.max(0, Math.round(top || 0)), b = Math.max(0, Math.round(bottom || 0));
  document.documentElement.style.setProperty('--safe-bottom', b + 'px');
  if (t === insetTop) return;
  insetTop = t;
  document.documentElement.style.setProperty('--safe-top', insetTop + 'px');
  layoutScene();
};
// Sans affichage bord à bord, la barre d'état prend la couleur du ciel
function syncBars() {
  if (!bridge || insetTop > 0) return;
  try { bridge.setBarColor(sheetOpen ? '#15172b' : Scene.skyTop, true); } catch (e) { /* rien */ }
}
setInterval(syncBars, 5000);

function applyLook() {
  Scene.setTheme(S.theme);
  Scene.setPet(S.pet, S.fur);
  Scene.setHour(S.ambiance === 'day' ? 12.5 : S.ambiance === 'night' ? 22.5 : null);
  dialog.setPet(S.pet, S.fur, Care.state.wear);
  Scene.setCare({ acc: Care.state.wear, dirt: Care.dirt(), mood: Care.mood() });
  $('#dlgName').textContent = S.petName || Pets.INFO[S.pet].name;
}
let iconT = null;
function exportPetIcon() {
  if (!bridge || !bridge.setPetIcon) return;
  clearTimeout(iconT);
  iconT = setTimeout(() => { try { bridge.setPetIcon(Pets.portraitPNG(S.pet, S.fur, 1, Care.state.wear).split(',')[1]); } catch (e) { /* rien */ } }, 400);
}

function setChip(ico, text) {
  const i = $('#chipIco');
  if (i.getAttribute('data-ico') !== ico) { i.setAttribute('data-ico', ico); HUD.paintIcons($('#chip')); }
  $('#chipText').textContent = text;
}
let lastKind = null, lastHour = null;
function tick() {
  const now = Date.now(), cs = computeState(now), sh = cs.sh;
  const P = Pets.INFO[S.pet], nm = S.petName || P.name;
  const h = new Date(now).getHours();
  $('#hello').textContent = (h >= 18 || h < 5 ? 'Bonsoir' : h >= 12 ? 'Bon après-midi' : 'Bonjour') + ' !';
  const ds = new Date(now).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#date').textContent = ds.charAt(0).toUpperCase() + ds.slice(1);
  const info = { next: cs.next || null };
  let mood = cs.kind, clockTheme = 'rest', pct = 0;
  const bar = $('#bar');
  if (cs.kind !== 'work') lastHour = null;
  if (cs.kind === 'work') {
    const rem = sh.en - now, len = sh.en - sh.st;
    const inB = sh.breaks.find(b => now >= b.bs && now < b.be), nextB = sh.breaks.find(b => b.bs > now);
    const bLeft = sh.breaks.reduce((a, b) => a + Math.max(0, Math.min(b.be, sh.en) - Math.max(b.bs, now)), 0);
    const almost = rem <= Math.max(5, +S.notif.beforeMin || 15) * MIN;
    pct = Math.floor(((now - sh.st) / len) * 100);
    Object.assign(info, { rem, inB, nextB, pct });
    mood = inB ? 'break' : almost ? 'almost' : 'work';
    clockTheme = mood;
    clock.set(clockText(rem), clockTheme);
    $('#sub').textContent = 'avant de rentrer à la maison';
    if (inB) setChip('cup', `${inB.label} · reprise à ${hhmm(inB.be)}`);
    else if (almost) setChip('star', 'Presque fini ! Prépare ton sac');
    else setChip('bag', 'Au travail');
    $('#vEnd').textContent = hhmm(sh.en); $('#sEnd').textContent = 'dans ' + dur(rem);
    if (inB) { $('#kBreak').textContent = 'En pause'; $('#vBreak').textContent = hhmm(inB.be); $('#sBreak').textContent = 'fin dans ' + dur(inB.be - now); }
    else if (nextB) { $('#kBreak').textContent = 'Prochaine pause'; $('#vBreak').textContent = hhmm(nextB.bs); $('#sBreak').textContent = nextB.label + ' dans ' + dur(nextB.bs - now); }
    else { $('#kBreak').textContent = 'Pauses'; $('#vBreak').textContent = 'Fini'; $('#sBreak').textContent = 'plus de pause aujourd\'hui'; }
    $('#vEff').textContent = dur(rem - bLeft);
    $('#vPct').textContent = pct + ' %'; $('#sPct').textContent = dur(now - sh.st) + ' passées';
    const hourNowW = new Date(now).getHours();
    if (lastHour !== null && hourNowW !== lastHour && !inB && rem > MIN) {
      Scene.cheer();
      dialog.say(`Ding ! Encore une heure de faite. Plus que ${dur(rem)} !`, S.sound ? () => SFX.blip() : null);
      lastSay = Date.now();
    }
    lastHour = hourNowW;
    Scene.setState({ kind: 'work', eff: effAt(sh, now), breaks: sh.breaks.map(b => ({ f: +effAt(sh, b.bs).toFixed(4), long: b.be - b.bs >= 30 * MIN })), inBreak: inB ? sh.breaks.indexOf(inB) : -1, almost, endedAgo: 9e9, hours: hourMarks(sh) });
  } else if (cs.kind === 'done') {
    pct = 100; clockTheme = 'done';
    clock.set(S.showSeconds ? '00:00:00' : '00:00', 'done');
    $('#sub').textContent = cs.next ? 'Prochaine journée : ' + whenLabel(cs.next.st) : 'Bonne soirée !';
    setChip('house', 'Journée terminée depuis ' + dur(now - sh.en));
    $('#vEnd').textContent = hhmm(sh.en); $('#sEnd').textContent = 'c\'est fait !';
    $('#kBreak').textContent = 'Pauses'; $('#vBreak').textContent = String(sh.breaks.length); $('#sBreak').textContent = 'pause(s) aujourd\'hui';
    $('#vEff').textContent = '0 min'; $('#vPct').textContent = '100 %'; $('#sPct').textContent = 'bravo !';
    Scene.setState({ kind: 'done', eff: 1, breaks: sh.breaks.map(b => ({ f: +effAt(sh, b.bs).toFixed(4), long: b.be - b.bs >= 30 * MIN })), inBreak: -1, almost: false, endedAgo: (now - sh.en) / 1000, hours: hourMarks(sh) });
    if (lastKind === 'work') confetti();
  } else {
    if (sh) {
      clock.set(clockText(sh.st - now), 'rest');
      $('#sub').textContent = cs.kind === 'before' ? 'avant le début de ta journée' : 'avant ta prochaine journée (' + whenLabel(sh.st) + ')';
      $('#vEnd').textContent = hhmm(sh.en); $('#sEnd').textContent = cs.kind === 'before' ? 'aujourd\'hui' : whenLabel(sh.en).split(' à ')[0];
      const nb = sh.breaks[0];
      $('#kBreak').textContent = 'Première pause'; $('#vBreak').textContent = nb ? hhmm(nb.bs) : '—'; $('#sBreak').textContent = nb ? nb.label : 'aucune pause';
      $('#vEff').textContent = dur(sh.en - sh.st - breakBefore(sh, sh.en)); $('#vPct').textContent = '0 %'; $('#sPct').textContent = 'pas encore commencé';
      Scene.setState({ kind: cs.kind, eff: 0, breaks: sh.breaks.map(b => ({ f: +effAt(sh, b.bs).toFixed(4), long: b.be - b.bs >= 30 * MIN })), inBreak: -1, almost: false, endedAgo: 9e9, hours: hourMarks(sh) });
    } else {
      clock.set('--:--', 'rest');
      $('#sub').textContent = 'Aucun jour travaillé n\'est réglé';
      ['#vEnd', '#vBreak', '#vEff', '#vPct'].forEach(k => { $(k).textContent = '—'; });
      $('#sEnd').textContent = ''; $('#sBreak').textContent = ''; $('#sPct').textContent = '';
      Scene.setState({ kind: 'off', eff: 0, breaks: [], inBreak: -1, almost: false, endedAgo: 9e9, hours: [] });
    }
    const restDay = !S.days[new Date(now).getDay()];
    if (cs.kind === 'before') setChip('moon', 'Ta journée n\'a pas commencé');
    else if (restDay) { setChip('star', 'Jour de repos'); mood = 'rest'; }
    else { setChip('moon', h >= 21 || h < 5 ? 'Bonne nuit !' : 'Bonne soirée !'); mood = 'night'; }
  }
  // barre du trajet
  const segs = bar.querySelectorAll('.seg');
  segs.forEach(e => e.remove());
  bar.className = 'pxbar' + (mood === 'break' ? ' break' : cs.kind === 'done' ? ' done' : '');
  $('#barFill').style.width = pct + '%';
  $('#barPct').textContent = pct + ' %';
  if (sh) {
    const len = sh.en - sh.st;
    for (const b of sh.breaks) {
      const e = document.createElement('div');
      e.className = 'seg';
      e.style.left = ((b.bs - sh.st) / len) * 100 + '%';
      e.style.width = ((b.be - b.bs) / len) * 100 + '%';
      bar.insertBefore(e, bar.querySelector('.shine'));
    }
    $('#tStart').textContent = hhmm(sh.st); $('#tEnd').textContent = hhmm(sh.en);
  } else { $('#tStart').textContent = '--:--'; $('#tEnd').textContent = '--:--'; }
  lastInfo = info;
  Care.update(now);
  renderCare();
  if (now - lastCareSave > 60000) { lastCareSave = now; save(); }
  if (mood !== curMood) { curMood = mood; say(); }
  else if (Date.now() - lastSay > 22000) say();
  lastKind = cs.kind;
}

/* ================= Effets ================= */
function confetti() {
  const box = $('#confetti'), cols = ['#ffd34e', '#ff7aa8', '#5ff0d8', '#b98cff', '#ffffff', '#7cf27c'];
  for (let i = 0; i < 70; i++) {
    const e = document.createElement('div');
    e.className = 'cf';
    e.style.left = Math.random() * 100 + 'vw';
    e.style.background = cols[i % cols.length];
    e.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    e.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
    e.style.animationDuration = 2.2 + Math.random() * 1.8 + 's';
    e.style.animationDelay = Math.random() * 0.6 + 's';
    e.style.animationTimingFunction = 'steps(' + (18 + Math.floor(Math.random() * 10)) + ')';
    box.appendChild(e);
    setTimeout(() => e.remove(), 5000);
  }
}
Scene.on('tapPet', () => {
  SFX.boing();
  const r = Care.caress();
  renderCare();
  if (r.levelUp) { levelUp(); return; }
  if (S.vibrate && bridge) { try { bridge.vibrate(25); } catch (e) { /* rien */ } }
  say(true, true);
});
Scene.on('sfx', name => { if (SFX[name]) SFX[name](); });
$('#sceneWrap').addEventListener('pointerdown', () => SFX.unlock(), { passive: true });
$('.dialog').addEventListener('click', () => { SFX.click(); say(true, true); });

/* ================= Écran réglages ================= */
let sheetOpen = false;
function openSheet() { buildSettings(); $('#sheet').classList.add('open'); sheetOpen = true; refreshStatus(); SFX.click(); Scene.stop(); syncBars(); }
function closeSheet() { $('#sheet').classList.remove('open'); sheetOpen = false; applyLook(); if (pendingLayout) { pendingLayout = false; layoutScene(); } tick(); Scene.start(); SFX.click(); syncBars(); }
$('#btnSettings').onclick = openSheet;
$('#btnDone').onclick = closeSheet;
window.onBack = () => {
  if ($('#modal').classList.contains('open')) { closeModal(); return true; }
  if (gamesOpen) { if (Games.state !== 'idle' && $('#gPlay').style.display !== 'none') { showGameMenu(); } else closeGames(); return true; }
  if (sheetOpen) { closeSheet(); return true; }
  return false;
};
window.onResumeApp = () => { tick(); refreshStatus(); };

const petCanvases = [];
function buildSettings() {
  const g = $('#petsGrid');
  g.innerHTML = ''; petCanvases.length = 0;
  Pets.names.forEach(k => {
    const b = document.createElement('button');
    b.className = 'petopt pxbox' + (S.pet === k ? ' sel' : '');
    const c = document.createElement('canvas'); c.width = Pets.W; c.height = Pets.H;
    b.appendChild(c); b.appendChild(document.createTextNode(Pets.INFO[k].name));
    petCanvases.push({ c, k });
    b.onclick = () => {
      if (S.pet !== k) {
        const wasDefault = !S.petName || Object.values(Pets.INFO).some(p => p.name === S.petName) || S.petName === 'Minou';
        S.pet = k; S.fur = 0;
        if (wasDefault) S.petName = { cat: 'Minou', dog: 'Filou', bunny: 'Pompon', fox: 'Roussette', panda: 'Bambou', hamster: 'Noisette' }[k];
        save(); buildSettings(); applyLook(); exportPetIcon();
      }
      SFX.boing();
    };
    g.appendChild(b);
  });
  const sw = $('#swatches');
  sw.innerHTML = '';
  Pets.INFO[S.pet].furs.forEach((f, i) => {
    const b = document.createElement('button');
    b.className = 'sw pxbox' + (S.fur === i ? ' sel' : '');
    b.style.background = f.fur;
    b.setAttribute('aria-label', 'Pelage ' + (i + 1));
    b.onclick = () => { S.fur = i; save(); buildSettings(); applyLook(); exportPetIcon(); SFX.click(); };
    sw.appendChild(b);
  });
  $('#petName').value = S.petName;
  document.querySelectorAll('#themes button').forEach(b => b.classList.toggle('sel', b.dataset.v === S.theme));
  $('#ambiance').value = S.ambiance;
  $('#start').value = S.start; $('#end').value = S.end;
  const dd = $('#days');
  dd.innerHTML = '';
  [[1, 'L'], [2, 'M'], [3, 'M'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']].forEach(([i, l]) => {
    const b = document.createElement('button');
    b.className = 'day pxbox' + (S.days[i] ? ' on' : '');
    b.textContent = l;
    b.onclick = () => { S.days[i] = !S.days[i]; b.classList.toggle('on'); save(); tick(); SFX.click(); };
    dd.appendChild(b);
  });
  $('#perDay').checked = S.perDay;
  $('#sameHours').style.display = S.perDay ? 'none' : '';
  $('#week').style.display = S.perDay ? '' : 'none';
  const wk = $('#week');
  wk.innerHTML = '';
  [1, 2, 3, 4, 5, 6, 0].forEach(i => {
    const r = document.createElement('div');
    r.className = 'wrow' + (S.days[i] ? '' : ' offd');
    r.innerHTML = `<span class="wn">${JOURS[i][0].toUpperCase() + JOURS[i].slice(1, 3)}.</span><label class="tog"><input type="checkbox"><span></span></label><input class="pxin" type="time"><input class="pxin" type="time">`;
    const [, tg, ts, te] = r.children, cb = tg.querySelector('input');
    cb.checked = S.days[i]; ts.value = S.week[i].start; te.value = S.week[i].end;
    cb.onchange = () => { S.days[i] = cb.checked; r.classList.toggle('offd', !cb.checked); save(); tick(); };
    ts.onchange = () => { if (ts.value) { S.week[i].start = ts.value; save(); tick(); } };
    te.onchange = () => { if (te.value) { S.week[i].end = te.value; save(); tick(); } };
    wk.appendChild(r);
  });
  renderBreaks();
  document.querySelectorAll('#style button').forEach(b => b.classList.toggle('sel', b.dataset.v === S.notif.style));
  document.querySelectorAll('[data-n]').forEach(i => { i.checked = !!S.notif[i.dataset.n]; });
  $('#beforeMin').value = String(S.notif.beforeMin); $('#periodic').value = String(S.notif.periodic);
  $('#showSeconds').checked = S.showSeconds; $('#vibrate').checked = S.vibrate; $('#sound').checked = S.sound;
  HUD.paintIcons($('#sheet'));
}
function renderBreaks() {
  const box = $('#breaks');
  box.innerHTML = '';
  S.breaks.forEach((b, i) => {
    const r = document.createElement('div');
    r.className = 'brow';
    r.innerHTML = '<input class="pxin" type="text" placeholder="Pause"><input class="pxin" type="time"><input class="pxin" type="number" min="1" max="600" inputmode="numeric"><button class="del pxbox" aria-label="Supprimer">X</button>';
    const [lab, tm, du, del] = r.children;
    lab.value = b.label; tm.value = b.start; du.value = b.dur;
    lab.oninput = () => { b.label = lab.value; save(); };
    tm.onchange = () => { if (tm.value) { b.start = tm.value; save(); tick(); } };
    du.oninput = () => { const v = parseInt(du.value, 10); if (v > 0) { b.dur = v; save(); tick(); } };
    del.onclick = () => { S.breaks.splice(i, 1); save(); renderBreaks(); tick(); SFX.click(); };
    box.appendChild(r);
  });
}
$('#addBreak').onclick = () => { S.breaks.push({ label: 'Pause', start: '15:00', dur: 15 }); save(); renderBreaks(); tick(); SFX.click(); };
$('#petName').oninput = e => { S.petName = e.target.value.trim() || Pets.INFO[S.pet].name; save(); applyLook(); };
$('#start').onchange = e => { if (e.target.value) { S.start = e.target.value; save(); tick(); } };
$('#end').onchange = e => { if (e.target.value) { S.end = e.target.value; save(); tick(); } };
$('#perDay').onchange = e => {
  S.perDay = e.target.checked;
  if (S.perDay && !S.week.some(w => w.start !== S.week[0].start || w.end !== S.week[0].end)) S.week = S.week.map(() => ({ start: S.start, end: S.end }));
  save(); buildSettings(); tick();
};
document.querySelectorAll('#themes button').forEach(b => { b.onclick = () => { S.theme = b.dataset.v; save(); document.querySelectorAll('#themes button').forEach(x => x.classList.toggle('sel', x === b)); SFX.twinkle(); }; });
$('#ambiance').onchange = e => { S.ambiance = e.target.value; save(); };
document.querySelectorAll('#style button').forEach(b => {
  b.onclick = () => { S.notif.style = b.dataset.v; save(); document.querySelectorAll('#style button').forEach(x => x.classList.toggle('sel', x === b)); SFX.click(); };
});
document.querySelectorAll('[data-n]').forEach(i => { i.onchange = () => { S.notif[i.dataset.n] = i.checked; save(); }; });
$('#beforeMin').onchange = e => { S.notif.beforeMin = +e.target.value; save(); tick(); };
$('#periodic').onchange = e => { S.notif.periodic = +e.target.value; save(); };
$('#showSeconds').onchange = e => { S.showSeconds = e.target.checked; save(); tick(); };
$('#vibrate').onchange = e => { S.vibrate = e.target.checked; save(); };
$('#sound').onchange = e => { S.sound = e.target.checked; save(); if (S.sound) SFX.twinkle(); };
$('#btnTest').onclick = () => {
  exportPetIcon();
  if (bridge) { clearTimeout(saveT); bridge.saveSettings(JSON.stringify(S)); setTimeout(() => bridge.testNotification(), 450); }
  else if ('Notification' in window) Notification.requestPermission();
  SFX.twinkle();
  setTimeout(refreshStatus, 900);
};
function refreshStatus() {
  const el = $('#status');
  if (!el) return;
  if (!bridge) { el.textContent = 'Aperçu navigateur : les notifications programmées fonctionnent dans l\'application Android.'; return; }
  let s = {};
  try { s = JSON.parse(bridge.status()); } catch (e) { /* rien */ }
  let h = s.notif ? 'Notifications autorisées.<br>' : '<span class="warn">Notifications bloquées</span> : <a href="#" id="lnN">autoriser</a><br>';
  if (s.exact === false) h += '<span class="warn">Alarmes exactes désactivées</span> : <a href="#" id="lnE">activer</a><br>';
  h += s.next ? 'Prochaine notification : <b>' + whenLabel(s.next) + '</b>' : 'Aucune notification programmée';
  el.innerHTML = h;
  const n = $('#lnN'); if (n) n.onclick = e => { e.preventDefault(); bridge.openNotifSettings(); };
  const x = $('#lnE'); if (x) x.onclick = e => { e.preventDefault(); bridge.openExactAlarmSettings(); };
}

/* ================= Coin du compagnon ================= */
let lastCareSave = Date.now();
function setBar(id, v) {
  const el = $(id);
  el.firstElementChild.style.width = Math.round(U.clamp(v, 0, 100)) + '%';
  el.classList.toggle('low', v < 25);
}
function renderCare(cleanOverride) {
  const C = Care.state;
  setBar('#sFood', C.food); setBar('#sJoy', C.joy); setBar('#sClean', cleanOverride !== undefined ? cleanOverride : C.clean);
  $('#sXp').firstElementChild.style.width = Math.round(Care.levelProgress() * 100) + '%';
  $('#lvlTxt').textContent = 'Amitié niv. ' + Care.level();
  $('#starsN').textContent = C.stars;
  Scene.setCare({ acc: C.wear, dirt: Care.dirt(), mood: Care.mood() });
}
function levelUp() {
  confetti(); SFX.fanfare(); Scene.cheer();
  const n = Care.level(), unlock = Care.ACCS.filter(a => a.level === n).map(a => a.name);
  dialog.say(`Niveau d'amitié ${n} ! Je t'adore !` + (unlock.length ? ` (${unlock.join(', ')} débloqué !)` : ''), S.sound ? () => SFX.blip() : null);
  lastSay = Date.now();
}
function talk(txt) { dialog.say(txt, S.sound ? () => SFX.blip() : null); lastSay = Date.now(); }
function toScene() { if (window.scrollY > 40) window.scrollTo({ top: 0, behavior: 'smooth' }); }
const actButtons = {};
document.querySelectorAll('.act').forEach(b => { actButtons[b.dataset.act] = b; b.onclick = () => { SFX.unlock(); doAct(b.dataset.act); }; });
let bathing = false;
function doAct(a) {
  const P = Pets.INFO[S.pet];
  if ((a === 'feed' || a === 'ball' || a === 'bath') && Scene.busy && !(a === 'bath' && bathing)) { talk('Attends, je suis occupé !'); return; }
  if (a === 'feed') { if (bathing) return; openModal('food'); }
  else if (a === 'shop') openModal('shop');
  else if (a === 'games') { if (bathing) stopBath(); openGames(); }
  else if (a === 'ball') {
    if (bathing || Scene.busy) return;
    toScene();
    if (Scene.throwBall(() => { const r = Care.fetchDone(); renderCare(); save(); if (r.levelUp) levelUp(); else talk(['Je l\'ai ! Encore, encore !', `${P.cry} ! Relance-la !`, 'Trop facile !'][Math.floor(Math.random() * 3)]); })) talk('Je vais la chercher !');
  } else if (a === 'bath') {
    if (bathing) { stopBath(); talk('Bon… on finira plus tard.'); return; }
    if (Scene.busy) return;
    if (Care.state.clean >= 92) { talk('Je suis déjà tout propre !'); return; }
    toScene();
    const c0 = Care.state.clean;
    const ok = Scene.startBath(p => renderCare(c0 + (100 - c0) * p), () => {
      bathing = false; actButtons.bath.classList.remove('on');
      const r = Care.bathDone(); renderCare(); save();
      if (r.levelUp) levelUp(); else talk('Tout propre ! Je sens bon la noix de coco.');
    });
    if (ok) { bathing = true; actButtons.bath.classList.add('on'); talk('Frotte-moi avec ton doigt pour faire plein de mousse !'); }
  }
}
function stopBath() { Scene.stopBath(); bathing = false; actButtons.bath.classList.remove('on'); renderCare(); }

/* ---------- Menus nourriture et boutique ---------- */
let modalKind = '';
function openModal(kind) { modalKind = kind; buildModal(''); $('#modal').classList.add('open'); SFX.click(); }
function closeModal() { $('#modal').classList.remove('open'); }
$('#mClose').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function iconCanvas(src, scale) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  c.style.width = src.width * px * scale + 'px'; c.style.height = src.height * px * scale + 'px';
  return c;
}
function buildModal(note) {
  const C = Care.state, grid = $('#mGrid'), P = Pets.INFO[S.pet], nm = S.petName || P.name;
  grid.innerHTML = '';
  $('#mStars').textContent = C.stars;
  $('#mNote').textContent = note || '';
  if (modalKind === 'food') {
    $('#mTitle').textContent = 'Nourrir ' + nm;
    for (const id of Care.menu(S.pet)) {
      const f = Care.FOODS[id], fav = Care.FAV[S.pet] === id, b = document.createElement('button');
      b.className = 'mitem pxbox' + (fav ? ' fav' : '');
      b.appendChild(iconCanvas(Care.icon(id), 2));
      b.insertAdjacentHTML('beforeend', `<span class="nm">${f.name}</span>${fav ? '<span class="tag">Son préféré !</span>' : ''}<span class="fx">Ventre +${f.food} · Joie +${f.joy + (fav ? 8 : 0)}</span><span class="pr">${f.price ? f.price + ' étoile' + (f.price > 1 ? 's' : '') : 'Gratuit'}</span>`);
      b.onclick = () => feedItem(id);
      grid.appendChild(b);
    }
  } else {
    $('#mTitle').textContent = 'Boutique';
    const lvl = Care.level();
    for (const a of Care.ACCS) {
      const owned = C.owned.includes(a.id), worn = C.wear === a.id, locked = !owned && a.level && lvl < a.level;
      const b = document.createElement('button');
      b.className = 'mitem pxbox' + (worn ? ' worn' : '') + (locked ? ' locked' : '');
      b.appendChild(iconCanvas(Pets.get(S.pet, S.fur, { eyes: worn ? 'happy' : 'open', mouth: worn ? 'open' : 'w' }, a.id), 1.6));
      const st = worn ? 'Porté (retirer)' : owned ? 'Porter' : locked ? 'Amitié niv. ' + a.level : a.price + ' étoiles';
      b.insertAdjacentHTML('beforeend', `<span class="nm">${a.name}</span><span class="pr">${st}</span>`);
      b.onclick = () => buyAcc(a.id);
      grid.appendChild(b);
    }
  }
  HUD.paintIcons($('#modal'));
}
function feedItem(id) {
  if (Scene.busy) { closeModal(); return; }
  const r = Care.feed(id, S.pet);
  if (!r.ok) {
    if (r.reason === 'full') { closeModal(); talk('Je n\'ai plus faim, merci ! On joue plutôt ?'); }
    else if (r.reason === 'stars') { SFX.hurt(); buildModal(`Il te manque ${r.missing} étoile${r.missing > 1 ? 's' : ''}. Gagne-en avec les mini-jeux !`); }
    return;
  }
  closeModal(); toScene(); renderCare(); save();
  const art = Care.FOODS[id].art;
  talk(r.fav ? `Oh !! ${art.charAt(0).toUpperCase() + art.slice(1)} ?!` : `Oh, ${art} !`);
  Scene.feed(id, r.fav, () => {
    if (r.levelUp) levelUp();
    else talk(r.fav ? `${Pets.INFO[S.pet].cry} ! C'est mon plat préféré !` : 'Miam ! Merci, c\'était délicieux !');
  });
}
function buyAcc(id) {
  const r = Care.buy(id);
  if (!r.ok) {
    SFX.hurt();
    buildModal(r.reason === 'level' ? `Débloqué au niveau d'amitié ${r.level}. Prends soin de ton compagnon !` : `Il te manque ${r.missing} étoile${r.missing > 1 ? 's' : ''}. Joue aux mini-jeux !`);
    return;
  }
  SFX.twinkle(); applyLook(); renderCare(); exportPetIcon(); save();
  buildModal(r.bought ? 'Acheté ! Ton compagnon le porte déjà.' : r.worn ? 'C\'est mis !' : 'Retiré.');
  if (r.bought) { confetti(); talk('Waouh ! Merci pour ce cadeau, je l\'adore !'); }
}

/* ---------- Mini-jeux ---------- */
let gamesOpen = false, curGame = '';
Games.init($('#gCanvas'));
function openGames() {
  showGameMenu();
  $('#gamesSheet').classList.add('open'); gamesOpen = true; Scene.stop(); SFX.click();
}
function closeGames() { Games.stop(); $('#gamesSheet').classList.remove('open'); gamesOpen = false; Scene.start(); renderCare(); applyLook(); }
$('#gClose').onclick = closeGames;
function showGameMenu() {
  Games.stop();
  $('#gTitle').textContent = 'Mini-jeux';
  $('#gMenu').style.display = ''; $('#gPlay').style.display = 'none'; $('#gEnd').style.display = 'none';
  const box = $('#gCards'), C = Care.state;
  box.innerHTML = '';
  for (const id in Games.LIST) {
    const gm = Games.LIST[id], b = document.createElement('button');
    b.className = 'gcard pxbox';
    const cv = document.createElement('canvas'); cv.width = 42; cv.height = 40;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(Pets.get(S.pet, S.fur, { eyes: 'happy', mouth: 'open', pose: id === 'jump' ? 'jump' : '' }, C.wear), 0, 3);
    const ic = Care.icon(gm.icon); x.drawImage(ic, 42 - ic.width, 0);
    cv.style.width = 42 * px * 1.3 + 'px'; cv.style.height = 40 * px * 1.3 + 'px';
    b.appendChild(cv);
    b.insertAdjacentHTML('beforeend', `<div><div class="gn">${gm.name}</div><div class="gd">${gm.desc}</div><div class="gb">Record : ${C.best[id] || 0}</div></div>`);
    b.onclick = () => startGame(id);
    box.appendChild(b);
  }
}
function startGame(id) {
  curGame = id;
  $('#gTitle').textContent = Games.LIST[id].name;
  $('#gMenu').style.display = 'none'; $('#gEnd').style.display = 'none'; $('#gPlay').style.display = '';
  const top = $('#gamesSheet .top').getBoundingClientRect().height;
  const w = document.documentElement.clientWidth, h = Math.max(240, window.innerHeight - top - 44 - 12 - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0));
  Games.open(id, { sp: S.pet, fur: S.fur, acc: Care.state.wear, theme: S.theme, night: Scene.night > 0.6 }, w, h);
  const m = $('#gMsg');
  m.innerHTML = `<b>${Games.LIST[id].name}</b>${Games.LIST[id].desc}<br><br>Touche l'écran pour commencer !`;
  m.classList.remove('hide');
  $('#gScore').textContent = '0'; $('#gInfo').textContent = ''; renderLives(id === 'memory' ? -1 : 3);
  SFX.click();
}
function renderLives(n) {
  const el = $('#gLives');
  if (el.dataset.n === String(n)) return;
  el.dataset.n = String(n);
  el.innerHTML = n < 0 ? '' : [0, 1, 2].map(i => `<i class="ico" data-ico="${i < n ? 'heart' : 'heartoff'}"></i>`).join('');
  HUD.paintIcons(el);
}
Games.on('start', () => { $('#gMsg').classList.add('hide'); });
Games.on('hud', (score, lives, info) => { $('#gScore').textContent = score; $('#gInfo').textContent = info; renderLives(lives); });
Games.on('sfx', n => { if (SFX[n]) SFX[n](); });
Games.on('end', (id, score) => {
  const r = Care.reward(id, score);
  renderCare(); save();
  setTimeout(() => {
    $('#gPlay').style.display = 'none'; $('#gEnd').style.display = '';
    $('#gResTitle').textContent = r.isBest ? 'Nouveau record !' : score > 0 ? 'Bravo !' : 'Presque !';
    $('#gResScore').textContent = score;
    $('#gResBest').textContent = 'Record : ' + r.best;
    $('#gResReward').innerHTML = `+${r.stars} étoile${r.stars > 1 ? 's' : ''} · Joie +15` + (r.levelUp ? `<br>Amitié niveau ${Care.level()} !` : '');
    const c = $('#gResPet'), x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height); x.drawImage(Pets.get(S.pet, S.fur, { eyes: 'happy', mouth: 'open', pose: 'jump' }, Care.state.wear), 0, 0);
    if (r.isBest || r.levelUp) { confetti(); SFX.fanfare(); } else SFX.over();
  }, 700);
});
$('#gAgain').onclick = () => startGame(curGame);
$('#gBack').onclick = showGameMenu;

/* ================= Boucle d'animation de l'interface ================= */
function hudLoop(now) {
  clock.draw(now);
  dialog.draw(now);
  if (sheetOpen) {
    for (const p of petCanvases) {
      const x = p.c.getContext('2d'), sel = p.k === S.pet;
      const f = { hy: Math.floor(now / 600) % 2, tail: [0, 1, 0, -1][Math.floor(now / 250) % 4], eyes: Math.floor(now / 90) % 37 === 0 ? 'blink' : sel ? 'happy' : 'open', mouth: sel ? 'open' : 'w' };
      x.clearRect(0, 0, p.c.width, p.c.height);
      x.drawImage(Pets.get(p.k, sel ? S.fur : 0, f, sel ? Care.state.wear : ''), 0, 0);
    }
  }
  requestAnimationFrame(hudLoop);
}

/* ================= Démarrage ================= */
Scene.init($('#scene'));
applyLook();
layoutScene();
HUD.paintIcons();
tick();
Scene.start();
requestAnimationFrame(hudLoop);
setInterval(tick, 1000);
let pendingLayout = false;
window.addEventListener('resize', () => { if (sheetOpen) pendingLayout = true; else layoutScene(); });
exportPetIcon();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layoutScene());
