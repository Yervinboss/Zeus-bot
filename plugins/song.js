const { generateQuickReplyButtons } = require('@innovatorssoft/baileys');
const { ID_RE, react, fmtDuration, ytSearch, sendVoice, sendVideo, friendlyError, MAX_AUDIO_SEC, MAX_VIDEO_SEC } = require('../lib/music');

module.exports = {
  name: 'song',
  aliases: ['canzone', 'play'],
  category: 'Musica',
  description: 'Cerca una canzone su YouTube: .song titolo artista',
  run: async ({ sock, jid, m, args, prefix }) => {
    const action = (args[0] || '').toLowerCase();
    const id = args[1] || '';

    if (action === 'audio' && ID_RE.test(id)) {
      await react(sock, jid, m, '🎧');
      try {
        const r = await sendVoice(sock, jid, m, id);
        if (r === 'toolong') {
          await react(sock, jid, m, '❌');
          return sock.sendMessage(jid, { text: `❌ Brano troppo lungo (massimo ${MAX_AUDIO_SEC / 60} minuti).` }, { quoted: m });
        }
        await react(sock, jid, m, '✅');
      } catch (e) {
        console.error('Errore .song audio:', e.message, e.stderr || '');
        await react(sock, jid, m, '❌');
        await sock.sendMessage(jid, { text: friendlyError(e) }, { quoted: m });
      }
      return;
    }

    if (action === 'video' && ID_RE.test(id)) {
      await react(sock, jid, m, '⏳');
      try {
        const r = await sendVideo(sock, jid, m, id, '🎬 Ecco il tuo video!');
        if (r === 'toolong') {
          await react(sock, jid, m, '❌');
          return sock.sendMessage(jid, { text: `❌ Video troppo lungo (massimo ${MAX_VIDEO_SEC / 60} minuti).` }, { quoted: m });
        }
        await react(sock, jid, m, '✅');
      } catch (e) {
        console.error('Errore .song video:', e.message, e.stderr || '');
        await react(sock, jid, m, '❌');
        await sock.sendMessage(jid, { text: friendlyError(e) }, { quoted: m });
      }
      return;
    }

    const term = args.join(' ').trim();
    if (term === '') {
      return sock.sendMessage(jid, {
        text: `Uso: ${prefix}song titolo artista\nEsempio: ${prefix}song Blinding Lights The Weeknd`
      }, { quoted: m });
    }

    await react(sock, jid, m, '⏳');
    try {
      const v = await ytSearch(term);
      if (!v) {
        await react(sock, jid, m, '❌');
        return sock.sendMessage(jid, { text: `❌ Nessun risultato per: ${term}` }, { quoted: m });
      }

      const thumb = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
      const caption =
        `🎶 *ZEUS MUSIC* 🎶\n\n` +
        `📌 *Titolo:* ${v.title}\n` +
        `⏱ *Durata:* ${fmtDuration(v.duration)}\n` +
        `👁️ *Visualizzazioni:* ${v.views}\n`;
      const btns = [
        { id: `${prefix}song audio ${v.id}`, label: '🎤 Vocale' },
        { id: `${prefix}song video ${v.id}`, label: '🎬 Video MP4' },
        { id: `${prefix}pl aggiungi ${v.id}`, label: '➕ Aggiungi a playlist' }
      ];

      try {
        await sock.sendMessage(jid, {
          image: { url: thumb },
          caption,
          footer: 'Zeus Bot',
          buttons: btns.map(b => ({ buttonId: b.id, buttonText: { displayText: b.label }, type: 1 })),
          headerType: 4
        }, { quoted: m });
      } catch (e) {
        console.error('Formato bottoni non inviato, uso il formato semplice:', e.message);
        await sock.sendMessage(jid, { image: { url: thumb }, caption }, { quoted: m });
        const buttons = generateQuickReplyButtons(
          'Cosa vuoi fare?',
          btns.map(b => ({ id: b.id, displayText: b.label })),
          { footer: 'Zeus Bot' }
        );
        await sock.sendMessage(jid, buttons, { quoted: m });
      }
      await react(sock, jid, m, '✅');
    } catch (e) {
      console.error('Errore .song:', e.message, e.stderr || '');
      await react(sock, jid, m, '❌');
      await sock.sendMessage(jid, { text: friendlyError(e) }, { quoted: m });
    }
  }
};
