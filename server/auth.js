// Autentifikatsiya: scrypt bilan parol xeshlash + bazadagi sessiya tokenlari.
import crypto from 'node:crypto';
import { get, run } from './db.js';

const SESSION_DAYS = 30;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, keyHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const key = Buffer.from(keyHex, 'hex');
    const test = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), key.length);
    return crypto.timingSafeEqual(key, test);
  } catch {
    return false;
  }
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)', [token, userId, expires]);
  return { token, expires_at: expires };
}

export function destroySession(token) {
  run('DELETE FROM sessions WHERE token = ?', [token]);
}

function userFromToken(token) {
  if (!token) return null;
  const row = get(
    `SELECT u.id, u.username, u.full_name, u.role, u.active, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`,
    [token]
  );
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    destroySession(token);
    return null;
  }
  if (!row.active) return null;
  return row;
}

/** Har bir so'rovda foydalanuvchini aniqlaydi (majburiy emas). */
export function attachUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.token = token;
  req.user = userFromToken(token);
  next();
}

/** Kirishni talab qiladi; rollar berilsa — faqat shu rollarga ruxsat. */
export function requireAuth(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

// Rol iyerarxiyasi: admin hamma narsani qila oladi.
export const CAN_EDIT_REFS = ['admin'];
export const CAN_EDIT_WAYBILLS = ['admin', 'dispatcher'];
export const CAN_EDIT_FUEL = ['admin', 'dispatcher', 'operator'];
