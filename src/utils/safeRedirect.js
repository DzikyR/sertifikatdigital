/**
 * Kembalikan path internal yang aman untuk redirect (anti open-redirect).
 * Hanya menerima path relatif "/..." (bukan "//host") atau URL dari origin yang sama.
 */
function safePath(target, req, fallback = '/') {
  if (!target || typeof target !== 'string') return fallback;
  if (target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')) return target;
  try {
    const url = new URL(target);
    if (url.host === req.get('host')) return url.pathname + url.search;
  } catch {
    // bukan URL valid
  }
  return fallback;
}

const back = (req, fallback = '/') => safePath(req.get('referer'), req, fallback);

module.exports = { safePath, back };
