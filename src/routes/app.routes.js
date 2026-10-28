const { Router } = require('express');
const v = require('../validators/apiValidators');
const validate = require('../middlewares/validate');
const { requireRole, isSuperAdmin } = require('../middlewares/auth');
const { loadEvent } = require('../middlewares/eventAccess');
const { requireFeature } = require('../middlewares/feature');
const page = require('../controllers/pages/appPageController');

// Halaman internal (ensureAuthenticated dipasang di routes/index.js)
const router = Router();
const ADMIN_HMP = requireRole('ADMIN', 'HMP');

router.get('/dashboard', page.dashboard);

router.get('/events', ADMIN_HMP, v.listEvents, validate, page.eventList);
router.get('/events/new', ADMIN_HMP, requireFeature('event.create'), page.eventNew);
router.get('/events/:eventId', ADMIN_HMP, v.id('eventId'), v.listParticipants, validate, loadEvent, page.eventShow);
router.get('/events/:eventId/builder', ADMIN_HMP, v.id('eventId'), validate, loadEvent, page.eventBuilder);

router.get('/signatures', requireRole('ADMIN'), page.signatures);
router.get('/approvals', requireRole('ADMIN'), requireFeature('approval.review'), page.approvals);

router.get('/admin/users', isSuperAdmin, v.listUsers, validate, page.users);
router.get('/admin/logs', isSuperAdmin, v.listLogs, validate, page.logs);
router.get('/admin/features', isSuperAdmin, page.features);
router.get('/admin/settings', isSuperAdmin, page.settings);

module.exports = router;
