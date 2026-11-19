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
  return Array.isArray(all[user]) ? all[user] : [];
}

function add(user, track) {
  const all = readAll();
  const list = Array.isArray(all[user]) ? all[user] : [];
  if (list.some(t => t.id === track.id)) return 'exists';
  if (list.length >= MAX) return 'full';
  list.push(track);
  all[user] = list;
  writeAll(all);
  return 'added';
}

function removeAt(user, index) {
  const all = readAll();
  const list = Array.isArray(all[user]) ? all[user] : [];
  if (index < 0 || index >= list.length) return null;
  const removed = list.splice(index, 1)[0];
  all[user] = list;
  writeAll(all);
  return removed;
}

module.exports = { userKey, getList, add, removeAt };
