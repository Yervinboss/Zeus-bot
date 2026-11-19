const items = [
  { title: 'Card 1', desc: 'Descrizione 1', img: 'https://picsum.photos/id/10/600/400', id: '.ping' },
  { title: 'Card 2', desc: 'Descrizione 2', img: 'https://picsum.photos/id/1015/600/400', id: '.info' },
  { title: 'Card 3', desc: 'Descrizione 3', img: 'https://picsum.photos/id/1018/600/400', id: '.menu' }
];

module.exports = {
  name: 'carousel',
  aliases: ['card'],
  category: 'Interattivi',
  description: 'Card scorrevoli',
  run: async ({ sock, jid, m }) => {
    try {
      await sock.sendMessage(jid, {
        text: '🎠 Scorri le card',
        footer: 'Zeus Bot',
        cards: items.map(it => ({
          image: { url: it.img },
          title: it.title,
          body: it.desc,
          footer: 'Zeus Bot',
          buttons: [{
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: 'Scegli', id: it.id })
          }]
        }))
      }, { quoted: m });
    } catch (err) {
      console.error('Carousel non inviato:', err.message);
      for (const it of items) {
        await sock.sendMessage(jid, {
          image: { url: it.img },
          caption: `*${it.title}*\n${it.desc}\n\nUsa: ${it.id}`
        }, { quoted: m });
      }
    }
  }
};
