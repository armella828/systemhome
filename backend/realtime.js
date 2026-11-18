/**
 * SYSTEMHOME - Bus de eventos en tiempo real (SSE)
 * Los eventos se publican desde los endpoints y llegan de inmediato
 * a los paneles abiertos (admin, vendedor, técnico y portal cliente).
 */
const clients = new Set();

let counter = 0;

function id() {
  counter += 1;
  return `sh_${Date.now()}_${counter}`;
}

function frame(eventName, payload) {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function subscribe(req, res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const client = {
    id: id(),
    res,
    user: {
      id: req.user?.id || null,
      role: String(req.user?.role || '').toLowerCase(),
      username: req.user?.username || '',
      clientId: req.user?.clientId || null
    },
    alive: true
  };

  clients.add(client);
  res.write(frame('connected', { clientId: client.id, at: new Date().toISOString() }));

  const heartbeat = setInterval(() => {
    if (!client.alive || res.writableEnded || res.destroyed) {
      clearInterval(heartbeat);
      return;
    }
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch (e) {
      client.alive = false;
    }
  }, 25000);

  req.on('close', () => {
    client.alive = false;
    clearInterval(heartbeat);
    clients.delete(client);
  });

  return client;
}

function deliver(client, eventName, payload) {
  if (!client.alive || client.res.writableEnded || client.res.destroyed) return;
  try {
    client.res.write(frame(eventName, payload));
  } catch (e) {
    client.alive = false;
    clients.delete(client);
  }
}

/**
 * Publica un evento.
 * @param {string} eventName nombre del evento SSE
 * @param {object} payload datos del evento
 * @param {object} filter filtros opcionales { roles: [], userIds: [] }
 */
function publish(eventName, payload = {}, filter = {}) {
  const roles = filter.roles ? filter.roles.map(r => String(r).toLowerCase()) : null;
  const userIds = filter.userIds ? filter.userIds.map(Number) : null;
  const message = { ...payload, at: new Date().toISOString() };

  clients.forEach(client => {
    if (roles && !roles.includes(client.user.role)) return;
    if (userIds && !userIds.includes(Number(client.user.id))) return;
    // Un cliente NUNCA debe recibir eventos de otros clientes, aunque el
    // publicador olvide pasar el filtro. Sin clientId explícito, se descarta.
    if (client.user.role === 'cliente') {
      if (!filter.clientIds || !filter.clientIds.some(id => Number(id) === Number(client.user.clientId))) return;
    }
    deliver(client, eventName, message);
  });
}

function publishDataChange(entity, action, data = {}, filter = {}) {
  publish('sh-update', { entity, action, ...data }, filter);
}

function count() {
  return clients.size;
}

module.exports = { subscribe, publish, publishDataChange, count };
