const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { FEATURES, FEATURE_MAP, MANAGED_ROLES } = require('../config/features');

/**
 * Status fitur disimpan di memori agar pengecekan (dipakai di policy, view, route)
 * tetap sinkron & tanpa query per pemanggilan. Cache dimuat saat server start,
 * diperbarui langsung saat Super Admin mengubah, dan disegarkan berkala (REFRESH_MS)
 * agar instance lain (jika ada lebih dari satu proses) ikut sinkron.
 */
const REFRESH_MS = 30 * 1000;
const cache = new Map(); // "key|role" -> boolean (hanya override dari DB)
let loadedAt = 0;
let refreshing = null;

const cacheKey = (key, role) => `${key}|${role}`;

async function load() {
  const rows = await prisma.featureSetting.findMany();
  cache.clear();
  rows.forEach((r) => cache.set(cacheKey(r.key, r.role), r.enabled));
  loadedAt = Date.now();
}

/** Middleware: segarkan cache bila sudah lewat REFRESH_MS (tidak menahan request lain). */
async function refreshIfStale() {
  if (Date.now() - loadedAt < REFRESH_MS) return;
  refreshing ||= load().catch((err) => console.error('[features] gagal memuat:', err.message)).finally(() => { refreshing = null; });
  await refreshing;
}

/**
 * Apakah fitur aktif untuk role tertentu?
 * - Fitur global: role diabaikan.
 * - Super Admin: selalu aktif (tidak bisa mengunci dirinya sendiri).
 * - Role yang tidak tercantum di fitur: tidak dibatasi oleh fitur ini (policy role yang menentukan).
 */
function isEnabled(key, role) {
  const def = FEATURE_MAP[key];
  if (!def) throw new Error(`Fitur tidak dikenal: ${key}`);
  if (def.global) return cache.get(cacheKey(key, 'GLOBAL')) ?? true;
  if (!role || role === 'SUPER_ADMIN' || !def.roles.includes(role)) return true;
  return cache.get(cacheKey(key, role)) ?? true;
}

/** Data untuk halaman pengaturan: dikelompokkan per grup. */
function matrix() {
  const groups = [];
  FEATURES.forEach((f) => {
    let g = groups.find((x) => x.name === f.group);
    if (!g) groups.push(g = { name: f.group, global: Boolean(f.global), items: [] });
    g.items.push({
      key: f.key,
      label: f.label,
      description: f.description || null,
      global: Boolean(f.global),
      values: f.global
        ? { GLOBAL: isEnabled(f.key) }
        : Object.fromEntries(MANAGED_ROLES.map((r) => [r, f.roles.includes(r) ? isEnabled(f.key, r) : null])),
    });
  });
  return groups;
}

async function set(key, role, enabled, actorId) {
  const def = FEATURE_MAP[key];
  if (!def) throw new AppError('Fitur tidak dikenal.', 422);
  const target = def.global ? 'GLOBAL' : role;
  if (!def.global && !def.roles.includes(role)) throw new AppError('Fitur ini tidak berlaku untuk role tersebut.', 422);

  await prisma.featureSetting.upsert({
    where: { key_role: { key, role: target } },
    update: { enabled, updatedById: actorId },
    create: { key, role: target, enabled, updatedById: actorId },
  });
  cache.set(cacheKey(key, target), enabled);
  return { key, role: target, enabled };
}

/** Kembalikan semua fitur ke default (aktif). */
async function reset() {
  await prisma.featureSetting.deleteMany();
  cache.clear();
}

function label(key) {
  return FEATURE_MAP[key]?.label || key;
}

module.exports = { load, refreshIfStale, isEnabled, matrix, set, reset, label };
