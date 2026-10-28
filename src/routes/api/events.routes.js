const { Router } = require('express');
const v = require('../../validators/apiValidators');
const validate = require('../../middlewares/validate');
const { loadEvent, requireEventPermission: can } = require('../../middlewares/eventAccess');
const { requireRole } = require('../../middlewares/auth');
const { requireFeature } = require('../../middlewares/feature');
const { templateUpload, signatureUpload, logoUpload, csvUpload } = require('../../config/upload');
const event = require('../../controllers/api/eventController');
const builder = require('../../controllers/api/builderController');
const participant = require('../../controllers/api/participantController');

const router = Router();
const ADMIN_HMP = requireRole('ADMIN', 'HMP');

// Daftar & buat event (Kaprodi/Admin Prodi -> PRODI, HMP -> HMP)
router.get('/', v.listEvents, validate, event.list);
router.post('/', ADMIN_HMP, requireFeature('event.create'), v.eventFields(false), validate, event.create);
router.get('/participants/csv-template', participant.csvTemplate);
router.get('/participants/xlsx-template', participant.xlsxTemplate);

// Semua route di bawah memuat event + cek hak lihat
const one = Router({ mergeParams: true });
// Ubah data peserta: saat draf (editParticipants) atau perbaikan setelah terbit (correct; dicek lagi di service)
const canEditOrCorrect = (req, res, next) => (req.event.status === 'PUBLISHED' ? can('correct') : can('editParticipants'))(req, res, next);
router.use('/:eventId', v.id('eventId'), validate, loadEvent, one);

one.get('/', event.show);
one.patch('/', can('edit'), v.eventFields(true), validate, event.update);
one.delete('/', can('deleteEvent'), event.remove);

// Template background
one.post('/template', can('editTemplate'), templateUpload.single('template'), event.uploadTemplate);
one.get('/template/image', event.templateImage);

// Builder (koordinat teks, QR, TTD)
one.get('/builder', builder.getBuilder);
one.put('/layout', can('editLayout'), builder.saveLayout);
one.get('/preview', event.preview);

// Multi-TTD
one.get('/signatures', builder.listSignatures);
one.post('/signatures', can('editTemplate'), signatureUpload.single('image'), v.signatureFields(false), validate, builder.createSignature);
one.patch('/signatures/:signatureId', can('editTemplate'), signatureUpload.single('image'), v.signatureFields(true), validate, builder.updateSignature);
one.delete('/signatures/:signatureId', can('editTemplate'), builder.deleteSignature);
one.get('/signatures/:signatureId/image', builder.signatureImage);

// Logo (bisa lebih dari satu)
one.post('/logos', can('editTemplate'), logoUpload.single('image'), v.logoFields, validate, builder.createLogo);
one.delete('/logos/:logoId', can('editTemplate'), builder.deleteLogo);
one.get('/logos/:logoId/image', builder.logoImage);

// Peserta
one.get('/participants', v.listParticipants, validate, participant.list);
one.post('/participants/import', can('editParticipants'), csvUpload.single('file'), participant.importCsv);
one.post('/participants', can('editParticipants'), v.participantFields, validate, participant.create);
one.post('/participants/issue', can('issue'), v.issueIds, validate, participant.issue);
one.post('/participants/withdraw', can('correct'), v.withdraw, validate, participant.withdraw);
one.post('/participants/bulk-delete', can('editParticipants'), v.bulkIds, validate, participant.removeMany);
one.delete('/participants', can('editParticipants'), participant.removeAll);
one.patch('/participants/:certificateId', canEditOrCorrect, v.id('certificateId'), v.participantFields, validate, participant.update);
one.delete('/participants/:certificateId', can('editParticipants'), participant.remove);
one.get('/participants/:certificateId/pdf', can('downloadPdf'), event.certificatePdf);
one.get('/participants/:certificateId/preview', v.id('certificateId'), validate, event.participantPreview);
one.post('/participants/:certificateId/revoke', can('revoke'), participant.revoke);
one.post('/participants/:certificateId/restore', can('revoke'), participant.restore);

// Workflow
one.post('/submit', can('submit'), event.submit);
one.post('/approve', can('review'), v.review(false), validate, event.approve);
one.post('/reject', can('review'), v.review(true), validate, event.reject);
one.post('/publish', can('publish'), event.publish);
one.post('/unlock', can('unlock'), v.review(true, 'Alasan membuka kunci'), validate, event.unlock);

// Blast email
one.post('/blast', can('blast'), v.blast, validate, event.blast);
one.get('/blast', event.blastStatus);

module.exports = router;
