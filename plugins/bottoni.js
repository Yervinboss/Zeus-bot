const { generateQuickReplyButtons } = require('@innovatorssoft/baileys');

module.exports = {
  name: 'bottoni',
  aliases: ['buttons'],
  category: 'Interattivi',
  description: 'Messaggio con bottoni',
  run: async ({ sock, jid, m }) => {
    const content = generateQuickReplyButtons(
      '⚡ *Scegli un\'opzione:*',
      [
        { id: '.ping', displayText: '🏓 Ping' },
        { id: '.info', displayText: 'ℹ️ Info' },
        { id: '.menu', displayText: '📋 Menu' }
      ],
      { footer: 'Zeus Bot' }
    );
    await sock.sendMessage(jid, content, { quoted: m });
  }
};
