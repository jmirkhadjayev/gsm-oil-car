// Yoqilg'i quyish (kirim) yozuvlari.
import express from 'express';
import { all, get, run, audit } from '../db.js';
import { requireAuth } from '../auth.js';
import { recalcVehicle, r2 } from '../calc.js';
import { h, str, num, date, bad, notFound } from '../util.js';

export const router = express.Router();
const EDIT = ['admin', 'dispatcher', 'operator'];

const SELECT = `
  SELECT fi.*, v.garage_no, v.plate, v.model,
         d.full_name AS driver_name,
         w.number AS waybill_number,
         ft.code AS fuel_code, ft.name_uz AS fuel_name_uz, ft.name_ru AS fuel_name_ru,
         ft.unit_uz, ft.unit_ru
    FROM fuel_issues fi
    JOIN vehicles   v  ON v.id = fi.vehicle_id
    JOIN fuel_types ft ON ft.id = fi.fuel_type_id
    LEFT JOIN drivers  d ON d.id = fi.driver_id
    LEFT JOIN waybills w ON w.id = fi.waybill_id`;

router.get('/', requireAuth(), h((req, res) => {
  const where = [];
  const params = [];
  const from = str(req.query.from, 'from');
  const to = str(req.query.to, 'to');
  if (from) { where.push('fi.date >= ?'); params.push(from); }
  if (to) { where.push('fi.date <= ?'); params.push(to); }
  if (req.query.vehicle_id) { where.push('fi.vehicle_id = ?'); params.push(Number(req.query.vehicle_id)); }
  if (req.query.fuel_type_id) { where.push('fi.fuel_type_id = ?'); params.push(Number(req.query.fuel_type_id)); }
  if (req.query.source) { where.push('fi.source = ?'); params.push(str(req.query.source, 'source')); }
  const q = str(req.query.q, 'q');
  if (q) {
    where.push('(v.garage_no LIKE ? OR v.plate LIKE ? OR fi.station LIKE ? OR fi.doc_no LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Number(req.query.limit) || 300, 2000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const rows = all(`${SELECT} ${clause} ORDER BY fi.date DESC, fi.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const totals = get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(fi.liters),0) AS liters, COALESCE(SUM(fi.amount),0) AS amount
       FROM fuel_issues fi JOIN vehicles v ON v.id = fi.vehicle_id ${clause}`, params);
  res.json({ rows, totals, limit, offset });
}));

router.get('/:id', requireAuth(), h((req, res) => {
  const row = get(`${SELECT} WHERE fi.id = ?`, [Number(req.params.id)]);
  if (!row) throw notFound();
  res.json(row);
}));

function body(b) {
  const vehicle = get('SELECT * FROM vehicles WHERE id = ?', [Number(b.vehicle_id)]);
  if (!vehicle) throw bad('Avtomobil tanlanmagan');

  const fuel_type_id = Number(b.fuel_type_id) || vehicle.fuel_type_id;
  if (!get('SELECT id FROM fuel_types WHERE id = ?', [fuel_type_id])) throw bad('Yoqilg\'i turi topilmadi');

  let driver_id = b.driver_id ? Number(b.driver_id) : null;
  if (driver_id && !get('SELECT id FROM drivers WHERE id = ?', [driver_id])) driver_id = null;

  let waybill_id = b.waybill_id ? Number(b.waybill_id) : null;
  if (waybill_id) {
    const w = get('SELECT * FROM waybills WHERE id = ?', [waybill_id]);
    if (!w) throw bad('Yo\'l varaqasi topilmadi');
    if (w.vehicle_id !== vehicle.id) throw bad('Yo\'l varaqasi boshqa avtomobilga tegishli');
    if (w.status === 'closed') throw bad('Yopilgan varaqaga yoqilg\'i qo\'shib bo\'lmaydi');
    if (!driver_id) driver_id = w.driver_id;
  }

  const liters = num(b.liters, 'Miqdori', { min: 0.01, max: 1e5 });
  const price = num(b.price, 'Narxi', { min: 0, max: 1e9, def: 0 });
  const source = str(b.source, 'Manba', { max: 20 }) || 'azs';
  if (!['azs', 'ombor', 'talon', 'karta'].includes(source)) throw bad('Noto\'g\'ri manba turi');

  return {
    date: date(b.date, 'Sana'),
    vehicle_id: vehicle.id,
    driver_id,
    waybill_id,
    fuel_type_id,
    liters: r2(liters),
    price: r2(price),
    amount: r2(liters * price),
    source,
    station: str(b.station, 'AZS', { max: 120 }),
    doc_no: str(b.doc_no, 'Hujjat raqami', { max: 50 }),
    notes: str(b.notes, 'Izoh', { max: 500 }),
  };
}

router.post('/', requireAuth(...EDIT), h((req, res) => {
  const f = body(req.body);
  const r = run(
    `INSERT INTO fuel_issues (date, vehicle_id, driver_id, waybill_id, fuel_type_id,
       liters, price, amount, source, station, doc_no, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [...Object.values(f), req.user.id]
  );
  const id = Number(r.lastInsertRowid);
  recalcVehicle(f.vehicle_id);
  audit(req.user.id, 'create', 'fuel_issue', id, `${f.liters} l`);
  res.status(201).json(get(`${SELECT} WHERE fi.id = ?`, [id]));
}));

router.put('/:id', requireAuth(...EDIT), h((req, res) => {
  const id = Number(req.params.id);
  const cur = get('SELECT * FROM fuel_issues WHERE id = ?', [id]);
  if (!cur) throw notFound();
  const closedWb = cur.waybill_id && get('SELECT status FROM waybills WHERE id = ?', [cur.waybill_id])?.status === 'closed';
  if (closedWb && req.user.role !== 'admin') throw bad('Yopilgan varaqadagi yozuvni faqat administrator tahrirlaydi');

  const f = body(req.body);
  run(
    `UPDATE fuel_issues SET date=?, vehicle_id=?, driver_id=?, waybill_id=?, fuel_type_id=?,
       liters=?, price=?, amount=?, source=?, station=?, doc_no=?, notes=? WHERE id=?`,
    [...Object.values(f), id]
  );
  recalcVehicle(f.vehicle_id);
  if (cur.vehicle_id !== f.vehicle_id) recalcVehicle(cur.vehicle_id);
  audit(req.user.id, 'update', 'fuel_issue', id, `${f.liters} l`);
  res.json(get(`${SELECT} WHERE fi.id = ?`, [id]));
}));

router.delete('/:id', requireAuth(...EDIT), h((req, res) => {
  const id = Number(req.params.id);
  const cur = get('SELECT * FROM fuel_issues WHERE id = ?', [id]);
  if (!cur) throw notFound();
  const closedWb = cur.waybill_id && get('SELECT status FROM waybills WHERE id = ?', [cur.waybill_id])?.status === 'closed';
  if (closedWb && req.user.role !== 'admin') throw bad('Yopilgan varaqadagi yozuvni faqat administrator o\'chiradi');

  run('DELETE FROM fuel_issues WHERE id = ?', [id]);
  recalcVehicle(cur.vehicle_id);
  audit(req.user.id, 'delete', 'fuel_issue', id, `${cur.liters} l`);
  res.json({ ok: true });
}));

/** Tanlangan avtomobil uchun ochiq (yopilmagan) varaqalar — yoqilg'ini bog'lash uchun. */
router.get('/meta/open-waybills', requireAuth(), h((req, res) => {
  const vehicleId = Number(req.query.vehicle_id);
  if (!vehicleId) return res.json([]);
  res.json(all(
    `SELECT id, number, date_from, date_to, driver_id FROM waybills
      WHERE vehicle_id = ? AND status <> 'closed' ORDER BY date_from DESC LIMIT 50`, [vehicleId]));
}));
