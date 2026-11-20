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
const path = require('path');
const { intro, outro } = require('./lib/animazione');

let drawMiniChat = null;
try {
  ({ drawMiniChat } = require('./lib/minichat'));
} catch {}

const PREFIXES = ['.', '!'];
const AUTH_DIR = path.join(__dirname, 'auth_info_zeus');
const PLUGINS_DIR = path.join(__dirname, 'plugins');
const COOLDOWN_MS = 1200;

const plugins = new Map();
const cooldowns = new Map();
const stats = {
  startedAt: Date.now(),
  commandsExecuted: 0,
  errors: 0
};

let splash = { step() {}, done: async () => {}, end() {} };
let reconnectAttempts = 0;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadPlugins() {
  ensureDir(PLUGINS_DIR);
  plugins.clear();

  const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js')).sort();
  for (const file of files) {
    const full = path.join(PLUGINS_DIR, file);
    try {
      delete require.cache[require.resolve(full)];
      const p = require(full);
      if (!p || !p.name || typeof p.run !== 'function') {
        console.log('⚠️ Plugin non valido:', file);
        continue;
      }
      plugins.set(p.name.toLowerCase(), {
        ...p,
        name: p.name.toLowerCase(),
        aliases: Array.isArray(p.aliases) ? p.aliases.map(a => a.toLowerCase()) : [],
        cooldown: typeof p.cooldown === 'number' ? p.cooldown : COOLDOWN_MS
      });
    } catch (e) {
      console.error('❌ Errore nel plugin', file, '->', e.message);
    }
  }

  console.log(`🔌 Plugin caricati: ${plugins.size}`);
  return plugins.size;
}

function findPlugin(cmd) {
  const c = cmd.toLowerCase();
  for (const p of plugins.values()) {
    if (p.name === c || p.aliases.includes(c)) return p;
  }
  return null;
}

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
    try {
      const parsed = JSON.parse(nf.paramsJson);
      text = parsed.id || parsed.command || text;
    } catch {}
  }
  if (msg.buttonsResponseMessage?.selectedButtonId) text = msg.buttonsResponseMessage.selectedButtonId;
  if (msg.templateButtonReplyMessage?.selectedId) text = msg.templateButtonReplyMessage.selectedId;
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) text = msg.listResponseMessage.singleSelectReply.selectedRowId;

  return typeof text === 'string' ? text.trim() : '';
}

function checkCooldown(sender, pluginName, ms) {
  if (!sender || ms <= 0) return 0;
  const key = `${sender}:${pluginName}`;
  const now = Date.now();
  const expiresAt = cooldowns.get(key) || 0;
  if (now < expiresAt) return Math.ceil((expiresAt - now) / 1000);
  cooldowns.set(key, now + ms);
  return 0;
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

  const body = text.slice(usedPrefix.length).trim();
  if (!body) return;

  const args = body.split(/\s+/);
  const command = (args.shift() || '').toLowerCase();
  if (!command) return;

  console.log(`📩 Comando ricevuto: ${text} (${isGroup ? 'Gruppo' : 'Privato'})`);

  if (command === 'reload') {
    const count = loadPlugins();
    await sock.sendMessage(jid, { text: `♻️ Plugin ricaricati: *${count}* attivi.` }, { quoted: m });
    return;
  }

  const plugin = findPlugin(command);
  if (!plugin) {
    console.log(`⚠️ Nessun plugin trovato per: ${command}`);
    return;
  }

  if (plugin.groupOnly && !isGroup) {
    await sock.sendMessage(jid, { text: '👥 Questo comando funziona solo nei gruppi.' }, { quoted: m });
    return;
  }

  const remainingSec = checkCooldown(sender, plugin.name, plugin.cooldown);
  if (remainingSec > 0) return;

  const callerName = m.pushName || sender.split('@')[0];
  const chatTitle = isGroup ? jid.split('@')[0] : callerName;

  let lastPreview = '';
  const origSend = sock.sendMessage.bind(sock);
  const proxiedSock = new Proxy(sock, {
    get(target, prop, receiver) {
      if (prop === 'sendMessage') {
        return async (targetJid, content, opts) => {
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
  const react = (emoji) => origSend(jid, { react: { text: emoji, key: m.key } }).catch(() => {});

  try {
    stats.commandsExecuted++;
    await plugin.run({
      sock: proxiedSock,
      m,
      jid,
      sender,
      isGroup,
      args,
      text,
      body,
      command,
      prefix: usedPrefix,
      prefixes: PREFIXES,
      plugins,
      stats,
      reload: loadPlugins,
      reply,
      react
    });
  } catch (err) {
    stats.errors++;
    lastPreview = `⚠️ Errore in ${usedPrefix}${command}`;
    console.error(`❌ Errore nel comando [${command}]:`, err);
    await origSend(jid, { text: `⚠️ Errore durante l'esecuzione di *${usedPrefix}${command}*.` }, { quoted: m }).catch(() => {});
  } finally {
    if (typeof drawMiniChat === 'function') {
      drawMiniChat({
        userName: callerName,
        userJid: sender,
        chatTitle,
        isGroup,
        incomingText: text,
        botReplyText: lastPreview || `Comando ${usedPrefix}${command} eseguito`
      });
    }
  }
}

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
      console.log('📱 Scansiona questo QR Code per Zeus:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'connecting') {
      splash.step(75, 'Connessione a WhatsApp...');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        splash.end();
        console.log('🔒 Sessione scollegata: cancella la cartella auth_info_zeus e riavvia per rifare il QR.');
        return;
      }

      reconnectAttempts++;
      const delay = Math.min(3000 * reconnectAttempts, 20000);
      splash.step(80, `Riconnessione (${delay / 1000}s)...`);
      console.log(`⚡ Connessione chiusa (codice ${code}), riconnetto tra ${delay / 1000}s...`);
      setTimeout(connectToWhatsApp, delay);
    } else if (connection === 'open') {
      reconnectAttempts = 0;
      splash.done().then(() => {
        console.log(`⚡ Zeus è online! (Baileys v${version ? version.join('.') : 'default'})`);
      });
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      await handleMessage(sock, m).catch(e => console.error('❌ Errore messaggio:', e));
    }
  });

  sock.ev.on('group-participants.update', async (event) => {
    for (const p of plugins.values()) {
      if (typeof p.onParticipants === 'function') {
        try {
          await p.onParticipants({ sock, event, plugins, stats, reload: loadPlugins });
        } catch (e) {
          console.error(`❌ Errore onParticipants [${p.name}]:`, e.message);
        }
      }
    }
  });
}

process.on('unhandledRejection', (e) => console.error('⚠️ Promessa non gestita:', e));
process.on('uncaughtException', (e) => console.error('💥 Errore non gestito:', e));

let spegnimento = false;
async function spegni() {
  if (spegnimento) process.exit(0);
  spegnimento = true;
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
  console.error('💥 Errore di avvio:', e);
});
