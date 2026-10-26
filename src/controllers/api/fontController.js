const fs = require('fs/promises');
const AppError = require('../../utils/AppError');
const storage = require('../../utils/storage');
const fontService = require('../../services/fontService');
const audit = require('../../services/auditService');

const MIME = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff' };

exports.list = async (req, res) => {
  res.json({ success: true, data: await fontService.listFonts() });
};

exports.upload = async (req, res) => {
  if (!req.file) throw new AppError('File font wajib diunggah (field "font").', 422);
  const font = await fontService.uploadCustom({ buffer: req.file.buffer, originalName: req.file.originalname, name: req.body?.name }, req.user);
  await audit.log({ req, action: 'FONT_UPLOAD', entity: 'CustomFont', entityId: font.id, meta: { name: font.name } });
  res.status(201).json({ success: true, data: { id: font.id, name: font.name }, message: `Font "${font.name}" ditambahkan.` });
};

exports.file = async (req, res) => {
  const font = await fontService.customFile(req.params.fontId);
  res.set({ 'Content-Type': MIME[font.format] || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400' });
  res.send(await fs.readFile(storage.absPath(font.filePath)));
};

exports.remove = async (req, res) => {
  const font = await fontService.removeCustom(req.params.fontId, req.user);
  await audit.log({ req, action: 'FONT_DELETE', entity: 'CustomFont', entityId: font.id, meta: { name: font.name } });
  res.json({ success: true, message: `Font "${font.name}" dihapus.` });
};
