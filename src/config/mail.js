const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  pool: true,
  maxConnections: 3,
  maxMessages: 100,
});

const mailFrom = process.env.MAIL_FROM || 'Prodi Informatika TSU <no-reply@tsu.ac.id>';

module.exports = { transporter, mailFrom };
