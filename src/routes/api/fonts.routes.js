const { Router } = require('express');
const v = require('../../validators/apiValidators');
const validate = require('../../middlewares/validate');
const { requireFeature } = require('../../middlewares/feature');
const { fontUpload } = require('../../config/upload');
const font = require('../../controllers/api/fontController');

// Pustaka font sertifikat (dipakai bersama semua event)
const router = Router();

router.get('/', font.list);
router.post('/', requireFeature('event.builder'), fontUpload.single('font'), font.upload);
router.get('/:fontId/file', v.id('fontId'), validate, font.file);
router.delete('/:fontId', requireFeature('event.builder'), v.id('fontId'), validate, font.remove);

module.exports = router;
