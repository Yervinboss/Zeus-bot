module.exports = {
  name: 'ping',
  aliases: [],
  category: 'Generali',
  description: 'Testa se il bot risponde',
  run: async ({ sock, jid, m }) => {
    await sock.sendMessage(jid, { text: 'Pong! 🏓 Zeus risponde perfettamente.' }, { quoted: m });
  }
};
