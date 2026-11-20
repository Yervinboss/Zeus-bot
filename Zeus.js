const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@innovatorssoft/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { intro, outro } = require('./lib/animazione');

const PREFIX = '.';
const plugins = new Map();

let splash = { step() {}, done: async () => {}, end() {} };

function loadPlugins() {
  plugins.clear();
  const dir = path.join(__dirname, 'plugins');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const full = path.join(dir, file);
    try {
      delete require.cache[require.resolve(full)];
      const p = require(full);
      if (!p.name || typeof p.run !== 'function') {
        console.log('Plugin non valido:', file);
        continue;
      }
      plugins.set(p.name, p);
    } catch (e) {
      console.error('Errore nel plugin', file, '->', e.message);
    }
  }
  console.log(`🔌 Plugin caricati: ${plugins.size}`);
  return plugins.size;
}

function findPlugin(cmd) {
  for (const p of plugins.values()) {
    if (p.name === cmd || (p.aliases && p.aliases.includes(cmd))) return p;
  }
  return null;
}

function unwrap(msg) {
  let cur = msg;
  for (let i = 0; i < 5; i++) {
    const inner = cur.ephemeralMessage?.message
      || cur.viewOnceMessage?.message
      || cur.viewOnceMessageV2?.message
      || cur.documentWithCaptionMessage?.message;
    if (!inner) break;
    cur = inner;
  }
  return cur;
}

function extractText(rawMsg) {
  const msg = unwrap(rawMsg);
  let text = msg.conversation
    || msg.extendedTextMessage?.text
    || msg.imageMessage?.caption
    || msg.videoMessage?.caption;

  const nf = msg.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (nf) {
    try { text = JSON.parse(nf.paramsJson).id || text; } catch {}
  }
  if (msg.buttonsResponseMessage?.selectedButtonId) text = msg.buttonsResponseMessage.selectedButtonId;
  if (msg.templateButtonReplyMessage?.selectedId) text = msg.templateButtonReplyMessage.selectedId;
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) text = msg.listResponseMessage.singleSelectReply.selectedRowId;

  return text;
}

async function handleMessage(sock, m) {
  if (!m?.message) return;
  if (m.key.remoteJid === 'status@broadcast') return;

  const text = extractText(m.message);
  if (!text || !text.startsWith(PREFIX)) return;

  const jid = m.key.remoteJid;
  const args = text.slice(PREFIX.length).trim().split(/\s+/);
  const command = (args.shift() || '').toLowerCase();
  if (!command) return;

  const plugin = findPlugin(command);
  if (!plugin) return;

  try {
    await plugin.run({
      sock, m, jid, args, text, command,
      plugins, prefix: PREFIX, reload: loadPlugins
    });
  } catch (err) {
    console.error(`Errore nel comando ${command}:`, err);
    await sock.sendMessage(jid, { text: '⚠️ Errore nell\'esecuzione del comando.' }, { quoted: m }).catch(() => {});
  }
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_zeus');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      splash.end();
      console.log('Scansiona questo QR Code per Zeus:');
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
      splash.step(80, 'Riconnessione...');
      console.log(`Connessione chiusa (codice ${code}), riconnetto tra 3 secondi...`);
      setTimeout(connectToWhatsApp, 3000);
    } else if (connection === 'open') {
      splash.done().then(() => console.log('⚡ Zeus è online!'));
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      await handleMessage(sock, m).catch(e => console.error('Errore messaggio:', e));
    }
  });
}

process.on('unhandledRejection', (e) => console.error('Promessa non gestita:', e));
process.on('uncaughtException', (e) => console.error('Errore non gestito:', e));

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
  console.error('Errore di avvio:', e);
});
