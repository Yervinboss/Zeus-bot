const os = require('os');
const { execFile } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}g`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${x}s`);
  return parts.join(' ');
}

const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
const gb = (b) => `${(b / 1073741824).toFixed(1)} GB`;

function bar(pct, len = 10) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const f = Math.round((p / 100) * len);
  return '▰'.repeat(f) + '▱'.repeat(len - f);
}

function rate(ms) {
  if (ms < 300) return '🟢 Ottima';
  if (ms < 800) return '🟡 Buona';
  if (ms < 2000) return '🟠 Lenta';
  return '🔴 Pessima';
}

function sh(cmd, args, timeout = 2500) {
  return new Promise((resolve) => {
    try { execFile(cmd, args, { timeout }, (e, out) => resolve(e ? null : String(out))); }
    catch { resolve(null); }
  });
}

async function cpuUsage() {
  try {
    const snap = () => os.cpus().reduce((a, c) => {
      const t = Object.values(c.times).reduce((x, y) => x + y, 0);
      return { idle: a.idle + c.times.idle, total: a.total + t };
    }, { idle: 0, total: 0 });
    const a = snap();
    if (!a.total) return null;
    await sleep(250);
    const b = snap();
    const dt = b.total - a.total;
    return dt > 0 ? Math.round((1 - (b.idle - a.idle) / dt) * 100) : null;
  } catch { return null; }
}

async function battery() {
  const out = await sh('termux-battery-status', []);
  if (!out) return null;
  try {
    const j = JSON.parse(out);
    return { pct: j.percentage, status: j.status, temp: j.temperature };
  } catch { return null; }
}

async function disk() {
  const out = await sh('df', ['-k', process.env.HOME || '/']);
  if (!out) return null;
  const line = out.trim().split('\n').pop().trim().split(/\s+/);
  const total = Number(line[1]) * 1024, used = Number(line[2]) * 1024;
  return total > 0 ? { total, used } : null;
}

module.exports = {
  name: 'ping',
  aliases: ['p', 'status', 'uptime', 'pong', 'latenza'],
  category: 'Generali',
  description: 'Latenza reale, uptime, CPU, RAM, disco e batteria di Zeus',
  cooldown: 3000,
  run: async ({ sock, jid, m, stats, db, plugins, reply, react }) => {
    await react('🏓');

    const msgSec = Number(m.messageTimestamp || 0) || 0;
    const inbound = msgSec > 0 ? Math.max(1, Date.now() - msgSec * 1000) : 0;

    const t0 = Date.now();
    const sent = await reply({ text: '🏓 *Pinging…*' }).catch(() => null);
    const rtt = Date.now() - t0;

    const [cpu, bat, dsk] = await Promise.all([cpuUsage(), battery(), disk()]);

    const nowMs = Date.now();
    const uptimeMs = stats?.startedAt ? nowMs - stats.startedAt : process.uptime() * 1000;
    const procMem = process.memoryUsage().rss;
    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();
    const memPct = Math.round((usedMem / totalMem) * 100);
    const load = os.loadavg()[0]?.toFixed(2) || '0.00';
    const cores = os.cpus()?.length || 0;
    const top = Object.entries(db?.usage || {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([n, c], i) => `${['🥇', '🥈', '🥉'][i]} ${n} (${c})`);

    const lines = [
      '⚡ *ZEUS ONLINE* ⚡',
      '━━━━━━━━━━━━━━━━━━',
      '🏓 *LATENZA*',
      ` ↳ Risposta: *${rtt} ms* · ${rate(rtt)}`,
      ...(inbound ? [` ↳ Ricezione: ${inbound} ms`] : []),
      '',
      '⏱️ *UPTIME*',
      ` ↳ ${formatDuration(uptimeMs)}`,
      '',
      '🧠 *RISORSE*',
      ...(cpu !== null ? [` ↳ CPU: *${cpu}%* ${bar(cpu)}${cores ? ` (${cores} core)` : ''}`] : [` ↳ Load: ${load}${cores ? ` (${cores} core)` : ''}`]),
      ` ↳ RAM: *${memPct}%* ${bar(memPct)}`,
      `    ${mb(usedMem)} / ${mb(totalMem)}`,
      ` ↳ RAM bot: ${mb(procMem)}`,
      ...(dsk ? [` ↳ Disco: *${Math.round((dsk.used / dsk.total) * 100)}%* ${bar((dsk.used / dsk.total) * 100)}`, `    ${gb(dsk.used)} / ${gb(dsk.total)}`] : []),
      ...(bat ? [` ↳ Batteria: *${bat.pct}%* ${bar(bat.pct)} ${/CHARGING/i.test(bat.status || '') ? '🔌' : '🔋'}${bat.temp ? ` ${Math.round(bat.temp)}°C` : ''}`] : []),
      '',
      '🤖 *BOT*',
      ` ↳ Comandi: ${stats?.commandsExecuted ?? 0} (totali ${db?.totalCommands ?? 0})`,
      ` ↳ Errori: ${stats?.errors ?? 0}`,
      ...(plugins ? [` ↳ Plugin: ${plugins.size}`] : []),
      ` ↳ Modo: ${db?.mode === 'private' ? 'privato 🔒' : 'pubblico 🌍'}`,
      ` ↳ Node ${process.version} · ${os.platform()} ${os.arch()}`,
      ...(top.length ? ['', '🏆 *PIÙ USATI*', ...top.map((t) => ` ↳ ${t}`)] : []),
      '',
      `📅 ${new Date().toLocaleString('it-IT', { hour12: false })}`
    ];
    const text = lines.join('\n');

    let edited = false;
    if (sent?.key) {
      edited = await sock.sendMessage(jid, { text, edit: sent.key }).then(() => true).catch(() => false);
    }
    if (!edited) await reply({ text });
    react('✅');
  }
};
