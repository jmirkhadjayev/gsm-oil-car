// Spravochniklar: avtomobillar, haydovchilar, yoqilg'i turlari, tashkilot, foydalanuvchilar.
import express from 'express';
import { all, get, run, audit } from '../db.js';
import { requireAuth, hashPassword } from '../auth.js';
import { recalcVehicle } from '../calc.js';
import { h, str, num, bool, bad, notFound } from '../util.js';

export const router = express.Router();
const ADMIN = ['admin'];

// ============================== Avtomobillar ==============================
const vehicleSelect = `
  SELECT v.*, ft.code AS fuel_code, ft.name_uz AS fuel_name_uz, ft.name_ru AS fuel_name_ru,
         ft.unit_uz, ft.unit_ru, ft.price AS fuel_price
    FROM vehicles v JOIN fuel_types ft ON ft.id = v.fuel_type_id`;

router.get('/vehicles', requireAuth(), h((req, res) => {
  const onlyActive = req.query.active === '1';
  const q = str(req.query.q, 'q');
  const where = [];
  const params = [];
  if (onlyActive) where.push('v.active = 1');
  if (q) {
    where.push('(v.garage_no LIKE ? OR v.plate LIKE ? OR v.model LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const sql = `${vehicleSelect} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY v.active DESC, CAST(v.garage_no AS INTEGER), v.garage_no`;
  res.json(all(sql, params));
}));

router.get('/vehicles/:id', requireAuth(), h((req, res) => {
  const row = get(`${vehicleSelect} WHERE v.id = ?`, [req.params.id]);
  if (!row) throw notFound();
  res.json(row);
}));

function vehicleBody(b) {
  return {
    garage_no: str(b.garage_no, 'Garaj raqami', { required: true, max: 20 }),
    plate: str(b.plate, 'Davlat raqami', { required: true, max: 20 }),
    model: str(b.model, 'Rusum', { required: true, max: 80 }),
    fuel_type_id: num(b.fuel_type_id, 'Yoqilg\'i turi', { min: 1 }),
    tank_capacity: num(b.tank_capacity, 'Bak hajmi', { min: 0, max: 100000, def: 0 }),
    norm_per_100km: num(b.norm_per_100km, 'Norma (100 km)', { min: 0, max: 1000, def: 0 }),
    winter_pct: num(b.winter_pct, 'Qishki ustama', { min: 0, max: 100, def: 0 }),
    norm_engine_hour: num(b.norm_engine_hour, 'Ish soati normasi', { min: 0, max: 1000, def: 0 }),
    norm_per_ton_km: num(b.norm_per_ton_km, 'Yuk normasi', { min: 0, max: 1000, def: 0 }),
    init_odometer: num(b.init_odometer, 'Boshlang\'ich spidometr', { min: 0, max: 1e9, def: 0 }),
    init_fuel: num(b.init_fuel, 'Boshlang\'ich qoldiq', { min: 0, max: 100000, def: 0 }),
    active: bool(b.active ?? 1),
    notes: str(b.notes, 'Izoh', { max: 1000 }),
  };
}

router.post('/vehicles', requireAuth(...ADMIN), h((req, res) => {
  const v = vehicleBody(req.body);
  if (!get('SELECT id FROM fuel_types WHERE id = ?', [v.fuel_type_id])) throw bad('Yoqilg\'i turi topilmadi');
  if (get('SELECT id FROM vehicles WHERE garage_no = ?', [v.garage_no])) throw bad('Bu garaj raqami band');
  const r = run(
    `INSERT INTO vehicles (garage_no, plate, model, fuel_type_id, tank_capacity, norm_per_100km,
       winter_pct, norm_engine_hour, norm_per_ton_km, init_odometer, init_fuel, active, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    Object.values(v)
  );
  recalcVehicle(Number(r.lastInsertRowid));
  audit(req.user.id, 'create', 'vehicle', Number(r.lastInsertRowid), v.garage_no);
  res.status(201).json(get(`${vehicleSelect} WHERE v.id = ?`, [r.lastInsertRowid]));
}));

router.put('/vehicles/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM vehicles WHERE id = ?', [id])) throw notFound();
  const v = vehicleBody(req.body);
  if (get('SELECT id FROM vehicles WHERE garage_no = ? AND id <> ?', [v.garage_no, id])) throw bad('Bu garaj raqami band');
  run(
    `UPDATE vehicles SET garage_no=?, plate=?, model=?, fuel_type_id=?, tank_capacity=?, norm_per_100km=?,
       winter_pct=?, norm_engine_hour=?, norm_per_ton_km=?, init_odometer=?, init_fuel=?, active=?, notes=?
     WHERE id=?`,
    [...Object.values(v), id]
  );
  recalcVehicle(id);
  audit(req.user.id, 'update', 'vehicle', id, v.garage_no);
  res.json(get(`${vehicleSelect} WHERE v.id = ?`, [id]));
}));

router.delete('/vehicles/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  const used = get('SELECT id FROM waybills WHERE vehicle_id = ? LIMIT 1', [id])
            || get('SELECT id FROM fuel_issues WHERE vehicle_id = ? LIMIT 1', [id]);
  if (used) {
    run('UPDATE vehicles SET active = 0 WHERE id = ?', [id]);
    audit(req.user.id, 'archive', 'vehicle', id);
    return res.json({ ok: true, archived: true });
  }
  run('DELETE FROM vehicles WHERE id = ?', [id]);
  audit(req.user.id, 'delete', 'vehicle', id);
  res.json({ ok: true, archived: false });
}));

// ============================== Haydovchilar ==============================
router.get('/drivers', requireAuth(), h((req, res) => {
  const onlyActive = req.query.active === '1';
  const q = str(req.query.q, 'q');
  const where = [];
  const params = [];
  if (onlyActive) where.push('active = 1');
  if (q) { where.push('(full_name LIKE ? OR tab_no LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  res.json(all(
    `SELECT * FROM drivers ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY active DESC, full_name`, params));
}));

function driverBody(b) {
  return {
    full_name: str(b.full_name, 'F.I.Sh.', { required: true, max: 120 }),
    tab_no: str(b.tab_no, 'Tabel raqami', { max: 20 }),
    license_no: str(b.license_no, 'Guvohnoma', { max: 30 }),
    phone: str(b.phone, 'Telefon', { max: 30 }),
    class: str(b.class, 'Toifa', { max: 30 }),
    active: bool(b.active ?? 1),
  };
}

router.post('/drivers', requireAuth(...ADMIN), h((req, res) => {
  const d = driverBody(req.body);
  const r = run(
    'INSERT INTO drivers (full_name, tab_no, license_no, phone, class, active) VALUES (?,?,?,?,?,?)',
    Object.values(d)
  );
  audit(req.user.id, 'create', 'driver', Number(r.lastInsertRowid), d.full_name);
  res.status(201).json(get('SELECT * FROM drivers WHERE id = ?', [r.lastInsertRowid]));
}));

router.put('/drivers/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM drivers WHERE id = ?', [id])) throw notFound();
  const d = driverBody(req.body);
  run(
    'UPDATE drivers SET full_name=?, tab_no=?, license_no=?, phone=?, class=?, active=? WHERE id=?',
    [...Object.values(d), id]
  );
  audit(req.user.id, 'update', 'driver', id, d.full_name);
  res.json(get('SELECT * FROM drivers WHERE id = ?', [id]));
}));

router.delete('/drivers/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  const used = get('SELECT id FROM waybills WHERE driver_id = ? LIMIT 1', [id]);
  if (used) {
    run('UPDATE drivers SET active = 0 WHERE id = ?', [id]);
    audit(req.user.id, 'archive', 'driver', id);
    return res.json({ ok: true, archived: true });
  }
  run('DELETE FROM drivers WHERE id = ?', [id]);
  audit(req.user.id, 'delete', 'driver', id);
  res.json({ ok: true, archived: false });
}));

// ============================ Yoqilg'i turlari ============================
router.get('/fuel-types', requireAuth(), h((_req, res) => {
  res.json(all('SELECT * FROM fuel_types ORDER BY active DESC, id'));
}));

router.put('/fuel-types/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM fuel_types WHERE id = ?', [id])) throw notFound();
  run('UPDATE fuel_types SET price = ?, active = ? WHERE id = ?', [
    num(req.body.price, 'Narx', { min: 0, max: 1e9, def: 0 }),
    bool(req.body.active ?? 1),
    id,
  ]);
  audit(req.user.id, 'update', 'fuel_type', id);
  res.json(get('SELECT * FROM fuel_types WHERE id = ?', [id]));
}));

// =============================== Tashkilot ================================
router.get('/org', requireAuth(), h((_req, res) => {
  res.json(get('SELECT * FROM org WHERE id = 1'));
}));

router.put('/org', requireAuth(...ADMIN), h((req, res) => {
  const b = req.body;
  run(
    `UPDATE org SET name=?, inn=?, address=?, phone=?, director=?, mechanic=?, winter_months=? WHERE id = 1`,
    [
      str(b.name, 'Tashkilot nomi', { max: 200 }),
      str(b.inn, 'STIR', { max: 20 }),
      str(b.address, 'Manzil', { max: 300 }),
      str(b.phone, 'Telefon', { max: 50 }),
      str(b.director, 'Rahbar', { max: 120 }),
      str(b.mechanic, 'Mexanik', { max: 120 }),
      str(b.winter_months, 'Qish oylari', { max: 40 }) || '11,12,1,2,3',
    ]
  );
  audit(req.user.id, 'update', 'org', 1);
  res.json(get('SELECT * FROM org WHERE id = 1'));
}));

// ============================ Foydalanuvchilar ============================
router.get('/users', requireAuth(...ADMIN), h((_req, res) => {
  res.json(all('SELECT id, username, full_name, role, active, created_at FROM users ORDER BY active DESC, username'));
}));

router.post('/users', requireAuth(...ADMIN), h((req, res) => {
  const username = str(req.body.username, 'Login', { required: true, max: 60 }).toLowerCase();
  const full_name = str(req.body.full_name, 'F.I.Sh.', { required: true, max: 120 });
  const password = str(req.body.password, 'Parol', { required: true, max: 200 });
  const role = str(req.body.role, 'Rol', { required: true, max: 20 });
  if (!['admin', 'dispatcher', 'operator', 'viewer'].includes(role)) throw bad('Noto\'g\'ri rol');
  if (password.length < 4) throw bad('Parol kamida 4 belgidan iborat bo\'lsin');
  if (get('SELECT id FROM users WHERE lower(username) = ?', [username])) throw bad('Bu login band');

  const r = run(
    'INSERT INTO users (username, full_name, password_hash, role, active) VALUES (?,?,?,?,?)',
    [username, full_name, hashPassword(password), role, bool(req.body.active ?? 1)]
  );
  audit(req.user.id, 'create', 'user', Number(r.lastInsertRowid), username);
  res.status(201).json(get('SELECT id, username, full_name, role, active FROM users WHERE id = ?', [r.lastInsertRowid]));
}));

router.put('/users/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  const user = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw notFound();
  const full_name = str(req.body.full_name, 'F.I.Sh.', { required: true, max: 120 });
  const role = str(req.body.role, 'Rol', { required: true, max: 20 });
  if (!['admin', 'dispatcher', 'operator', 'viewer'].includes(role)) throw bad('Noto\'g\'ri rol');
  const active = bool(req.body.active ?? 1);

  // Oxirgi faol adminni o'chirib qo'yishdan himoya
  const admins = get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1").c;
  if (user.role === 'admin' && user.active && (role !== 'admin' || !active) && admins <= 1) {
    throw bad('Tizimda kamida bitta faol administrator qolishi kerak');
  }

  run('UPDATE users SET full_name=?, role=?, active=? WHERE id=?', [full_name, role, active, id]);
  const password = str(req.body.password, 'Parol', { max: 200 });
  if (password) {
    if (password.length < 4) throw bad('Parol kamida 4 belgidan iborat bo\'lsin');
    run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), id]);
    run('DELETE FROM sessions WHERE user_id = ?', [id]);   // parol o'zgarsa — sessiyalar bekor
  }
  audit(req.user.id, 'update', 'user', id, user.username);
  res.json(get('SELECT id, username, full_name, role, active FROM users WHERE id = ?', [id]));
}));
