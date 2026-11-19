const { generateQuickReplyButtons } = require('@innovatorssoft/baileys');
const { react, itunesSearch } = require('../lib/music');

module.exports = {
  name: 'song',
  aliases: ['canzone'],
  category: 'Musica',
  description: 'Cerca una canzone: .song titolo artista',
  run: async ({ sock, jid, m, args, prefix }) => {
    const term = args.join(' ').trim();
    if (term === '') {
      return sock.sendMessage(jid, {
        text: `Uso: ${prefix}song titolo artista\nEsempio: ${prefix}song Despacito Luis Fonsi`
      }, { quoted: m });
    }
    await react(sock, jid, m, '⏳');
    try {
      const t = await itunesSearch(term, 'song');
      if (t === undefined) {
        await react(sock, jid, m, '❌');
        return sock.sendMessage(jid, { text: '❌ Nessuna canzone trovata.' }, { quoted: m });
      }

      const cover = (t.artworkUrl100 || '').replace('100x100', '600x600');
      const caption = `🎵 *${t.trackName}*\n👤 ${t.artistName}\n💿 ${t.collectionName || ''}\n\n🔗 Canzone intera: ${t.trackViewUrl}`;
      if (cover !== '') {
        await sock.sendMessage(jid, { image: { url: cover }, caption }, { quoted: m });
      } else {
        await sock.sendMessage(jid, { text: caption }, { quoted: m });
      }

      const query = `${t.trackName} ${t.artistName}`.slice(0, 80);
      const buttons = generateQuickReplyButtons(
        'Cosa vuoi fare? (anteprime di 30 secondi)',
        [
          { id: `.songaudio ${t.trackId}`, displayText: '🎤 Vocale' },
          { id: `.songvideo ${query}`, displayText: '🎬 Video' },
          { id: `.songpl ${t.trackId}`, displayText: '➕ Playlist' }
        ],
        { footer: 'Zeus Bot' }
      );
      await sock.sendMessage(jid, buttons, { quoted: m });
      await react(sock, jid, m, '✅');
    } catch (e) {
      console.error('Errore .song:', e.message);
      await react(sock, jid, m, '❌');
      await sock.sendMessage(jid, { text: '⚠️ Errore nella ricerca, riprova.' }, { quoted: m });
    }
  }
};
