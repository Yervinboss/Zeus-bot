const { OWNERS } = require('../lib/config');

const clean = (jid) => (jid || '').split('@')[0].split(':')[0];

module.exports = {
  name: 'reload',
  aliases: [],
  category: 'Admin',
  description: 'Ricarica i plugin (solo admin)',
  run: async ({ sock, jid, m, reload }) => {
    const ids = [
      m.key.participant,
      m.key.participantAlt,
      m.key.remoteJid,
      m.key.remoteJidAlt
    ].map(clean).filter(Boolean);

    const isOwner = m.key.fromMe || ids.some(id => OWNERS.includes(id));

    if (!isOwner) {
      console.log('Reload negato, ID ricevuti:', ids);
      return sock.sendMessage(jid, { text: '⛔ Solo gli admin possono usare questo comando.' }, { quoted: m });
    }
    const n = reload();
    await sock.sendMessage(jid, { text: `🔄 Plugin ricaricati: ${n}` }, { quoted: m });
  }
};
