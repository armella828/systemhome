const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuración de Cloudinary
const isCloudinaryConfigured = !!(
  (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) ||
  process.env.CLOUDINARY_URL
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
  console.log('✅ Cloudinary configurado correctamente');
} else {
  console.log('ℹ️ Cloudinary no configurado. Se usará almacenamiento local como fallback.');
}

// Multer memory storage (ideal para enviar buffers a Cloudinary sin tocar disco)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

/**
 * Sube un buffer de archivo a Cloudinary
 * @param {Buffer} buffer - Buffer de archivo
 * @param {Object} options - Opciones de Cloudinary (folder, resource_type, etc)
 * @returns {Promise<Object>} Resultado con secure_url, public_id, etc.
 */
function uploadStream(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: 'systemhome',
      resource_type: 'auto',
      ...options
    };

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });

    stream.end(buffer);
  });
}

/**
 * Sube una imagen o archivo en formato Base64 o Data URI a Cloudinary
 * @param {string} base64Data - Cadena base64 o data URI
 * @param {Object} options - Opciones de Cloudinary
 */
async function uploadBase64(base64Data, options = {}) {
  if (!isCloudinaryConfigured) {
    throw new Error('Cloudinary no está configurado en las variables de entorno.');
  }

  const uploadOptions = {
    folder: 'systemhome',
    resource_type: 'auto',
    ...options
  };

  return await cloudinary.uploader.upload(base64Data, uploadOptions);
}

/**
 * Helper unificado para guardar un archivo subido:
 * Si Cloudinary está configurado, lo sube a la nube.
 * Si no, lo guarda en la carpeta local uploads/ como fallback.
 */
async function saveUploadedFile(file, subfolder = 'general') {
  if (isCloudinaryConfigured && file && file.buffer) {
    const result = await uploadStream(file.buffer, {
      folder: `systemhome/${subfolder}`
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      isCloud: true
    };
  }

  // Fallback local
  const uploadDir = path.join(__dirname, 'uploads', subfolder);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const localPath = path.join(uploadDir, filename);
  fs.writeFileSync(localPath, file.buffer);

  return {
    url: `/uploads/${subfolder}/${filename}`,
    localPath: localPath,
    isCloud: false
  };
}

module.exports = {
  cloudinary,
  upload,
  uploadStream,
  uploadBase64,
  saveUploadedFile,
  isCloudinaryConfigured
};
