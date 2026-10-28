const fs = require('fs/promises');
const signatureService = require('../../services/signatureService');
const audit = require('../../services/auditService');
const storage = require('../../utils/storage');

const serialize = ({ imagePath, createdById, ...lib }) => ({ ...lib, imageUrl: `/api/signatures/${lib.id}/image` });

exports.list = async (req, res) => {
  const items = await signatureService.listLibrary(req.user);
  res.json({ success: true, data: items.map(serialize) });
};

exports.create = async (req, res) => {
  const { lib, warning } = await signatureService.createLibrary(req.file, req.validated, req.user);
  await audit.log({ req, action: 'SIGNATURE_LIBRARY_UPLOAD', entity: 'SignatureLibrary', entityId: lib.id, meta: { label: lib.label } });
  res.status(201).json({ success: true, data: serialize(lib), warning, message: `Tanda tangan "${lib.label}" ditambahkan ke pustaka.` });
};

exports.update = async (req, res) => {
  const lib = await signatureService.updateLibrary(req.params.signatureId, req.validated, req.user);
  await audit.log({ req, action: 'SIGNATURE_LIBRARY_UPDATE', entity: 'SignatureLibrary', entityId: lib.id, meta: req.validated });
  res.json({ success: true, data: serialize(lib), message: `Tanda tangan "${lib.label}" diperbarui.` });
};

exports.remove = async (req, res) => {
  const lib = await signatureService.removeLibrary(req.params.signatureId, req.user);
  await audit.log({ req, action: 'SIGNATURE_LIBRARY_DELETE', entity: 'SignatureLibrary', entityId: lib.id, meta: { label: lib.label } });
  res.json({ success: true, message: `Tanda tangan "${lib.label}" dihapus dari pustaka.` });
};

exports.image = async (req, res) => {
  const lib = await signatureService.findLibrary(req.params.signatureId, req.user);
  res.set('Cache-Control', 'private, max-age=300');
  res.type('png').send(await fs.readFile(storage.absPath(lib.imagePath)));
};
