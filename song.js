const { generateQuickReplyButtons } = require('@innovatorssoft/baileys');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const { react } = require('../lib/music');

module.exports = {
  name: 'song',
  aliases: ['canzone'],
  category: 'Musica',
  description: 'Cerca una canzone su YouTube: .song titolo artista',
  run: async ({ sock, jid, m, args, prefix }) => {
    const first = (args[0] || '').toLowerCase();
    const rest = args.slice(1);

    // ─── Sotto-azione: Scarica Audio ───────────────────────────
    if (first === 'audio') {
      const id = rest[0];
      if (!id) return;
      await react(sock, jid, m, '🎧');
      try {
        const url = `https://www.youtube.com/watch?v=${id}`;
        const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
        await sock.sendMessage(jid, {
          audio: stream,
          mimetype: 'audio/mp4',
          fileName: `audio.mp4`
        }, { quoted: m });
        await react(sock, jid, m, '✅');
      } catch (e) {
        console.error('Errore .song audio:', e.message);
        await react(sock, jid, m, '❌');
        await sock.sendMessage(jid, { text: '⚠️ Errore nel download audio (YouTube potrebbe aver bloccato la richiesta).' }, { quoted: m });
      }
      return;
    }

    // ─── Sotto-azione: Scarica Video ───────────────────────────
    if (first === 'video') {
      const id = rest[0];
      if (!id) return;
      await react(sock, jid, m, '⏳');
      try {
        const url = `https://www.youtube.com/watch?v=${id}`;
        // Usiamo una qualità più bassa per evitare che WhatsApp blocchi il file (limite ~64MB)
        const stream = ytdl(url, { filter: 'audioandvideo', quality: 'lowest' });
        await sock.sendMessage(jid, {
          video: stream,
          mimetype: 'video/mp4',
          caption: `🎬 Video da YouTube`
        }, { quoted: m });
        await react(sock, jid, m, '✅');
      } catch (e) {
        console.error('Errore .song video:', e.message);
        await react(sock, jid, m, '❌');
        await sock.sendMessage(jid, { text: '⚠️ Errore nel download video.' }, { quoted: m });
      }
      return;
    }

    // ─── Ricerca normale ───────────────────────────────────────
    const term = args.join(' ').trim();
    if (term === '') {
      return sock.sendMessage(jid, {
        text: `Uso: ${prefix}song titolo artista\nEsempio: ${prefix}song Despacito Luis Fonsi`
      }, { quoted: m });
    }
    await react(sock, jid, m, '⏳');
    try {
      const r = await yts(term);
      const v = r.videos[0]; // Prendi il primo risultato
      
      if (!v) {
        await react(sock, jid, m, '❌');
        return sock.sendMessage(jid, { text: '❌ Nessun video trovato.' }, { quoted: m });
      }

      const caption = `🎵 *${v.title}*\n👤 ${v.author.name}\n⏱️ ${v.timestamp}\n👁️ ${v.views.toLocaleString()} visualizzazioni\n\n🔗 Link: ${v.url}`;
      
      await sock.sendMessage(jid, { image: { url: v.thumbnail }, caption }, { quoted: m });

      const buttons = generateQuickReplyButtons(
        'Cosa vuoi fare? (Scarica da YouTube)',
        [
          { id: `.song audio ${v.videoId}`, displayText: '🎤 Audio (MP3)' },
          { id: `.song video ${v.videoId}`, displayText: '🎬 Video' },
          { id: `.pl aggiungi ${v.videoId}`, displayText: '➕ Playlist' }
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
