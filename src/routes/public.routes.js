const { Router } = require('express');
const homeController = require('../controllers/homeController');
const publicController = require('../controllers/api/publicController');
const publicPage = require('../controllers/pages/publicPageController');
const { publicLimiter } = require('../middlewares/rateLimiter');
const { requireFeature } = require('../middlewares/feature');

const router = Router();

router.get('/', homeController.index);

// Unduh PDF sertifikat (tautan di email & halaman verifikasi)
router.get('/sertifikat/:code/download', publicLimiter, requireFeature('public.download'), publicController.download);

// Portal publik: pencarian mandiri & halaman hasil scan QR
router.get('/cari', publicLimiter, requireFeature('public.search'), publicPage.search);
router.get('/verify', publicLimiter, publicPage.verifyForm);
router.get('/verify/:code', publicLimiter, publicPage.verify);

module.exports = router;
