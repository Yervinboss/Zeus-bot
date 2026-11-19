const { react, itunesSearch } = require('../lib/music');

module.exports = {
  name: 'songvideo',
  aliases: [],
  hidden: true,
  category: 'Musica',
  description: 'Anteprima video (usato dai bottoni)',
  run: async ({ sock, jid, m, args }) => {
    const term = args.join(' ').trim();
    if (term === '') return;
    await react(sock, jid, m, '⏳');
    try {
      const v = await itunesSearch(term, 'musicVideo');
      if (v === undefined || v.previewUrl === undefined) {
        await react(sock, jid, m, '❌');
        return sock.sendMessage(jid, { text: '❌ Nessun video disponibile per questo brano.' }, { quoted: m });
      }
      await sock.sendMessage(jid, {
        video: { url: v.previewUrl },
        caption: `🎬 ${v.trackName} - ${v.artistName}\n(anteprima di 30 secondi)`
      }, { quoted: m });
      await react(sock, jid, m, '✅');
    } catch (e) {
      console.error('Errore .songvideo:', e.message);
      await react(sock, jid, m, '❌');
      await sock.sendMessage(jid, { text: '⚠️ Errore nell\'invio del video.' }, { quoted: m });
    }
  }
};
