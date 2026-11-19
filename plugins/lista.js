module.exports = {
  name: 'lista',
  aliases: [],
  category: 'Interattivi',
  description: 'Lista (formato classico, solo chat private)',
  run: async ({ sock, jid, m }) => {
    await sock.sendMessage(jid, {
      text: '📋 *Lista comandi di Zeus*',
      footer: 'Zeus Bot',
      title: '⚡ Zeus',
      buttonText: '📋 Apri lista',
      sections: [{
        title: 'Comandi',
        rows: [
          { title: 'Ping', rowId: '.ping', description: 'Test del bot' },
          { title: 'Info', rowId: '.info', description: 'Info sul bot' },
          { title: 'Menu', rowId: '.menu', description: 'Menu completo' }
        ]
      }]
    }, { quoted: m });
  }
};
