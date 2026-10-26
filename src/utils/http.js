/** Balas JSON untuk route /api/*, request AJAX, atau klien yang meminta JSON. */
const wantsJson = (req) => req.originalUrl.startsWith('/api/') || req.xhr || req.accepts(['html', 'json']) === 'json';

module.exports = { wantsJson };
