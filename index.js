const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@innovatorssoft/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const PREFIX = '.';
const plugins = new Map();

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

function extractText(msg) {
  let text = msg.conversation
    || msg.extendedTextMessage?.text
    || msg.imageMessage?.caption
    || msg.videoMessage?.caption;

  // Risposte da bottoni, liste e carousel
  const nf = msg.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (nf) {
    try { text = JSON.parse(nf.paramsJson).id; } catch {}
  }
  if (msg.buttonsResponseMessage?.selectedButtonId) text = msg.buttonsResponseMessage.selectedButtonId;
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) text = msg.listResponseMessage.singleSelectReply.selectedRowId;

  return text;
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
      console.log('Scansiona questo QR Code per Zeus:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) connectToWhatsApp();
    } else if (connection === 'open') {
      console.log('⚡ Zeus è online!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const m = messages.at(0);
    if (!m?.message) return;

    const text = extractText(m.message);
    if (!text) return;

    // I messaggi inviati da te stesso passano solo se sono comandi
    if (m.key.fromMe && !text.startsWith(PREFIX)) return;
    if (!text.startsWith(PREFIX)) return;

    const jid = m.key.remoteJid;
    const args = text.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const plugin = findPlugin(command);
    if (!plugin) return;

    try {
      await plugin.run({
        sock, m, jid, args, text, command,
        plugins, prefix: PREFIX, reload: loadPlugins
      });
    } catch (err) {
      console.error(`Errore nel comando ${command}:`, err);
      await sock.sendMessage(jid, { text: '⚠️ Errore nell\'esecuzione del comando.' }, { quoted: m });
    }
  });
}

loadPlugins();
connectToWhatsApp();
