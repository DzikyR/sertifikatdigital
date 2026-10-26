const app = require('./app');
const config = require('./config');
const featureService = require('./services/featureService');
const brandingService = require('./services/brandingService');

let server;

// Muat pengaturan fitur & tampilan sebelum menerima request
Promise.all([
  featureService.load().catch((err) => console.error('[features] gagal memuat, memakai default:', err.message)),
  brandingService.load().catch((err) => console.error('[branding] gagal memuat, memakai default:', err.message)),
])
  .finally(() => {
    server = app.listen(config.port, () => {
      console.log(`[${config.env}] ${config.appName} berjalan di ${config.appUrl} (port ${config.port})`);
    });
  });

const shutdown = (signal) => {
  console.log(`${signal} diterima, menutup server...`);
  if (!server) process.exit(0);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
