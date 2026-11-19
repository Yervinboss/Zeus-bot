const { generateWAMessageFromContent, proto } = require('@innovatorssoft/baileys');

async function relay(sock, jid, interactiveMessage, quoted) {
  const msg = generateWAMessageFromContent(jid, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage
      }
    }
  }, { quoted, userJid: sock.user.id });
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
}

module.exports = { relay, proto };
