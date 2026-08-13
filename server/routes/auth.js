import express from 'express';
import { get, run, audit } from '../db.js';
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth } from '../auth.js';
import { h, str, bad, HttpError } from '../util.js';

export const router = express.Router();

router.post('/login', h((req, res) => {
  const username = str(req.body.username, 'login', { required: true, max: 60 }).toLowerCase();
  const password = str(req.body.password, 'parol', { required: true, max: 200 });

  const user = get('SELECT * FROM users WHERE lower(username) = ?', [username]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, 'Login yoki parol noto\'g\'ri');
  }
  if (!user.active) throw new HttpError(403, 'Foydalanuvchi bloklangan');

  const session = createSession(user.id);
  audit(user.id, 'login', 'user', user.id);
  res.json({
    token: session.token,
    expires_at: session.expires_at,
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
  });
}));

router.post('/logout', h((req, res) => {
  if (req.token) destroySession(req.token);
  res.json({ ok: true });
}));

router.get('/me', requireAuth(), h((req, res) => {
  res.json({ user: req.user });
}));

router.post('/password', requireAuth(), h((req, res) => {
  const oldPass = str(req.body.old_password, 'joriy parol', { required: true, max: 200 });
  const newPass = str(req.body.new_password, 'yangi parol', { required: true, max: 200 });
  if (newPass.length < 4) throw bad('Yangi parol kamida 4 belgidan iborat bo\'lsin');

  const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!verifyPassword(oldPass, user.password_hash)) throw bad('Joriy parol noto\'g\'ri');

  run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPass), user.id]);
  audit(user.id, 'password_change', 'user', user.id);
  res.json({ ok: true });
}));
