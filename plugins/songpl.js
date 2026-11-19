const playlist = require('../lib/playlist');
const { react, itunesLookup } = require('../lib/music');

module.exports = {
  name: 'songpl',
  aliases: [],
  hidden: true,
  category: 'Musica',
  description: 'Aggiunge alla playlist (usato dai bottoni)',
  run: async ({ sock, jid, m, args }) => {
    const id = (args[0] || '').replace(/[^0-9]/g, '');
    if (id === '') return;
    try {
      const t = await itunesLookup(id);
      if (t === undefined) {
        return sock.sendMessage(jid, { text: '❌ Brano non trovato.' }, { quoted: m });
      }
      const result = playlist.add(playlist.userKey(m), {
        id: String(t.trackId),
        title: t.trackName,
        artist: t.artistName
      });
      if (result === 'exists') {
        return sock.sendMessage(jid, { text: '⚠️ Questo brano è già nella tua playlist.' }, { quoted: m });
      }
      if (result === 'full') {
        return sock.sendMessage(jid, { text: '⚠️ Playlist piena (massimo 50 brani). Rimuovine qualcuno con .pl rimuovi numero' }, { quoted: m });
      }
      await react(sock, jid, m, '✅');
      await sock.sendMessage(jid, { text: `✅ Aggiunto alla tua playlist:\n🎵 *${t.trackName}* - ${t.artistName}` }, { quoted: m });
    } catch (e) {
      console.error('Errore .songpl:', e.message);
      await sock.sendMessage(jid, { text: '⚠️ Errore nel salvataggio, riprova.' }, { quoted: m });
    }
  }
};
