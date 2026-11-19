/**
 * SYSTEMHOME - Módulo de correo electrónico real
 * Credenciales SOLO desde variables de entorno. Nunca en el código.
 *
 * Proveedor preferido: Brevo por API HTTP (puerto 443). Funciona en Render Free,
 * que bloquea el tráfico saliente SMTP en los puertos 25, 465 y 587.
 *   BREVO_API_KEY, MAIL_FROM, MAIL_FROM_NAME, APP_URL
 *
 * Respaldo SMTP (planes de pago o servidores sin bloqueo de puertos):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
 */
const nodemailer = require('nodemailer');
require('dotenv').config();

const APP_URL = (process.env.APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
const FROM_NAME = process.env.MAIL_FROM_NAME || 'SYSTEMHOME';
const FROM = process.env.MAIL_FROM || process.env.SMTP_USER || '';
const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

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
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  return transporter;
}

function isConfigured() {
  return !!(BREVO_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

// Brevo espera direcciones como objetos { name, email }. Se aceptan tanto
// "correo@ejemplo.com" como "Nombre <correo@ejemplo.com>".
function parseAddress(value) {
  const s = String(value == null ? '' : value).trim();
  const m = s.match(/^(.*?)<([^>]+)>$/);
  if (m) return { name: m[1].trim().replace(/^["']|["']$/g, ''), email: m[2].trim() };
  return { email: s };
}

async function sendViaBrevo(to, subject, html, text, attachments = []) {
  if (!FROM) return { sent: false, reason: 'MAIL_FROM_MISSING' };
  const payload = {
    sender: { name: FROM_NAME, email: FROM },
    to: [parseAddress(to)],
    subject,
    htmlContent: html,
    textContent: text || ''
  };
  if (attachments.length) {
    payload.attachment = attachments.map(a => ({
      name: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : String(a.content || ''),
      contentType: a.contentType || 'application/pdf'
    }));
  }
  const resp = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });
  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 240);
    throw new Error('Brevo HTTP ' + resp.status + ': ' + detail);
  }
  return { sent: true };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(value) {
  return Number(value || 0).toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
  if (!href) return '';
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0">' +
    '<tr><td style="border-radius:8px;background:#0e7490">' +
    '<a href="' + esc(href) + '" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600">' + esc(label) + '</a>' +
    '</td></tr></table>';
}

/**
 * Envio generico. `attachments` es opcional y usa el formato de nodemailer.
 */
async function sendMail(to, subject, html, text, attachments = []) {
  if (BREVO_API_KEY) {
    try {
      return await sendViaBrevo(to, subject, html, text, attachments);
    } catch (err) {
      return { sent: false, reason: err.message };
    }
  }
  const t = getTransporter();
  if (!t) {
    console.warn('Correo no configurado: no enviado a', String(to).replace(/@.*/, '@***'));
    return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };
  }
  await t.sendMail({
    from: '"' + FROM_NAME + '" <' + FROM + '>',
    to,
    subject,
    html,
    text,
    attachments
  });
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

async function sendVerificationEmail(to, name, token, expiresMinutes) {
  const link = APP_URL + '/verify-email?token=' + encodeURIComponent(token);
  const html = shell('Verificar correo',
    '<h2 style="margin:0 0 10px;font-size:20px">Hola ' + esc(name) + '</h2>' +
    '<p style="color:#475569;line-height:1.6">Confirma tu correo para activar tu cuenta de SYSTEMHOME.</p>' +
    button(link, 'Verificar mi correo') +
    '<p style="color:#64748b;font-size:13px">Este enlace vence en ' + esc(expiresMinutes) + ' minutos. Si no creaste esta cuenta, ignora este correo.</p>' +
    '<p style="color:#94a3b8;font-size:11px;word-break:break-all">Si el boton no funciona, copia este enlace: ' + esc(link) + '</p>');
  return sendMail(to, 'SYSTEMHOME - Verifica tu correo', html,
    'Verifica tu correo: ' + link);
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

/**
 * Cotizacion por correo real, con PDF adjunto cuando se genera.
 */
async function sendBudget(to, clientName, budget, pdfBuffer, message = '') {
  const link = APP_URL ? APP_URL + '/#/quote/' + encodeURIComponent(budget.number) : '';
  const html = shell('Cotizacion SYSTEMHOME',
    '<h2 style="margin:0 0 10px;font-size:20px">Hola ' + esc(clientName || 'Cliente') + '</h2>' +
    '<p style="color:#475569;line-height:1.6">Adjuntamos la cotizacion <strong>' + esc(budget.number) + '</strong> preparada por SYSTEMHOME.</p>' +
    (message ? '<div style="background:#f0f9ff;border-left:4px solid #0e7490;padding:12px 16px;border-radius:6px;color:#334155;margin:16px 0;white-space:pre-wrap">' + esc(message) + '</div>' : '') +
    '<table width="100%" cellpadding="8" style="border-collapse:collapse;background:#f8fafc;border-radius:8px;margin:16px 0">' +
    '<tr><td style="color:#64748b;font-size:13px">Servicio</td><td style="text-align:right;font-weight:600">' + esc(budget.serviceType || 'Servicio tecnico') + '</td></tr>' +
    '<tr><td style="color:#64748b;font-size:13px">Total</td><td style="text-align:right;font-weight:700;color:#0e7490">Bs. ' + money(budget.total) + '</td></tr>' +
    (budget.validUntil ? '<tr><td style="color:#64748b;font-size:13px">Valido hasta</td><td style="text-align:right">' + esc(budget.validUntil) + '</td></tr>' : '') +
    '</table>' +
    '<p style="color:#475569;font-size:13px">El detalle completo se encuentra en el PDF adjunto. Si desea aprobar o consultar, responda a este correo o escribanos al WhatsApp +591 64595762.</p>' +
    button(link, 'Ver en el portal') +
    '<p style="color:#94a3b8;font-size:12px">Gracias por confiar en SYSTEMHOME Security.</p>');

  const attachments = [];
  if (pdfBuffer && pdfBuffer.length) {
    attachments.push({
      filename: 'cotizacion-' + String(budget.number || 'systemhome').replace(/[^\w.-]/g, '_') + '.pdf',
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
  }

  const text = 'Hola ' + (clientName || 'Cliente') + ',\n\n' +
    'Adjuntamos la cotizacion ' + budget.number + ' por Bs. ' + money(budget.total) + '.\n' +
    (message ? message + '\n\n' : '') +
    'Consultas: WhatsApp +591 64595762.\n\nSYSTEMHOME Security';

  return sendMail(to, 'SYSTEMHOME - Cotizacion ' + budget.number, html, text, attachments);
}

/**
 * Aviso interno de nueva solicitud (admin / tecnico).
 */
async function sendNewRequestNotification(to, roleLabel, request) {
  const html = shell('Nueva solicitud',
    '<h2 style="margin:0 0 10px;font-size:20px">Nueva solicitud de cotizacion</h2>' +
    '<p style="color:#475569;line-height:1.6">Estimado/a ' + esc(roleLabel) + ':</p>' +
    '<table width="100%" cellpadding="8" style="border-collapse:collapse;background:#f8fafc;margin:14px 0">' +
    '<tr><td style="color:#64748b">Numero</td><td style="text-align:right;font-weight:700">' + esc(request.number) + '</td></tr>' +
    '<tr><td style="color:#64748b">Cliente</td><td style="text-align:right">' + esc(request.clientName || 'Cliente') + '</td></tr>' +
    '<tr><td style="color:#64748b">Servicio</td><td style="text-align:right">' + esc(request.serviceType) + '</td></tr>' +
    '</table>' +
    '<p style="color:#475569;font-size:13px;white-space:pre-wrap">' + esc((request.description || '').substring(0, 600)) + '</p>' +
    button(APP_URL, 'Abrir SYSTEMHOME'));
  return sendMail(to, 'SYSTEMHOME - Nueva solicitud ' + request.number, html,
    'Nueva solicitud ' + request.number + ' de ' + (request.clientName || 'Cliente') + ': ' + request.description);
}

module.exports = {
  isConfigured,
  sendMail,
  sendPasswordReset,
  sendVerificationEmail,
  sendWelcome,
  sendBudget,
  sendNewRequestNotification,
  APP_URL
};
