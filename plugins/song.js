const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const yts = require('yt-search');

const dbPath = path.join(__dirname, '../zenomusic_db.json');
const playlistDbPath = path.join(__dirname, '../playlist_db.json');

const readDb = (p = dbPath) => {
    if (!fs.existsSync(p)) return {};
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
};
const writeDb = (data, p = dbPath) => {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
};

module.exports = {
    name: 'song',
    aliases: ['play', 'canzone', 'sendnormal', 'sendvideo', 'addplaylist'],
    category: 'Musica',
    description: 'Cerca e scarica canzoni da YouTube',
    run: async ({ sock, jid, m, args, prefix }) => {
        const sender = m.key.participant || m.key.remoteJid;
        const usedPrefix = prefix || '.';
        
        let rawInput = args.join(' ').trim();
        let btnId = m.message?.buttonsResponseMessage?.selectedButtonId || m.message?.templateButtonReplyMessage?.selectedId || m.msg?.selectedButtonId || '';
        
        if (btnId) rawInput = btnId;

        let cleanInput = rawInput.toLowerCase();
        if (cleanInput.startsWith(usedPrefix)) cleanInput = cleanInput.slice(usedPrefix.length);
        if (cleanInput.startsWith('song ')) cleanInput = cleanInput.slice(5);
        if (cleanInput.startsWith('play ')) cleanInput = cleanInput.slice(5);
        if (cleanInput.startsWith('canzone ')) cleanInput = cleanInput.slice(8);
        
        let action = 'song';
        let query = cleanInput;

        if (cleanInput === 'audio' || cleanInput.includes('sendnormal') || cleanInput.includes('vocale')) {
            action = 'sendnormal';
        } else if (cleanInput === 'video' || cleanInput.includes('sendvideo')) {
            action = 'sendvideo';
        } else if (cleanInput === 'addplaylist' || cleanInput.includes('playlist') || cleanInput.includes('aggiungi')) {
            action = 'addplaylist';
        }

        // 1. RICERCA
        if (action === 'song') {
            if (!query) {
                return sock.sendMessage(jid, { text: `❌ Inserisci il titolo della canzone! (Esempio: \`${usedPrefix}song blinding lights\`)` }, { quoted: m });
            }
            await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

            let search = await yts(query);
            if (!search || search.videos.length === 0) {
                return sock.sendMessage(jid, { text: `❌ Nessun risultato trovato per: "${query}"` }, { quoted: m });
            }

            let vid = search.videos[0];
            let txt = `🎶 *ZEUS MUSIC* 🎶\n\n` +
                      `📌 *Titolo:* ${vid.title}\n` +
                      `⏱ *Durata:* ${vid.timestamp}\n` +
                      `👁️ *Visualizzazioni:* ${vid.views}\n`;

            let db = readDb(dbPath);
            db[sender] = { url: vid.url, title: vid.title, duration: vid.timestamp };
            writeDb(db, dbPath);

            await sock.sendMessage(jid, {
                image: { url: vid.thumbnail },
                caption: txt,
                footer: 'Zeus Bot',
                buttons: [
                    { buttonId: `${usedPrefix}song audio`, buttonText: { displayText: '🎤 Vocale' }, type: 1 },
                    { buttonId: `${usedPrefix}song video`, buttonText: { displayText: '🎬 Video MP4' }, type: 1 },
                    { buttonId: `${usedPrefix}song addplaylist`, buttonText: { displayText: '➕ Aggiungi a playlist' }, type: 1 }
                ],
                headerType: 4
            }, { quoted: m });
            
            return;
        }

        await sock.sendMessage(jid, { react: { text: '🔥', key: m.key } });

        // 2. DOWNLOAD AUDIO VELOCE
        if (action === 'sendnormal') {
            let db = readDb(dbPath);
            let trackData = db[sender];
            let videourl = typeof trackData === 'object' ? trackData.url : trackData;

            if (!videourl) return sock.sendMessage(jid, { text: `❌ Errore: Cerca prima il brano con \`${usedPrefix}song\`.` }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '🎧', key: m.key } });

            let rawPath = path.join(__dirname, `raw_${Date.now()}.m4a`);
            let outputOgg = path.join(__dirname, `vocale_${Date.now()}.ogg`);

            // Scarica l'audio completo (velocissimo) senza sezioni
            let yt_command = `yt-dlp -f "ba[ext=m4a]/ba" --extractor-args "youtube:player_client=android" -o "${rawPath}" "${videourl}"`;
            
            exec(yt_command, async (error, stdout, stderr) => {
                if (error || !fs.existsSync(rawPath)) {
                    console.error('Errore yt-dlp:', stderr);
                    return sock.sendMessage(jid, { text: '❌ Errore durante il download da YouTube.' }, { quoted: m });
                }

                // ffmpeg taglia a 120s (-t 120) e crea un OGG Opus perfetto in un colpo solo
                let ffmpeg_command = `ffmpeg -y -i "${rawPath}" -t 120 -c:a libopus -b:a 64k -ar 48000 -ac 1 -f ogg "${outputOgg}"`;
                
                exec(ffmpeg_command, async (err2, stdout2, stderr2) => {
                    if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);

                    if (err2 || !fs.existsSync(outputOgg)) {
                        console.error('Errore conversione ffmpeg:', stderr2);
                        return sock.sendMessage(jid, { text: '❌ Errore nella conversione del vocale.' }, { quoted: m });
                    }

                    try {
                        let audioBuffer = fs.readFileSync(outputOgg);
                        await sock.sendMessage(jid, {
                            audio: audioBuffer,
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true
                        }, { quoted: m });
                        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                    } catch (err) {
                        console.error('Errore durante invio audio:', err);
                    } finally {
                        setTimeout(() => { if (fs.existsSync(outputOgg)) fs.unlinkSync(outputOgg); }, 5000);
                    }
                });
            });
            return;
        }

        // 3. AGGIUNGI ALLA PLAYLIST
        if (action === 'addplaylist') {
            let db = readDb(dbPath);
            let track = db[sender];
            if (!track || !track.url) {
                return sock.sendMessage(jid, { text: '❌ Errore: Nessun brano recente da aggiungere.' }, { quoted: m });
            }

            let plDb = readDb(playlistDbPath);
            if (!plDb[sender]) plDb[sender] = [];
            let exists = plDb[sender].some(t => t.url === track.url);
            
            if (exists) {
                return sock.sendMessage(jid, { text: `⚠️ Questo brano è *già presente* nella tua playlist!` }, { quoted: m });
            }

            plDb[sender].push(track);
            writeDb(plDb, playlistDbPath);

            return sock.sendMessage(jid, { text: `✅ Brano aggiunto con successo alla tua playlist!\n📌 *${track.title}*` }, { quoted: m });
        }

        // 4. DOWNLOAD VIDEO MP4
        if (action === 'sendvideo') {
            let db = readDb(dbPath);
            let trackData = db[sender];
            let videourl = typeof trackData === 'object' ? trackData.url : trackData;

            if (!videourl) return sock.sendMessage(jid, { text: `❌ Errore: Cerca prima il brano con \`${usedPrefix}song\`.` }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

            let outputPath = path.join(__dirname, `video_${Date.now()}.mp4`);
            // Anche per il video, scarichiamo e tagliamo a 120 secondi con ffmpeg per velocità
            let ytdlpVideoCommand = `yt-dlp -f "b[ext=mp4]/b" --extractor-args "youtube:player_client=android" -o "${outputPath}" "${videourl}"`;

            exec(ytdlpVideoCommand, async (error, stdout, stderr) => {
                if (error) {
                    console.error('Errore yt-dlp video:', stderr);
                    return sock.sendMessage(jid, { text: '❌ Errore durante il download del video.' }, { quoted: m });
                }

                if (fs.existsSync(outputPath)) {
                    try {
                        await sock.sendMessage(jid, {
                            video: fs.readFileSync(outputPath),
                            caption: '🎬 Ecco il tuo video!',
                            mimetype: 'video/mp4'
                        }, { quoted: m });
                        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                    } catch (err) {
                        console.error(err);
                    } finally {
                        setTimeout(() => { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); }, 5000);
                    }
                }
            });
            return;
        }
    }
};
EOFcat > plugins/song.js << 'EOF'
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const yts = require('yt-search');

const dbPath = path.join(__dirname, '../zenomusic_db.json');
const playlistDbPath = path.join(__dirname, '../playlist_db.json');

const readDb = (p = dbPath) => {
    if (!fs.existsSync(p)) return {};
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
};
const writeDb = (data, p = dbPath) => {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
};

module.exports = {
    name: 'song',
    aliases: ['play', 'canzone', 'sendnormal', 'sendvideo', 'addplaylist'],
    category: 'Musica',
    description: 'Cerca e scarica canzoni da YouTube',
    run: async ({ sock, jid, m, args, prefix }) => {
        const sender = m.key.participant || m.key.remoteJid;
        const usedPrefix = prefix || '.';
        
        let rawInput = args.join(' ').trim();
        let btnId = m.message?.buttonsResponseMessage?.selectedButtonId || m.message?.templateButtonReplyMessage?.selectedId || m.msg?.selectedButtonId || '';
        
        if (btnId) rawInput = btnId;

        let cleanInput = rawInput.toLowerCase();
        if (cleanInput.startsWith(usedPrefix)) cleanInput = cleanInput.slice(usedPrefix.length);
        if (cleanInput.startsWith('song ')) cleanInput = cleanInput.slice(5);
        if (cleanInput.startsWith('play ')) cleanInput = cleanInput.slice(5);
        if (cleanInput.startsWith('canzone ')) cleanInput = cleanInput.slice(8);
        
        let action = 'song';
        let query = cleanInput;

        if (cleanInput === 'audio' || cleanInput.includes('sendnormal') || cleanInput.includes('vocale')) {
            action = 'sendnormal';
        } else if (cleanInput === 'video' || cleanInput.includes('sendvideo')) {
            action = 'sendvideo';
        } else if (cleanInput === 'addplaylist' || cleanInput.includes('playlist') || cleanInput.includes('aggiungi')) {
            action = 'addplaylist';
        }

        // 1. RICERCA
        if (action === 'song') {
            if (!query) {
                return sock.sendMessage(jid, { text: `❌ Inserisci il titolo della canzone! (Esempio: \`${usedPrefix}song blinding lights\`)` }, { quoted: m });
            }
            await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

            let search = await yts(query);
            if (!search || search.videos.length === 0) {
                return sock.sendMessage(jid, { text: `❌ Nessun risultato trovato per: "${query}"` }, { quoted: m });
            }

            let vid = search.videos[0];
            let txt = `🎶 *ZEUS MUSIC* 🎶\n\n` +
                      `📌 *Titolo:* ${vid.title}\n` +
                      `⏱ *Durata:* ${vid.timestamp}\n` +
                      `👁️ *Visualizzazioni:* ${vid.views}\n`;

            let db = readDb(dbPath);
            db[sender] = { url: vid.url, title: vid.title, duration: vid.timestamp };
            writeDb(db, dbPath);

            await sock.sendMessage(jid, {
                image: { url: vid.thumbnail },
                caption: txt,
                footer: 'Zeus Bot',
                buttons: [
                    { buttonId: `${usedPrefix}song audio`, buttonText: { displayText: '🎤 Vocale' }, type: 1 },
                    { buttonId: `${usedPrefix}song video`, buttonText: { displayText: '🎬 Video MP4' }, type: 1 },
                    { buttonId: `${usedPrefix}song addplaylist`, buttonText: { displayText: '➕ Aggiungi a playlist' }, type: 1 }
                ],
                headerType: 4
            }, { quoted: m });
            
            return;
        }

        await sock.sendMessage(jid, { react: { text: '🔥', key: m.key } });

        // 2. DOWNLOAD AUDIO VELOCE
        if (action === 'sendnormal') {
            let db = readDb(dbPath);
            let trackData = db[sender];
            let videourl = typeof trackData === 'object' ? trackData.url : trackData;

            if (!videourl) return sock.sendMessage(jid, { text: `❌ Errore: Cerca prima il brano con \`${usedPrefix}song\`.` }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '🎧', key: m.key } });

            let rawPath = path.join(__dirname, `raw_${Date.now()}.m4a`);
            let outputOgg = path.join(__dirname, `vocale_${Date.now()}.ogg`);

            // Scarica l'audio completo (velocissimo) senza sezioni
            let yt_command = `yt-dlp -f "ba[ext=m4a]/ba" --extractor-args "youtube:player_client=android" -o "${rawPath}" "${videourl}"`;
            
            exec(yt_command, async (error, stdout, stderr) => {
                if (error || !fs.existsSync(rawPath)) {
                    console.error('Errore yt-dlp:', stderr);
                    return sock.sendMessage(jid, { text: '❌ Errore durante il download da YouTube.' }, { quoted: m });
                }

                // ffmpeg taglia a 120s (-t 120) e crea un OGG Opus perfetto in un colpo solo
                let ffmpeg_command = `ffmpeg -y -i "${rawPath}" -t 120 -c:a libopus -b:a 64k -ar 48000 -ac 1 -f ogg "${outputOgg}"`;
                
                exec(ffmpeg_command, async (err2, stdout2, stderr2) => {
                    if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);

                    if (err2 || !fs.existsSync(outputOgg)) {
                        console.error('Errore conversione ffmpeg:', stderr2);
                        return sock.sendMessage(jid, { text: '❌ Errore nella conversione del vocale.' }, { quoted: m });
                    }

                    try {
                        let audioBuffer = fs.readFileSync(outputOgg);
                        await sock.sendMessage(jid, {
                            audio: audioBuffer,
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true
                        }, { quoted: m });
                        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                    } catch (err) {
                        console.error('Errore durante invio audio:', err);
                    } finally {
                        setTimeout(() => { if (fs.existsSync(outputOgg)) fs.unlinkSync(outputOgg); }, 5000);
                    }
                });
            });
            return;
        }

        // 3. AGGIUNGI ALLA PLAYLIST
        if (action === 'addplaylist') {
            let db = readDb(dbPath);
            let track = db[sender];
            if (!track || !track.url) {
                return sock.sendMessage(jid, { text: '❌ Errore: Nessun brano recente da aggiungere.' }, { quoted: m });
            }

            let plDb = readDb(playlistDbPath);
            if (!plDb[sender]) plDb[sender] = [];
            let exists = plDb[sender].some(t => t.url === track.url);
            
            if (exists) {
                return sock.sendMessage(jid, { text: `⚠️ Questo brano è *già presente* nella tua playlist!` }, { quoted: m });
            }

            plDb[sender].push(track);
            writeDb(plDb, playlistDbPath);

            return sock.sendMessage(jid, { text: `✅ Brano aggiunto con successo alla tua playlist!\n📌 *${track.title}*` }, { quoted: m });
        }

        // 4. DOWNLOAD VIDEO MP4
        if (action === 'sendvideo') {
            let db = readDb(dbPath);
            let trackData = db[sender];
            let videourl = typeof trackData === 'object' ? trackData.url : trackData;

            if (!videourl) return sock.sendMessage(jid, { text: `❌ Errore: Cerca prima il brano con \`${usedPrefix}song\`.` }, { quoted: m });

            await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

            let outputPath = path.join(__dirname, `video_${Date.now()}.mp4`);
            // Anche per il video, scarichiamo e tagliamo a 120 secondi con ffmpeg per velocità
            let ytdlpVideoCommand = `yt-dlp -f "b[ext=mp4]/b" --extractor-args "youtube:player_client=android" -o "${outputPath}" "${videourl}"`;

            exec(ytdlpVideoCommand, async (error, stdout, stderr) => {
                if (error) {
                    console.error('Errore yt-dlp video:', stderr);
                    return sock.sendMessage(jid, { text: '❌ Errore durante il download del video.' }, { quoted: m });
                }

                if (fs.existsSync(outputPath)) {
                    try {
                        await sock.sendMessage(jid, {
                            video: fs.readFileSync(outputPath),
                            caption: '🎬 Ecco il tuo video!',
                            mimetype: 'video/mp4'
                        }, { quoted: m });
                        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
                    } catch (err) {
                        console.error(err);
                    } finally {
                        setTimeout(() => { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); }, 5000);
                    }
                }
            });
            return;
        }
    }
};
