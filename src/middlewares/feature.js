const AppError = require('../utils/AppError');
const featureService = require('../services/featureService');

const disabledMessage = (key) => `Fitur "${featureService.label(key)}" sedang dinonaktifkan oleh Super Admin.`;

/** Tolak request bila fitur dimatikan untuk role user saat ini (atau fitur global dimatikan). */
const requireFeature = (key) => (req, res, next) => {
  if (featureService.isEnabled(key, req.user?.role)) return next();
  return next(new AppError(disabledMessage(key), 403));
};

module.exports = { requireFeature, disabledMessage };
