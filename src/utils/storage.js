const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const ROOT = config.paths.storage;

/** Path relatif (disimpan di DB) -> path absolut, dengan proteksi path traversal. */
function absPath(relPath) {
  const resolved = path.resolve(ROOT, relPath);
  if (!resolved.startsWith(ROOT + path.sep)) throw new Error('Path storage tidak valid.');
  return resolved;
}

/** Simpan buffer dengan nama acak. Mengembalikan path relatif terhadap storage/. */
async function saveBuffer(subdir, ext, buffer) {
  const rel = path.posix.join(subdir, `${crypto.randomUUID()}.${ext}`);
  const abs = absPath(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
  return rel;
}

async function writeAt(relPath, buffer) {
  const abs = absPath(relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
  return relPath;
}

async function removeFile(relPath) {
  if (!relPath) return;
  try {
    await fs.unlink(absPath(relPath));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[storage] gagal hapus', relPath, err.message);
  }
}

async function removeDir(relPath) {
  try {
    await fs.rm(absPath(relPath), { recursive: true, force: true });
  } catch (err) {
    console.error('[storage] gagal hapus folder', relPath, err.message);
  }
}

async function exists(relPath) {
  if (!relPath) return false;
  try {
    await fs.access(absPath(relPath));
    return true;
  } catch {
    return false;
  }
}

module.exports = { absPath, saveBuffer, writeAt, removeFile, removeDir, exists };
