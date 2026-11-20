const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const MAX_AUDIO_SEC = 15 * 60;
const MAX_VIDEO_SEC = 8 * 60;
const ID_RE = /^[\w-]{11}$/;

function findCookiesFile() {
  const candidates = [
    path.join(process.cwd(), 'cookies.txt'),
    path.join(__dirname, '..', 'cookies.txt'),
    path.join(__dirname, 'cookies.txt')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 0) return p;
    } catch {}
  }
  return null;
}

function withYtArgs(baseArgs) {
  const args = [...baseArgs];
  const cookies = findCookiesFile();
  if (cookies) {
    args.push('--cookies', cookies);
  }
  return args;
}

async function react(sock, jid, m, emoji) {
  try {
    await sock.sendMessage(jid, { react: { text: emoji, key: m.key } });
  } catch (e) {}
}

function run(cmd, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

function fmtDuration(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const mi = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${mi}:${String(s).padStart(2, '0')}`;
}

async function ytSearch(term) {
  const args = withYtArgs(['--no-warnings', '--flat-playlist', '-j', `ytsearch5:${term}`]);
  const out = await run('yt-dlp', args);
  const items = out.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch (e) { return null; }
  }).filter(Boolean);
  const v = items.find(i => ID_RE.test(i.id || '') && !i.is_live);
  if (!v) return null;
  return {
    id: v.id,
    title: v.title || 'Senza titolo',
    channel: (v.channel || v.uploader || '').replace(/ - Topic$/, ''),
    duration: v.duration || 0,
    views: v.view_count || 0
  };
}

async function ytInfo(id) {
  const args = withYtArgs(['--no-warnings', '--no-playlist', '-j', `https://www.youtube.com/watch?v=${id}`]);
  const out = await run('yt-dlp', args);
  const v = JSON.parse(out);
  return {
    id,
    title: v.title || 'Senza titolo',
    artist: (v.artist || v.channel || v.uploader || '').replace(/ - Topic$/, '')
  };
}

async function fetchMedia(id, kind) {
  const stamp = `zeus_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const base = path.join(os.tmpdir(), stamp);
  const url = `https://www.youtube.com/watch?v=${id}`;
  const common = withYtArgs([
    '--no-warnings',
    '--no-playlist',
    '-q',
    '--socket-timeout', '20',
    '--retries', '3',
    '--extractor-args', 'youtube:player_client=android,web',
    '-o', `${base}.%(ext)s`
  ]);

  const args = kind === 'video'
    ? [
        ...common,
        '--match-filter', `duration<=${MAX_VIDEO_SEC}`,
        '-f', 'b[height<=480][ext=mp4]/bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[ext=mp4]',
        '--merge-output-format', 'mp4',
        url
      ]
    : [
        ...common,
        '--match-filter', `duration<=${MAX_AUDIO_SEC}`,
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        url
      ];

  await run('yt-dlp', args, 5 * 60 * 1000);
  const file = fs.readdirSync(os.tmpdir()).find(f => f.startsWith(stamp + '.'));
  return file ? path.join(os.tmpdir(), file) : null;
}

function cleanupStamp(file) {
  if (!file) return;
  const stamp = path.basename(file).split('.')[0];
  try {
    for (const f of fs.readdirSync(os.tmpdir())) {
      if (f.startsWith(stamp)) {
        try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch (e) {}
      }
    }
  } catch (e) {}
}

async function sendVoice(sock, jid, m, id) {
  const input = await fetchMedia(id, 'audio');
  if (!input) return 'toolong';
  const output = input.replace(/\.[^.]+$/, '') + '_out.ogg';
  try {
    let audioBuffer;
    let mimetype;
    try {
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-vn', '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1', '-f', 'ogg', output], 180000);
      audioBuffer = fs.readFileSync(output);
      mimetype = 'audio/ogg; codecs=opus';
    } catch (e) {
      console.error('ffmpeg non disponibile o in errore, invio senza conversione:', e.message);
      audioBuffer = fs.readFileSync(input);
      mimetype = 'audio/mp4';
    }
    await sock.sendMessage(jid, { audio: audioBuffer, mimetype, ptt: true }, { quoted: m });
    return 'ok';
  } finally {
    cleanupStamp(input);
    try { if (fs.existsSync(output)) fs.unlinkSync(output); } catch {}
  }
}

async function sendVideo(sock, jid, m, id, caption) {
  const file = await fetchMedia(id, 'video');
  if (!file) return 'toolong';
  try {
    await sock.sendMessage(jid, { video: { url: file }, mimetype: 'video/mp4', caption }, { quoted: m });
    return 'ok';
  } finally {
    cleanupStamp(file);
  }
}

function friendlyError(e) {
  if (e && e.code === 'ENOENT') return '⚠️ yt-dlp non è installato. Su Termux: pkg install yt-dlp ffmpeg';
  const stderr = String(e?.stderr || '');
  if (stderr.includes('confirm your age') || stderr.includes('Sign in')) {
    return '🔒 Video protetto da verifica età su YouTube: aggiungi un file `cookies.txt` nella cartella del bot o aggiorna `yt-dlp`.';
  }
  return '⚠️ Errore da YouTube, riprova (se continua: aggiorna yt-dlp).';
}

module.exports = {
  ID_RE, react, fmtDuration, ytSearch, ytInfo, sendVoice, sendVideo, friendlyError,
  MAX_AUDIO_SEC, MAX_VIDEO_SEC
};
