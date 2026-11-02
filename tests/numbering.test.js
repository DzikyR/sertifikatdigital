// Uji integrasi penomoran terhubung. Butuh PostgreSQL yang sudah dimigrasi.
// Hanya berjalan pada database yang namanya mengandung "dev" atau "test".
require('dotenv').config();
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
if (!/dev|test/i.test(dbName)) throw new Error(`Menolak menjalankan tes pada database "${dbName}".`);

const prisma = require('../src/config/database');
const numbering = require('../src/services/numberingService');
const participants = require('../src/services/participantService');
const { isSignatureValid } = require('../src/utils/certCrypto');

const admin = { role: 'ADMIN' };
const hmp = { role: 'HMP' };
let user;
let counter = 0;
// Awalan unik per event, karena nomor sertifikat unik di seluruh tabel
const uniqueFormat = () => { counter += 1; return `T${Date.now().toString(36)}${counter}.{SEQ:2}.A/{YYYY}`; };

const newEvent = (title, extra = {}) => prisma.event.create({
  data: {
    title, eventDate: new Date('2026-10-15'), organizerType: 'PRODI', certNumberFormat: uniqueFormat(), createdById: user.id, ...extra,
  },
});
const add = (event, count, tag = event.id) => Promise.all(Array.from({ length: count }, (_, i) => participants.addOne(event, {
  name: `Peserta ${i}`, email: `p${i}-${tag}@example.com`, role: 'Peserta',
})));
const importFile = (event, count, tag) => participants.importParticipants(event, Buffer.from(
  `nama,email\n${Array.from({ length: count }, (_, i) => `Orang ${i},o${i}-${tag}@example.com`).join('\n')}\n`,
));
const certs = (event) => prisma.certificate.findMany({ where: { eventId: event.id }, orderBy: { seqNo: 'asc' } });
const seqs = async (event) => (await certs(event)).map((c) => c.seqNo);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

before(async () => {
  user = await prisma.user.create({ data: { name: 'Uji Penomoran', email: `numbering-${Date.now()}@example.com`, role: 'ADMIN' } });
});

after(async () => {
  await prisma.event.deleteMany({ where: { createdById: user.id } });
  await prisma.numberingGroup.deleteMany({ where: { events: { none: {} } } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
});

test('event terhubung melanjutkan nomor, event lama tidak berubah', async () => {
  const a = await newEvent('A');
  await importFile(a, 28, a.id);
  const before28 = (await certs(a)).map((c) => c.certificateNumber);
  const b = await newEvent('B');

  const result = await numbering.link(b, a.id, admin);
  assert.equal(result.nextSeq, 29);
  await importFile(b, 3, b.id);

  assert.deepEqual((await certs(a)).map((c) => c.certificateNumber), before28);
  const prefix = a.certNumberFormat.split('{')[0];
  assert.deepEqual((await certs(b)).map((c) => c.certificateNumber), [`${prefix}29.A/2026`, `${prefix}30.A/2026`, `${prefix}31.A/2026`]);
});

test('peserta yang sudah ada dinomori ulang saat dihubungkan, HMAC tetap valid', async () => {
  const a = await newEvent('A', { certNumberFormat: `X${Date.now().toString(36)}{EID}.{SEQ:2}` });
  await importFile(a, 5, a.id);
  const b = await newEvent('B', { certNumberFormat: `Y${Date.now().toString(36)}{EID}.{SEQ:2}` });
  await importFile(b, 3, b.id);

  await numbering.link(b, a.id, admin);
  const rows = await certs(b);
  assert.deepEqual(rows.map((c) => c.seqNo), [6, 7, 8]);
  assert.ok(rows.every(isSignatureValid));
  // {EID} memakai kode grup = kode event acuan
  const code = a.id.slice(-5).toUpperCase();
  const stem = a.certNumberFormat.split('{')[0];
  assert.equal(rows[0].certificateNumber, `${stem}${code}.06`);
  assert.equal((await certs(a))[0].certificateNumber, `${stem}${code}.01`);
});

test('race condition: impor bersamaan tidak menghasilkan nomor dobel atau celah', async () => {
  const a = await newEvent('A');
  const b = await newEvent('B');
  const c = await newEvent('C');
  await numbering.link(b, a.id, admin);
  await numbering.link(c, a.id, admin);

  await Promise.all([
    importFile(a, 40, `${a.id}r`), importFile(b, 40, `${b.id}r`), importFile(c, 40, `${c.id}r`), add(a, 10), add(b, 10), add(c, 10),
  ]);

  const all = [...await seqs(a), ...await seqs(b), ...await seqs(c)].sort((x, y) => x - y);
  assert.deepEqual(all, range(1, 150));
  const group = await prisma.numberingGroup.findFirst({ where: { events: { some: { id: a.id } } } });
  assert.equal(group.lastSeq, 150);
});

test('Hapus Semua lalu impor ulang kembali ke nomor yang sama', async () => {
  const a = await newEvent('A');
  await importFile(a, 5, a.id);
  const b = await newEvent('B');
  await numbering.link(b, a.id, admin);
  await importFile(b, 3, b.id);

  await participants.removeAll(b);
  await importFile(b, 2, `${b.id}x`);
  assert.deepEqual(await seqs(b), [6, 7]);
});

test('ubah format di dalam grup mempertahankan nomor urut', async () => {
  const a = await newEvent('A');
  await importFile(a, 2, a.id);
  const b = await newEvent('B');
  await numbering.link(b, a.id, admin);
  await importFile(b, 2, b.id);

  const updated = await prisma.event.update({ where: { id: b.id }, data: { certNumberFormat: `Z${b.id.slice(-4)}/{SEQ:3}` } });
  await participants.renumber(updated);
  const rows = await certs(b);
  assert.deepEqual(rows.map((c) => c.seqNo), [3, 4]);
  assert.equal(rows[1].certificateNumber, `Z${b.id.slice(-4)}/004`);
  assert.ok(rows.every(isSignatureValid));
});

test('tujuan yang sudah terbit tetap bisa dilanjutkan, event yang terkunci tidak bisa dihubungkan', async () => {
  const published = await newEvent('Terbit', { status: 'PUBLISHED' });
  await prisma.event.update({ where: { id: published.id }, data: { certNumberSeq: 7 } });
  const b = await newEvent('B');
  assert.equal((await numbering.link(b, published.id, admin)).nextSeq, 8);

  const locked = await newEvent('Terkunci', { status: 'PUBLISHED' });
  const other = await newEvent('Lain');
  await assert.rejects(numbering.link(locked, other.id, admin), { statusCode: 409 });
});

test('lepaskan event: acuan ditolak, anggota kembali ke counter sendiri, grup dibubarkan', async () => {
  const a = await newEvent('A');
  await importFile(a, 2, a.id);
  const b = await newEvent('B');
  await numbering.link(b, a.id, admin);
  await importFile(b, 2, b.id);

  await assert.rejects(numbering.unlink(a), { statusCode: 409 });
  // Format masih sama dengan A, jadi nomor 01-02 akan bentrok: harus ditolak tanpa mengubah apa pun
  await assert.rejects(numbering.unlink(b), { statusCode: 409 });
  assert.deepEqual(await seqs(b), [3, 4]);

  const reformatted = await prisma.event.update({ where: { id: b.id }, data: { certNumberFormat: `U${b.id.slice(-4)}/{SEQ}` } });
  await participants.renumber(reformatted);
  await numbering.unlink(reformatted);
  assert.deepEqual(await seqs(b), [1, 2]);

  const freshA = await prisma.event.findUnique({ where: { id: a.id } });
  assert.equal(freshA.numberingGroupId, null);
  assert.equal(freshA.certNumberSeq, 2);
  await add(freshA, 1);
  assert.deepEqual(await seqs(a), [1, 2, 3]);
});

test('hapus event anggota merapikan counter grup', async () => {
  const a = await newEvent('A');
  await importFile(a, 2, a.id);
  const b = await newEvent('B');
  const c = await newEvent('C');
  await numbering.link(b, a.id, admin);
  await numbering.link(c, a.id, admin);
  await importFile(b, 2, b.id);
  await importFile(c, 2, c.id);

  await numbering.deleteEvent(c.id);
  const group = await prisma.numberingGroup.findFirst({ where: { events: { some: { id: a.id } } } });
  assert.equal(group.lastSeq, 4);
});

test('validasi: diri sendiri, sudah terhubung, beda penyelenggara, tanpa hak lihat', async () => {
  const a = await newEvent('A');
  const b = await newEvent('B');
  const c = await newEvent('C');
  const hmpEvent = await newEvent('HMP', { organizerType: 'HMP' });

  await assert.rejects(numbering.link(a, a.id, admin), { statusCode: 422 });
  await numbering.link(b, a.id, admin);
  await assert.rejects(numbering.link(b, c.id, admin), { statusCode: 409 });
  await assert.rejects(numbering.link(c, hmpEvent.id, admin), { statusCode: 422 });
  await assert.rejects(numbering.link(hmpEvent, a.id, hmp), { statusCode: 404 });
});
