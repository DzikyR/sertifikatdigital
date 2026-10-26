/* eslint-disable no-console */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function upsertUser({ name, email, password, role }) {
  const normalized = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  // Tidak menimpa password user yang sudah ada
  const user = await prisma.user.upsert({
    where: { email: normalized },
    update: { role, isActive: true },
    create: { name, email: normalized, passwordHash, role },
  });
  console.log(`  ✓ ${role.padEnd(11)} ${user.email}`);
  return user;
}

async function main() {
  const email = process.env.SEED_SUPERADMIN_EMAIL;
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('SEED_SUPERADMIN_EMAIL dan SEED_SUPERADMIN_PASSWORD wajib diisi di .env');
  }
  if (password.length < 10) throw new Error('SEED_SUPERADMIN_PASSWORD minimal 10 karakter.');

  console.log('Seeding user...');
  await upsertUser({
    name: process.env.SEED_SUPERADMIN_NAME || 'Super Admin',
    email,
    password,
    role: 'SUPER_ADMIN',
  });

  // Admin Prodi: role ADMIN (selevel Kaprodi), dibuat di semua environment
  await upsertUser({
    name: process.env.SEED_ADMINPRODI_NAME || 'Admin Prodi Informatika',
    email: process.env.SEED_ADMINPRODI_EMAIL || 'adminprodi@tsu.ac.id',
    password: process.env.SEED_ADMINPRODI_PASSWORD || password,
    role: 'ADMIN',
  });

  // Akun demo hanya di development
  if (process.env.NODE_ENV !== 'production') {
    await upsertUser({ name: 'Kaprodi Informatika (Demo)', email: 'kaprodi@tsu.ac.id', password, role: 'ADMIN' });
    await upsertUser({ name: 'Pengurus HMP (Demo)', email: 'hmp@tsu.ac.id', password, role: 'HMP' });
    console.log('  (akun demo memakai password yang sama dengan Super Admin)');
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
