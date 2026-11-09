require('dotenv').config();

const bcrypt = require('bcryptjs');
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');

const requiredEnvironment = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD', 'SESSION_SECRET'];
const missingEnvironment = requiredEnvironment.filter(name => !process.env[name]);
if (missingEnvironment.length) {
  throw new Error(`Missing required environment variables: ${missingEnvironment.join(', ')}. Copy .env.example to .env and configure it.`);
}
if (process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters.');
}

const port = Number(process.env.PORT || 3000);
const databasePort = Number(process.env.MYSQL_PORT || 3306);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) {
  throw new Error('MYSQL_PORT must be an integer between 1 and 65535.');
}
const database = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: databasePort,
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});
class MySQLSessionStore extends session.Store {
  constructor(pool) {
    super();
    this.pool = pool;
    this.cleanupTimer = setInterval(() => {
      this.pool.execute('DELETE FROM sessions WHERE expires <= ?', [Date.now()])
        .catch(error => console.error('Unable to remove expired sessions.', error));
    }, 15 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  get(sessionId, callback) {
    this.pool.execute(
      'SELECT data FROM sessions WHERE session_id = ? AND expires > ? LIMIT 1',
      [sessionId, Date.now()]
    ).then(([rows]) => {
      if (!rows[0]) return callback(null, null);
      callback(null, JSON.parse(rows[0].data));
    }).catch(callback);
  }

  set(sessionId, sessionData, callback) {
    const expires = sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + 24 * 60 * 60 * 1000;
    if (!Number.isFinite(expires)) return callback(new Error('Invalid session expiration.'));
    this.pool.execute(
      `INSERT INTO sessions (session_id, expires, data)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
      [sessionId, expires, JSON.stringify(sessionData)]
    ).then(() => callback(null)).catch(callback);
  }

  touch(sessionId, sessionData, callback) {
    const expires = sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + 24 * 60 * 60 * 1000;
    if (!Number.isFinite(expires)) return callback(new Error('Invalid session expiration.'));
    this.pool.execute(
      'UPDATE sessions SET expires = ? WHERE session_id = ?',
      [expires, sessionId]
    ).then(() => callback(null)).catch(callback);
  }

  destroy(sessionId, callback) {
    this.pool.execute('DELETE FROM sessions WHERE session_id = ?', [sessionId])
      .then(() => callback(null)).catch(callback);
  }

  close() {
    clearInterval(this.cleanupTimer);
  }
}

const sessionStore = new MySQLSessionStore(database);
const app = express();
const defaultSettings = {
  theme: 'light',
  notifications: { deadlines: true, recommendations: true, shortlist: true }
};

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(session({
  name: 'globaledu.sid',
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

function sendError(response, status, message) {
  response.status(status).json({ error: message });
}

function requireAuthentication(request, response, next) {
  if (!request.session.userId) {
    return sendError(response, 401, 'Please sign in to access your account settings.');
  }
  next();
}

function cleanUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}

function establishSession(request, user) {
  return new Promise((resolve, reject) => {
    request.session.regenerate(error => {
      if (error) return reject(error);
      request.session.userId = user.id;
      request.session.save(saveError => saveError ? reject(saveError) : resolve());
    });
  });
}

app.post('/api/auth/register', async (request, response, next) => {
  const body = request.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return sendError(response, 400, 'Enter a valid name and email, and a password with at least 8 characters and no more than 72 UTF-8 bytes.');
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await database.execute(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, passwordHash]
    );
    const user = { id: result.insertId, name, email };
    await establishSession(request, user);
    response.status(201).json({ user });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return sendError(response, 409, 'An account with that email already exists.');
    }
    next(error);
  }
});

app.post('/api/auth/login', async (request, response, next) => {
  const body = request.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return sendError(response, 400, 'Enter your email and password.');

  try {
    const [rows] = await database.execute(
      'SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const row = rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return sendError(response, 401, 'Email or password is incorrect.');
    }
    const user = cleanUser(row);
    await establishSession(request, user);
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireAuthentication, async (request, response, next) => {
  try {
    const [rows] = await database.execute(
      'SELECT id, name, email FROM users WHERE id = ? LIMIT 1',
      [request.session.userId]
    );
    if (!rows[0]) {
      request.session.destroy(error => {
        if (error) return next(error);
        sendError(response, 401, 'Your session has expired. Please sign in again.');
      });
      return;
    }
    response.json({ user: cleanUser(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (request, response, next) => {
  request.session.destroy(error => {
    if (error) return next(error);
    response.clearCookie('globaledu.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    response.status(204).end();
  });
});

app.get('/api/settings', requireAuthentication, async (request, response, next) => {
  try {
    const [rows] = await database.execute(
      'SELECT theme, notifications FROM user_settings WHERE user_id = ? LIMIT 1',
      [request.session.userId]
    );
    if (!rows[0]) return response.json(defaultSettings);
    const notifications = typeof rows[0].notifications === 'string'
      ? JSON.parse(rows[0].notifications)
      : rows[0].notifications;
    response.json({ theme: rows[0].theme, notifications });
  } catch (error) {
    next(error);
  }
});

app.put('/api/settings', requireAuthentication, async (request, response, next) => {
  const body = request.body || {};
  const { theme, notifications } = body;
  const allowedNotifications = ['deadlines', 'recommendations', 'shortlist'];
  const validNotifications = notifications
    && typeof notifications === 'object'
    && !Array.isArray(notifications)
    && Object.keys(notifications).length === allowedNotifications.length
    && allowedNotifications.every(key => typeof notifications[key] === 'boolean');

  if (!['light', 'dark'].includes(theme) || !validNotifications) {
    return sendError(response, 400, 'Provide a light or dark theme and all notification preferences as booleans.');
  }

  try {
    await database.execute(
      `INSERT INTO user_settings (user_id, theme, notifications)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE theme = VALUES(theme), notifications = VALUES(notifications)`,
      [request.session.userId, theme, JSON.stringify(notifications)]
    );
    response.json({ theme, notifications });
  } catch (error) {
    next(error);
  }
});

app.use((request, response, next) => {
  const requestPath = request.path.toLowerCase();
  const privateFiles = ['/server.js', '/schema.sql', '/package.json', '/package-lock.json', '/database_setup.md', '/.env.example'];
  if (privateFiles.includes(requestPath) || requestPath === '/node_modules' || requestPath.startsWith('/node_modules/')
    || requestPath === '/php' || requestPath.startsWith('/php/')) {
    return response.sendStatus(404);
  }
  next();
});

app.use(express.static(__dirname, { dotfiles: 'ignore' }));
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  console.error('Request failed:', error);
  if (error.type === 'entity.parse.failed') {
    return sendError(response, 400, 'Request body must be valid JSON.');
  }
  sendError(response, 500, 'The server could not complete the request.');
});

async function start() {
  await database.query('SELECT 1');
  await database.query('SELECT id FROM users LIMIT 0');
  await database.query('SELECT user_id FROM user_settings LIMIT 0');
  await database.query('SELECT session_id FROM sessions LIMIT 0');
  app.listen(port, () => {
    console.log(`GlobalEdu is running at http://localhost:${port}`);
  });
}

start().catch(error => {
  console.error('GlobalEdu could not start. Check your .env settings, database availability, and that schema.sql has been applied.', error);
  process.exitCode = 1;
});
