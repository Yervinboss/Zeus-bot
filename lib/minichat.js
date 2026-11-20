const ESC = '\x1b[';
const RESET = ESC + '0m';
const fg = (n) => `${ESC}38;5;${n}m`;
const out = (s) => process.stdout.write(s);
const W = () => process.stdout.columns || 60;

function fitText(str, maxLen) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  return maxLen > 1 ? s.slice(0, maxLen - 1) + '…' : s.slice(0, maxLen);
}

function formatTime(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function drawMiniChat({
  userName = 'Utente',
  userJid = '',
  chatTitle = 'Chat Privata',
  isGroup = false,
  incomingText = '',
  botReplyText = ''
}) {
  if (!process.stdout.isTTY) return;

  const boxWidth = Math.max(38, Math.min(62, W() - 4));
  const inner = boxWidth - 4;
  const padLeft = Math.max(1, Math.floor((W() - boxWidth) / 2) + 1);
  const pad = ' '.repeat(padLeft);
  const ora = formatTime();

  const headerBadge = isGroup ? '👥 GRUPPO' : '💬 PRIVATO';
  const line1 = fitText(`${headerBadge} · ${chatTitle}`, inner - 9).padEnd(inner - 9, ' ');
  const line2 = fitText(`👤 ${userName} (${userJid.split('@')[0] || 'id'})`, inner);

  const userBubble = fitText(`▸ ${incomingText}`, inner - 4);
  const botBubble = botReplyText ? fitText(`⚡ ${botReplyText}`, inner - 4) : '';

  const top = `${pad}${fg(220)}╭${'─'.repeat(boxWidth - 2)}╮${RESET}`;
  const mid = `${pad}${fg(220)}├${'─'.repeat(boxWidth - 2)}┤${RESET}`;
  const bot = `${pad}${fg(220)}╰${'─'.repeat(boxWidth - 2)}╯${RESET}`;

  const rowHeader = `${pad}${fg(220)}│${RESET} ${fg(39)}${line1}${RESET} ${fg(244)}${ora}${RESET} ${fg(220)}│${RESET}`;
  const rowUserMeta = `${pad}${fg(220)}│${RESET} ${fg(229)}${line2.padEnd(inner, ' ')}${RESET} ${fg(220)}│${RESET}`;

  const userBox = ` ${fg(236)}[${RESET}${fg(231)}${userBubble.padEnd(inner - 2, ' ')}${RESET}${fg(236)}]${RESET}`;
  const rowMsg = `${pad}${fg(220)}│${userBox}${fg(220)}│${RESET}`;

  const lines = [top, rowHeader, rowUserMeta, mid, rowMsg];

  if (botBubble) {
    const botBox = ` ${fg(236)}[${RESET}${fg(226)}${botBubble.padEnd(inner - 2, ' ')}${RESET}${fg(236)}]${RESET}`;
    lines.push(`${pad}${fg(220)}│${botBox}${fg(220)}│${RESET}`);
  }

  lines.push(bot);
  out('\n' + lines.join('\n') + '\n');
}

module.exports = { drawMiniChat };
