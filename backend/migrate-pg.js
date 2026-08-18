/**
 * SYSTEMHOME - Script de Migración e Inicialización para Neon Console (PostgreSQL)
 * Uso: node backend/migrate-pg.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ Error: DATABASE_URL no está definida en las variables de entorno (.env).');
    console.error('   Por favor configure DATABASE_URL con la cadena de conexión de Neon.');
    process.exit(1);
  }

  console.log('🔄 Conectando a Neon PostgreSQL...');
  
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conexión establecida con éxito a la base de datos.');

    const schemaPath = path.join(__dirname, 'database', 'schema-pg.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`No se encontró el archivo de esquema en ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    console.log('📦 Ejecutando esquema de base de datos...');
    await client.query(schemaSql);
    console.log('✅ Esquema y tablas creadas exitosamente.');

    // Verificar / Insertar usuarios por defecto si no existen
    const userCountRes = await client.query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(userCountRes.rows[0].count, 10);

    if (userCount === 0) {
      console.log('👤 Creando usuarios iniciales por defecto...');
      const now = new Date().toISOString();
      const defaultUsers = [
        { u: 'admin', p: 'admin123', name: 'Administrador General', email: 'admin@systemhome.com', phone: '0981 000 000', role: 'admin' },
        { u: 'vendedor', p: 'vendedor123', name: 'Vendedor Comercial', email: 'vendedor@systemhome.com', phone: '0981 555 555', role: 'vendedor' },
        { u: 'tecnico', p: 'tecnico123', name: 'Técnico Especialista', email: 'tecnico@systemhome.com', phone: '0981 333 333', role: 'tecnico' },
        { u: 'cliente', p: 'cliente123', name: 'Cliente Residencial', email: 'cliente@systemhome.com', phone: '0981 666 666', role: 'cliente' }
      ];

      for (const u of defaultUsers) {
        const hash = bcrypt.hashSync(u.p, 10);
        await client.query(`
          INSERT INTO users (username, password_hash, full_name, email, phone, role_id, active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, (SELECT id FROM roles WHERE name = $6), 1, $7, $8)
          ON CONFLICT (username) DO NOTHING
        `, [u.u, hash, u.name, u.email, u.phone, u.role, now, now]);
      }
      console.log('✅ Usuarios iniciales creados.');
    }

    // Verificar catálogo de inventario inicial
    const invCountRes = await client.query('SELECT COUNT(*) as count FROM inventory_items');
    const invCount = parseInt(invCountRes.rows[0].count, 10);

    if (invCount === 0) {
      console.log('📦 Sembrando catálogo de productos de demostración...');
      const now = new Date().toISOString();
      const sampleItems = [
        ['Cámara Domo IP 4MP IR 30m', 'camaras', 'Hikvision', 'DS-2CD1143G0-I', 15, 4, 580000, 'Cámara antivandálica domo IP 4MP con visión nocturna infrarroja de 30m.', '4 Megapíxeles, PoE, Visión Nocturna 30m, IP67', 'Más vendido', 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=80', 1, 1, now, now],
        ['Cámara Tubo Exterior Full Color 2MP', 'camaras', 'Dahua', 'DH-HAC-HFW1209TLMN-LED', 20, 5, 420000, 'Cámara bullet Full Color para imágenes a color 24/7 con luz LED blanca cálida.', 'Full Color 24/7, 1080p Full HD, Luz blanca 20m, IP67', 'Recomendado', 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600&auto=format&fit=crop&q=80', 1, 1, now, now],
        ['DVR Grabador 8 Canales 1080p', 'dvr_nvr', 'Hikvision', 'iDS-7208HQHI-M1/S', 8, 2, 890000, 'Grabador digital de 8 canales con inteligencia artificial AcuSense.', '8 Canales BNC + 2 IP, AcuSense, Salida HDMI 4K', 'Alta demanda', 'https://images.unsplash.com/photo-1544652478-6653e09f18a2?w=600&auto=format&fit=crop&q=80', 1, 1, now, now],
        ['Kit Alarma Inalámbrica Smart WiFi + 4G', 'alarmas', 'Tuya Smart', 'PG-103-4G', 12, 3, 950000, 'Kit de alarma inteligente con pantalla táctil, conexión WiFi y 4G SIM.', 'Pantalla 2.4", WiFi + Chip 4G, App móvil', 'Popular', 'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&auto=format&fit=crop&q=80', 1, 1, now, now],
        ['Aire Split 12000 BTU Inverter Frío/Calor', 'ac', 'Samsung', 'AR12TVHQASIN', 7, 2, 3450000, 'Aire acondicionado split inverter alta eficiencia energética.', '12000 BTU, Frío/Calor, Inverter 60% ahorro', 'Ahorro Energía', 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&auto=format&fit=crop&q=80', 1, 1, now, now]
      ];

      for (const item of sampleItems) {
        await client.query(`
          INSERT INTO inventory_items (name, category, brand, model, stock, min_stock, price, description, features, badge, image_url, show_in_catalog, active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, item);
      }
      console.log('✅ Catálogo inicial sembrado.');
    }

    console.log('\n🎉 ¡MIGRACIÓN A NEON POSTGRESQL COMPLETADA EXITOSAMENTE! 🎉');
  } catch (err) {
    console.error('❌ Error durante la migración:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
