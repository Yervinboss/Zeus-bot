const playlist = require('../lib/playlist');
const ytdl = require('@distube/ytdl-core');
const { react } = require('../lib/music');

module.exports = {
  name: 'pl',
  aliases: ['playlist'],
  category: 'Musica',
  description: 'La tua playlist YouTube: .pl | .pl rimuovi 2 | .pl svuota | .pl play',
  run: async ({ sock, jid, m, args, prefix }) => {
    const user = playlist.userKey(m);
    const sub = (args[0] || '').toLowerCase();

    // ─── Aggiungi brano da YouTube ────────────────────────────
    if (sub === 'aggiungi' || sub === 'add') {
      const id = args[1];
      if (!id) return;
      try {
        const info = await ytdl.getBasicInfo(`https://www.youtube.com/watch?v=${id}`);
        const result = playlist.add(user, {
          id: id,
          title: info.videoDetails.title,
          artist: info.videoDetails.author.name
        });
        
        if (result === 'exists') {
          return sock.sendMessage(jid, { text: '⚠️ Questo brano è già nella tua playlist.' }, { quoted: m });
        }
        if (result === 'full') {
          return sock.sendMessage(jid, { text: '⚠️ Playlist piena (massimo 50 brani).' }, { quoted: m });
        }
        
        await react(sock, jid, m, '✅');
        await sock.sendMessage(jid, { text: `✅ Aggiunto alla playlist:\n🎵 *${info.videoDetails.title}*` }, { quoted: m });
      } catch (e) {
        console.error('Errore .pl aggiungi:', e.message);
        await sock.sendMessage(jid, { text: '⚠️ Errore nell\'aggiunta (Video non trovato).' }, { quoted: m });
      }
      return;
    }

    // ─── Rimuovi brano ─────────────────────────────────────────
    if (sub === 'rimuovi' || sub === 'remove' || sub === 'rm') {
      const n = parseInt(args[1], 10);
      if (Number.isNaN(n)) {
        return sock.sendMessage(jid, { text: `Uso: ${prefix}pl rimuovi numero` }, { quoted: m });
      }
      const removed = playlist.removeAt(user, n - 1);
      if (removed === null) {
        return sock.sendMessage(jid, { text: '❌ Numero non valido.' }, { quoted: m });
      }
      await react(sock, jid, m, '🗑️');
      return sock.sendMessage(jid, { text: `🗑️ Rimosso: *${removed.title}*` }, { quoted: m });
    }

    // ─── Svuota playlist ──────────────────────────────────────
    if (sub === 'svuota' || sub === 'clear' || sub === 'reset') {
      const list = playlist.getList(user);
      if (list.length === 0) {
        return sock.sendMessage(jid, { text: '📭 La playlist è già vuota.' }, { quoted: m });
      }
      while (playlist.getList(user).length > 0) {
        playlist.removeAt(user, 0);
      }
      await react(sock, jid, m, '✅');
      return sock.sendMessage(jid, { text: `✅ Playlist svuotata.` }, { quoted: m });
    }

    // ─── Riproduci (scarica da YouTube) ────────────────────────
    if (sub === 'play' || sub === 'riproduci') {
      const list = playlist.getList(user);
      if (list.length === 0) {
        return sock.sendMessage(jid, { text: '📭 Playlist vuota.' }, { quoted: m });
      }
      await react(sock, jid, m, '🎧');
      let sent = 0;
      
      for (const s of list) {
        try {
          const stream = ytdl(`https://www.youtube.com/watch?v=${s.id}`, { filter: 'audioonly', quality: 'highestaudio' });
          await sock.sendMessage(jid, {
            audio: stream,
            mimetype: 'audio/mp4',
            fileName: `${s.title}.mp4`
          }, { quoted: m });
          sent++;
        } catch (e) {
          console.error('Errore play:', s.title, e.message);
        }
      }
      
      await react(sock, jid, m, sent > 0 ? '✅' : '❌');
      if (sent === 0) {
        return sock.sendMessage(jid, { text: '❌ Nessuna canzone riprodotta (blocco di YouTube).' }, { quoted: m });
      }
      return;
    }

    // ─── Lista (default) ──────────────────────────────────────
    const list = playlist.getList(user);
    if (list.length === 0) {
      return sock.sendMessage(jid, {
        text: `📭 La tua playlist è vuota.\nCerca un brano con ${prefix}song e tocca ➕ Playlist.`
      }, { quoted: m });
    }

    const lines = list.map((t, i) => `${i + 1}. ${t.title} - ${t.artist}`).join('\n');
    return sock.sendMessage(jid, {
      text:
        `🎧 *La tua playlist* (${list.length} brani)\n\n${lines}\n\n` +
        `📌 Comandi:\n` +
        `• ${prefix}pl rimuovi numero\n` +
        `• ${prefix}pl svuota\n` +
        `• ${prefix}pl play`
    }, { quoted: m });
  }
};
