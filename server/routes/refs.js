// Spravochniklar: avtomobillar, haydovchilar, yoqilg'i turlari, tashkilot, foydalanuvchilar.
import express from 'express';
import { all, get, run, audit } from '../db.js';
import { requireAuth, hashPassword } from '../auth.js';
import { recalcVehicle } from '../calc.js';
import { pushBranch, branchForInsert } from '../branch.js';
import { h, str, num, bool, bad, notFound } from '../util.js';

export const router = express.Router();
const ADMIN = ['admin'];

// ========================= Texnika (avtomobil/GSE) ========================
const vehicleSelect = `
  SELECT v.*, ft.code AS fuel_code, ft.name_uz AS fuel_name_uz, ft.name_ru AS fuel_name_ru,
         ft.unit_uz, ft.unit_ru, ft.price AS fuel_price,
         ec.code AS category_code, ec.group_code,
         ec.name_uz AS category_name_uz, ec.name_ru AS category_name_ru,
         z.code AS zone_code, z.name_uz AS zone_name_uz, z.name_ru AS zone_name_ru
    FROM vehicles v
    JOIN fuel_types ft ON ft.id = v.fuel_type_id
    LEFT JOIN equipment_categories ec ON ec.id = v.category_id
    LEFT JOIN zones z ON z.id = v.zone_id`;

router.get('/vehicles', requireAuth(), h((req, res) => {
  const where = [];
  const params = [];
  pushBranch(where, params, req, 'v.branch_id');
  if (req.query.active === '1') where.push('v.active = 1');
  if (req.query.category_id) { where.push('v.category_id = ?'); params.push(Number(req.query.category_id)); }
  if (req.query.group) { where.push('ec.group_code = ?'); params.push(str(req.query.group, 'group')); }
  if (req.query.zone_id) { where.push('v.zone_id = ?'); params.push(Number(req.query.zone_id)); }
  if (req.query.basis) { where.push('v.norm_basis = ?'); params.push(str(req.query.basis, 'basis')); }
  const q = str(req.query.q, 'q');
  if (q) {
    where.push('(v.garage_no LIKE ? OR v.plate LIKE ? OR v.model LIKE ? OR v.serial_no LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const sql = `${vehicleSelect} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY v.active DESC, ec.group_code, v.garage_no`;
  res.json(all(sql, params));
}));

router.get('/vehicles/:id', requireAuth(), h((req, res) => {
  const row = get(`${vehicleSelect} WHERE v.id = ?`, [req.params.id]);
  if (!row) throw notFound();
  res.json(row);
}));

const BASES = ['km', 'hour', 'both', 'electric'];
const POWERS = ['diesel', 'petrol', 'gas', 'electric', 'hybrid'];

function vehicleBody(b) {
  const basis = str(b.norm_basis, 'Norma asosi', { max: 10 }) || 'km';
  if (!BASES.includes(basis)) throw bad('Noto\'g\'ri norma asosi');
  const power = str(b.power_type, 'Quvvat manbai', { max: 10 }) || 'diesel';
  if (!POWERS.includes(power)) throw bad('Noto\'g\'ri quvvat manbai');

  return {
    garage_no: str(b.garage_no, 'Garaj/inventar raqami', { required: true, max: 20 }),
    plate: str(b.plate, 'Davlat raqami', { max: 20 }) || '—',   // perron texnikasida bo'lmasligi mumkin
    model: str(b.model, 'Rusum', { required: true, max: 80 }),
    category_id: b.category_id ? num(b.category_id, 'Turkum', { min: 1 }) : null,
    zone_id: b.zone_id ? num(b.zone_id, 'Zona', { min: 1 }) : null,
    norm_basis: basis,
    power_type: power,
    serial_no: str(b.serial_no, 'Zavod raqami', { max: 50 }),
    made_year: b.made_year ? num(b.made_year, 'Yil', { min: 1950, max: 2100 }) : null,
    fuel_type_id: num(b.fuel_type_id, 'Yoqilg\'i turi', { min: 1 }),
    tank_capacity: num(b.tank_capacity, 'Bak hajmi', { min: 0, max: 100000, def: 0 }),
    norm_per_100km: num(b.norm_per_100km, 'Norma (100 km)', { min: 0, max: 1000, def: 0 }),
    winter_pct: num(b.winter_pct, 'Qishki ustama', { min: 0, max: 100, def: 0 }),
    norm_engine_hour: num(b.norm_engine_hour, 'Motosoat normasi', { min: 0, max: 1000, def: 0 }),
    norm_per_ton_km: num(b.norm_per_ton_km, 'Yuk normasi', { min: 0, max: 1000, def: 0 }),
    init_odometer: num(b.init_odometer, 'Boshlang\'ich spidometr', { min: 0, max: 1e9, def: 0 }),
    init_hours: num(b.init_hours, 'Boshlang\'ich motosoat', { min: 0, max: 1e7, def: 0 }),
    init_fuel: num(b.init_fuel, 'Boshlang\'ich qoldiq', { min: 0, max: 100000, def: 0 }),
    active: bool(b.active ?? 1),
    notes: str(b.notes, 'Izoh', { max: 1000 }),
  };
}

router.post('/vehicles', requireAuth(...ADMIN), h((req, res) => {
  const v = vehicleBody(req.body);
  const branchId = branchForInsert(req, req.body);
  if (!get('SELECT id FROM fuel_types WHERE id = ?', [v.fuel_type_id])) throw bad('Yoqilg\'i turi topilmadi');
  if (get('SELECT id FROM vehicles WHERE garage_no = ? AND branch_id = ?', [v.garage_no, branchId])) {
    throw bad('Bu filialda bunday garaj raqami band');
  }
  const r = run(
    `INSERT INTO vehicles (branch_id, garage_no, plate, model, category_id, zone_id, norm_basis, power_type,
       serial_no, made_year, fuel_type_id, tank_capacity, norm_per_100km, winter_pct,
       norm_engine_hour, norm_per_ton_km, init_odometer, init_hours, init_fuel, active, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [branchId, ...Object.values(v)]
  );
  recalcVehicle(Number(r.lastInsertRowid));
  audit(req.user.id, 'create', 'vehicle', Number(r.lastInsertRowid), v.garage_no);
  res.status(201).json(get(`${vehicleSelect} WHERE v.id = ?`, [r.lastInsertRowid]));
}));

router.put('/vehicles/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM vehicles WHERE id = ?', [id])) throw notFound();
  const v = vehicleBody(req.body);
  const cur = get('SELECT branch_id FROM vehicles WHERE id = ?', [id]);
  if (get('SELECT id FROM vehicles WHERE garage_no = ? AND branch_id = ? AND id <> ?',
          [v.garage_no, cur.branch_id, id])) throw bad('Bu filialda bunday garaj raqami band');
  run(
    `UPDATE vehicles SET garage_no=?, plate=?, model=?, category_id=?, zone_id=?, norm_basis=?,
       power_type=?, serial_no=?, made_year=?, fuel_type_id=?, tank_capacity=?, norm_per_100km=?,
       winter_pct=?, norm_engine_hour=?, norm_per_ton_km=?, init_odometer=?, init_hours=?,
       init_fuel=?, active=?, notes=?
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
  pushBranch(where, params, req);
  if (onlyActive) where.push('active = 1');
  if (q) { where.push('(full_name LIKE ? OR tab_no LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  res.json(all(
    `SELECT * FROM drivers ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY active DESC, full_name`, params));
}));

const POSITIONS = ['driver', 'operator', 'mechanic', 'loader'];

function driverBody(b) {
  const position = str(b.position, 'Lavozim', { max: 20 }) || 'driver';
  if (!POSITIONS.includes(position)) throw bad('Noto\'g\'ri lavozim');
  return {
    full_name: str(b.full_name, 'F.I.Sh.', { required: true, max: 120 }),
    tab_no: str(b.tab_no, 'Tabel raqami', { max: 20 }),
    license_no: str(b.license_no, 'Guvohnoma', { max: 30 }),
    phone: str(b.phone, 'Telefon', { max: 30 }),
    class: str(b.class, 'Toifa', { max: 30 }),
    position,
    apron_permit: str(b.apron_permit, 'Perron ruxsatnomasi', { max: 30 }),
    permit_until: str(b.permit_until, 'Ruxsatnoma muddati', { max: 10 }) || null,
    active: bool(b.active ?? 1),
  };
}

router.post('/drivers', requireAuth(...ADMIN), h((req, res) => {
  const d = driverBody(req.body);
  const r = run(
    `INSERT INTO drivers (branch_id, full_name, tab_no, license_no, phone, class, position,
       apron_permit, permit_until, active) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [branchForInsert(req, req.body), ...Object.values(d)]
  );
  audit(req.user.id, 'create', 'driver', Number(r.lastInsertRowid), d.full_name);
  res.status(201).json(get('SELECT * FROM drivers WHERE id = ?', [r.lastInsertRowid]));
}));

router.put('/drivers/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM drivers WHERE id = ?', [id])) throw notFound();
  const d = driverBody(req.body);
  run(
    `UPDATE drivers SET full_name=?, tab_no=?, license_no=?, phone=?, class=?, position=?,
       apron_permit=?, permit_until=?, active=? WHERE id=?`,
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

// =============================== Filiallar ================================
router.get('/branches', requireAuth(), h((req, res) => {
  // Filial xodimi faqat o'z filialini ko'radi, bosh ofis — barchasini
  const rows = req.isHq
    ? all('SELECT * FROM branches WHERE active = 1 ORDER BY id')
    : all('SELECT * FROM branches WHERE id = ?', [req.branchId]);
  res.json(rows);
}));

router.post('/branches', requireAuth(...ADMIN), h((req, res) => {
  if (!req.isHq) throw bad('Filial ochishni faqat bosh ofis amalga oshiradi');
  const code = str(req.body.code, 'Kod', { required: true, max: 10 }).toUpperCase();
  if (get('SELECT id FROM branches WHERE code = ?', [code])) throw bad('Bu kod band');
  const r = run('INSERT INTO branches (code, name_uz, name_ru) VALUES (?,?,?)', [
    code,
    str(req.body.name_uz, 'Nomi (uz)', { required: true, max: 120 }),
    str(req.body.name_ru, 'Nomi (ru)', { required: true, max: 120 }),
  ]);
  audit(req.user.id, 'create', 'branch', Number(r.lastInsertRowid), code);
  res.status(201).json(get('SELECT * FROM branches WHERE id = ?', [r.lastInsertRowid]));
}));

// ========================= Texnika turkumlari (GSE) =======================
router.get('/equipment-categories', requireAuth(), h((req, res) => {
  const where = [];
  const params = [];
  if (req.query.active === '1') where.push('ec.active = 1');
  if (req.query.group) { where.push('ec.group_code = ?'); params.push(str(req.query.group, 'group')); }
  res.json(all(
    `SELECT ec.*, (SELECT COUNT(*) FROM vehicles v WHERE v.category_id = ec.id) AS vehicle_count
       FROM equipment_categories ec
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ec.group_code, ec.name_uz`, params));
}));

const GROUPS = ['aircraft', 'passenger', 'cargo', 'airfield', 'road'];

function categoryBody(b) {
  const group_code = str(b.group_code, 'Guruh', { max: 20 }) || 'road';
  if (!GROUPS.includes(group_code)) throw bad('Noto\'g\'ri guruh');
  const norm_basis = str(b.norm_basis, 'Norma asosi', { max: 10 }) || 'km';
  if (!BASES.includes(norm_basis)) throw bad('Noto\'g\'ri norma asosi');
  return {
    code: str(b.code, 'Kod', { required: true, max: 30 }).toUpperCase(),
    name_uz: str(b.name_uz, 'Nomi (uz)', { required: true, max: 120 }),
    name_ru: str(b.name_ru, 'Nomi (ru)', { required: true, max: 120 }),
    group_code,
    norm_basis,
    default_norm_km: num(b.default_norm_km, 'Norma (100 km)', { min: 0, max: 1000, def: 0 }),
    default_norm_hour: num(b.default_norm_hour, 'Norma (motosoat)', { min: 0, max: 1000, def: 0 }),
    active: bool(b.active ?? 1),
  };
}

router.post('/equipment-categories', requireAuth(...ADMIN), h((req, res) => {
  const c = categoryBody(req.body);
  if (get('SELECT id FROM equipment_categories WHERE code = ?', [c.code])) throw bad('Bu kod band');
  const r = run(
    `INSERT INTO equipment_categories (code, name_uz, name_ru, group_code, norm_basis,
       default_norm_km, default_norm_hour, active) VALUES (?,?,?,?,?,?,?,?)`,
    Object.values(c)
  );
  audit(req.user.id, 'create', 'equipment_category', Number(r.lastInsertRowid), c.code);
  res.status(201).json(get('SELECT * FROM equipment_categories WHERE id = ?', [r.lastInsertRowid]));
}));

router.put('/equipment-categories/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM equipment_categories WHERE id = ?', [id])) throw notFound();
  const c = categoryBody(req.body);
  if (get('SELECT id FROM equipment_categories WHERE code = ? AND id <> ?', [c.code, id])) throw bad('Bu kod band');
  run(
    `UPDATE equipment_categories SET code=?, name_uz=?, name_ru=?, group_code=?, norm_basis=?,
       default_norm_km=?, default_norm_hour=?, active=? WHERE id=?`,
    [...Object.values(c), id]
  );
  audit(req.user.id, 'update', 'equipment_category', id, c.code);
  res.json(get('SELECT * FROM equipment_categories WHERE id = ?', [id]));
}));

router.delete('/equipment-categories/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  if (get('SELECT id FROM vehicles WHERE category_id = ? LIMIT 1', [id])) {
    run('UPDATE equipment_categories SET active = 0 WHERE id = ?', [id]);
    return res.json({ ok: true, archived: true });
  }
  run('DELETE FROM equipment_categories WHERE id = ?', [id]);
  res.json({ ok: true, archived: false });
}));

// ============================ Aeroport zonalari ===========================
router.get('/zones', requireAuth(), h((req, res) => {
  const onlyActive = req.query.active === '1' ? 'WHERE active = 1' : '';
  res.json(all(`SELECT * FROM zones ${onlyActive} ORDER BY active DESC, id`));
}));

router.post('/zones', requireAuth(...ADMIN), h((req, res) => {
  const code = str(req.body.code, 'Kod', { required: true, max: 20 }).toUpperCase();
  if (get('SELECT id FROM zones WHERE code = ?', [code])) throw bad('Bu kod band');
  const r = run('INSERT INTO zones (code, name_uz, name_ru) VALUES (?,?,?)', [
    code,
    str(req.body.name_uz, 'Nomi (uz)', { required: true, max: 120 }),
    str(req.body.name_ru, 'Nomi (ru)', { required: true, max: 120 }),
  ]);
  res.status(201).json(get('SELECT * FROM zones WHERE id = ?', [r.lastInsertRowid]));
}));

router.put('/zones/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM zones WHERE id = ?', [id])) throw notFound();
  run('UPDATE zones SET name_uz=?, name_ru=?, active=? WHERE id=?', [
    str(req.body.name_uz, 'Nomi (uz)', { required: true, max: 120 }),
    str(req.body.name_ru, 'Nomi (ru)', { required: true, max: 120 }),
    bool(req.body.active ?? 1), id,
  ]);
  res.json(get('SELECT * FROM zones WHERE id = ?', [id]));
}));

// ============================= Xizmat turlari =============================
const SERVICE_UNITS = ['flight', 'ton', 'uld', 'pax', 'hour'];

router.get('/service-types', requireAuth(), h((req, res) => {
  const onlyActive = req.query.active === '1' ? 'WHERE active = 1' : '';
  res.json(all(`SELECT * FROM service_types ${onlyActive} ORDER BY active DESC, id`));
}));

router.post('/service-types', requireAuth(...ADMIN), h((req, res) => {
  const code = str(req.body.code, 'Kod', { required: true, max: 20 }).toUpperCase();
  if (get('SELECT id FROM service_types WHERE code = ?', [code])) throw bad('Bu kod band');
  const unit = str(req.body.unit, 'O\'lchov', { max: 10 }) || 'flight';
  if (!SERVICE_UNITS.includes(unit)) throw bad('Noto\'g\'ri o\'lchov birligi');
  const r = run('INSERT INTO service_types (code, name_uz, name_ru, unit) VALUES (?,?,?,?)', [
    code,
    str(req.body.name_uz, 'Nomi (uz)', { required: true, max: 120 }),
    str(req.body.name_ru, 'Nomi (ru)', { required: true, max: 120 }),
    unit,
  ]);
  res.status(201).json(get('SELECT * FROM service_types WHERE id = ?', [r.lastInsertRowid]));
}));

router.put('/service-types/:id', requireAuth(...ADMIN), h((req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM service_types WHERE id = ?', [id])) throw notFound();
  const unit = str(req.body.unit, 'O\'lchov', { max: 10 }) || 'flight';
  if (!SERVICE_UNITS.includes(unit)) throw bad('Noto\'g\'ri o\'lchov birligi');
  run('UPDATE service_types SET name_uz=?, name_ru=?, unit=?, active=? WHERE id=?', [
    str(req.body.name_uz, 'Nomi (uz)', { required: true, max: 120 }),
    str(req.body.name_ru, 'Nomi (ru)', { required: true, max: 120 }),
    unit, bool(req.body.active ?? 1), id,
  ]);
  res.json(get('SELECT * FROM service_types WHERE id = ?', [id]));
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
router.get('/users', requireAuth(...ADMIN), h((req, res) => {
  const where = [];
  const params = [];
  pushBranch(where, params, req, 'u.branch_id');
  res.json(all(
    `SELECT u.id, u.username, u.full_name, u.role, u.active, u.created_at, u.branch_id,
            b.code AS branch_code, b.name_uz AS branch_name_uz, b.name_ru AS branch_name_ru
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY u.active DESC, u.username`, params));
}));

router.post('/users', requireAuth(...ADMIN), h((req, res) => {
  const username = str(req.body.username, 'Login', { required: true, max: 60 }).toLowerCase();
  const full_name = str(req.body.full_name, 'F.I.Sh.', { required: true, max: 120 });
  const password = str(req.body.password, 'Parol', { required: true, max: 200 });
  const role = str(req.body.role, 'Rol', { required: true, max: 20 });
  if (!['admin', 'dispatcher', 'operator', 'viewer'].includes(role)) throw bad('Noto\'g\'ri rol');
  if (password.length < 4) throw bad('Parol kamida 4 belgidan iborat bo\'lsin');
  if (get('SELECT id FROM users WHERE lower(username) = ?', [username])) throw bad('Bu login band');

  // Bosh ofis xodimi uchun branch_id = NULL (barcha filiallar)
  const branchId = req.isHq && req.body.branch_id === null
    ? null
    : branchForInsert(req, req.body);
  const r = run(
    'INSERT INTO users (username, full_name, password_hash, role, active, branch_id) VALUES (?,?,?,?,?,?)',
    [username, full_name, hashPassword(password), role, bool(req.body.active ?? 1), branchId]
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
