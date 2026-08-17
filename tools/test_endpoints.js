const http = require('http');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resBody });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function test() {
  console.log('--- 1. Testing GET /catalog ---');
  const cat = await request('GET', '/catalog');
  console.log('Catalog status:', cat.status, 'Items count:', cat.data?.catalog?.length);

  console.log('\n--- 2. Testing Login Admin ---');
  const login = await request('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  console.log('Login status:', login.status, 'User:', login.data?.user?.username, 'Role:', login.data?.user?.role);
  const token = login.data?.token;

  console.log('\n--- 3. Testing GET /users ---');
  const users = await request('GET', '/users', null, token);
  console.log('Users status:', users.status, 'Total users:', users.data?.users?.length);

  console.log('\n--- 4. Testing POST /users (Create New User) ---');
  const testUser = {
    username: 'test_tech_' + Date.now().toString().slice(-4),
    name: 'Tecnico Prueba',
    email: 'tecnico_test@systemhome.com',
    phone: '0981 999 888',
    role: 'tecnico',
    password: 'password123',
    active: true
  };
  const createU = await request('POST', '/users', testUser, token);
  console.log('Create User status:', createU.status, 'Created:', createU.data?.user?.username);

  console.log('\n--- 5. Testing GET /inventory ---');
  const inv = await request('GET', '/inventory', null, token);
  console.log('Inventory status:', inv.status, 'Total products:', inv.data?.inventory?.length);

  console.log('\n--- 6. Testing POST /inventory (Create New Product) ---');
  const newProd = {
    name: 'Cámara IP 8MP 4K UltraHD Test',
    category: 'camaras',
    brand: 'Hikvision',
    model: 'DS-2CD2083G2-I',
    stock: 15,
    minStock: 3,
    price: 850000,
    description: 'Cámara IP 4K de alta definición para exterior con visión nocturna EXIR',
    features: '8 Megapixeles, 4K, PoE, WDR 120dB, IP67',
    badge: 'Nuevo',
    showInCatalog: true,
    imageUrl: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600'
  };
  const createP = await request('POST', '/inventory', newProd, token);
  console.log('Create Product status:', createP.status, 'Created:', createP.data?.inventoryItem?.name, 'ID:', createP.data?.inventoryItem?.id);
  const newId = createP.data?.inventoryItem?.id;

  if (newId) {
    console.log('\n--- 7. Testing PUT /inventory/:id (Update Product) ---');
    const updateP = await request('PUT', `/inventory/${newId}`, { price: 890000, stock: 20 }, token);
    console.log('Update Product status:', updateP.status, 'New Price:', updateP.data?.inventoryItem?.price, 'New Stock:', updateP.data?.inventoryItem?.stock);

    console.log('\n--- 8. Testing POST /inventory/:id/image (Image URL update) ---');
    const updateImg = await request('POST', `/inventory/${newId}/image`, { imageUrl: 'https://images.unsplash.com/photo-1589254065878-42c9da997008?w=600' }, token);
    console.log('Update Image status:', updateImg.status, 'New Image URL:', updateImg.data?.inventoryItem?.imageUrl);
  }

  console.log('\n================ ALL API TESTS COMPLETED ================');
}

test().catch(console.error);
