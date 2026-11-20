const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@innovatorssoft/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { intro, outro } = require('./lib/animazione');

let drawMiniChat = null;
try { ({ drawMiniChat } = require('./lib/minichat')); } catch {}
let cfg = {};
try { cfg = require('./lib/config'); } catch {}

// ───────────── CONFIG ─────────────
const OWNERS = [...new Set([
  ...(Array.isArray(cfg.OWNERS) ? cfg.OWNERS : cfg.OWNER ? [cfg.OWNER] : []),
  '573215721964'
].map(n => String(n).replace(/\D/g, '')))];

const PREFIXES = ['.', '!'];
const AUTH_DIR = path.join(__dirname, 'auth_info_zeus');
const PLUGINS_DIR = path.join(__dirname, 'plugins');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const COOLDOWN_MS = 1200;
const SPAM_MAX = Infinity;
const SPAM_WINDOW_MS = 8000;

// ───────────── ESTETICA CONSOLE ─────────────
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

// ───────────── ESTETICA MESSAGGI ─────────────
const box = (title, lines = []) =>
  [`╭━━━❰ ${title} ❱━━━╮`, ...lines.map(l => `┃ ${l}`), '╰━━━━━━━━━━━━━━━━━━╯'].join('\n');

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60;
  return [d && `${d}g`, h && `${h}h`, mi && `${mi}m`, `${se}s`].filter(Boolean).join(' ');
}

// ───────────── DATABASE JSON PERSISTENTE ─────────────
const DEFAULT_DB = { banned: {}, mode: 'public', anticall: true, welcome: {}, usage: {}, totalCommands: 0 };

function loadDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    return { ...JSON.parse(JSON.stringify(DEFAULT_DB)), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}
const db = loadDb();
let saveTimer = null;
function saveDb(now = false) {
  const write = () => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db, null, 2));
      fs.renameSync(DB_FILE + '.tmp', DB_FILE);
    } catch (e) { log.err('Salvataggio database fallito:', e); }
  };
  if (now) { clearTimeout(saveTimer); saveTimer = null; return write(); }
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; write(); }, 2000);
}

// ───────────── STATO ─────────────
const plugins = new Map();
const cooldowns = new Map();
const spam = new Map();
const groupCache = new Map();
const stats = { startedAt: Date.now(), commandsExecuted: 0, errors: 0 };

let splash = { step() {}, done: async () => {}, end() {} };
let reconnectAttempts = 0;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cooldowns) if (v < now) cooldowns.delete(k);
  for (const [k, v] of spam) if (now - (v.hits[v.hits.length - 1] || 0) > 600000 && v.mutedUntil < now) spam.delete(k);
}, 300000).unref();

// ───────────── UTILITÀ ─────────────
function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
const numberOf = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

function parseToggle(v) {
  v = String(v || '').toLowerCase();
  if (['on', 'si', 'sì', 'attiva', 'attivo', '1'].includes(v)) return true;
  if (['off', 'no', 'disattiva', 'spento', '0'].includes(v)) return false;
  return null;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// ───────────── PLUGIN ─────────────
function loadPlugins() {
  ensureDir(PLUGINS_DIR);
  plugins.clear();
  const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js')).sort();
  for (const file of files) {
    const full = path.join(PLUGINS_DIR, file);
    try {
      delete require.cache[require.resolve(full)];
      const p = require(full);
      if (!p || !p.name || typeof p.run !== 'function') { log.warn(`Plugin non valido: ${file}`); continue; }
      plugins.set(p.name.toLowerCase(), {
        ...p,
        name: p.name.toLowerCase(),
        aliases: Array.isArray(p.aliases) ? p.aliases.map(a => a.toLowerCase()) : [],
        cooldown: typeof p.cooldown === 'number' ? p.cooldown : COOLDOWN_MS
      });
    } catch (e) { log.err(`Errore nel plugin ${file}:`, e); }
  }
  log.ok(`Plugin caricati: ${C.b}${plugins.size}${C.r}`);
  return plugins.size;
}

// ───────────── COMANDI INTEGRATI ─────────────
const BUILTINS = new Map();
function addBuiltin(def) {
  BUILTINS.set(def.name, { aliases: [], cooldown: COOLDOWN_MS, ...def });
}

addBuiltin({
  name: 'reload', ownerOnly: true,
  async run({ reload, reply }) {
    const n = reload();
    await reply({ text: box('♻️ RELOAD', [`Plugin attivi: *${n}*`]) });
  }
});

addBuiltin({
  name: 'stats', aliases: ['stato', 'uptime'],
  async run({ reply, plugins }) {
    const top = Object.entries(db.usage).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, v], i) => `${['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]} .${k} › ${v}`);
    const mem = (process.memoryUsage().rss / 1048576).toFixed(0);
    await reply({
      text: box('⚡ ZEUS STATS', [
        `⏱️ Uptime: *${formatUptime(Date.now() - stats.startedAt)}*`,
        `🔌 Plugin: *${plugins.size}*`,
        `📨 Comandi (sessione): *${stats.commandsExecuted}*`,
        `📊 Comandi (totali): *${db.totalCommands}*`,
        `❌ Errori: *${stats.errors}*`,
        `💾 RAM: *${mem} MB*`,
        `🟢 Node: *${process.version}*`,
        `${db.mode === 'private' ? '🔒' : '🌍'} Modo: *${db.mode === 'private' ? 'privato' : 'pubblico'}*`,
        ...(top.length ? ['', '🏆 *Più usati*', ...top] : [])
      ])
    });
  }
});

function getTarget(m, args) {
  const ctx = getContext(m);
  if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
  if (ctx?.participant) return ctx.participant;
  const num = (args[0] || '').replace(/\D/g, '');
  return num.length >= 7 ? `${num}@s.whatsapp.net` : null;
}

addBuiltin({
  name: 'ban', ownerOnly: true,
  async run({ m, args, reply }) {
    const t = getTarget(m, args);
    if (!t) return reply({ text: box('🚫 BAN', ['Usa: *.ban @utente [motivo]*', 'oppure rispondi a un suo messaggio']) });
    const n = numberOf(t);
    if (OWNERS.includes(n)) return reply({ text: box('🚫 BAN', ['Non puoi bannare un owner.']) });
    const reason = args.slice(1).join(' ') || 'nessun motivo';
    db.banned[n] = { reason, at: Date.now() };
    saveDb();
    await reply({ text: box('🚫 BANNATO', [`@${n}`, `Motivo: ${reason}`]), mentions: [t] });
  }
});

addBuiltin({
  name: 'unban', ownerOnly: true,
  async run({ m, args, reply }) {
    const t = getTarget(m, args);
    if (!t) return reply({ text: box('✅ UNBAN', ['Usa: *.unban @utente*']) });
    const n = numberOf(t);
    if (!db.banned[n]) return reply({ text: box('✅ UNBAN', ['Utente non bannato.']) });
    delete db.banned[n];
    saveDb();
    await reply({ text: box('✅ SBANNATO', [`@${n}`]), mentions: [t] });
  }
});

addBuiltin({
  name: 'banlist', ownerOnly: true,
  async run({ reply }) {
    const list = Object.entries(db.banned);
    await reply({
      text: box('📛 BANLIST', list.length
        ? list.map(([n, v]) => `• ${n} — ${v.reason}`)
        : ['Nessun utente bannato.'])
    });
  }
});

addBuiltin({
  name: 'modo', ownerOnly: true,
  async run({ args, reply }) {
    const v = (args[0] || '').toLowerCase();
    if (!['pubblico', 'privato'].includes(v))
      return reply({ text: box('⚙️ MODO', [`Attuale: *${db.mode === 'private' ? 'privato' : 'pubblico'}*`, 'Usa: *.modo pubblico* / *.modo privato*']) });
    db.mode = v === 'privato' ? 'private' : 'public';
    saveDb();
    await reply({ text: box('⚙️ MODO', [db.mode === 'private' ? '🔒 Ora rispondo solo all\'owner' : '🌍 Ora rispondo a tutti']) });
  }
});

addBuiltin({
  name: 'anticall', ownerOnly: true,
  async run({ args, reply }) {
    const t = parseToggle(args[0]);
    if (t === null) return reply({ text: box('📵 ANTI-CALL', [`Stato: *${db.anticall ? 'ON' : 'OFF'}*`, 'Usa: *.anticall on/off*']) });
    db.anticall = t;
    saveDb();
    await reply({ text: box('📵 ANTI-CALL', [t ? '✅ Attivo: rifiuto le chiamate' : '❌ Disattivato']) });
  }
});

addBuiltin({
  name: 'welcome', groupOnly: true, adminOnly: true,
  async run({ args, jid, reply }) {
    const t = parseToggle(args[0]);
    if (t === null) return reply({ text: box('👋 WELCOME', [`Stato: *${db.welcome[jid] ? 'ON' : 'OFF'}*`, 'Usa: *.welcome on/off*']) });
    if (t) db.welcome[jid] = true; else delete db.welcome[jid];
    saveDb();
    await reply({ text: box('👋 WELCOME', [t ? '✅ Benvenuto/addio attivi' : '❌ Disattivati']) });
  }
});

function findCommand(cmd) {
  const c = cmd.toLowerCase();
  for (const p of plugins.values()) if (p.name === c || p.aliases.includes(c)) return p;
  for (const p of BUILTINS.values()) if (p.name === c || p.aliases.includes(c)) return p;
  return null;
}

function suggestCommand(cmd) {
  const names = [];
  for (const p of [...plugins.values(), ...BUILTINS.values()]) names.push(p.name, ...p.aliases);
  let best = null, bestD = 3;
  for (const n of names) {
    const d = levenshtein(cmd, n);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

// ───────────── PARSING MESSAGGI ─────────────
function unwrap(msg) {
  let cur = msg;
  for (let i = 0; i < 6; i++) {
    if (!cur) break;
    const inner = cur.ephemeralMessage?.message
      || cur.viewOnceMessage?.message
      || cur.viewOnceMessageV2?.message
      || cur.viewOnceMessageV2Extension?.message
      || cur.documentWithCaptionMessage?.message
      || cur.editedMessage?.message;
    if (!inner) break;
    cur = inner;
  }
  return cur;
}

function getContext(m) {
  const msg = unwrap(m.message);
  if (!msg) return null;
  for (const v of Object.values(msg)) if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo;
  return null;
}

function extractText(rawMsg) {
  const msg = unwrap(rawMsg);
  if (!msg) return '';
  let text = msg.conversation
    || msg.extendedTextMessage?.text
    || msg.imageMessage?.caption
    || msg.videoMessage?.caption
    || msg.documentMessage?.caption
    || '';
  const nf = msg.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (nf?.paramsJson) {
    try { const parsed = JSON.parse(nf.paramsJson); text = parsed.id || parsed.command || text; } catch {}
  }
  if (msg.buttonsResponseMessage?.selectedButtonId) text = msg.buttonsResponseMessage.selectedButtonId;
  if (msg.templateButtonReplyMessage?.selectedId) text = msg.templateButtonReplyMessage.selectedId;
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) text = msg.listResponseMessage.singleSelectReply.selectedRowId;
  return typeof text === 'string' ? text.trim() : '';
}

function summarizeContent(content) {
  if (!content || typeof content !== 'object') return '';
  if (content.react) return '';
  if (typeof content.text === 'string') return content.text.split('\n')[0];
  if (typeof content.caption === 'string') return content.caption.split('\n')[0];
  if (content.audio) return '[Audio inviato]';
  if (content.sticker) return '[Sticker inviato]';
  if (content.image) return '[Immagine inviata]';
  if (content.video) return '[Video inviato]';
  if (content.document) return '[Documento inviato]';
  return '[Risposta inviata]';
}

// ───────────── COOLDOWN, ANTI-SPAM, GRUPPI ─────────────
function checkCooldown(sender, name, ms) {
  if (!sender || ms <= 0) return 0;
  const key = `${sender}:${name}`;
  const now = Date.now();
  const exp = cooldowns.get(key) || 0;
  if (now < exp) return Math.ceil((exp - now) / 1000);
  cooldowns.set(key, now + ms);
  return 0;
}

function spamCheck(key) {
  const now = Date.now();
  const s = spam.get(key) || { hits: [], mutedUntil: 0, level: 0 };
  spam.set(key, s);
  if (now < s.mutedUntil) return { blocked: true, warn: false };
  if (s.level && now - s.mutedUntil > 600000) s.level = 0;
  s.hits = s.hits.filter(t => now - t < SPAM_WINDOW_MS);
  s.hits.push(now);
  if (s.hits.length > SPAM_MAX) {
    s.level = Math.min(s.level + 1, 5);
    s.mutedUntil = now + 30000 * s.level;
    s.hits = [];
    return { blocked: true, warn: true, secs: 30 * s.level };
  }
  return { blocked: false };
}

async function getGroup(sock, jid, fresh = false) {
  const hit = groupCache.get(jid);
  if (!fresh && hit && Date.now() - hit.t < 60000) return hit.meta;
  try {
    const meta = await sock.groupMetadata(jid);
    groupCache.set(jid, { meta, t: Date.now() });
    return meta;
  } catch { return hit?.meta || null; }
}

function adminIn(meta, candidates) {
  if (!meta?.participants) return false;
  const nums = candidates.filter(Boolean).map(numberOf);
  return meta.participants.some(p => {
    if (!p.admin) return false;
    return [p.id, p.jid, p.lid, p.phoneNumber].filter(Boolean).map(numberOf).some(n => nums.includes(n));
  });
}

// ───────────── GESTIONE COMANDI ─────────────
async function handleMessage(sock, m) {
  if (!m?.message || !m.key?.remoteJid) return;
  if (m.key.remoteJid === 'status@broadcast') return;

  const text = extractText(m.message);
  if (!text) return;
  const usedPrefix = PREFIXES.find(p => text.startsWith(p));
  if (!usedPrefix) return;

  const jid = m.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const sender = m.key.fromMe
    ? (sock.user?.id || 'me')
    : (isGroup ? (m.key.participant || jid) : jid);
  const ids = [sender, m.key.participant, m.key.participantAlt, m.key.remoteJidAlt].filter(Boolean);

  const isOwner = !!m.key.fromMe || ids.some(i => OWNERS.includes(numberOf(i)));
  if (!isOwner && ids.some(i => db.banned[numberOf(i)])) return;
  if (!isOwner && db.mode === 'private') return;

  const body = text.slice(usedPrefix.length).trim();
  if (!body) return;
  const args = body.split(/\s+/);
  const command = (args.shift() || '').toLowerCase();
  if (!command) return;

  const callerName = m.pushName || numberOf(sender);
  const chatTitle = isGroup ? jid.split('@')[0] : callerName;
  const origSend = sock.sendMessage.bind(sock);

  const cmdObj = findCommand(command);
  if (!cmdObj) {
    if (/^[a-zà-ú]{2,}$/i.test(command) && !checkCooldown(sender, '__unknown', 4000)) {
      const sug = suggestCommand(command);
      if (sug) await origSend(jid, { text: box('🤔 COMANDO NON TROVATO', [`Forse intendevi *${usedPrefix}${sug}*?`]) }, { quoted: m }).catch(() => {});
    }
    return;
  }

  // Anti-spam
  if (!isOwner) {
    const sp = spamCheck(sender);
    if (sp.blocked) {
      if (sp.warn) {
        log.warn(`Anti-spam: ${callerName} mutato ${sp.secs}s`);
        await origSend(jid, { text: box('🛑 ANTI-SPAM', [`Stai andando troppo veloce!`, `Pausa di *${sp.secs}s* ⏳`]) }, { quoted: m }).catch(() => {});
      }
      return;
    }
  }

  // Permessi
  const deny = (msg) => origSend(jid, { text: box('⛔ ACCESSO NEGATO', [msg]) }, { quoted: m }).catch(() => {});
  if (cmdObj.ownerOnly && !isOwner) return deny('Solo l\'owner può usare questo comando.');
  if (cmdObj.groupOnly && !isGroup) return deny('Questo comando funziona solo nei gruppi. 👥');
  if (cmdObj.privateOnly && isGroup) return deny('Questo comando funziona solo in privato. 💬');

  let isAdmin = false, isBotAdmin = false, groupMeta = null;
  if (isGroup) {
    groupMeta = await getGroup(sock, jid);
    isAdmin = isOwner || adminIn(groupMeta, ids);
    isBotAdmin = adminIn(groupMeta, [sock.user?.id, sock.user?.lid]);
  }
  if (cmdObj.adminOnly && !isAdmin) return deny('Solo gli admin del gruppo possono usarlo. 👑');
  if (cmdObj.botAdmin && !isBotAdmin) return deny('Devo essere admin del gruppo per farlo. 🤖');

  if (checkCooldown(sender, cmdObj.name, cmdObj.cooldown) > 0) return;

  log.cmd(`${usedPrefix}${command}`, callerName, isGroup ? 'Gruppo' : 'Privato');

  // Proxy per tracciare risposte e reazioni
  let lastPreview = '';
  let pluginReacted = false;
  const proxiedSock = new Proxy(sock, {
    get(target, prop, receiver) {
      if (prop === 'sendMessage') {
        return async (targetJid, content, opts) => {
          if (content?.react && targetJid === jid) pluginReacted = true;
          const sum = summarizeContent(content);
          if (targetJid === jid && sum) lastPreview = sum;
          return origSend(targetJid, content, opts);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });

  const reply = (content, opts = {}) => proxiedSock.sendMessage(jid, content, { quoted: m, ...opts });
  const react = (emoji) => { pluginReacted = true; return origSend(jid, { react: { text: emoji, key: m.key } }).catch(() => {}); };
  const autoReact = (emoji) => origSend(jid, { react: { text: emoji, key: m.key } }).catch(() => {});

  // Presenza: letto + "sta scrivendo..."
  Promise.resolve().then(() => sock.readMessages([m.key])).catch(() => {});
  sock.sendPresenceUpdate('composing', jid).catch(() => {});
  if (cmdObj.autoReact !== false) autoReact('⏳');

  const t0 = Date.now();
  try {
    stats.commandsExecuted++;
    db.totalCommands++;
    db.usage[cmdObj.name] = (db.usage[cmdObj.name] || 0) + 1;
    saveDb();

    await cmdObj.run({
      sock: proxiedSock, m, jid, sender, isGroup, args, text, body, command,
      prefix: usedPrefix, prefixes: PREFIXES, plugins, stats, reload: loadPlugins, reply, react,
      isOwner, isAdmin, isBotAdmin, groupMeta, db, saveDb, box, owners: OWNERS
    });
    if (!pluginReacted && cmdObj.autoReact !== false) autoReact('✅');
  } catch (err) {
    stats.errors++;
    lastPreview = `⚠️ Errore in ${usedPrefix}${command}`;
    log.err(`Errore nel comando [${command}]:`, err);
    if (process.env.ZEUS_DEBUG) console.error(err);
    autoReact('❌');
    await origSend(jid, { text: box('⚠️ ERRORE', [`Comando: *${usedPrefix}${command}*`, 'Qualcosa è andato storto, riprova.']) }, { quoted: m }).catch(() => {});
  } finally {
    sock.sendPresenceUpdate('paused', jid).catch(() => {});
    if (typeof drawMiniChat === 'function') {
      drawMiniChat({
        userName: callerName, userJid: sender, chatTitle, isGroup,
        incomingText: text,
        botReplyText: lastPreview || `Comando ${usedPrefix}${command} eseguito (${Date.now() - t0}ms)`
      });
    }
  }
}

// ───────────── BANNER ─────────────
function printBanner(version) {
  const rows = [
    ['Baileys', version ? version.join('.') : 'default'],
    ['Plugin', plugins.size],
    ['Modo', db.mode === 'private' ? '🔒 privato' : '🌍 pubblico'],
    ['Anti-call', db.anticall ? 'ON' : 'OFF'],
    ['Bannati', Object.keys(db.banned).length],
    ['Owner', OWNERS.length]
  ];
  console.log(`\n${C.gold}╭━━━━━━━━━━ ⚡ ${C.b}ZEUS ONLINE${C.r}${C.gold} ⚡ ━━━━━━━━━━╮${C.r}`);
  for (const [k, v] of rows) console.log(`${C.gold}┃${C.r} ${C.gray}${k.padEnd(10)}${C.r} ${C.b}${v}${C.r}`);
  console.log(`${C.gold}╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯${C.r}\n`);
}

// ───────────── CONNESSIONE ─────────────
async function connectToWhatsApp() {
  ensureDir(AUTH_DIR);
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: true,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      splash.end();
      log.info('📱 Scansiona questo QR Code per Zeus:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'connecting') splash.step(75, 'Connessione a WhatsApp...');

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        splash.end();
        log.warn('🔒 Sessione scollegata: cancella la cartella auth_info_zeus e riavvia per rifare il QR.');
        return;
      }
      reconnectAttempts++;
      const delay = code === DisconnectReason.restartRequired ? 1000 : Math.min(3000 * reconnectAttempts, 20000);
      splash.step(80, `Riconnessione (${delay / 1000}s)...`);
      log.warn(`Connessione chiusa (codice ${code}), riconnetto tra ${delay / 1000}s...`);
      setTimeout(connectToWhatsApp, delay);
    } else if (connection === 'open') {
      reconnectAttempts = 0;
      splash.done().then(() => printBanner(version));
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      await handleMessage(sock, m).catch(e => log.err('Errore messaggio:', e));
    }
  });

  // Anti-call
  sock.ev.on('call', async (calls) => {
    if (!db.anticall) return;
    for (const c of calls) {
      if (c.status !== 'offer') continue;
      try {
        await sock.rejectCall(c.id, c.from);
        await sock.sendMessage(c.from, { text: box('📵 ANTI-CALL', ['Le chiamate non sono accettate.', 'Scrivimi un messaggio! ⚡']) });
        log.warn(`Chiamata rifiutata da ${numberOf(c.from)}`);
      } catch (e) { log.err('Errore anti-call:', e); }
    }
  });

  // Benvenuto / addio + plugin
  sock.ev.on('group-participants.update', async (event) => {
    groupCache.delete(event.id);

    if (db.welcome[event.id] && (event.action === 'add' || event.action === 'remove')) {
      try {
        const meta = await getGroup(sock, event.id, true);
        const users = event.participants.map(x => (typeof x === 'string' ? x : x.phoneNumber || x.id || x.jid));
        const tags = users.map(u => `@${numberOf(u)}`).join(' ');
        const text = event.action === 'add'
          ? box('👋 BENVENUTO', [tags, `è entrato in *${meta?.subject || 'questo gruppo'}*`, `Membri: *${meta?.participants?.length ?? '?'}*`, 'Leggi le regole e divertiti! ⚡'])
          : box('🚪 ADDIO', [tags, `ha lasciato *${meta?.subject || 'il gruppo'}*`]);
        await sock.sendMessage(event.id, { text, mentions: users });
      } catch (e) { log.err('Errore welcome:', e); }
    }

    for (const p of plugins.values()) {
      if (typeof p.onParticipants === 'function') {
        try { await p.onParticipants({ sock, event, plugins, stats, reload: loadPlugins }); }
        catch (e) { log.err(`Errore onParticipants [${p.name}]:`, e); }
      }
    }
  });
}

// ───────────── SICUREZZA E SPEGNIMENTO ─────────────
process.on('unhandledRejection', (e) => log.warn(`Promessa non gestita: ${e?.message || e}`));
process.on('uncaughtException', (e) => log.err('Errore non gestito:', e));

let spegnimento = false;
async function spegni() {
  if (spegnimento) process.exit(0);
  spegnimento = true;
  saveDb(true);
  splash.end();
  await outro();
  process.exit(0);
}
process.on('SIGINT', spegni);
process.on('SIGTERM', spegni);
process.on('exit', () => process.stdout.write('\x1b[?25h'));

(async () => {
  splash = await intro();
  splash.step(15, 'Carico i plugin...');
  const n = loadPlugins();
  splash.step(45, `Plugin caricati: ${n}`);
  await connectToWhatsApp();
})().catch((e) => {
  splash.end();
  log.err('Errore di avvio:', e);
});
