const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

async function react(sock, jid, m, emoji) {
  try {
    await sock.sendMessage(jid, { react: { text: emoji, key: m.key } });
  } catch (e) {}
}

async function itunesSearch(term, entity) {
  const media = entity === 'musicVideo' ? 'musicVideo' : 'music';
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=${media}&entity=${entity}&limit=1&country=IT`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results && data.results[0];
}

async function itunesLookup(id) {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=IT`);
  const data = await res.json();
  return data.results && data.results[0];
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 60000 }, (err) => (err ? reject(err) : resolve()));
  });
}

async function sendVoicePreview(sock, jid, m, previewUrl) {
  const stamp = Date.now() + '_' + Math.floor(Math.random() * 1000);
  const input = path.join(os.tmpdir(), `zeus_${stamp}.m4a`);
  const output = path.join(os.tmpdir(), `zeus_${stamp}.ogg`);
  try {
    const res = await fetch(previewUrl);
    if (res.ok === false) throw new Error('download anteprima fallito');
    fs.writeFileSync(input, Buffer.from(await res.arrayBuffer()));

    let audioBuffer;
    let mimetype;
    try {
      await run('ffmpeg', ['-y', '-i', input, '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1', '-f', 'ogg', output]);
      audioBuffer = fs.readFileSync(output);
      mimetype = 'audio/ogg; codecs=opus';
    } catch (e) {
      console.error('ffmpeg non disponibile o in errore, invio senza conversione:', e.message);
      audioBuffer = fs.readFileSync(input);
      mimetype = 'audio/mp4';
    }
    await sock.sendMessage(jid, { audio: audioBuffer, mimetype, ptt: true }, { quoted: m });
  } finally {
    for (const f of [input, output]) {
      try { fs.unlinkSync(f); } catch (e) {}
    }
  }
}

module.exports = { react, itunesSearch, itunesLookup, sendVoicePreview };
