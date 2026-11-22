const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const MAX_AUDIO_SEC = 900;
const MAX_VIDEO_SEC = 480;
let busy = 0;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const baseTitle = (s) => norm(String(s).replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s-\s.*$/, ''));
const fmtTime = (ms) => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

async function itunes(term, artistOnly) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=50${artistOnly ? '&attribute=artistTerm' : ''}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  return (await res.json()).results || [];
}

function pick(list, artist, strict) {
  const a = norm(artist);
  const seen = new Set(), out = [];
  for (const t of list) {
    if (!t.trackName) continue;
    if (strict && !norm(t.artistName).includes(a)) continue;
    const key = baseTitle(t.trackName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length === 5) break;
  }
  return out;
}

async function ytFill(artist, have) {
  try {
    const out = await run('yt-dlp', ['--no-warnings', '--flat-playlist', '-j', '--extractor-args', 'youtube:player_client=default', `ytsearch12:${artist}`], 60000);
    const a = norm(artist);
    const seen = new Set(have.map((t) => baseTitle(t.trackName)));
    const res = [...have];
    for (const line of out.split('\n').filter(Boolean)) {
      if (res.length >= 5) break;
      let v;
      try { v = JSON.parse(line); } catch { continue; }
      if (!v.id || v.is_live || !(v.duration >= 60 && v.duration <= 600)) continue;
      if (!norm(`${v.title} ${v.channel || v.uploader || ''}`).includes(a)) continue;
      const parts = String(v.title).split(/\s[-–]\s/);
      let name = parts.length > 1 ? parts.slice(1).join(' - ') : String(v.title);
      name = name.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/, '').trim() || String(v.title);
      const key = baseTitle(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      res.push({
        trackName: cut(name, 50),
        artistName: have[0]?.artistName || artist,
        collectionName: '',
        trackTimeMillis: v.duration * 1000,
        artworkUrl100: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        query: cut(String(v.title), 120)
      });
    }
    return res;
  } catch (e) { return have; }
}

async function topSongs(artist) {
  let list = await itunes(artist, true).catch(() => []);
  if (!list.length) list = await itunes(artist, false);
  const strict = pick(list, artist, true);
  const base = strict.length ? strict : pick(list, artist, false);
  return base.length >= 5 ? base : await ytFill(artist, base);
}

function run(cmd, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.code !== 101) { err.stderr = stderr; return reject(err); }
      resolve(stdout);
    });
  });
}

function cleanup(stamp) {
  const dir = os.tmpdir();
  try { for (const f of fs.readdirSync(dir)) if (f.startsWith(stamp + '.')) fs.unlinkSync(path.join(dir, f)); } catch {}
}

async function download(query, kind) {
  const stamp = `zeus_tp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const dir = os.tmpdir();
  const common = [
    '--no-warnings', '--no-playlist', '-q', '--socket-timeout', '20', '--retries', '3',
    '--extractor-args', 'youtube:player_client=default',
    '--max-downloads', '1', '--max-filesize', '50M',
    '-o', path.join(dir, `${stamp}.%(ext)s`)
  ];
  const args = kind === 'video'
    ? [...common, '--match-filter', `duration<=${MAX_VIDEO_SEC}`,
        '-f', 'b[height<=480][ext=mp4]/bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[ext=mp4]',
        '--merge-output-format', 'mp4', `ytsearch3:${query} official video`]
    : [...common, '--match-filter', `duration<=${MAX_AUDIO_SEC}`,
        '-f', 'bestaudio[ext=m4a]/bestaudio/best', `ytsearch3:${query} official audio`];
  try {
    await run('yt-dlp', args, 5 * 60 * 1000);
  } catch (e) { cleanup(stamp); throw e; }
  const file = fs.readdirSync(dir).find((f) => f.startsWith(stamp + '.') && !f.endsWith('.part'));
  return { file: file ? path.join(dir, file) : null, stamp };
}

const MIME = { m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg; codecs=opus', opus: 'audio/ogg; codecs=opus', webm: 'audio/webm' };

module.exports = {
  name: 'tp',
  aliases: ['tpplay', 'tpvideo', 'tpmenu', 'top5'],
  category: 'Musica',
  description: 'Top 5 canzoni di un artista con bottoni Riproduci e Manda video',
  cooldown: 1500,
  run: async ({ sock, jid, m, args, command, prefix, reply, react }) => {
    const P = prefix || '.';
    const query = args.join(' ').trim();

    // ── Menu scelta (secondo passo) ──
    if (command === 'tpmenu') {
      if (!query) return;
      const { generateQuickReplyButtons } = require('@innovatorssoft/baileys');
      const content = generateQuickReplyButtons(
        `🎵 *${query}*\n\nCosa vuoi fare?`,
        [
          { id: `${P}tpplay ${query}`, displayText: '▶️ Riproduci' },
          { id: `${P}tpvideo ${query}`, displayText: '🎬 Manda video' }
        ],
        { footer: 'Zeus Music' }
      );
      await sock.sendMessage(jid, content, { quoted: m });
      return;
    }

    // ── Bottoni: Riproduci / Manda video ──
    if (command === 'tpplay' || command === 'tpvideo') {
      const kind = command === 'tpvideo' ? 'video' : 'audio';
      if (!query) return reply({ text: '⚠️ Canzone mancante.' });
      if (busy >= 2) return reply({ text: '⏳ Sto già scaricando altre canzoni, riprova tra poco.' });
      busy++;
      await react('⏳');
      let job = null;
      try {
        for (let i = 0; i < 2 && !job?.file; i++) {
          try { job = await download(query, kind); }
          catch (e) {
            const txt = String(e.stderr || e.message);
            if (i === 1 || !/403|timed out|HTTP Error/i.test(txt)) throw e;
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
        if (!job?.file) {
          await react('❌');
          return reply({ text: `❌ Non ho trovato una versione adatta di *${query}* (max ${kind === 'video' ? MAX_VIDEO_SEC / 60 : MAX_AUDIO_SEC / 60} minuti).` });
        }
        const buf = fs.readFileSync(job.file);
        const ext = path.extname(job.file).slice(1).toLowerCase();
        if (kind === 'video') {
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: `🎬 ${query}` }, { quoted: m });
        } else {
          await sock.sendMessage(jid, { audio: buf, mimetype: MIME[ext] || 'audio/mp4', fileName: `${query}.${ext}` }, { quoted: m });
        }
        await react('✅');
      } catch (e) {
        console.error(`Errore ${command}:`, String(e.stderr || e.message).slice(0, 300));
        await react('❌');
        const txt = String(e.stderr || e.message);
        const msg = e.code === 'ENOENT' ? '⚠️ yt-dlp non è installato (pkg install yt-dlp ffmpeg).'
          : /403/.test(txt) ? '⚠️ YouTube ha rifiutato il download (403). Riprova tra poco.'
          : '⚠️ Download non riuscito, riprova.';
        await reply({ text: msg });
      } finally {
        busy--;
        if (job?.stamp) cleanup(job.stamp);
      }
      return;
    }

    // ── .tp <artista> ──
    if (!query) return reply({ text: `🎤 Scrivi il nome dell'artista.\nEsempio: ${P}tp Sfera Ebbasta` });
    await react('🔎');
    let songs;
    try { songs = await topSongs(query); }
    catch (e) { await react('❌'); return reply({ text: '⚠️ Ricerca non riuscita, riprova tra poco.' }); }
    if (!songs.length) { await react('❌'); return reply({ text: `❌ Nessuna canzone trovata per *${query}*.` }); }

    const artistName = songs[0].artistName;
    const qOf = (t) => cut(t.query || `${t.artistName} - ${t.trackName}`, 120);
    const imgOf = (t) => (t.artworkUrl100 || '').replace('100x100bb', '600x600bb') || 'https://picsum.photos/600/600';

    const cards = songs.map((t, i) => ({
      image: { url: imgOf(t) },
      title: cut(`${i + 1}. ${t.trackName}`, 60),
      body: [t.artistName, t.collectionName ? `💿 ${cut(t.collectionName, 40)}` : '', `⏱️ ${fmtTime(t.trackTimeMillis)}`].filter(Boolean).join(' · '),
      footer: 'Zeus Music',
      buttons: [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🎧 Seleziona', id: `${P}tpmenu ${qOf(t)}` }) }
      ]
    }));

    let sent = false, lastErr = null;
    for (let attempt = 0; attempt < 2 && !sent; attempt++) {
      try {
        await sock.sendMessage(jid, { text: `🎤 *Top 5 — ${artistName}*\nScorri e premi Seleziona 👉`, footer: 'Zeus Music', cards }, { quoted: m });
        sent = true;
      } catch (err) {
        lastErr = err;
        console.error('Carousel .tp non inviato:', err.message);
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    if (!sent) {
      await react('❌');
      return reply({ text: `⚠️ Carosello non inviato.\n${String(lastErr?.message || lastErr).slice(0, 150)}` });
    }
    await react('✅');
  }
};
