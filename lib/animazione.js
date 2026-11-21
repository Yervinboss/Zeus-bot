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
const clear = () => out(`${ESC}2J${ESC}H`);
const col = (len) => Math.max(1, Math.floor((W() - len) / 2) + 1);
const rand = (n) => Math.floor(Math.random() * n);

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

// Zeus è uno sprite 24x28 pixel: ogni cella del terminale = 2 pixel (▀ ▄)
const SW = 24, SH = 28, CH = SH / 2;
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
function aura(x, y, t) {
  const dx = x - 10.5, dy = y - 8.5;
  const d = Math.hypot(dx, dy);
  if (d >= 8.2 && d <= 9.6) {
    const seg = Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 8));
    if ((seg + (t >> 1)) % 3 !== 0) return RING[(seg + t) % RING.length];
  }
  if (x >= 16 && y <= 9 && Math.random() < 0.06) return SPARK_COLORS[rand(SPARK_COLORS.length)];
  return -1;
}

function tint(c, y, o) {
  if (o.drop && Math.random() < o.drop) {
    return Math.random() < 0.25 ? SPARK_COLORS[rand(SPARK_COLORS.length)] : -1;
  }
  if (o.scan !== undefined) {
    if (y >= o.scan + 2) return dim(c, 0.88);
    if (y >= o.scan) return 231;
  }
  return o.p ? dim(c, o.p) : c;
}
function layout() {
  const rows = H();
  const small = rows < 18 || W() < SW;
  const ch = small ? 0 : CH;
  const top = small ? 1 : Math.max(1, Math.min(rows - 19, 4 + Math.floor((rows - 24) / 2)));
  const subRow = top + ch;
  const barRow = subRow + 2;
  const statusRow = barRow + 1;
  return {
    small, top, subRow, barRow, statusRow,
    boltEnd: small ? 0 : top - 1,
    tipX: col(SW) + 21,
    end: Math.min(rows, statusRow + 2)
  };
}

function buildFrame(t, o = {}) {
  const bob = o.bob === undefined ? Math.round(Math.sin(t / 6) * 0.5 + 0.5) : o.bob;
  const g = [];
  for (let y = 0; y < SH; y++) {
    const row = new Array(SW).fill(-1);
    const sy = y - bob;
    for (let x = 0; x < SW; x++) {
      const ch = sy >= 0 ? SPRITE[sy][x] : '.';
      let c = -1;
      if (ch !== '.') c = colorOf(ch, x, sy, t, o);
      else if (o.fx) c = aura(x, y, t);
      row[x] = c >= 0 ? tint(c, y, o) : -1;
    }
    g.push(row);
  }
  return g;
}
function paint(L, g, dx = 0) {
  if (L.small) return;
  const left = Math.max(1, col(SW) + dx);
  let s = '';
  for (let r = 0; r < CH; r++) {
    let line = '', last = '';
    for (let x = 0; x < SW; x++) {
      const a = g[r * 2][x], b = g[r * 2 + 1][x];
      let st, ch;
      if (a < 0 && b < 0) { st = RESET; ch = ' '; }
      else if (b < 0) { st = ESC + '49m' + fg(a); ch = '▀'; }
      else if (a < 0) { st = ESC + '49m' + fg(b); ch = '▄'; }
      else { st = fg(a) + bg(b); ch = '▀'; }
      if (st !== last) { line += st; last = st; }
      line += ch;
    }
    s += at(L.top + r, left) + line + RESET;
  }
  out(s);
}

function flash(color) {
  const cols = W();
  const rows = H();
  const line = bg(color) + ' '.repeat(cols) + RESET;
  let s = '';
  for (let r = 1; r <= rows; r++) s += at(r, 1) + line;
  out(s);
}
function makeBolt(L) {
  const width = W();
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
  for (const c of cells.values()) {
    (byRow[c.r] = byRow[c.r] || []).push(c);
  }
  return { byRow, all: [...cells.values()] };
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
  const width = W();
  const c0 = col(SW);
  const r = L.top + rand(CH);
  let x;
  if (Math.random() < 0.6) {
    x = Math.random() < 0.5
      ? Math.max(1, c0 - 2 - rand(6))
      : Math.min(width, c0 + SW + 1 + rand(6));
  } else {
    x = Math.max(1, Math.min(width, c0 + rand(SW)));
  }
  return {
    r,
    x,
    ch: SPARK_CHARS[rand(SPARK_CHARS.length)],
    color: SPARK_COLORS[rand(SPARK_COLORS.length)],
    ttl: 2 + rand(3)
  };
}

function drawBar(L, pct, label) {
  const clamped = Math.max(0, Math.min(100, pct));
  const steps = 20;
  const filled = Math.round((clamped / 100) * steps);
  const bar = '█'.repeat(filled) + '░'.repeat(steps - filled);
  const color = clamped >= 100 ? 46 : clamped >= 65 ? 220 : 39;
  const cleanLabel = String(label || '').slice(0, 36).padEnd(36, ' ');

  out(
    at(L.barRow, col(27)) + fg(color) + `[${bar}] ${String(clamped).padStart(3, ' ')}%` + RESET +
    at(L.statusRow, col(36)) + fg(clamped >= 100 ? 46 : 250) + cleanLabel + RESET
  );
}

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
      clear(); drawBolt(bolt, TONE_HOT); paint(L, buildFrame(0, { p: 0.85 })); await sleep(105);
      flash(195); await sleep(30);
      clear(); drawBolt(bolt, TONE_HOT); paint(L, buildFrame(0, { p: 0.6 })); await sleep(85);
      drawBolt(bolt, TONE_DIM);
    }
    // l'energia scende nel corpo e lo accende riga per riga
    for (let k = 0; k <= SH; k += 2) {
      paint(L, buildFrame(k, { scan: k, bob: 0 }));
      await sleep(42);
    }
    // gli occhi si accendono
    for (let i = 0; i < 3; i++) {
      if (i === 0) vibra(60);
      paint(L, buildFrame(30 + i * 2, { fx: true, hit: true })); await sleep(70);
      paint(L, buildFrame(31 + i * 2, { fx: true })); await sleep(90);
    }

    const sub = '⚡ DIO DEL FULMINE ⚡';
    let typed = '';
    for (const ch of sub) {
      typed += ch;
      out(at(L.subRow, col(sub.length + 2)) + fg(39) + typed + RESET);
      await sleep(30);
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

  drawBar(L, 0, label);
  const timer = setInterval(() => {
    if (ended) return;
    t++;

    if (shown < target) {
      shown = Math.min(target, shown + Math.max(1, Math.ceil((target - shown) * 0.24)));
    }

    for (const sp of sparks) out(at(sp.r, sp.x) + ' ');
    sparks = sparks
      .map(sp => ({ ...sp, ttl: sp.ttl - 1 }))
      .filter(sp => sp.ttl > 0);
    if (!L.small && Math.random() < 0.45 && sparks.length < 6) sparks.push(makeSpark(L));

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

    paint(L, buildFrame(t, { fx: true, hit: flicker > 0 }));
    drawBar(L, shown, label);
    for (const sp of sparks) out(at(sp.r, sp.x) + fg(sp.color) + sp.ch + RESET);
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
async function outro() {
  if (!process.stdout.isTTY) return;
  out(`${ESC}?25l`);
  try {
    const L = layout();
    const bolt = L.boltEnd >= 3 ? makeBolt(L) : null;
    clear();
    paint(L, buildFrame(0, { fx: true }));
    await sleep(320);

    if (bolt) {
      vibra(280);
      flash(231); await sleep(55);
      clear(); drawBolt(bolt, TONE_HOT);
      paint(L, buildFrame(1, { fx: true, hit: true }));
      await sleep(150);
      drawBolt(bolt, TONE_DIM);
      await sleep(110);
    }
    for (let k = 0; k < 2; k++) {
      if (k === 0) vibra(60);
      flash(231); await sleep(45);
      clear(); paint(L, buildFrame(2 + k, { fx: true, hit: true })); await sleep(85);
    }

    // glitch elettrico
    for (let k = 0; k < 6; k++) {
      clear();
      paint(L, buildFrame(k, { fx: true, hit: k % 2 === 0 }), rand(7) - 3);
      await sleep(60);
    }

    // si dissolve in scintille
    for (let k = 1; k <= 12; k++) {
      paint(L, buildFrame(k, { fx: true, drop: k / 12, p: k / 16 }));
      await sleep(95);
    }

    clear();
    const msg = 'Il tuono tace... a presto ⚡';
    out(at(Math.floor(H() / 2), col(msg.length + 1)) + fg(244) + msg + RESET);
    await sleep(800);
    clear();
  } finally {
    out(`${ESC}?25h${at(1, 1)}`);
  }
}

module.exports = { intro, outro };
