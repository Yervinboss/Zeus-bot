module.exports = {
  name: 'menu',
  aliases: ['zeus', 'help'],
  category: 'Generali',
  description: 'Mostra tutti i comandi',
  run: async ({ sock, jid, m, plugins, prefix }) => {
    const groups = {};
    for (const p of plugins.values()) {
      if (p.hidden === true) continue;
      const cat = p.category || 'Altro';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    let t = '⚡ *Menu di Zeus*\n';
    for (const [cat, list] of Object.entries(groups)) {
      t += `\n*${cat}*\n`;
      for (const p of list) t += `• ${prefix}${p.name} — ${p.description || ''}\n`;
    }
    t += '\n_Zeus Bot_';
    await sock.sendMessage(jid, { text: t }, { quoted: m });
  }
};
