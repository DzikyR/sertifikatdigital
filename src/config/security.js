const helmet = require('helmet');

// CSP ketat: semua aset (Tailwind build, Fabric.js, QR lib) dilayani dari origin sendiri.
// Hindari inline <script>; gunakan file di /public/js.
function helmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        // blob:/data: dibutuhkan canvas builder (preview template & export gambar)
        imgSrc: ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'", 'https://accounts.google.com'],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}

module.exports = { helmetMiddleware };
