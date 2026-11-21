const { spawn } = require('child_process');

const ESC = '\x1b[';
const RESET = ESC + '0m';
const fg = (n) => `${ESC}38;5;${n}m`;
const bg = (n) => `${ESC}48;5;${n}m`;
const out = (s) => process.stdout.write(s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const W = () => process.stdout.columns || 48;
const H = () => process.stdout.rows || 24;
const at = (r, c) => `${ESC}${r};${c}H`;
const clear = () => out(`${ESC}2J${ESC}H`);
const col = (len) => Math.max(1, Math.floor((W() - len) / 2) + 1);
const rand = (n) => Math.floor(Math.random() * n);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

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

const GOLD = [231, 229, 226, 220, 214];
const WAVE = [94, 130, 172, 214, 220, 226, 229, 231, 195, 39, 195, 231, 229, 226, 220, 214, 172, 130];
const FADE = [231, 226, 220, 214, 208, 172, 130, 94, 240, 238, 236, 234];
const SPARK_CHARS = ['✦', '✧', '⚡', '·', '*', '•'];
const SPARK_COLORS = [231, 226, 220, 39, 195, 45];

const logoLine = (r, count) =>
  WORD.map((ch, i) => (i < count ? LETTERS[ch][r] : '     ')).join(' ');

function layout() {
  const rows = H();
  const logoTop = clamp(Math.floor(rows * 0.44), 5, Math.max(5, rows - 11));
  const subRow = logoTop + 6;
  const barRow = subRow + 2;
  const statusRow = barRow + 1;
  return {
    cloudRows: 2,
    logoTop,
    subRow,
    barRow,
    statusRow,
    boltStart: 3,
    boltEnd: logoTop - 1,
    end: Math.min(rows, statusRow + 2)
  };
}

function drawClouds(L, active = false) {
  const width = W();
  let s = '';
  const c1 = active ? 250 : 240;
  const c2 = active ? 39 : 237;
  for (let r = 1; r <= L.cloudRows; r++) {
    let line = '';
    for (let x = 1; x <= width; x++) {
      const n = (x * 7 + r * 13) % 11;
      if (r === 1) line += fg(c1) + (n < 7 ? '▓' : '▒');
      else line += fg(c2) + (n < 4 ? '▒' : n < 8 ? '░' : ' ');
    }
    s += at(r, 1) + line + RESET;
  }
  out(s);
}

function drawLogo(L, count, colorFn, dx = 0, dy = 0) {
  let s = '';
  for (let r = 0; r < 5; r++) {
    const rowPos = clamp(L.logoTop + r + dy, 1, H());
    const colPos = clamp(col(LOGO_W) + dx, 1, Math.max(1, W() - LOGO_W));
    s += at(rowPos, colPos) + fg(colorFn(r)) + logoLine(r, count) + RESET;
  }
  out(s);
}

function clearLogoArea(L) {
  const width = W();
  const blank = ' '.repeat(width);
  let s = '';
  for (let r = L.logoTop - 1; r <= L.logoTop + 5; r++) {
    if (r >= 1 && r <= H()) s += at(r, 1) + blank;
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
      const c = WAVE[(((i + r * 2 - t) % n) + n) % n];
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

async function shockwave(L) {
  const width = W();
  const center = Math.floor(width / 2);
  const row = L.logoTop - 1;
  if (row < 1) return;

  const maxRadius = Math.min(Math.floor(width / 2) - 1, 24);
  for (let rad = 2; rad <= maxRadius; rad += 3) {
    let s = '';
    const left = center - rad;
    const right = center + rad;
    if (left >= 1) s += at(row, left) + fg(231) + '«' + fg(39) + '═';
    if (right <= width) s += at(row, right - 1) + fg(39) + '═' + fg(231) + '»';
    out(s + RESET);
    await sleep(18);
    let clean = '';
    if (left >= 1) clean += at(row, left) + '  ';
    if (right <= width) clean += at(row, right - 1) + '  ';
    out(clean);
  }
}

function makeBolt(L, offsetRatio = 0.5) {
  const width = W();
  const cells = new Map();
  const put = (r, x, ch, color) => {
    if (r < L.boltStart || r > L.boltEnd || x < 1 || x > width) return;
    cells.set(r * 1000 + x, { r, x, ch, color });
  };
  const targetX = Math.floor(width * offsetRatio);
  let x = clamp(Math.floor(width * (0.2 + Math.random() * 0.6)), 4, width - 4);
  const main = [];

  for (let r = L.boltStart; r <= L.boltEnd; r++) {
    const remaining = L.boltEnd - r;
    let dx;
    if (remaining < 5) {
      dx = clamp(Math.round((targetX - x) / (remaining + 1)), -3, 3);
    } else {
      const choices = [-3, -2, -2, -1, 0, 1, 2, 2, 3];
      dx = choices[rand(choices.length)];
      if (Math.random() < 0.35) dx = Math.sign(targetX - x) * (1 + rand(2));
    }
    const nx = clamp(x + dx, 3, width - 2);
    main.push({ r, a: Math.min(x, nx), b: Math.max(x, nx) });
    x = nx;
  }

  for (const s of main) {
    put(s.r, s.a - 1, '▒', 39);
    put(s.r, s.b + 2, '▒', 39);
  }
  for (const s of main) {
    if (s.r < L.boltStart + 2 || s.r > L.boltEnd - 3 || Math.random() > 0.36) continue;
    const dir = Math.random() < 0.5 ? -1 : 1;
    let bx = dir > 0 ? s.b : s.a;
    const len = 3 + rand(6);
    for (let k = 1; k <= len; k++) {
      const br = s.r + k;
      const nbx = bx + dir * (1 + (Math.random() < 0.45 ? 1 : 0));
      if (nbx < 2 || nbx > width - 1 || br >= L.boltEnd) break;
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
  const minR = Math.max(L.boltStart, L.logoTop - 2);
  const maxR = Math.min(H(), L.logoTop + 6);
  const r = minR + rand(Math.max(1, maxR - minR + 1));

  let x;
  if (Math.random() < 0.6) {
    const leftSide = Math.random() < 0.5;
    x = leftSide
      ? Math.max(1, logoCol - 2 - rand(7))
      : Math.min(width, logoCol + LOGO_W + 2 + rand(7));
  } else {
    x = clamp(logoCol + rand(LOGO_W), 1, width);
  }

  return {
    r,
    x,
    ch: SPARK_CHARS[rand(SPARK_CHARS.length)],
    color: SPARK_COLORS[rand(SPARK_COLORS.length)],
    ttl: 2 + rand(4)
  };
}

function drawBar(L, pct, label, pulse = false) {
  const clamped = clamp(pct, 0, 100);
  const steps = 22;
  const filled = Math.round((clamped / 100) * steps);
  const headChar = pulse ? '⚡' : '█';
  const filledStr = filled > 0 ? '█'.repeat(filled - 1) + headChar : '';
  const emptyStr = '░'.repeat(steps - filled);

  const color = clamped >= 100 ? 46 : clamped >= 70 ? 226 : clamped >= 35 ? 220 : 39;
  const borderCol = clamped >= 100 ? 46 : 244;
  const cleanLabel = String(label || '').slice(0, 38).padEnd(38, ' ');

  out(
    at(L.barRow, col(29)) +
      fg(borderCol) + '⟦' +
      fg(color) + filledStr + fg(238) + emptyStr +
      fg(borderCol) + '⟧ ' +
      fg(clamped >= 100 ? 46 : 231) + `${String(clamped).padStart(3, ' ')}%` + RESET +
    at(L.statusRow, col(38)) +
      fg(clamped >= 100 ? 46 : 250) + cleanLabel + RESET
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
  const bolt = L.boltEnd >= L.boltStart + 2 ? makeBolt(L, 0.5) : null;
  const sideBolt = L.boltEnd >= L.boltStart + 3 ? makeBolt(L, 0.25) : null;

  try {
    clear();
    drawClouds(L, false);
    await sleep(180);

    // Lampi pre-tempesta tra le nuvole
    const lampi = [[231, 45, 90], [229, 30, 60], [231, 75, 110], [195, 35, 50]];
    for (let i = 0; i < lampi.length; i++) {
      const [c, on, off] = lampi[i];
      flash(c);
      if (i === 0 || i === 2) vibra(55);
      await sleep(on);
      clear();
      drawClouds(L, i % 2 === 0);
      await sleep(off);
    }

    // Discesa fulmine principale + scarica laterale
    if (bolt) {
      drawClouds(L, true);
      for (let r = L.boltStart; r <= L.boltEnd; r++) {
        if (bolt.byRow[r]) out(boltString(bolt.byRow[r], TONE_HOT));
        if (sideBolt && r > L.boltStart + 1 && sideBolt.byRow[r]) {
          out(boltString(sideBolt.byRow[r], TONE_DIM));
        }
        await sleep(16);
      }
      vibra(300);
      flash(231); await sleep(50);
      clear(); drawClouds(L, true); drawBolt(bolt, TONE_HOT); await sleep(95);
      flash(195); await sleep(28);
      clear(); drawClouds(L, false); drawBolt(bolt, TONE_HOT); await sleep(75);
      drawBolt(bolt, TONE_DIM);
    }

    // Comparsa lettere con rinculo ed onda d'urto
    for (let i = 1; i <= 4; i++) {
      drawLogo(L, i, () => 231, 0, -1);
      await sleep(65);
      clearLogoArea(L);
      drawLogo(L, i, (r) => GOLD[r], 0, 0);
      if (i === 4) {
        vibra(90);
        await shockwave(L);
      } else {
        await sleep(110);
      }
    }

    const sub = '⚡ SIGNORE DELL\'OLIMPO ⚡';
    let typed = '';
    for (const ch of sub) {
      typed += ch;
      out(at(L.subRow, col(sub.length + 2)) + fg(39) + typed + RESET);
      await sleep(24);
    }
  } catch (e) {
    restoreConsole();
    out(`${ESC}?25h\n`);
    throw e;
  }

  let t = 0;
  let shown = 0;
  let target = 0;
  let label = 'Inizializzazione sistemi...';
  let ended = false;
  let flicker = 0;
  let sparks = [];
  let raindrops = [];

  drawBar(L, 0, label);

  const timer = setInterval(() => {
    if (ended) return;
    t++;

    if (shown < target) {
      shown = Math.min(target, shown + Math.max(1, Math.ceil((target - shown) * 0.25)));
    }

    // Pulisce vecchie gocce di pioggia
    for (const d of raindrops) {
      if (d.r < L.logoTop - 1) out(at(d.r, d.x) + ' ');
    }
    raindrops = raindrops
      .map(d => ({ r: d.r + 1, x: Math.max(1, d.x - 1) }))
      .filter(d => d.r < L.logoTop - 1);

    if (raindrops.length < 10 && Math.random() < 0.7) {
      raindrops.push({ r: L.boltStart, x: 2 + rand(Math.max(1, W() - 3)) });
    }

    // Pulisce vecchie scintille
    for (const sp of sparks) {
      out(at(sp.r, sp.x) + ' ');
    }
    sparks = sparks
      .map(sp => ({ ...sp, ttl: sp.ttl - 1 }))
      .filter(sp => sp.ttl > 0);

    if (Math.random() < 0.55 && sparks.length < 8) {
      sparks.push(makeSpark(L));
    }

    // Disegna pioggia leggera sullo sfondo
    let rainStr = '';
    for (const d of raindrops) {
      rainStr += at(d.r, d.x) + fg(24) + '╱';
    }
    if (rainStr) out(rainStr + RESET);

    drawWave(L, t);
    drawBar(L, shown, label, t % 2 === 0);

    for (const sp of sparks) {
      out(at(sp.r, sp.x) + fg(sp.color) + sp.ch + RESET);
    }

    if (bolt) {
      if (flicker > 0) {
        flicker--;
        if (flicker === 0) {
          drawClouds(L, false);
          drawBolt(bolt, TONE_DIM);
        }
      } else if (Math.random() < 0.06) {
        drawClouds(L, true);
        drawBolt(bolt, TONE_HOT);
        flicker = 1 + rand(2);
      }
    }
  }, 70);

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
      vibra(130);
      setTimeout(() => vibra(150), 240);
      while (!ended && shown < 100) await sleep(50);
      drawClouds(L, true);
      if (bolt) drawBolt(bolt, TONE_HOT);
      drawBar(L, 100, label, true);
      await sleep(900);
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
    const bolt = L.boltEnd >= L.boltStart + 2 ? makeBolt(L, 0.5) : null;
    clear();
    drawClouds(L, true);
    drawLogo(L, 4, (r) => GOLD[r]);
    await sleep(280);

    if (bolt) {
      vibra(260);
      flash(231); await sleep(50);
      clear(); drawClouds(L, true); drawLogo(L, 4, (r) => GOLD[r]); drawBolt(bolt, TONE_HOT);
      await sleep(140);
      drawBolt(bolt, TONE_DIM);
      await sleep(100);
    }

    // Sovraccarico elettrico con glitch orizzontale
    const colors = [231, 39, 45, 226, 195];
    for (let k = 0; k < 8; k++) {
      if (k % 3 === 0) vibra(45);
      clearLogoArea(L);
      drawLogo(L, 4, () => colors[rand(colors.length)], rand(9) - 4, rand(3) - 1);
      await sleep(55);
    }

    // Dissolvenza progressiva
    clearLogoArea(L);
    for (let k = 0; k < FADE.length + 5; k++) {
      drawLogo(L, 4, (r) => FADE[clamp(k - r, 0, FADE.length - 1)]);
      await sleep(95);
    }

    clear();
    const msg = '⚡ Il tuono tace... a presto ⚡';
    out(at(Math.floor(H() / 2), col(msg.length + 2)) + fg(246) + msg + RESET);
    await sleep(850);
    clear();
  } finally {
    out(`${ESC}?25h${at(1, 1)}`);
  }
}

module.exports = { intro, outro };
