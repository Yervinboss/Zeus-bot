module.exports = {
  name: 'info',
  aliases: [],
  category: 'Generali',
  description: 'Informazioni sul bot',
  run: async ({ sock, jid, m }) => {
    await sock.sendMessage(jid, { text: '🤖 Questo è Zeus Bot, basato su Node.js e Baileys.' }, { quoted: m });
  }
};
