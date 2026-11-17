/**
 * SYSTEMHOME - Modulo de correo electronico real (SMTP)
 * Credenciales SOLO desde variables de entorno.
 * SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_FROM_NAME, APP_URL
 */
const nodemailer = require('nodemailer');
require('dotenv').config();

const APP_URL = (process.env.APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
const FROM_NAME = process.env.MAIL_FROM_NAME || 'SYSTEMHOME';
const FROM = process.env.MAIL_FROM || process.env.SMTP_USER || '';

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
  });
  return transporter;
}

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shell(title, content) {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(title) + '</title></head>' +
    '<body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">' +
    '<table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08)">' +
    '<tr><td style="background:linear-gradient(135deg,#0b1f3a,#0e7490);padding:24px 28px;color:#fff">' +
    '<div style="font-size:20px;font-weight:700;letter-spacing:.5px">SYSTEMHOME</div>' +
    '<div style="font-size:12px;opacity:.85;margin-top:4px">Seguridad electronica y gestion integral</div></td></tr>' +
    '<tr><td style="padding:28px">' + content + '</td></tr>' +
    '<tr><td style="padding:18px 28px;background:#f8fafc;color:#64748b;font-size:11px;text-align:center">' +
    'Este correo fue enviado automaticamente por SYSTEMHOME. No lo comparta.</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function button(href, label) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0">' +
    '<tr><td style="border-radius:8px;background:#0e7490">' +
    '<a href="' + esc(href) + '" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600">' + esc(label) + '</a>' +
    '</td></tr></table>';
}

async function sendMail(to, subject, html, text) {
  const t = getTransporter();
  if (!t) {
    console.warn('SMTP no configurado: correo no enviado a', String(to).replace(/@.*/, '@***'));
    return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };
  }
  await t.sendMail({ from: '"' + FROM_NAME + '" <' + FROM + '>', to, subject, html, text });
  return { sent: true };
}

async function sendPasswordReset(to, name, token, expiresMinutes) {
  const link = APP_URL + '/reset-password?token=' + encodeURIComponent(token);
  const html = shell('Restablecer contrasena',
    '<h2 style="margin:0 0 10px;font-size:20px">Hola ' + esc(name) + '</h2>' +
    '<p style="color:#475569;line-height:1.6">Recibimos una solicitud para restablecer la contrasena de tu cuenta SYSTEMHOME.</p>' +
    button(link, 'Restablecer contrasena') +
    '<p style="color:#64748b;font-size:13px">Este enlace vence en ' + esc(expiresMinutes) + ' minutos. Si no solicitaste el cambio, ignora este correo.</p>' +
    '<p style="color:#94a3b8;font-size:11px;word-break:break-all">Si el boton no funciona, copia este enlace: ' + esc(link) + '</p>');
  return sendMail(to, 'SYSTEMHOME - Restablece tu contrasena', html,
    'Usa este enlace para restablecer tu contrasena: ' + link);
}

async function sendWelcome(to, name, username) {
  const html = shell('Bienvenido a SYSTEMHOME',
    '<h2 style="margin:0 0 10px;font-size:20px">Bienvenido, ' + esc(name) + '</h2>' +
    '<p style="color:#475569;line-height:1.6">Tu cuenta de cliente ha sido creada correctamente.</p>' +
    '<p style="color:#334155">Usuario: <strong>' + esc(username) + '</strong></p>' +
    '<p style="color:#64748b;font-size:13px">Ya puedes ingresar al portal de clientes.</p>' +
    button(APP_URL, 'Ingresar a SYSTEMHOME'));
  return sendMail(to, 'Bienvenido a SYSTEMHOME', html, 'Tu cuenta ha sido creada. Usuario: ' + username);
}

module.exports = { isConfigured, sendMail, sendPasswordReset, sendWelcome };
