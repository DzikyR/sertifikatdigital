const { Router } = require('express');
const authController = require('../controllers/authController');
const authValidator = require('../validators/authValidator');
const validate = require('../middlewares/validate');
const { ensureGuest, ensureAuthenticated } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');

const router = Router();

router.get('/login', ensureGuest, authController.showLogin);
router.post('/login', authLimiter, ensureGuest, authValidator.login, validate, authController.login);

router.get('/google', authLimiter, ensureGuest, authController.googleRedirect);
router.get('/google/callback', authLimiter, authController.googleCallback);

router.get('/pending', authController.pending);

router.post('/logout', ensureAuthenticated, authController.logout);

module.exports = router;
