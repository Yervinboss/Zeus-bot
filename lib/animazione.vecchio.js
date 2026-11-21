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

const LETTERS = {
  Z: ['█████', '   █ ', '  █  ', ' █   ', '█████'],
  E: ['█████', '█    ', '████ ', '█    ', '█████'],
  U: ['█   █', '█   █', '█   █', '█   █', ' ███ '],
  S: [' ████', '█    ', ' ███ ', '    █', '████ ']
};
const WORD = ['Z', 'E', 'U', 'S'];
const LOGO_W = 23;
const GOLD = [229, 226, 220, 214, 208];
const WAVE = [94, 130, 172, 214, 220, 226, 229, 231, 229, 226, 220, 214, 172, 130, 94];
const FADE = [220, 214, 208, 172, 130, 94, 240, 238, 236, 234];
const SPARK_CHARS = ['✦', '✧', '⚡', '·', '*'];
const SPARK_COLORS = [231, 226, 220, 39, 195];

const logoLine = (r, count) =>
  WORD.map((ch, i) => (i < count ? LETTERS[ch][r] : '     ')).join(' ');

function layout() {
  const rows = H();
  const logoTop = Math.max(3, Math.min(rows - 12, Math.floor(rows * 0.42)));
  const subRow = logoTop + 6;
  const barRow = subRow + 2;
  const statusRow = barRow + 1;
  return {
    logoTop, subRow, barRow, statusRow,
    boltEnd: logoTop - 1,
    end: Math.min(rows, statusRow + 2)
  };
}

function drawLogo(L, count, colorFn, dx = 0) {
  let s = '';
  for (let r = 0; r < 5; r++) {
    s += at(L.logoTop + r, Math.max(1, col(LOGO_W) + dx)) + fg(colorFn(r)) + logoLine(r, count) + RESET;
  }
  out(s);
}

function drawWave(L, t) {
  const n = WAVE.length;
  let s = '';
  for (let r = 0; r < 5; r++) {
    const line = logoLine(r, 4);
    let row = '';
    let last = -1;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === ' ') { row += ' '; continue; }
      const c = WAVE[(((i + r - t) % n) + n) % n];
      if (c !== last) { row += fg(c); last = c; }
      row += ch;
    }
    s += at(L.logoTop + r, col(LOGO_W)) + row + RESET;
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
  const targetX = Math.floor(width / 2);
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
    let dir = Math.random() < 0.5 ? -1 : 1;
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
  const logoCol = col(LOGO_W);
  const minR = Math.max(1, L.logoTop - 2);
  const maxR = Math.min(H(), L.logoTop + 6);
  const r = minR + rand(Math.max(1, maxR - minR + 1));

  let x;
  if (Math.random() < 0.55) {
    const leftSide = Math.random() < 0.5;
    x = leftSide
      ? Math.max(1, logoCol - 2 - rand(6))
      : Math.min(width, logoCol + LOGO_W + 2 + rand(6));
  } else {
    x = Math.max(1, Math.min(width, logoCol + rand(LOGO_W)));
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
  const bolt = L.boltEnd >= 4 ? makeBolt(L) : null;

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
      clear(); drawBolt(bolt, TONE_HOT); await sleep(105);
      flash(195); await sleep(30);
      clear(); drawBolt(bolt, TONE_HOT); await sleep(85);
      drawBolt(bolt, TONE_DIM);
    }

    for (let i = 1; i <= 4; i++) {
      drawLogo(L, i, () => 231);
      await sleep(100);
      drawLogo(L, i, (r) => GOLD[r]);
      await sleep(145);
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

    // Pulisce vecchie scintille prima di ridisegnare onde e barra
    for (const sp of sparks) {
      out(at(sp.r, sp.x) + ' ');
    }
    sparks = sparks
      .map(sp => ({ ...sp, ttl: sp.ttl - 1 }))
      .filter(sp => sp.ttl > 0);

    if (Math.random() < 0.45 && sparks.length < 6) {
      sparks.push(makeSpark(L));
    }

    drawWave(L, t);
    drawBar(L, shown, label);

    for (const sp of sparks) {
      out(at(sp.r, sp.x) + fg(sp.color) + sp.ch + RESET);
    }

    if (bolt) {
      if (flicker > 0) {
        flicker--;
        if (flicker === 0) drawBolt(bolt, TONE_DIM);
      } else if (Math.random() < 0.045) {
        drawBolt(bolt, TONE_HOT);
        flicker = 1 + rand(2);
      }
    }
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
    const bolt = L.boltEnd >= 4 ? makeBolt(L) : null;
    clear();
    drawLogo(L, 4, (r) => GOLD[r]);
    await sleep(320);

    if (bolt) {
      vibra(280);
      flash(231); await sleep(55);
      clear(); drawLogo(L, 4, (r) => GOLD[r]); drawBolt(bolt, TONE_HOT);
      await sleep(150);
      drawBolt(bolt, TONE_DIM);
      await sleep(110);
    }
    for (let k = 0; k < 2; k++) {
      if (k === 0) vibra(60);
      flash(231); await sleep(45);
      clear(); drawLogo(L, 4, (r) => GOLD[r]); await sleep(85);
    }

    const colors = [231, 39, 208, 226];
    for (let k = 0; k < 6; k++) {
      clear();
      drawLogo(L, 4, () => colors[rand(colors.length)], rand(7) - 3);
      await sleep(60);
    }

    for (let k = 0; k < FADE.length + 5; k++) {
      drawLogo(L, 4, (r) => FADE[Math.min(FADE.length - 1, Math.max(0, k - r))]);
      await sleep(105);
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
