// Yo'l varaqalari: yaratish, tahrirlash, yopish, marshrut qatorlari.
import express from 'express';
import { all, get, run, tx, audit } from '../db.js';
import { requireAuth } from '../auth.js';
import { recalcVehicle, isWinterDate, issuedSplit, r2 } from '../calc.js';
import { h, str, num, optNum, bool, date, bad, notFound, today, monthRange } from '../util.js';
import { pushBranch, branchForInsert } from '../branch.js';

export const router = express.Router();
const EDIT = ['admin', 'dispatcher'];

const CALC = 'SELECT * FROM v_waybill_calc';

function loadFull(id) {
  const w = get(`${CALC} WHERE id = ?`, [id]);
  if (!w) throw notFound('Yo\'l varaqasi topilmadi');
  w.routes = all('SELECT * FROM waybill_routes WHERE waybill_id = ? ORDER BY seq, id', [id]);
  w.fuel = all(
    `SELECT fi.*, ft.code AS fuel_code, ft.unit_uz, ft.unit_ru,
            CASE WHEN v.fuel_type2_id IS NOT NULL AND fi.fuel_type_id = v.fuel_type2_id
                 THEN 1 ELSE 0 END AS is_second
       FROM fuel_issues fi
       JOIN fuel_types ft ON ft.id = fi.fuel_type_id
       JOIN vehicles v ON v.id = fi.vehicle_id
      WHERE fi.waybill_id = ? ORDER BY fi.date, fi.id`, [id]);
  w.deviation = w.fact_liters == null ? null : r2(w.fact_liters - w.norm_liters);
  w.deviation2 = w.fact2_liters == null ? null : r2(w.fact2_liters - w.norm2_liters);
  return w;
}

/** Ikkala manba bo'yicha farq — ro'yxatlar uchun. */
const withDeviation = (w) => ({
  ...w,
  deviation: w.fact_liters == null ? null : r2(w.fact_liters - w.norm_liters),
  deviation2: w.fact2_liters == null ? null : r2(w.fact2_liters - w.norm2_liters),
});

/** Keyingi bo'sh raqam — filial ichida (har filialning o'z raqamlash ketma-ketligi). */
function nextNumber(branchId) {
  const row = get(
    `SELECT MAX(CAST(number AS INTEGER)) AS m FROM waybills
      WHERE branch_id = ? AND number GLOB '[0-9]*' AND CAST(number AS INTEGER) > 0`,
    [branchId]
  );
  return String((Number(row?.m) || 0) + 1);
}

// ------------------------------- Ro'yxat --------------------------------
router.get('/', requireAuth(), h((req, res) => {
  const where = [];
  const params = [];
  pushBranch(where, params, req);
  const from = str(req.query.from, 'from');
  const to = str(req.query.to, 'to');
  if (from) { where.push('date_from >= ?'); params.push(from); }
  if (to) { where.push('date_from <= ?'); params.push(to); }
  if (req.query.vehicle_id) { where.push('vehicle_id = ?'); params.push(Number(req.query.vehicle_id)); }
  if (req.query.driver_id) { where.push('driver_id = ?'); params.push(Number(req.query.driver_id)); }
  if (req.query.status) { where.push('status = ?'); params.push(str(req.query.status, 'status')); }
  const q = str(req.query.q, 'q');
  if (q) {
    where.push('(number LIKE ? OR garage_no LIKE ? OR plate LIKE ? OR driver_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = all(
    `${CALC} ${clause} ORDER BY date_from DESC, CAST(number AS INTEGER) DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  ).map(withDeviation);

  const total = get(`SELECT COUNT(*) AS c FROM v_waybill_calc ${clause}`, params).c;
  res.json({ rows, total, limit, offset });
}));

router.get('/next-number', requireAuth(), h((req, res) => res.json({ number: nextNumber(req.branchId ?? 1) })));

// Yangi varaqa uchun boshlang'ich qiymatlar (avtomobil holatidan)
router.get('/defaults', requireAuth(), h((req, res) => {
  const vehicleId = Number(req.query.vehicle_id);
  const v = get('SELECT * FROM vehicles WHERE id = ?', [vehicleId]);
  if (!v) throw notFound('Texnika topilmadi');
  const org = get('SELECT winter_months FROM org WHERE id = 1');
  const d = str(req.query.date, 'date') || today();
  res.json({
    number: nextNumber(v.branch_id),
    odo_start: v.odometer,
    hours_start: v.hour_meter,
    fuel_start: v.fuel_balance,
    norm_per_100km: v.norm_per_100km,
    norm_engine_hour: v.norm_engine_hour,
    norm_per_ton_km: v.norm_per_ton_km,
    winter_pct: v.winter_pct,
    winter: isWinterDate(d, org?.winter_months),
    // Texnika kartochkasidan keladigan kontekst — forma qaysi maydonlarni ko'rsatishini belgilaydi
    norm_basis: v.norm_basis,
    zone_id: v.zone_id,
    tank_capacity: v.tank_capacity,
    // Gibrid: ikkinchi manba (fuel_type2_id NULL bo'lsa forma uni ko'rsatmaydi)
    power_type: v.power_type,
    fuel_type2_id: v.fuel_type2_id ?? null,
    fuel2_start: v.fuel_balance2,
    norm2_per_100km: v.norm2_per_100km,
    norm2_engine_hour: v.norm2_engine_hour,
    tank_capacity2: v.tank_capacity2,
  });
}));

router.get('/:id', requireAuth(), h((req, res) => res.json(loadFull(Number(req.params.id)))));

// ------------------------------- Yaratish -------------------------------
const SHIFTS = ['day', 'night', 'full'];

function baseBody(b, vehicle) {
  const date_from = date(b.date_from, 'Sana (dan)');
  const date_to = date(b.date_to, 'Sana (gacha)', { required: false, def: date_from }) || date_from;
  if (date_to < date_from) throw bad('«Gacha» sanasi «dan» sanasidan oldin bo\'lishi mumkin emas');
  const shift = str(b.shift, 'Smena', { max: 10 }) || 'day';
  if (!SHIFTS.includes(shift)) throw bad('Noto\'g\'ri smena turi');

  return {
    date_from,
    date_to,
    odo_start: num(b.odo_start, 'Chiqishdagi spidometr', { min: 0, max: 1e9, def: 0 }),
    hours_start: num(b.hours_start, 'Smena boshidagi motosoat', { min: 0, max: 1e7, def: 0 }),
    fuel_start: num(b.fuel_start, 'Chiqishdagi qoldiq', { min: 0, max: 1e5, def: 0 }),
    engine_hours: num(b.engine_hours, 'Motosoat', { min: 0, max: 10000, def: 0 }),
    cargo_ton_km: num(b.cargo_ton_km, 't·km', { min: 0, max: 1e7, def: 0 }),
    zone_id: b.zone_id ? num(b.zone_id, 'Zona', { min: 1 }) : (vehicle.zone_id ?? null),
    shift,
    winter: bool(b.winter),
    norm_per_100km: num(b.norm_per_100km, 'Norma (100 km)', { min: 0, max: 1000, def: vehicle.norm_per_100km }),
    norm_engine_hour: num(b.norm_engine_hour, 'Motosoat normasi', { min: 0, max: 1000, def: vehicle.norm_engine_hour }),
    norm_per_ton_km: num(b.norm_per_ton_km, 'Yuk normasi', { min: 0, max: 1000, def: vehicle.norm_per_ton_km }),
    // Ikkinchi manba faqat gibrid texnikada mavjud
    fuel2_start: vehicle.fuel_type2_id
      ? num(b.fuel2_start, 'Chiqishdagi zaryad', { min: 0, max: 1e5, def: 0 }) : 0,
    norm2_per_100km: vehicle.fuel_type2_id
      ? num(b.norm2_per_100km, 'Ikkinchi norma (100 km)', { min: 0, max: 1000, def: vehicle.norm2_per_100km }) : 0,
    norm2_engine_hour: vehicle.fuel_type2_id
      ? num(b.norm2_engine_hour, 'Ikkinchi norma (motosoat)', { min: 0, max: 1000, def: vehicle.norm2_engine_hour }) : 0,
    winter_pct: num(b.winter_pct, 'Qishki ustama', { min: 0, max: 100, def: vehicle.winter_pct }),
    task: str(b.task, 'Topshiriq', { max: 500 }),
    notes: str(b.notes, 'Izoh', { max: 1000 }),
  };
}

/**
 * Bajarilgan ishlar qatorlari.
 * Yo'l transporti uchun — marshrut, perron texnikasi uchun — reysga xizmat operatsiyasi.
 */
function saveRoutes(waybillId, routes) {
  run('DELETE FROM waybill_routes WHERE waybill_id = ?', [waybillId]);
  if (!Array.isArray(routes)) return;
  routes.forEach((r, i) => {
    if (!r) return;
    run(
      `INSERT INTO waybill_routes (waybill_id, seq, point_from, point_to, time_out, time_in,
         distance_km, cargo, cargo_ton, flight_no, aircraft_type, aircraft_reg, stand,
         service_type_id, zone_id, uld_count, pax_count, op_hours)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        waybillId, i + 1,
        str(r.point_from, 'Qayerdan', { max: 200 }),
        str(r.point_to, 'Qayerga', { max: 200 }),
        str(r.time_out, 'Chiqish vaqti', { max: 10 }),
        str(r.time_in, 'Kelish vaqti', { max: 10 }),
        num(r.distance_km, 'Masofa', { min: 0, max: 1e6, def: 0 }),
        str(r.cargo, 'Yuk', { max: 200 }),
        num(r.cargo_ton, 'Yuk (tonna)', { min: 0, max: 1e4, def: 0 }),
        str(r.flight_no, 'Reys', { max: 20 }),
        str(r.aircraft_type, 'Havo kemasi turi', { max: 40 }),
        str(r.aircraft_reg, 'Bort raqami', { max: 20 }),
        str(r.stand, 'Stoyanka', { max: 20 }),
        r.service_type_id ? num(r.service_type_id, 'Xizmat turi', { min: 1 }) : null,
        r.zone_id ? num(r.zone_id, 'Zona', { min: 1 }) : null,
        num(r.uld_count, 'ULD soni', { min: 0, max: 1000, def: 0 }),
        num(r.pax_count, 'Yo\'lovchilar', { min: 0, max: 1000, def: 0 }),
        num(r.op_hours, 'Operatsiya davomiyligi', { min: 0, max: 1000, def: 0 }),
      ]
    );
  });
}

router.post('/', requireAuth(...EDIT), h((req, res) => {
  const b = req.body;
  const vehicle = get('SELECT * FROM vehicles WHERE id = ?', [Number(b.vehicle_id)]);
  if (!vehicle) throw bad('Avtomobil tanlanmagan');
  if (!vehicle.active) throw bad('Avtomobil arxivda');
  const driver = get('SELECT * FROM drivers WHERE id = ?', [Number(b.driver_id)]);
  if (!driver) throw bad('Haydovchi tanlanmagan');
  if (driver.branch_id !== vehicle.branch_id) throw bad('Haydovchi boshqa filialga tegishli');

  // Varaqa texnika qaysi filialda bo'lsa, o'sha filialga tegishli
  const branchId = vehicle.branch_id;
  const number = str(b.number, 'Varaqa raqami', { max: 30 }) || nextNumber(branchId);
  if (get('SELECT id FROM waybills WHERE number = ? AND branch_id = ?', [number, branchId])) {
    throw bad(`Bu filialda № ${number} varaqa allaqachon mavjud`);
  }

  const f = baseBody(b, vehicle);
  const status = ['draft', 'issued'].includes(b.status) ? b.status : 'issued';

  const id = tx(() => {
    const r = run(
      `INSERT INTO waybills (branch_id, number, date_from, date_to, vehicle_id, driver_id, status,
         odo_start, hours_start, fuel_start, fuel2_start, engine_hours, cargo_ton_km, zone_id, shift, winter,
         norm_per_100km, norm_engine_hour, norm_per_ton_km, norm2_per_100km, norm2_engine_hour,
         winter_pct, task, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [branchId, number, f.date_from, f.date_to, vehicle.id, driver.id, status,
       f.odo_start, f.hours_start, f.fuel_start, f.fuel2_start, f.engine_hours, f.cargo_ton_km, f.zone_id, f.shift, f.winter,
       f.norm_per_100km, f.norm_engine_hour, f.norm_per_ton_km, f.norm2_per_100km, f.norm2_engine_hour,
       f.winter_pct, f.task, f.notes, req.user.id]
    );
    const newId = Number(r.lastInsertRowid);
    saveRoutes(newId, b.routes);
    return newId;
  });

  audit(req.user.id, 'create', 'waybill', id, `№${number}`);
  res.status(201).json(loadFull(id));
}));

// ----------------------------- Tahrirlash -------------------------------
router.put('/:id', requireAuth(...EDIT), h((req, res) => {
  const id = Number(req.params.id);
  const cur = get('SELECT * FROM waybills WHERE id = ?', [id]);
  if (!cur) throw notFound('Yo\'l varaqasi topilmadi');
  if (cur.status === 'closed' && req.user.role !== 'admin') {
    throw bad('Yopilgan varaqani faqat administrator tahrirlay oladi');
  }
  const b = req.body;
  const vehicle = get('SELECT * FROM vehicles WHERE id = ?', [Number(b.vehicle_id ?? cur.vehicle_id)]);
  if (!vehicle) throw bad('Avtomobil topilmadi');
  const driver = get('SELECT * FROM drivers WHERE id = ?', [Number(b.driver_id ?? cur.driver_id)]);
  if (!driver) throw bad('Haydovchi topilmadi');

  const number = str(b.number, 'Varaqa raqami', { max: 30 }) || cur.number;
  if (get('SELECT id FROM waybills WHERE number = ? AND branch_id = ? AND id <> ?',
          [number, cur.branch_id, id])) {
    throw bad(`Bu filialda № ${number} varaqa allaqachon mavjud`);
  }

  const f = baseBody(b, vehicle);
  const odo_end = optNum(b.odo_end, 'Qaytgandagi spidometr', { min: 0, max: 1e9 });
  const hours_end = optNum(b.hours_end, 'Smena oxiridagi motosoat', { min: 0, max: 1e7 });
  const fuel_end = optNum(b.fuel_end, 'Qaytgandagi qoldiq', { min: 0, max: 1e5 });
  const fuel2_end = vehicle.fuel_type2_id
    ? optNum(b.fuel2_end, 'Qaytgandagi zaryad', { min: 0, max: 1e5 }) : null;
  if (odo_end != null && odo_end < f.odo_start) throw bad('Qaytgandagi spidometr chiqishdagidan kam bo\'lishi mumkin emas');
  if (hours_end != null && hours_end < f.hours_start) throw bad('Motosoat hisoblagichi kamayishi mumkin emas');

  tx(() => {
    run(
      `UPDATE waybills SET number=?, date_from=?, date_to=?, vehicle_id=?, driver_id=?,
         odo_start=?, odo_end=?, hours_start=?, hours_end=?, fuel_start=?, fuel_end=?,
         fuel2_start=?, fuel2_end=?,
         engine_hours=?, cargo_ton_km=?, zone_id=?, shift=?, winter=?,
         norm_per_100km=?, norm_engine_hour=?, norm_per_ton_km=?,
         norm2_per_100km=?, norm2_engine_hour=?, winter_pct=?, task=?, notes=?
       WHERE id=?`,
      [number, f.date_from, f.date_to, vehicle.id, driver.id,
       f.odo_start, odo_end, f.hours_start, hours_end, f.fuel_start, fuel_end,
       f.fuel2_start, fuel2_end,
       f.engine_hours, f.cargo_ton_km, f.zone_id, f.shift, f.winter,
       f.norm_per_100km, f.norm_engine_hour, f.norm_per_ton_km,
       f.norm2_per_100km, f.norm2_engine_hour, f.winter_pct, f.task, f.notes, id]
    );
    if (b.routes !== undefined) saveRoutes(id, b.routes);
  });

  recalcVehicle(vehicle.id);
  if (vehicle.id !== cur.vehicle_id) recalcVehicle(cur.vehicle_id);
  audit(req.user.id, 'update', 'waybill', id, `№${number}`);
  res.json(loadFull(id));
}));

// ------------------------------- Yopish ---------------------------------
router.post('/:id/close', requireAuth(...EDIT), h((req, res) => {
  const id = Number(req.params.id);
  const w = get('SELECT * FROM waybills WHERE id = ?', [id]);
  if (!w) throw notFound('Yo\'l varaqasi topilmadi');
  if (w.status === 'closed') throw bad('Varaqa allaqachon yopilgan');

  const odo_end = num(req.body.odo_end, 'Qaytgandagi spidometr', { min: 0, max: 1e9, def: w.odo_start });
  const fuel_end = num(req.body.fuel_end, 'Qaytgandagi qoldiq', { min: 0, max: 1e5 });
  if (odo_end < w.odo_start) throw bad('Qaytgandagi spidometr chiqishdagidan kam bo\'lishi mumkin emas');

  const hours_end = optNum(req.body.hours_end, 'Smena oxiridagi motosoat', { min: 0, max: 1e7 });
  if (hours_end != null && hours_end < w.hours_start) throw bad('Motosoat hisoblagichi kamayishi mumkin emas');

  const veh = get('SELECT fuel_type2_id FROM vehicles WHERE id = ?', [w.vehicle_id]);
  const ft2 = veh?.fuel_type2_id ?? null;
  const split = issuedSplit(id, ft2);

  const available = r2(w.fuel_start + split.first);
  if (fuel_end > available + 0.001) {
    throw bad(`Qaytgandagi qoldiq ${available} l dan oshmasligi kerak (chiqishdagi ${w.fuel_start} + quyilgan ${split.first})`);
  }

  // Gibrid: ikkinchi manba qoldig'i ham yopilishda kiritiladi va tekshiriladi
  let fuel2_end = null;
  if (ft2) {
    fuel2_end = num(req.body.fuel2_end, 'Qaytgandagi zaryad', { min: 0, max: 1e5, def: 0 });
    const available2 = r2(w.fuel2_start + split.second);
    if (fuel2_end > available2 + 0.001) {
      throw bad(`Qaytgandagi zaryad ${available2} dan oshmasligi kerak (chiqishdagi ${w.fuel2_start} + quyilgan ${split.second})`);
    }
  }

  const engine_hours = num(req.body.engine_hours, 'Motosoat', { min: 0, max: 10000, def: w.engine_hours });
  const cargo_ton_km = num(req.body.cargo_ton_km, 't·km', { min: 0, max: 1e7, def: w.cargo_ton_km });

  run(
    `UPDATE waybills SET odo_end=?, hours_end=?, fuel_end=?, fuel2_end=?, engine_hours=?, cargo_ton_km=?,
       status='closed', closed_at=datetime('now'), closed_by=? WHERE id=?`,
    [odo_end, hours_end, fuel_end, fuel2_end, engine_hours, cargo_ton_km, req.user.id, id]
  );
  recalcVehicle(w.vehicle_id);
  audit(req.user.id, 'close', 'waybill', id, `№${w.number}`);
  res.json(loadFull(id));
}));

router.post('/:id/reopen', requireAuth(...EDIT), h((req, res) => {
  const id = Number(req.params.id);
  const w = get('SELECT * FROM waybills WHERE id = ?', [id]);
  if (!w) throw notFound('Yo\'l varaqasi topilmadi');
  if (w.status !== 'closed') throw bad('Varaqa yopilmagan');

  run(`UPDATE waybills SET status='issued', closed_at=NULL, closed_by=NULL WHERE id=?`, [id]);
  recalcVehicle(w.vehicle_id);
  audit(req.user.id, 'reopen', 'waybill', id, `№${w.number}`);
  res.json(loadFull(id));
}));

router.delete('/:id', requireAuth(...EDIT), h((req, res) => {
  const id = Number(req.params.id);
  const w = get('SELECT * FROM waybills WHERE id = ?', [id]);
  if (!w) throw notFound('Yo\'l varaqasi topilmadi');
  if (w.status === 'closed' && req.user.role !== 'admin') {
    throw bad('Yopilgan varaqani faqat administrator o\'chira oladi');
  }
  tx(() => {
    run('UPDATE fuel_issues SET waybill_id = NULL WHERE waybill_id = ?', [id]);
    run('DELETE FROM waybills WHERE id = ?', [id]);
  });
  recalcVehicle(w.vehicle_id);
  audit(req.user.id, 'delete', 'waybill', id, `№${w.number}`);
  res.json({ ok: true });
}));

// Joriy oy uchun standart oraliq (frontend filtri uchun qulaylik)
router.get('/meta/period', requireAuth(), h((_req, res) => res.json(monthRange())));
