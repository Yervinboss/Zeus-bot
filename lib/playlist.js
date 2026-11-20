const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'playlist_db.json');
const MAX = 50;

function readAll() {
  try {
    if (fs.existsSync(FILE) === false) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeAll(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function userKey(m) {
  const raw = m.key.participant || m.key.remoteJid || '';
  return raw.split('@')[0].split(':')[0];
}

function getList(user) {
  const all = readAll();
  const list = Array.isArray(all[user]) ? all[user] : [];
  return list.filter(t => t && t.title && /^[\w-]{11}$/.test(String(t.id)));
}

function add(user, track) {
  const list = getList(user);
  const id = String(track.id);
  if (list.some(t => String(t.id) === id)) return 'exists';
  if (list.length >= MAX) return 'full';
  list.push({ id, title: track.title, artist: track.artist || '' });
  const all = readAll();
  all[user] = list;
  writeAll(all);
  return 'added';
}

function removeAt(user, index) {
  const list = getList(user);
  if (index < 0 || index >= list.length) return null;
  const removed = list.splice(index, 1)[0];
  const all = readAll();
  all[user] = list;
  writeAll(all);
  return removed;
}

function clear(user) {
  const all = readAll();
  all[user] = [];
  writeAll(all);
}

module.exports = { userKey, getList, add, removeAt, clear };
