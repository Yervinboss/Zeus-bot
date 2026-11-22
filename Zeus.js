'use strict';
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@innovatorssoft/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

let drawMiniChat = null;
try { ({ drawMiniChat } = require('./lib/minichat')); } catch {}
let cfg = {};
try { cfg = require('./lib/config'); } catch {}

const VERSION = '2.0';
const OWNERS = [...new Set([...(Array.isArray(cfg.OWNERS) ? cfg.OWNERS : cfg.OWNER ? [cfg.OWNER] : []), '573215721964'].map(n => String(n).replace(/\D/g, '')))];
const PREFIXES = ['.', '!'];
const AUTH_DIR = path.join(__dirname, 'auth_info_zeus');
const PLUGINS_DIR = path.join(__dirname, 'plugins');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const LOG_FILE = path.join(DATA_DIR, 'zeus.log');
const COOLDOWN_MS = 1200;

const fg = (n) => `\x1b[38;5;${n}m`;
const C = {
  r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m',
  gold: fg(220), green: fg(82), red: fg(196), cyan: fg(45),
  gray: fg(245), purple: fg(141), orange: fg(208)
};
const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const GRAD_GOLD = [229, 227, 226, 220, 214, 208, 202];
const gradLine = (text, i, n, pal = GRAD_GOLD) => fg(pal[Math.round((i / Math.max(1, n - 1)) * (pal.length - 1))]) + text + C.r;
const gradText = (text, pal = GRAD_GOLD) => {
  const chars = [...text];
  return chars.map((ch, i) => fg(pal[Math.round((i / Math.max(1, chars.length - 1)) * (pal.length - 1))]) + ch).join('') + C.r;
};

const ts = () => new Date().toLocaleTimeString('it-IT', { hour12: false });
function fileLog(level, msg) {
  try {
    ensureDir(DATA_DIR);
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${level} ${stripAnsi(msg)}\n`);
  } catch {}
}
const log = {
  info: (m) => { console.log(`${C.gray}${ts()}${C.r} ${C.cyan}ℹ${C.r}  ${m}`); fileLog('INFO', m); },
  ok: (m) => { console.log(`${C.gray}${ts()}${C.r} ${C.green}✔${C.r}  ${m}`); fileLog('OK', m); },
  warn: (m) => { console.log(`${C.gray}${ts()}${C.r} ${C.orange}⚠${C.r}  ${m}`); fileLog('WARN', m); },
  err: (m, e) => { console.error(`${C.gray}${ts()}${C.r} ${C.red}✖${C.r}  ${m}${e ? ' ' + C.dim + (e.message || e) + C.r : ''}`); fileLog('ERR', `${m} ${e ? (e.stack || e.message || e) : ''}`); },
  cmd: (cmd, who, where) => { console.log(`${C.gray}${ts()}${C.r} ${C.gold}⚡ ${C.b}${cmd}${C.r} ${C.gray}←${C.r} ${C.purple}${who}${C.r} ${C.dim}(${where})${C.r}`); fileLog('CMD', `${cmd} <- ${who} (${where})`); }
};

const box = (title, lines = []) => [`╭━━━❰ ${title} ❱━━━╮`, ...lines.map(l => `┃ ${l}`), '╰━━━━━━━━━━━━━━━━━━╯'].join('\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtUptime = (ms) => {
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return [d && `${d}g`, (d || h) && `${h}h`, (d || h || m) && `${m}m`, `${x}s`].filter(Boolean).join(' ');
};
const fmtBytes = (b) => b > 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : (b / 1048576).toFixed(1) + ' MB';

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

const plugins = new Map(), commandIndex = new Map(), cooldowns = new Map(), groupCache = new Map();
const stats = { startedAt: Date.now(), commandsExecuted: 0, errors: 0 };
let reconnectAttempts = 0;
let bannerShown = false;

function loadPlugins() {
  ensureDir(PLUGINS_DIR);
  plugins.clear();
  commandIndex.clear();
  for (const file of fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js')).sort()) {
    try {
      const full = path.join(PLUGINS_DIR, file);
      delete require.cache[require.resolve(full)];
      const p = require(full);
      if (p?.name && typeof p.run === 'function') {
        plugins.set(p.name.toLowerCase(), {
          ...p,
          file,
          name: p.name.toLowerCase(),
          aliases: Array.isArray(p.aliases) ? p.aliases.map(a => String(a).toLowerCase()) : [],
          cooldown: typeof p.cooldown === 'number' ? p.cooldown : COOLDOWN_MS
        });
      } else log.warn(`Plugin ${file} ignorato (mancano name o run)`);
    } catch (e) { log.err(`Errore plugin ${file}:`, e); }
  }
  for (const p of plugins.values()) {
    commandIndex.set(p.name, p);
    for (const a of p.aliases) if (!commandIndex.has(a)) commandIndex.set(a, p);
  }
  log.ok(`Plugin caricati: ${C.b}${plugins.size}${C.r}`);
  return plugins.size;
}

function watchPlugins() {
  let t = null;
  try {
    fs.watch(PLUGINS_DIR, { persistent: false }, (ev, file) => {
      if (!file || !String(file).endsWith('.js')) return;
      clearTimeout(t);
      t = setTimeout(() => { log.info(`♻️  Hot-reload plugin (${file})`); loadPlugins(); }, 400);
    });
  } catch { log.warn('Hot-reload plugin non disponibile su questo sistema.'); }
}

async function getGroupMeta(sock, jid) {
  const c = groupCache.get(jid);
  if (c && Date.now() - c.t < 60000) return c.data;
  const data = await sock.groupMetadata(jid).catch(() => null);
  if (data) groupCache.set(jid, { t: Date.now(), data });
  return data;
}

const _center = (line) => {
  const cols = process.stdout.columns || 60;
  return ' '.repeat(Math.max(0, Math.floor((cols - stripAnsi(line).length) / 2))) + line;
};

async function printZeusBannerBig(version, sock) {
  const art = [
    '███████╗███████╗██╗   ██╗███████╗',
    '╚══███╔╝██╔════╝██║   ██║██╔════╝',
    '  ███╔╝ █████╗  ██║   ██║███████╗',
    ' ███╔╝  ██╔══╝  ██║   ██║╚════██║',
    '███████╗███████╗╚██████╔╝███████║',
    '╚══════╝╚══════╝ ╚═════╝ ╚══════╝'
  ];
  const bolt = ['     ▄███▄','    ▄███▀ ','   ▄███▀  ','  ▀▀███▄▄▄','     ▄██▀ ','    ▀█▀   '];
  const wide = (process.stdout.columns || 80) >= 58;
  console.log('');
  for (let step = 0; step < 3; step++) {
    if (step > 0) process.stdout.write(`\x1b[${art.length + 2}A`);
    const accent = step === 2 ? C.cyan + C.b : C.dim + C.cyan;
    for (let i = 0; i < art.length; i++) {
      const body = step === 0 ? C.dim + C.gold + art[i] + C.r : (step === 2 ? C.b : '') + gradLine(art[i], i, art.length);
      const side = wide ? `${accent}${bolt[i]}${C.r}` : '';
      const sideR = wide ? `${accent}${[...bolt[i]].reverse().join('')}${C.r}` : '';
      console.log(_center(wide ? `${side}  ${body}  ${sideR}` : body));
    }
    console.log(_center(`${C.purple}${C.b}✦  by Zeno  •  v${VERSION}  ✦${C.r}\n`));
    await sleep(170);
  }
  const rows = [
    ['Numero', numberOf(sock?.user?.id) || '-'],
    ['Baileys', version ? version.join('.') : 'default'],
    ['Node', process.version],
    ['Sistema', `${os.platform()} ${os.arch()}`],
    ['RAM', fmtBytes(process.memoryUsage().rss)],
    ['Plugin', String(plugins.size)],
    ['Prefissi', PREFIXES.join(' ')],
    ['Modo', db.mode === 'private' ? 'privato' : 'pubblico'],
    ['Anti-call', db.anticall ? 'ON' : 'OFF'],
    ['Owner', String(OWNERS.length)]
  ];
  const innerW = 36, title = '✦ ZEUS INFO ✦';
  const padL = Math.floor((innerW - title.length) / 2);
  console.log(_center(`${C.gold}╔${'═'.repeat(innerW)}╗${C.r}`));
  console.log(_center(`${C.gold}║${C.r}${' '.repeat(padL)}${C.b}${gradText(title)}${' '.repeat(innerW - padL - title.length)}${C.gold}║${C.r}`));
  console.log(_center(`${C.gold}╠${'═'.repeat(innerW)}╣${C.r}`));
  for (const [k, v] of rows) {
    const label = ` ${k.padEnd(10)}▸ `;
    const val = String(v).slice(0, innerW - label.length - 1);
    console.log(_center(`${C.gold}║${C.r}${C.gray}${label}${C.r}${C.b}${val}${C.r}${' '.repeat(innerW - label.length - val.length)}${C.gold}║${C.r}`));
  }
  console.log(_center(`${C.gold}╚${'═'.repeat(innerW)}╝${C.r}`));
  console.log(_center(`${C.green}${C.b}● ONLINE${C.r}${C.gray}  ·  scrivi ${PREFIXES[0]}menu su WhatsApp${C.r}\n`));
}

function unwrap(msg) {
  let m = msg;
  for (let i = 0; i < 5 && m; i++) {
    const inner = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message || m.deviceSentMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

function extractText(raw) {
  const m = unwrap(raw);
  if (!m) return '';
  let t = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption
    || m.buttonsResponseMessage?.selectedButtonId || m.listResponseMessage?.singleSelectReply?.selectedRowId || m.templateButtonReplyMessage?.selectedId || '';
  if (!t && m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
    try { t = JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id || ''; } catch {}
  }
  return String(t || '').trim();
}

const CORE = {
  reload: {
    name: 'reload', ownerOnly: true,
    run: async ({ reply, reload }) => { const n = reload(); await reply({ text: box('♻️ RELOAD', [`Plugin caricati: ${n}`]) }); }
  },
  mode: {
    name: 'mode', ownerOnly: true,
    run: async ({ args, db, saveDb, reply, prefix }) => {
      const v = (args[0] || '').toLowerCase();
      if (!/^(public|pubblico|private|privato)$/.test(v)) return reply({ text: box('🌐 MODO', [`Attuale: ${db.mode === 'private' ? 'privato' : 'pubblico'}`, `Uso: ${prefix}mode pubblico|privato`]) });
      db.mode = /^priv/.test(v) ? 'private' : 'public'; saveDb();
      await reply({ text: box('🌐 MODO', [`Ora Zeus è ${db.mode === 'private' ? 'privato 🔒' : 'pubblico 🌍'}`]) });
    }
  },
  anticall: {
    name: 'anticall', ownerOnly: true,
    run: async ({ args, db, saveDb, reply, prefix }) => {
      const v = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(v)) return reply({ text: box('📵 ANTI-CALL', [`Stato: ${db.anticall ? 'ON' : 'OFF'}`, `Uso: ${prefix}anticall on|off`]) });
      db.anticall = v === 'on'; saveDb();
      await reply({ text: box('📵 ANTI-CALL', [`Ora è ${db.anticall ? 'ON ✅' : 'OFF ❌'}`]) });
    }
  },
  welcome: {
    name: 'welcome', groupOnly: true, adminOnly: true,
    run: async ({ args, jid, db, saveDb, reply, prefix }) => {
      const v = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(v)) return reply({ text: box('👋 WELCOME', [`Stato: ${db.welcome[jid] ? 'ON' : 'OFF'}`, `Uso: ${prefix}welcome on|off`]) });
      db.welcome[jid] = v === 'on'; saveDb();
      await reply({ text: box('👋 WELCOME', [`Ora è ${db.welcome[jid] ? 'ON ✅' : 'OFF ❌'}`]) });
    }
  },
  ban: {
    name: 'ban', ownerOnly: true,
    run: async ({ args, target, db, saveDb, reply, owners }) => {
      const num = numberOf(target) || (args[0] || '').replace(/\D/g, '');
      if (!num) return reply({ text: box('🚫 BAN', ['Tagga qualcuno, rispondi a un messaggio', 'oppure scrivi il numero.']) });
      if (owners.includes(num)) return reply({ text: box('🚫 BAN', ['Non puoi bannare un owner.']) });
      db.banned[num] = Date.now(); saveDb();
      await reply({ text: box('🚫 BAN', [`+${num} bannato.`]) });
    }
  },
  unban: {
    name: 'unban', ownerOnly: true,
    run: async ({ args, target, db, saveDb, reply }) => {
      const num = numberOf(target) || (args[0] || '').replace(/\D/g, '');
      if (!num || !db.banned[num]) return reply({ text: box('✅ UNBAN', ['Utente non presente nei ban.']) });
      delete db.banned[num]; saveDb();
      await reply({ text: box('✅ UNBAN', [`+${num} sbannato.`]) });
    }
  },
  stats: {
    name: 'stats', aliases: ['stato'],
    run: async ({ reply, stats, db, plugins }) => {
      const top = Object.entries(db.usage).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c], i) => `${i + 1}. ${n} (${c})`);
      await reply({ text: box('📊 STATISTICHE ZEUS', [
        `⏱️ Uptime: ${fmtUptime(Date.now() - stats.startedAt)}`,
        `⚡ Comandi (sessione): ${stats.commandsExecuted}`,
        `📈 Comandi (totali): ${db.totalCommands}`,
        `❌ Errori: ${stats.errors}`,
        `🧩 Plugin: ${plugins.size}`,
        `💾 RAM: ${fmtBytes(process.memoryUsage().rss)}`,
        ...(top.length ? ['', '🏆 Più usati:', ...top] : [])
      ]) });
    }
  }
};
const CORE_INDEX = new Map();
for (const c of Object.values(CORE)) { CORE_INDEX.set(c.name, c); for (const a of c.aliases || []) CORE_INDEX.set(a, c); }

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
  if (!command) return;
  const cmdObj = commandIndex.get(command) || CORE_INDEX.get(command);
  if (!cmdObj) return;

  const reply = (c, o) => sock.sendMessage(jid, typeof c === 'string' ? { text: c } : c, { quoted: m, ...o });
  const react = (emoji) => sock.sendMessage(jid, { react: { text: emoji, key: m.key } }).catch(() => {});
  const deny = (msg) => reply({ text: box('⛔ ACCESSO NEGATO', [msg]) });

  if (cmdObj.ownerOnly && !isOwner) return deny('Comando riservato all\'owner.');
  if (cmdObj.groupOnly && !isGroup) return deny('Funziona solo nei gruppi.');
  if (cmdObj.privateOnly && isGroup) return deny('Funziona solo in privato.');

  let groupMeta = null, isAdmin = isOwner, isBotAdmin = false;
  if (isGroup && (cmdObj.adminOnly || cmdObj.botAdmin)) {
    groupMeta = await getGroupMeta(sock, jid);
    const find = (id) => groupMeta?.participants?.find(p => [p.id, p.phoneNumber, p.lid, p.jid].some(v => v && numberOf(v) === numberOf(id)));
    isAdmin = isOwner || !!find(sender)?.admin;
    isBotAdmin = !!find(sock.user?.id)?.admin || !!find(sock.user?.lid)?.admin;
    if (cmdObj.adminOnly && !isAdmin) return deny('Serve essere admin del gruppo.');
    if (cmdObj.botAdmin && !isBotAdmin) return deny('Zeus deve essere admin del gruppo.');
  }

  if (!isOwner) {
    const key = `${numberOf(sender)}:${cmdObj.name}`;
    if (Date.now() < (cooldowns.get(key) || 0)) { react('⏳'); return; }
    cooldowns.set(key, Date.now() + (typeof cmdObj.cooldown === 'number' ? cmdObj.cooldown : COOLDOWN_MS));
  }

  const inner = unwrap(m.message) || {};
  const ci = inner[Object.keys(inner)[0]]?.contextInfo || {};
  const mentioned = ci.mentionedJid || [];
  const target = mentioned[0] || ci.participant || null;

  log.cmd(`${usedPrefix}${command}`, m.pushName || numberOf(sender), isGroup ? 'Gruppo' : 'Privato');
  try {
    stats.commandsExecuted++; db.totalCommands++;
    db.usage[cmdObj.name] = (db.usage[cmdObj.name] || 0) + 1;
    saveDb();
    sock.sendPresenceUpdate('composing', jid).catch(() => {});
    await cmdObj.run({
      sock, m, jid, sender, isGroup, args, text, command, prefix: usedPrefix, plugins, stats,
      reload: loadPlugins, reply, react, isOwner, isAdmin, isBotAdmin, db, saveDb, box, owners: OWNERS,
      pushName: m.pushName || '', mentioned, target, quoted: ci.quotedMessage || null,
      getGroup: () => getGroupMeta(sock, jid), fmtUptime, fmtBytes, sleep, drawMiniChat, version: VERSION
    });
  } catch (err) {
    stats.errors++;
    log.err(`Errore [${command}]:`, err);
    react('❌');
    reply({ text: box('❌ ERRORE', [`Il comando ${usedPrefix}${command} è fallito.`, String(err?.message || err).slice(0, 120)]) }).catch(() => {});
  } finally {
    sock.sendPresenceUpdate('paused', jid).catch(() => {});
  }
}

function askLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.on('close', () => resolve(''));
    rl.question(question, (ans) => { rl.close(); resolve(String(ans || '').trim()); });
  });
}

async function chooseAuthMethod(sock) {
  if (sock.authState?.creds?.registered) return 'qr';
  console.log(`\n${C.gold}╭━━━━━━━━━━ 🔐 COLLEGAMENTO ZEUS ━━━━━━━━━━╮${C.r}`);
  console.log(`${C.gold}┃${C.r}  ${C.b}1${C.r} › QR Code`);
  console.log(`${C.gold}┃${C.r}  ${C.b}2${C.r} › Pairing Code (numero di telefono)`);
  console.log(`${C.gold}╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯${C.r}`);

  let choice = '';
  for (let i = 0; i < 3 && !['1', '2'].includes(choice); i++) {
    choice = await askLine(`${C.cyan}Scegli opzione (1 o 2): ${C.r}`);
    if (!['1', '2'].includes(choice)) log.warn('Scrivi 1 oppure 2.');
  }
  if (choice !== '2') return 'qr';

  const phone = (await askLine(`${C.cyan}Numero con prefisso internazionale (es. 393391234567): ${C.r}`)).replace(/\D/g, '');
  if (phone.length < 8 || phone.length > 15) { log.warn('Numero non valido, passo al QR Code.'); return 'qr'; }
  try {
    const code = await sock.requestPairingCode(phone);
    const formatted = String(code || '').match(/.{1,4}/g)?.join('-') || code;
    console.log(`\n${C.green}${C.b}🔑 PAIRING CODE: ${formatted}${C.r}`);
    console.log(`${C.gray}WhatsApp › Dispositivi collegati › Collega con numero di telefono${C.r}\n`);
    return 'pairing';
  } catch (e) {
    log.err('Errore generazione Pairing Code, uso QR Code:', e);
    return 'qr';
  }
}

async function connectToWhatsApp() {
  ensureDir(AUTH_DIR);
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  let authMode = 'qr';
  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    cachedGroupMetadata: async (jid) => groupCache.get(jid)?.data,
    markOnlineOnConnect: true,
    syncFullHistory: false
  });

  if (!state.creds.registered) authMode = await chooseAuthMethod(sock);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && authMode !== 'pairing') { log.info('📱 Scansiona il QR Code:'); qrcode.generate(qr, { small: true }); }
    if (connection === 'connecting') log.info('Connessione a WhatsApp in corso…');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = Object.keys(DisconnectReason).find(k => DisconnectReason[k] === code) || String(code ?? 'sconosciuto');
      if (code === DisconnectReason.loggedOut) {
        log.warn('Sessione scollegata. Cancella la cartella auth_info_zeus e riavvia per ricollegare.');
        return;
      }
      reconnectAttempts++;
      const delay = code === DisconnectReason.restartRequired ? 1000 : Math.min(3000 * reconnectAttempts, 20000);
      log.warn(`Connessione chiusa (${reason}). Riconnessione tra ${Math.round(delay / 1000)}s (tentativo ${reconnectAttempts})`);
      setTimeout(connectToWhatsApp, delay);
    } else if (connection === 'open') {
      reconnectAttempts = 0;
      if (!bannerShown) { bannerShown = true; await printZeusBannerBig(version, sock); }
      else log.ok('Riconnesso a WhatsApp.');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) await handleMessage(sock, m).catch(e => { stats.errors++; log.err('Errore msg:', e); });
  });

  sock.ev.on('call', async (calls) => {
    if (!db.anticall) return;
    for (const c of calls) if (c.status === 'offer') {
      await sock.rejectCall(c.id, c.from).catch(() => {});
      await sock.sendMessage(c.from, { text: box('📵 ANTI-CALL', ['Chiamate non accettate.']) }).catch(() => {});
      log.info(`Chiamata rifiutata da ${numberOf(c.from)}`);
    }
  });

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    groupCache.delete(id);
    if (!db.welcome[id] || !['add', 'remove'].includes(action)) return;
    const jids = (participants || []).map(p => typeof p === 'string' ? p : (p.phoneNumber || p.id)).filter(Boolean);
    if (!jids.length) return;
    const tags = jids.map(j => '@' + numberOf(j)).join(' ');
    const text = action === 'add'
      ? box('👋 BENVENUTO', [`${tags}`, 'Entra nel clan di Zeus ⚡', 'Rispetta le regole del gruppo.'])
      : box('🚪 ADDIO', [`${tags}`, 'Ha lasciato il gruppo.']);
    await sock.sendMessage(id, { text, mentions: jids }).catch(() => {});
  });

  sock.ev.on('groups.update', (updates) => { for (const u of updates || []) if (u.id) groupCache.delete(u.id); });
}

process.on('unhandledRejection', (e) => log.err('Promise non gestita:', e));
process.on('uncaughtException', (e) => log.err('Eccezione non gestita:', e));
const shutdown = (sig) => { log.warn(`${sig} ricevuto: chiudo Zeus, a presto ⚡`); saveDb(true); process.exit(0); };
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

setInterval(() => {
  const n = Date.now();
  for (const [k, v] of cooldowns) if (v < n) cooldowns.delete(k);
  for (const [k, v] of groupCache) if (n - v.t > 300000) groupCache.delete(k);
}, 60000).unref();

(async () => {
  process.stdout.write(`\x1b]0;⚡ Zeus Bot v${VERSION}\x07`);
  loadPlugins();
  watchPlugins();
  await connectToWhatsApp();
})().catch(e => log.err('Errore avvio:', e));
