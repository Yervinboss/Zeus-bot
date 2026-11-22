const { downloadContentFromMessage, downloadMediaMessage } = require('@innovatorssoft/baileys');
const pino = require('pino');

function unwrapAll(msg) {
  let m = msg;
  for (let i = 0; i < 8 && m; i++) {
    const inner =
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message ||
      m.deviceSentMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

function getContextInfo(m) {
  if (!m?.message) return null;
  if (m.message.extendedTextMessage?.contextInfo) return m.message.extendedTextMessage.contextInfo;
  for (const k of Object.keys(m.message)) {
    const ci = m.message[k]?.contextInfo;
    if (ci) return ci;
  }
  return null;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function hasMediaKey(mediaObj) {
  if (!mediaObj?.mediaKey) return false;
  if (Buffer.isBuffer(mediaObj.mediaKey)) return mediaObj.mediaKey.length > 0;
  if (mediaObj.mediaKey instanceof Uint8Array) return mediaObj.mediaKey.byteLength > 0;
  if (typeof mediaObj.mediaKey === 'object') return Object.keys(mediaObj.mediaKey).length > 0;
  return false;
}

async function fetchMediaBuffer(sock, fullMsg, inner, type) {
  const mediaObj = inner[`${type}Message`];
  if (!mediaObj) return null;

  if (hasMediaKey(mediaObj) && typeof downloadContentFromMessage === 'function') {
    const stream = await downloadContentFromMessage(mediaObj, type);
    return streamToBuffer(stream);
  }

  if (fullMsg && hasMediaKey(unwrapAll(fullMsg.message)?.[`${type}Message`]) && typeof downloadMediaMessage === 'function') {
    const buf = await downloadMediaMessage(
      { key: fullMsg.key, message: inner },
      'buffer',
      {},
      { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
    );
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  }

  return null;
}

module.exports = {
  name: 'vv',
  aliases: ['viewonce', 'apri'],
  category: 'Utility',
  description: 'Rinvia in chiaro un media a visualizzazione singola citato',
  cooldown: 1500,
  run: async ({ sock, jid, m, quoted, reply, react }) => {
    const ci = getContextInfo(m);
    const stanzaId = ci?.stanzaId;
    const cachedMsg = stanzaId && global.zeusMsgCache?.get(stanzaId);
    const rawQuoted = cachedMsg?.message || quoted || ci?.quotedMessage || null;

    if (!rawQuoted) {
      return reply('⚠️ Rispondi a una foto, video o vocale a visualizzazione singola con *.vv*.');
    }

    const inner = unwrapAll(rawQuoted);
    if (!inner) {
      return reply('⚠️ Impossibile leggere il messaggio citato.');
    }

    await react('⏳');
    try {
      if (inner.imageMessage) {
        const buf = await fetchMediaBuffer(sock, cachedMsg, inner, 'image');
        if (!buf) {
          await react('❌');
          return reply('⚠️ Impossibile recuperare la chiave del media view-once su questa sessione.');
        }
        const caption = inner.imageMessage.caption || '';
        await sock.sendMessage(jid, { image: buf, caption }, { quoted: m });
      } else if (inner.videoMessage) {
        const buf = await fetchMediaBuffer(sock, cachedMsg, inner, 'video');
        if (!buf) {
          await react('❌');
          return reply('⚠️ Impossibile recuperare la chiave del media view-once su questa sessione.');
        }
        const caption = inner.videoMessage.caption || '';
        await sock.sendMessage(jid, { video: buf, caption }, { quoted: m });
      } else if (inner.audioMessage) {
        const buf = await fetchMediaBuffer(sock, cachedMsg, inner, 'audio');
        if (!buf) {
          await react('❌');
          return reply('⚠️ Impossibile recuperare la chiave del media view-once su questa sessione.');
        }
        const ptt = !!inner.audioMessage.ptt;
        const mimetype = inner.audioMessage.mimetype || (ptt ? 'audio/ogg; codecs=opus' : 'audio/mp4');
        await sock.sendMessage(jid, { audio: buf, mimetype, ptt }, { quoted: m });
      } else {
        await react('❌');
        return reply('⚠️ Il messaggio citato non è una foto, un video o un vocale valido.');
      }
      await react('✅');
    } catch (e) {
      await react('❌');
      return reply(`⚠️ Errore nel recupero del media: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
};
