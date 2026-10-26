const { PrismaClient } = require('@prisma/client');
const config = require('./index');

// Singleton: cegah koneksi berlipat saat auto-reload di development
const globalForPrisma = globalThis;

const prisma = globalForPrisma.__prisma || new PrismaClient({
  log: config.isProd ? ['error'] : ['warn', 'error'],
});

if (!config.isProd) globalForPrisma.__prisma = prisma;

module.exports = prisma;
