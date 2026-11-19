const { react, itunesLookup, sendVoicePreview } = require('../lib/music');

module.exports = {
  name: 'songaudio',
  aliases: [],
  hidden: true,
  category: 'Musica',
  description: 'Anteprima vocale (usato dai bottoni)',
  run: async ({ sock, jid, m, args }) => {
    const id = (args[0] || '').replace(/[^0-9]/g, '');
    if (id === '') return;
    await react(sock, jid, m, '🎧');
    try {
      const t = await itunesLookup(id);
      if (t === undefined || t.previewUrl === undefined) {
        await react(sock, jid, m, '❌');
        return sock.sendMessage(jid, { text: '❌ Anteprima non disponibile.' }, { quoted: m });
      }
      await sendVoicePreview(sock, jid, m, t.previewUrl);
      await react(sock, jid, m, '✅');
    } catch (e) {
      console.error('Errore .songaudio:', e.message);
      await react(sock, jid, m, '❌');
      await sock.sendMessage(jid, { text: '⚠️ Errore nell\'invio del vocale.' }, { quoted: m });
    }
  }
};
