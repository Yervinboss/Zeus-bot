const playlist = require('../lib/playlist');

module.exports = {
  name: 'pl',
  aliases: ['playlist'],
  category: 'Musica',
  description: 'La tua playlist: .pl oppure .pl rimuovi 2',
  run: async ({ sock, jid, m, args, prefix }) => {
    const user = playlist.userKey(m);
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'rimuovi') {
      const n = parseInt(args[1], 10);
      if (Number.isNaN(n)) {
        return sock.sendMessage(jid, { text: `Uso: ${prefix}pl rimuovi numero` }, { quoted: m });
      }
      const removed = playlist.removeAt(user, n - 1);
      if (removed === null) {
        return sock.sendMessage(jid, { text: '❌ Numero non valido.' }, { quoted: m });
      }
      return sock.sendMessage(jid, { text: `🗑️ Rimosso: *${removed.title}*` }, { quoted: m });
    }

    const list = playlist.getList(user);
    if (list.length === 0) {
      return sock.sendMessage(jid, {
        text: `📭 La tua playlist è vuota.\nCerca un brano con ${prefix}song e tocca ➕ Playlist.`
      }, { quoted: m });
    }

    const isGroup = jid.endsWith('@g.us');
    if (isGroup) {
      const lines = list.map((t, i) => `${i + 1}. ${t.title} - ${t.artist}`).join('\n');
      return sock.sendMessage(jid, {
        text: `🎧 *La tua playlist* (${list.length} brani)\n\n${lines}\n\nPer rimuovere: ${prefix}pl rimuovi numero`
      }, { quoted: m });
    }

    const start = Math.max(0, list.length - 10);
    const rows = list.slice(start).map((t, i) => ({
      title: `${start + i + 1}. ${t.title}`.slice(0, 24),
      rowId: `.songaudio ${t.id}`,
      description: t.artist.slice(0, 72)
    }));

    await sock.sendMessage(jid, {
      text: `🎧 *La tua playlist* (${list.length} brani)\nTocca un brano per l'anteprima vocale.\nPer rimuovere: ${prefix}pl rimuovi numero`,
      footer: 'Zeus Bot',
      title: '🎵 Playlist',
      buttonText: '📋 Apri playlist',
      sections: [{ title: 'Ultimi brani', rows }]
    }, { quoted: m });
  }
};
