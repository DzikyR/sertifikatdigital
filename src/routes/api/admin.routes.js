const { Router } = require('express');
const v = require('../../validators/apiValidators');
const validate = require('../../middlewares/validate');
const admin = require('../../controllers/api/adminController');
const { logoUpload } = require('../../config/upload');

// isSuperAdmin dipasang di routes/api/index.js
const router = Router();

router.get('/users', v.listUsers, validate, admin.listUsers);
router.post('/users', v.createUser, validate, admin.createUser);
router.patch('/users/:userId', v.id('userId'), v.updateUser, validate, admin.updateUser);
router.post('/users/:userId/reset-password', v.id('userId'), v.password(), validate, admin.resetPassword);

router.get('/access-requests', admin.listAccessRequests);
router.post('/access-requests/:userId/approve', v.id('userId'), v.approveRequest, validate, admin.approveRequest);
router.post('/access-requests/:userId/reject', v.id('userId'), validate, admin.rejectRequest);
router.delete('/access-requests/:userId', v.id('userId'), validate, admin.deleteRequest);

router.get('/features', admin.listFeatures);
router.patch('/features', v.setFeature, validate, admin.setFeature);
router.post('/features/reset', admin.resetFeatures);

router.get('/logs', v.listLogs, validate, admin.listLogs);

// Pengaturan tampilan & identitas aplikasi
router.get('/settings', admin.getSettings);
router.put('/settings', admin.updateSettings);
router.post('/settings/logo', logoUpload.single('logo'), admin.uploadLogo);
router.delete('/settings/logo', admin.deleteLogo);
router.post('/settings/reset', admin.resetSettings);

module.exports = router;
