const { spawn } = require('child_process');

const ESC = '\x1b[';
const RESET = ESC + '0m';
const fg = (n) => `${ESC}38;5;${n}m`;
const bg = (n) => `${ESC}48;5;${n}m`;
const out = (s) => process.stdout.write(s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const W = () => process.stdout.columns || 40;
const H = () => process.stdout.rows || 24;
const at = (r, c) => `${ESC}${r};${c}H`;
const col = (len) => Math.max(1, Math.floor((W() - len) / 2) + 1);
const rand = (n) => Math.floor(Math.random() * n);

// cache dell'ultimo frame: si ridisegnano solo le celle cambiate (niente sfarfallio)
let prev = null;
const clear = () => { prev = null; out(`${ESC}2J${ESC}H`); };
function eraseStr(r, x) {
  if (prev) {
    const i = (r - 1) * W() + (x - 1);
    if (i >= 0 && i < prev.length) prev[i] = -1;
  }
  return at(r, x) + ' ';
}

let vibOk = true;
function vibra(ms) {
  if (!vibOk || !process.stdout.isTTY) return;
  try {
    const p = spawn('termux-vibrate', ['-f', '-d', String(ms)], { stdio: 'ignore', detached: true });
    p.on('error', () => { vibOk = false; });
    p.unref();
  } catch (e) {
    vibOk = false;
  }
}

// Zeus è uno sprite 24x28 pixel, ora viene ingrandito in automatico
// in base alla grandezza del terminale (ogni cella = 2 pixel ▀ ▄)
const SW = 24, SH = 28;
const EYES = [39, 45, 51, 231, 51, 45];
const BOLTC = [226, 231, 220, 39];
const RING = [220, 226, 229, 39];
const SPARK_CHARS = ['✦', '✧', '⚡', '·', '*'];
const SPARK_COLORS = [231, 226, 220, 39, 195];
const STATIC = { r: 255, R: 252, s: 223, S: 180, b: 240, m: 131, G: 220, g: 172, H: 249, C: 19, W: 231 };
const SPRITE = [
  '.....................yy.',
  '.........hhhH.......yyy.',
  '........hhHhhh.....yyy..',
  '......GgGgGGgGgG...yyyyy',
  '.....GHhhhhhhHhhG...yyy.',
  '.....hhhhsssshhhh..yyy..',
  '.....hhbbbssbbbhH..yy...',
  '.....hhseeSSeeshh.sssS..',
  '.....HhsssSSssshh.sssS..',
  '.....hhhhhsshhhhh.ssS...',
  '.....hhhHhmmhhhHh.ssS...',
  '.....hHhhhhhhHhhh.ssS...',
  '.....hhhhhhHhhhhh.GGG...',
  '....chhhhHhhhhhhHcssS...',
  '..CCc.hHhhhhhhHh.cssS...',
  'ccCGG.hhhhhhHhhh.GssSc..',
  'ccCGGGrrhhHhhhrrGGGCcc..',
  'SssrrrrrHhhhhhrrrrrCcc..',
  'SssrrrrRrhhhhrRrrrrCcc..',
  'SssrrrrRrhhHhrRrrrrCcc..',
  'GGGrrrrRrrhhrrRrrrrCcc..',
  'SssrrrrRrrhhrrRrrrrCcc..',
  'SssrrrrrRrrrrRrrrrrCcc..',
  'SssrrrrrRrrrrRrrrrrCcc..',
  'SssGGGGGGGWWGGGGGGGCcc..',
  'SssgggggggWWgggggggCcc..',
  '.ssrrrrrrRrrRrrrrrrCcc..',
  'ccCrrrrrrRrrRrrrrrrCcc..'
];

// alone luminoso attorno a Zeus (distanza 1..3 dal bordo), 5 intensità
const HALOS = [[25, 18, 17], [26, 19, 17], [27, 25, 18], [33, 26, 19], [45, 39, 27]];
const HALO_R = 3;
// colori delle onde d'urto, dal più vivo al più spento
const WAVES = [[231, 226, 39], [229, 220, 33], [228, 178, 27], [222, 136, 25], [180, 94, 19], [137, 58, 18], [59, 238, 17]];

const LEVELS = [0, 95, 135, 175, 215, 255];
function dim(c, p) {
  let r, g, b;
  if (c >= 232) r = g = b = 8 + (c - 232) * 10;
  else if (c >= 16) {
    const n = c - 16;
    r = LEVELS[Math.floor(n / 36)]; g = LEVELS[Math.floor(n / 6) % 6]; b = LEVELS[n % 6];
  } else return c;
  const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
  return 232 + Math.round(lum * (1 - p) * 23);
}

function colorOf(ch, x, y, t, o) {
  if (ch === 'e') return o.hit ? 231 : EYES[(t >> 1) % EYES.length];
  if (ch === 'y') return o.hit ? 231 : BOLTC[(t + x) % BOLTC.length];
  if (ch === 'h') return (((x + y - t) % 12) + 12) % 12 < 2 ? 231 : 253;
  if (ch === 'c') return ((y + (t >> 1)) % 4) < 2 ? 27 : 33;
  if (ch === 'G') return (x * 2 + y + t) % 14 === 0 ? 231 : 220;
  return STATIC[ch];
}

// ---------- sprite ingrandito + layout ----------
function buildScaled(f) {
  const bw = Math.round(SW * f);
  let bh = Math.round(SH * f);
  if (bh % 2) bh++;
  const sxm = [], sym = [];
  for (let i = 0; i < bw; i++) sxm.push(Math.min(SW - 1, Math.floor(i / f)));
  for (let j = 0; j < bh; j++) sym.push(Math.min(SH - 1, Math.floor(j / f)));
  const sp = [];
  for (let j = 0; j < bh; j++) {
    let row = '';
    for (let i = 0; i < bw; i++) row += SPRITE[sym[j]][sxm[i]];
    sp.push(row);
  }
  // mappa della distanza dal bordo, per l'alone
  const R = HALO_R, dw = bw + 2 * R, dh = bh + 2 * R;
  const dist = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let best = 99;
      for (let yy = -R; yy <= R; yy++) {
        const my = y - R + yy;
        if (my < 0 || my >= bh) continue;
        for (let xx = -R; xx <= R; xx++) {
          const mx = x - R + xx;
          if (mx < 0 || mx >= bw || sp[my][mx] === '.') continue;
          const d = Math.hypot(xx, yy);
          if (d < best) best = d;
        }
      }
      dist[y * dw + x] = best <= R ? Math.max(1, Math.ceil(best)) : 0;
    }
  }
  return { bw, bh, sxm, sym, sp, dist, dw };
}
let scaled = null;
function scaledFor(f) {
  if (!scaled || scaled.f !== f) scaled = { f, ...buildScaled(f) };
  return scaled;
}

function layout() {
  const cols = W(), rows = H();
  let f = Math.min((cols - 6) / SW, (rows - 10) / 14, 2.8);
  f = Math.floor(f * 8) / 8;
  if (f < 0.85) {
    return {
      small: true, cols, rows, titleRow: 1, subRow: 2, barRow: 4, statusRow: 5,
      boltEnd: 0, end: Math.min(rows, 6)
    };
  }
  const s = scaledFor(f);
  const bodyRows = s.bh / 2;
  const spare = Math.max(0, rows - (5 + bodyRows + 5));
  const top = 5 + Math.min(4, Math.floor(spare / 2));
  const left0 = Math.floor((cols - s.bw) / 2);
  const top0 = (top - 1) * 2;
  const titleRow = top + bodyRows + 1;
  const cx = left0 + s.bw / 2, cy = top0 + s.bh / 2;
  return {
    small: false, cols, rows, ...s, bodyRows, top, left0, top0, cx, cy,
    titleRow, subRow: titleRow + 1, barRow: titleRow + 3, statusRow: titleRow + 4,
    boltEnd: top - 2,
    tipX: left0 + Math.floor(22 * f) + 1,
    band: Math.max(2, Math.round(2 * f)),
    scanStep: Math.max(2, Math.round(2 * f)),
    waveMax: Math.ceil(Math.hypot(Math.max(cx, cols - cx), Math.max(cy, rows * 2 - cy))) + 2,
    end: Math.min(rows, titleRow + 6)
  };
}

// ---------- disegno del frame (griglia di pixel a tutto schermo) ----------
let SXc = 0, SYc = 0;
function spriteAt(L, X, Y, o, bob) {
  const sqx = o.sqx || 1, sqy = o.sqy || 1;
  const u = (X + 0.5 - L.cx - (o.dx || 0)) / sqx + L.bw / 2;
  const v = (Y + 0.5 - L.cy - bob) / sqy + L.bh / 2;
  const mx = Math.floor(u), my = Math.floor(v);
  if (mx < 0 || my < 0 || mx >= L.bw || my >= L.bh) return null;
  SXc = L.sxm[mx]; SYc = L.sym[my];
  return L.sp[my][mx];
}

function fxAt(L, X, Y, t, o, bob) {
  const dx = o.dx || 0;
  const sx = (X + 0.5 - L.left0 - dx) / L.f;
  const sy = (Y + 0.5 - L.top0 - bob) / L.f;
  const ddx = sx - 10.5, ddy = sy - 8.5;
  const d = Math.hypot(ddx, ddy);
  if (d >= 8.2 && d <= 9.8) {
    const seg = Math.floor((Math.atan2(ddy, ddx) + Math.PI) / (Math.PI / 8));
    if ((seg + (t >> 1)) % 3 !== 0) return RING[(seg + t) % RING.length];
  }
  if (sx >= 16 && sy <= 9 && Math.random() < 0.05) return SPARK_COLORS[rand(SPARK_COLORS.length)];
  const mx = X - L.left0 - dx, my = Y - L.top0 - bob, R = HALO_R;
  if (mx >= -R && my >= -R && mx < L.bw + R && my < L.bh + R) {
    const k = L.dist[(my + R) * L.dw + (mx + R)];
    if (k) return HALOS[o.hit ? 4 : Math.round((Math.sin(t / 4) + 1) * 1.5)][k - 1];
  }
  return -1;
}

function waveAt(L, X, Y, o) {
  const th = o.wthick || 1.3;
  const dd = Math.abs(Math.hypot(X + 0.5 - L.cx, Y + 0.5 - L.cy) - o.wave);
  if (dd > th) return -1;
  const pal = WAVES[Math.min(WAVES.length - 1, o.ws || 0)];
  const k = dd / th;
  return k < 0.4 ? pal[0] : k < 0.75 ? pal[1] : pal[2];
}

// filo di luce (usato quando Zeus si spegne)
function lineAt(L, X, Y, o) {
  const dx = Math.abs(X + 0.5 - L.cx), dy = Math.abs(Y + 0.5 - L.cy);
  const hw = o.line.w / 2, hh = o.line.h / 2;
  const g = Math.max(dx - hw, dy - hh);
  if (g <= 0) {
    const e = hw > 0 ? dx / hw : 0;
    return e > 0.88 ? 45 : e > 0.7 ? 195 : 231;
  }
  return g <= 1.2 ? 45 : g <= 2.4 ? 27 : g <= 3.6 ? 18 : -1;
}

function tint(L, c, ry, o) {
  if (o.scan !== undefined) {
    if (ry >= o.scan + L.band) return dim(c, 0.88);
    if (ry >= o.scan) return 231;
  }
  if (o.wy !== undefined) {
    if (ry >= o.wy + 3) return Math.random() < 0.18 ? 159 : 231;
    if (ry >= o.wy) return 159;
  }
  if (o.white) return Math.random() < 0.15 ? 159 : 231;
  return o.p ? dim(c, o.p) : c;
}

function buildFrame(L, t, o = {}) {
  const GW = L.cols, GH = L.rows * 2;
  const g = new Int16Array(GW * GH).fill(-1);
  const bob = o.bob === undefined ? Math.round((Math.sin(t / 6) * 0.5 + 0.5) * L.f) : o.bob;
  let x0 = 0, x1 = GW - 1, y0 = 0, y1 = GH - 1;
  if (!o.full) {
    x0 = Math.max(0, L.left0 - 8); x1 = Math.min(GW - 1, L.left0 + L.bw + 8);
    y0 = Math.max(0, L.top0 - 2); y1 = Math.min(GH - 1, L.top0 + L.bh + 2);
  }
  for (let Y = y0; Y <= y1; Y++) {
    for (let X = x0; X <= x1; X++) {
      let c = -1;
      const ch = (o.line || o.nosprite) ? null : spriteAt(L, X, Y, o, bob);
      if (ch !== null && ch !== '.') c = tint(L, colorOf(ch, SXc, SYc, t, o), Y - L.top0 - bob, o);
      else if (o.fx) c = fxAt(L, X, Y, t, o, bob);
      if (c < 0 && o.wave !== undefined) c = waveAt(L, X, Y, o);
      if (c < 0 && o.line) c = lineAt(L, X, Y, o);
      g[Y * GW + X] = c;
    }
  }
  return g;
}

function paint(L, g) {
  const GW = L.cols, rows = L.rows, n = GW * rows;
  if (!prev || prev.length !== n) prev = new Int32Array(n);
  let s = '', last = '';
  for (let r = 0; r < rows; r++) {
    let open = false;
    for (let x = 0; x < GW; x++) {
      const a = g[2 * r * GW + x], b = g[(2 * r + 1) * GW + x];
      const code = (a + 1) * 300 + (b + 1);
      const i = r * GW + x;
      if (code === prev[i]) { open = false; continue; }
      prev[i] = code;
      if (!open) { s += at(r + 1, x + 1); open = true; }
      let st, ch;
      if (a < 0 && b < 0) { st = RESET; ch = ' '; }
      else if (b < 0) { st = ESC + '49m' + fg(a); ch = '▀'; }
      else if (a < 0) { st = ESC + '49m' + fg(b); ch = '▄'; }
      else { st = fg(a) + bg(b); ch = '▀'; }
      if (st !== last) { s += st; last = st; }
      s += ch;
    }
  }
  if (s) out(s + RESET);
}
const show = (L, t, o) => { if (!L.small) paint(L, buildFrame(L, t, o)); };

// ---------- fulmine, scintille, pioggia, titolo, barra ----------
function flash(color) {
  prev = null;
  const cols = W(), rows = H();
  const line = bg(color) + ' '.repeat(cols) + RESET;
  let s = '';
  for (let r = 1; r <= rows; r++) s += at(r, 1) + line;
  out(s);
}

function makeBolt(L) {
  const width = L.cols;
  const cells = new Map();
  const put = (r, x, ch, color) => {
    if (r < 1 || r > L.boltEnd || x < 1 || x > width) return;
    cells.set(r * 1000 + x, { r, x, ch, color });
  };
  const targetX = L.tipX;
  let x = Math.max(4, Math.min(width - 4, Math.floor(width * (0.2 + Math.random() * 0.6))));
  const main = [];

  for (let r = 1; r <= L.boltEnd; r++) {
    const remaining = L.boltEnd - r;
    let dx;
    if (remaining < 6) {
      dx = Math.max(-3, Math.min(3, Math.round((targetX - x) / (remaining + 1))));
    } else {
      const choices = [-3, -2, -2, -1, 0, 1, 2, 2, 3];
      dx = choices[rand(choices.length)];
      if (Math.random() < 0.3) dx = Math.sign(targetX - x) * (1 + rand(2));
    }
    const nx = Math.max(3, Math.min(width - 2, x + dx));
    main.push({ r, a: Math.min(x, nx), b: Math.max(x, nx) });
    x = nx;
  }
  for (const s of main) {
    put(s.r, s.a - 1, '▒', 39);
    put(s.r, s.b + 2, '▒', 39);
  }
  for (const s of main) {
    if (s.r < 3 || s.r > L.boltEnd - 4 || Math.random() > 0.32) continue;
    const dir = Math.random() < 0.5 ? -1 : 1;
    let bx = dir > 0 ? s.b : s.a;
    const len = 3 + rand(6);
    for (let k = 1; k <= len; k++) {
      const br = s.r + k;
      const nbx = bx + dir * (1 + (Math.random() < 0.4 ? 1 : 0));
      if (nbx < 2 || nbx > width - 1 || br >= L.boltEnd - 1) break;
      for (let xx = Math.min(bx, nbx); xx <= Math.max(bx, nbx); xx++) put(br, xx, '▓', 226);
      bx = nbx;
    }
  }
  for (const s of main) {
    for (let xx = s.a; xx <= s.b + 1; xx++) put(s.r, xx, '█', 231);
  }

  const byRow = [];
  for (const c of cells.values()) (byRow[c.r] = byRow[c.r] || []).push(c);
  return { byRow, all: [...cells.values()], keys: new Set(cells.keys()) };
}

const TONE_HOT = (c) => c;
const TONE_DIM = (c) => ({ 231: 25, 226: 24, 39: 18 }[c] || 24);
function boltString(cells, tone) {
  let s = '';
  for (const c of cells) s += at(c.r, c.x) + fg(tone(c.color)) + c.ch;
  return s + RESET;
}
const drawBolt = (bolt, tone) => out(boltString(bolt.all, tone));

function makeSpark(L) {
  const c0 = L.left0 + 1;
  const r = L.top + rand(L.bodyRows);
  let x;
  if (Math.random() < 0.6) {
    x = Math.random() < 0.5 ? c0 - 2 - rand(6) : c0 + L.bw + 1 + rand(6);
  } else {
    x = c0 + rand(L.bw);
  }
  return {
    r,
    x: Math.max(1, Math.min(L.cols, x)),
    ch: SPARK_CHARS[rand(SPARK_CHARS.length)],
    color: SPARK_COLORS[rand(SPARK_COLORS.length)],
    ttl: 2 + rand(3)
  };
}

// pioggia di tempesta ai lati e sopra Zeus
function makeRain(L) {
  const n = Math.max(6, Math.floor(L.cols / 3));
  const drops = [];
  for (let i = 0; i < n; i++) {
    drops.push({ x: 1 + rand(L.cols), y: 1 + rand(L.rows), v: 1 + rand(2), drawn: false, px: 0, py: 0 });
  }
  return drops;
}
function stepRain(L, drops, bolt) {
  const maxRow = L.top + L.bodyRows - 1;
  const xa = L.left0 - 4, xb = L.left0 + L.bw + 5;
  let s = '';
  for (const d of drops) {
    if (d.drawn) { s += at(d.py, d.px) + ' '; d.drawn = false; }
    d.y += d.v;
    if (d.y > maxRow) { d.y = 1; d.x = 1 + rand(L.cols); d.v = 1 + rand(2); }
    const inside = d.y >= L.top - 1 && d.x >= xa && d.x <= xb;
    if (inside || (bolt && bolt.keys.has(d.y * 1000 + d.x))) continue;
    s += at(d.y, d.x) + fg(d.v > 1 ? 31 : 24) + '│';
    d.drawn = true; d.px = d.x; d.py = d.y;
  }
  if (s) out(s + RESET);
}

// titolo con onda dorata che scorre
const TITLE = '⚡  Z  E  U  S  ⚡';
const SHINE = [94, 136, 178, 220, 226, 229, 231, 229, 226, 220, 178, 136];
function drawTitle(L, t, n = TITLE.length) {
  let s = at(L.titleRow, col(TITLE.length + 2)) + ESC + '1m';
  for (let i = 0; i < TITLE.length; i++) {
    const ch = TITLE[i];
    if (i >= n || ch === ' ') s += ' '.repeat(ch === '⚡' ? 2 : 1);
    else if (ch === '⚡') s += ch;
    else s += fg(SHINE[(((i - t) % 12) + 12) % 12]) + ch;
  }
  out(s + RESET);
}
const SUB = '─ DIO DEL FULMINE ─';

// barra di caricamento a sfumatura
const GRAD = [27, 33, 39, 45, 51, 87, 123, 159, 195, 231];
const GOLD = [136, 178, 220, 226, 229, 231];
function drawBar(L, pct, label) {
  const p = Math.max(0, Math.min(100, pct));
  const steps = Math.max(10, Math.min(28, L.cols - 14));
  const filled = Math.round((p / 100) * steps);
  const pal = p >= 100 ? GOLD : GRAD;
  let bar = '';
  for (let i = 0; i < steps; i++) {
    if (i < filled) {
      const head = i === filled - 1 && p < 100;
      const c = head ? 231 : pal[Math.floor((i / (steps - 1)) * (pal.length - 1))];
      bar += fg(c) + '█';
    } else bar += fg(238) + '░';
  }
  const w = Math.min(36, L.cols - 2);
  const lab = String(label || '').slice(0, w).padEnd(w, ' ');
  const tc = p >= 100 ? 226 : 250;
  out(
    at(L.barRow, col(steps + 7)) + fg(245) + '[' + bar + fg(245) + '] ' + fg(tc) + String(p).padStart(3, ' ') + '%' + RESET +
    at(L.statusRow, col(w)) + fg(tc) + lab + RESET
  );
}

// ---------- INTRO ----------
const NOOP_SPLASH = { step() {}, done: async () => {}, end() {} };
async function intro() {
  if (!process.stdout.isTTY) return NOOP_SPLASH;

  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  const original = {};
  const queue = [];
  for (const m of methods) {
    original[m] = console[m];
    console[m] = (...a) => queue.push([m, a]);
  }
  const restoreConsole = () => {
    for (const m of methods) console[m] = original[m];
  };

  out(`${ESC}?25l`);
  const L = layout();
  const bolt = L.boltEnd >= 3 ? makeBolt(L) : null;

  try {
    clear();
    await sleep(220);

    const lampi = [[231, 50, 100], [229, 35, 65], [231, 85, 125], [195, 35, 55]];
    for (let i = 0; i < lampi.length; i++) {
      const [c, on, off] = lampi[i];
      flash(c);
      if (i === 0 || i === 2) vibra(60);
      await sleep(on);
      clear();
      await sleep(off);
    }

    if (bolt) {
      for (let r = 1; r <= L.boltEnd; r++) {
        if (bolt.byRow[r]) out(boltString(bolt.byRow[r], TONE_HOT));
        await sleep(20);
      }
      vibra(280);
      flash(231); await sleep(55);
      clear(); drawBolt(bolt, TONE_HOT); show(L, 0, { p: 0.85 }); await sleep(105);
      flash(195); await sleep(30);
      clear(); drawBolt(bolt, TONE_HOT); show(L, 0, { p: 0.6 }); await sleep(85);
      // l'urto: un'onda d'energia parte da Zeus e attraversa lo schermo
      for (let k = 0; k < 12; k++) {
        show(L, 0, { p: 0.6, full: true, nosprite: false, wave: 3 + (k * L.waveMax) / 12, ws: Math.floor(k / 2), wthick: 1.4 });
        await sleep(30);
      }
      drawBolt(bolt, TONE_DIM);
    }

    if (!L.small) {
      // l'energia scende nel corpo e lo accende riga per riga
      for (let k = 0; k <= L.bh + L.band; k += L.scanStep) {
        show(L, k, { scan: k, bob: 0 });
        await sleep(42);
      }
      // gli occhi si accendono
      for (let i = 0; i < 3; i++) {
        if (i === 0) vibra(60);
        show(L, 30 + i * 2, { fx: true, hit: true }); await sleep(70);
        show(L, 31 + i * 2, { fx: true }); await sleep(90);
      }
    }

    // il nome appare lettera per lettera, poi il sottotitolo
    for (let i = 1; i <= TITLE.length; i++) {
      drawTitle(L, i, i);
      if (i === 4) vibra(40);
      await sleep(38);
    }
    let typed = '';
    for (const ch of SUB) {
      typed += ch;
      out(at(L.subRow, col(SUB.length)) + fg(39) + typed + RESET);
      await sleep(28);
    }
  } catch (e) {
    restoreConsole();
    out(`${ESC}?25h\n`);
    throw e;
  }

  let t = 0;
  let shown = 0;
  let target = 0;
  let label = 'Avvio...';
  let ended = false;
  let flicker = 0;
  let sparks = [];
  const rain = L.small ? [] : makeRain(L);

  drawBar(L, 0, label);
  const timer = setInterval(() => {
    if (ended) return;
    t++;

    if (shown < target) {
      shown = Math.min(target, shown + Math.max(1, Math.ceil((target - shown) * 0.24)));
    }

    let s = '';
    for (const sp of sparks) s += eraseStr(sp.r, sp.x);
    if (s) out(s);
    sparks = sparks
      .map(sp => ({ ...sp, ttl: sp.ttl - 1 }))
      .filter(sp => sp.ttl > 0);
    if (!L.small && Math.random() < 0.5 && sparks.length < 8) sparks.push(makeSpark(L));

    if (bolt) {
      if (flicker > 0) {
        flicker--;
        if (flicker === 0) drawBolt(bolt, TONE_DIM);
      } else if (Math.random() < 0.045) {
        drawBolt(bolt, TONE_HOT);
        flicker = 1 + rand(2);
        vibra(40);
      }
    }

    if (!L.small) {
      stepRain(L, rain, bolt);
      paint(L, buildFrame(L, t, { fx: true, hit: flicker > 0 }));
    }
    drawTitle(L, t);
    drawBar(L, shown, label);
    let sp2 = '';
    for (const sp of sparks) sp2 += at(sp.r, sp.x) + fg(sp.color) + sp.ch + RESET;
    if (sp2) out(sp2);
  }, 75);
  const safety = setTimeout(() => end(), 30000);

  function end() {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    clearTimeout(safety);
    restoreConsole();
    out(at(L.end, 1) + `${ESC}?25h\n`);
    for (const [m, a] of queue) original[m](...a);
  }

  return {
    step(pct, text) {
      if (ended) return;
      target = Math.max(target, Math.min(99, pct));
      if (text) label = text;
    },
    async done() {
      if (ended) return;
      target = 100;
      label = '⚡ ZEUS È ONLINE ⚡';
      vibra(120);
      setTimeout(() => vibra(120), 260);
      while (!ended && shown < 100) await sleep(55);
      drawBar(L, 100, label);
      await sleep(950);
      end();
    },
    end
  };
}

// ---------- OUTRO: Zeus si carica di luce, si spegne come una vecchia TV ed esplode in un'onda dorata ----------
const BURST_COL = [231, 231, 226, 220, 178, 136, 94, 58];
function makeBurst(L, n) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 1.3;
    parts.push({
      x: L.cx + 0.5, y: L.cy / 2 + 0.5,
      vx: Math.cos(a) * sp * 2, vy: Math.sin(a) * sp,
      life: 10 + rand(10), age: 0, drawn: false, px: 0, py: 0,
      ch: SPARK_CHARS[rand(SPARK_CHARS.length)]
    });
  }
  return parts;
}
function stepBurst(L, parts) {
  let s = '';
  for (const p of parts) {
    if (p.drawn) { s += eraseStr(p.py, p.px); p.drawn = false; }
    p.age++;
    if (p.age > p.life) continue;
    p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96;
    const r = Math.round(p.y), x = Math.round(p.x);
    if (r < 1 || r >= L.rows || x < 1 || x >= L.cols) continue;
    const c = BURST_COL[Math.min(BURST_COL.length - 1, Math.floor((p.age / p.life) * BURST_COL.length))];
    s += at(r, x) + fg(c) + (p.age > p.life * 0.7 ? '·' : p.ch);
    p.drawn = true; p.px = x; p.py = r;
  }
  if (s) out(s + RESET);
}

async function outroZeus(L) {
  const bolt = L.boltEnd >= 3 ? makeBolt(L) : null;

  // 1) Zeus è lì, con la sua aura
  for (let k = 0; k < 5; k++) {
    show(L, k, { fx: true });
    drawTitle(L, k);
    await sleep(70);
  }

  // 2) un fulmine lo colpisce
  vibra(280);
  flash(231); await sleep(55);
  clear();
  if (bolt) drawBolt(bolt, TONE_HOT);
  show(L, 5, { fx: true, hit: true }); drawTitle(L, 5);
  await sleep(150);
  if (bolt) drawBolt(bolt, TONE_DIM);
  await sleep(110);

  // 3) si carica: il bianco sale dai piedi alla testa e anelli d'energia lo risucchiano
  const n = 16;
  for (let k = 0; k <= n; k++) {
    const ph = (k % 8) / 8;
    show(L, 6 + k, {
      fx: true, hit: k % 4 === 0,
      wy: Math.round(L.bh - (k / n) * (L.bh + 4)),
      dx: k > 5 ? (k % 2 ? 1 : -1) : 0,
      full: true, wave: 4 + (1 - ph) * L.f * 14, ws: 0, wthick: 1.2
    });
    drawTitle(L, 6 + k);
    if (k % 6 === 1) vibra(50);
    await sleep(55);
  }

  // 4) blackout: si schiaccia come una vecchia TV che si spegne
  vibra(80);
  flash(231); await sleep(40);
  clear();
  const m = 11;
  for (let k = 1; k <= m; k++) {
    const e = k / m;
    show(L, k, { white: true, bob: 0, sqx: 1 + 0.12 * e, sqy: Math.max(0.07, 1 - Math.pow(e, 2.4)) });
    await sleep(38);
  }

  // 5) resta un filo di luce... che si restringe fino a diventare un punto
  const w0 = L.bw * 1.12;
  for (let k = 0; k < 3; k++) { show(L, k, { line: { w: w0, h: 2 } }); await sleep(55); }
  vibra(60);
  for (let k = 1; k <= 10; k++) {
    show(L, k, { line: { w: Math.max(2, w0 * Math.pow(1 - k / 10, 1.8)), h: 2 } });
    await sleep(36);
  }
  for (let k = 0; k < 3; k++) {
    show(L, k, { line: { w: 2 + (k % 2), h: 2 + (k % 2) } });
    await sleep(70);
  }

  // 6) il punto esplode: onda d'urto dorata e scintille
  vibra(220);
  flash(231); await sleep(45);
  clear();
  const parts = makeBurst(L, 28);
  for (let k = 0; k < 18; k++) {
    const o = {
      full: true, nosprite: true,
      wave: 2 + (k * L.waveMax) / 16, ws: Math.min(6, Math.floor(k / 2.6)), wthick: 1.5
    };
    if (k < 4) o.line = { w: 6 - k, h: 4 - k };
    show(L, k, o);
    stepBurst(L, parts);
    await sleep(48);
  }
  for (let k = 0; k < 8; k++) { stepBurst(L, parts); await sleep(48); }
}

async function outroMessage() {
  const msg = 'Il tuono tace... a presto ⚡';
  const deco = '─────  ⚡  ─────';
  const row = Math.floor(H() / 2);
  const fades = [236, 240, 244, 248, 252, 255];
  const gold = [58, 94, 136, 178, 220, 226];
  const paintMsg = (i) => out(
    at(row - 1, col(deco.length + 1)) + fg(gold[i]) + deco + RESET +
    at(row + 1, col(msg.length + 1)) + fg(fades[i]) + msg + RESET
  );
  for (let i = 0; i < fades.length; i++) { paintMsg(i); await sleep(75); }
  await sleep(900);
  for (let i = fades.length - 1; i >= 0; i--) { paintMsg(i); await sleep(55); }
}

async function outro() {
  if (!process.stdout.isTTY) return;
  out(`${ESC}?25l`);
  try {
    const L = layout();
    clear();
    if (L.small) { flash(231); await sleep(60); }
    else await outroZeus(L);
    clear();
    await outroMessage();
    clear();
  } finally {
    out(`${ESC}?25h${at(1, 1)}`);
  }
}

module.exports = { intro, outro };
