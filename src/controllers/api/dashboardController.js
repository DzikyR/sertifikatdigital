const statsService = require('../../services/statsService');

exports.stats = async (req, res) => {
  res.json({ success: true, data: await statsService.dashboard(req.user) });
};
