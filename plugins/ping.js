const os = require('os');

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}g`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  name: 'ping',
  aliases: ['p', 'status', 'uptime'],
  category: 'Generali',
  description: 'Testa latenza, uptime e stato di sistema di Zeus',
  cooldown: 2000,
  run: async ({ m, stats, reply, react }) => {
    await react('⚡');

    const msgSeconds = Number(m.messageTimestamp || 0);
    const nowMs = Date.now();
    const diffMs = msgSeconds > 0 ? Math.max(1, nowMs - msgSeconds * 1000) : 0;

    const procMem = process.memoryUsage().rss;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedSysMem = totalMem - freeMem;
    const uptimeMs = stats?.startedAt ? nowMs - stats.startedAt : process.uptime() * 1000;
    const load1m = os.loadavg()[0]?.toFixed(2) || '0.00';

    const text = [
      '⚡ *ZEUS ONLINE — STATUS REPORT*',
      '',
      `🏓 *Latenza:* ${diffMs > 0 ? `${diffMs} ms` : 'N/D'}`,
      `⏱️ *Uptime:* ${formatDuration(uptimeMs)}`,
      `🧠 *RAM Bot:* ${formatMB(procMem)}`,
      `💾 *RAM Sistema:* ${formatMB(usedSysMem)} / ${formatMB(totalMem)}`,
      `⚙️ *Load (1m):* ${load1m} (${os.arch()})`,
      `📊 *Comandi eseguiti:* ${stats?.commandsExecuted ?? 0}`
    ].join('\n');

    await reply({ text });
  }
};
