const playlist = require('../lib/playlist');
const { ID_RE, react, ytInfo, sendVoice, friendlyError } = require('../lib/music');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  name: 'pl',
  aliases: ['playlist'],
  category: 'Musica',
  description: 'La tua playlist: .pl | .pl rimuovi 2 | .pl svuota | .pl play [numero]',
  run: async ({ sock, jid, m, args, prefix }) => {
    const user = playlist.userKey(m);
    const sub = (args[0] || '').toLowerCase();
    const reply = (text) => sock.sendMessage(jid, { text }, { quoted: m });

    if (sub === 'aggiungi' || sub === 'add') {
      const id = args[1] || '';
      if (ID_RE.test(id) === false) return reply(`Uso: usa il bottone ➕ Playlist dopo ${prefix}song`);
      try {
        const t = await ytInfo(id);
        const result = playlist.add(user, { id, title: t.title, artist: t.artist });
        if (result === 'exists') return reply('⚠️ Questo brano è già nella tua playlist.');
        if (result === 'full') return reply('⚠️ Playlist piena (massimo 50 brani).');
        await react(sock, jid, m, '✅');
        return reply(`✅ Aggiunto alla playlist:\n🎵 *${t.title}*`);
      } catch (e) {
        console.error('Errore .pl aggiungi:', e.message);
        return reply(friendlyError(e));
      }
    }

    if (sub === 'rimuovi' || sub === 'remove' || sub === 'rm') {
      const n = parseInt(args[1], 10);
      if (Number.isNaN(n)) return reply(`Uso: ${prefix}pl rimuovi numero`);
      const removed = playlist.removeAt(user, n - 1);
      if (removed === null) return reply('❌ Numero non valido.');
      await react(sock, jid, m, '🗑️');
      return reply(`🗑️ Rimosso: *${removed.title}*`);
    }

    if (sub === 'svuota' || sub === 'clear' || sub === 'reset') {
      if (playlist.getList(user).length === 0) return reply('📭 La playlist è già vuota.');
      playlist.clear(user);
      await react(sock, jid, m, '✅');
      return reply('✅ Playlist svuotata.');
    }

    if (sub === 'play' || sub === 'riproduci') {
      const list = playlist.getList(user);
      if (list.length === 0) return reply('📭 Playlist vuota.');

      let selection = list;
      if (args[1]) {
        const n = parseInt(args[1], 10);
        if (Number.isNaN(n) || n < 1 || n > list.length) return reply('❌ Numero non valido.');
        selection = [list[n - 1]];
      }

      await react(sock, jid, m, '🎧');
      let sent = 0;
      for (const s of selection) {
        try {
          const r = await sendVoice(sock, jid, m, s.id);
          if (r === 'ok') sent++;
          await sleep(1000);
        } catch (e) {
          console.error('Errore play:', s.title, e.message);
        }
      }
      await react(sock, jid, m, sent > 0 ? '✅' : '❌');
      if (sent === 0) return reply('❌ Nessun brano inviato, riprova.');
      return;
    }

    const list = playlist.getList(user);
    if (list.length === 0) {
      return reply(`📭 La tua playlist è vuota.\nCerca un brano con ${prefix}song e tocca ➕ Playlist.`);
    }
    const lines = list.map((t, i) => `${i + 1}. ${t.title}${t.artist ? ' - ' + t.artist : ''}`).join('\n');
    return reply(
      `🎧 *La tua playlist* (${list.length} brani)\n\n${lines}\n\n` +
      `📌 Comandi:\n` +
      `• ${prefix}pl play [numero]\n` +
      `• ${prefix}pl rimuovi numero\n` +
      `• ${prefix}pl svuota`
    );
  }
};
