const { Router } = require('express');
const v = require('../../validators/apiValidators');
const validate = require('../../middlewares/validate');
const { requireRole } = require('../../middlewares/auth');
const { signatureUpload } = require('../../config/upload');
const lib = require('../../controllers/api/signatureLibraryController');

// Pustaka tanda tangan: dikelola Kaprodi/Admin Prodi; HMP hanya melihat TTD yang boleh dipakai
const router = Router();
const ADMIN = requireRole('ADMIN');

router.get('/', lib.list);
router.post('/', ADMIN, signatureUpload.single('image'), v.libraryFields(false), validate, lib.create);
router.patch('/:signatureId', ADMIN, v.id('signatureId'), v.libraryFields(true), validate, lib.update);
router.delete('/:signatureId', ADMIN, v.id('signatureId'), validate, lib.remove);
router.get('/:signatureId/image', v.id('signatureId'), validate, lib.image);

module.exports = router;
