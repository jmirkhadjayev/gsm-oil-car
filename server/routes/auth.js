import express from 'express';
import { get, run, audit } from '../db.js';
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth } from '../auth.js';
import { ldapConfig, ldapAuthenticate, upsertLdapUser } from '../ldap.js';
import { h, str, bad, HttpError } from '../util.js';

export const router = express.Router();

/** Katalog yoqilganmi — login sahifasi shunga qarab matnini o'zgartiradi. */
router.get('/mode', h((_req, res) => {
  const cfg = ldapConfig();
  res.json({
    ldap: !!(cfg.enabled && cfg.url && cfg.base_dn),
    local_fallback: !!cfg.allow_local_fallback,
  });
}));

router.post('/login', h(async (req, res) => {
  // Bo'sh maydonlar ham 401 qaytaradi — qaysi biri xato ekanini bildirmaslik uchun
  const username = str(req.body.username, 'login', { max: 60 }).toLowerCase();
  const password = str(req.body.password, 'parol', { max: 200 });
  if (!username || !password) throw new HttpError(401, 'Login yoki parol noto\'g\'ri');

  const cfg = ldapConfig();
  const useLdap = !!(cfg.enabled && cfg.url && cfg.base_dn);
  let user = null;
  let via = 'local';

  if (useLdap) {
    try {
      const info = await ldapAuthenticate(username, password, cfg);
      user = upsertLdapUser(info, cfg);
      via = 'ldap';
    } catch (err) {
      // Katalog ishlamay qolsa yoki xodim faqat lokal bo'lsa — lokal parolga o'tamiz
      const localUser = get('SELECT * FROM users WHERE lower(username) = ?', [username]);
      const canFallback = cfg.allow_local_fallback && localUser && localUser.auth_source === 'local';
      if (!canFallback) {
        audit(null, 'login_failed', 'user', null, `${username}: ${err.message}`);
        throw new HttpError(401, err.message || 'Katalogda tekshiruvdan o\'tmadi');
      }
    }
  }

  if (!user) {
    const localUser = get('SELECT * FROM users WHERE lower(username) = ?', [username]);
    if (!localUser || localUser.auth_source === 'ldap' || !verifyPassword(password, localUser.password_hash)) {
      throw new HttpError(401, 'Login yoki parol noto\'g\'ri');
    }
    user = localUser;
    run('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', [user.id]);
  }

  if (!user.active) throw new HttpError(403, 'Foydalanuvchi bloklangan');

  const session = createSession(user.id);
  audit(user.id, 'login', 'user', user.id, via);
  const branch = user.branch_id ? get('SELECT * FROM branches WHERE id = ?', [user.branch_id]) : null;
  res.json({
    token: session.token,
    expires_at: session.expires_at,
    user: {
      id: user.id, username: user.username, full_name: user.full_name, role: user.role,
      branch_id: user.branch_id ?? null,
      branch_code: branch?.code ?? null,
      branch_name_uz: branch?.name_uz ?? null,
      branch_name_ru: branch?.name_ru ?? null,
    },
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
