// Brauzer ichidagi "server": server/routes/* dagi marshrutlarning ko'chirmasi.
// SQL so'rovlar server versiyasidan o'zgarishsiz olingan — hisob-kitob bir xil bo'lishi uchun.
import { all, get, run, tx, audit, openDatabase, resetDatabase, exportDatabase, importDatabase } from './db';
import { seedDemo, seedReference } from './seed';
import { isWinterDate, monthRange, r2, recalcVehicle, today } from './calc';

export class LocalError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const bad = (m: string) => new LocalError(400, m);
const notFound = (m = 'Topilmadi') => new LocalError(404, m);

// Demo rejimida autentifikatsiya o'chirilgan — barcha amallar administrator nomidan
const DEMO_USER = { id: 1, username: 'admin', full_name: 'Administrator', role: 'admin' as const, active: 1 };

let initialized = false;
export async function ensureReady() {
  if (initialized) return;
  await openDatabase(() => { seedReference(); seedDemo(); });
  initialized = true;
}

export async function resetToDemo() {
  await resetDatabase(() => { seedReference(); seedDemo(); });
}

export { exportDatabase, importDatabase };

// ----------------------------- Yordamchilar -----------------------------
const num = (v: any, def = 0) => {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw bad('Noto\'g\'ri son');
  return n;
};
const optNum = (v: any): number | null => (v === undefined || v === null || v === '' ? null : num(v));
const str = (v: any) => (v === undefined || v === null ? '' : String(v).trim());
const bool = (v: any) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

const VEHICLE_SELECT = `
  SELECT v.*, ft.code AS fuel_code, ft.name_uz AS fuel_name_uz, ft.name_ru AS fuel_name_ru,
         ft.unit_uz, ft.unit_ru, ft.price AS fuel_price,
         ec.code AS category_code, ec.group_code,
         ec.name_uz AS category_name_uz, ec.name_ru AS category_name_ru,
         z.code AS zone_code, z.name_uz AS zone_name_uz, z.name_ru AS zone_name_ru
    FROM vehicles v
    JOIN fuel_types ft ON ft.id = v.fuel_type_id
    LEFT JOIN equipment_categories ec ON ec.id = v.category_id
    LEFT JOIN zones z ON z.id = v.zone_id`;

const FUEL_SELECT = `
  SELECT fi.*, v.garage_no, v.plate, v.model, d.full_name AS driver_name, w.number AS waybill_number,
         ft.code AS fuel_code, ft.name_uz AS fuel_name_uz, ft.name_ru AS fuel_name_ru, ft.unit_uz, ft.unit_ru
    FROM fuel_issues fi
    JOIN vehicles v ON v.id = fi.vehicle_id
    JOIN fuel_types ft ON ft.id = fi.fuel_type_id
    LEFT JOIN drivers d ON d.id = fi.driver_id
    LEFT JOIN waybills w ON w.id = fi.waybill_id`;

const CALC = 'SELECT * FROM v_waybill_calc';

function loadWaybill(id: number) {
  const w = get<any>(`${CALC} WHERE id = ?`, [id]);
  if (!w) throw notFound('Yo\'l varaqasi topilmadi');
  w.routes = all('SELECT * FROM waybill_routes WHERE waybill_id = ? ORDER BY seq, id', [id]);
  w.fuel = all(`SELECT fi.*, ft.code AS fuel_code FROM fuel_issues fi
                  JOIN fuel_types ft ON ft.id = fi.fuel_type_id
                 WHERE fi.waybill_id = ? ORDER BY fi.date, fi.id`, [id]);
  w.deviation = w.fact_liters == null ? null : r2(w.fact_liters - w.norm_liters);
  return w;
}

function nextNumber() {
  const row = get<{ m: number }>(
    `SELECT MAX(CAST(number AS INTEGER)) AS m FROM waybills
      WHERE number GLOB '[0-9]*' AND CAST(number AS INTEGER) > 0`);
  return String((Number(row?.m) || 0) + 1);
}

function saveRoutes(waybillId: number, routes: any) {
  run('DELETE FROM waybill_routes WHERE waybill_id = ?', [waybillId]);
  if (!Array.isArray(routes)) return;
  routes.forEach((r: any, i: number) => {
    if (!r) return;
    run(`INSERT INTO waybill_routes (waybill_id, seq, point_from, point_to, time_out, time_in,
           distance_km, cargo, cargo_ton, flight_no, aircraft_type, aircraft_reg, stand,
           service_type_id, zone_id, uld_count, pax_count, op_hours)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [waybillId, i + 1, str(r.point_from), str(r.point_to), str(r.time_out), str(r.time_in),
       num(r.distance_km), str(r.cargo), num(r.cargo_ton),
       str(r.flight_no), str(r.aircraft_type), str(r.aircraft_reg), str(r.stand),
       r.service_type_id ? num(r.service_type_id) : null, r.zone_id ? num(r.zone_id) : null,
       num(r.uld_count), num(r.pax_count), num(r.op_hours)]);
  });
}

// =========================== Asosiy dispetcher ===========================
export async function localRequest(method: string, url: string, body?: any): Promise<any> {
  await ensureReady();

  const [rawPath, rawQuery = ''] = url.split('?');
  const path = rawPath.replace(/\/+$/, '') || '/';
  const q = new URLSearchParams(rawQuery);
  const seg = path.split('/').filter(Boolean);
  const b = body ?? {};

  // ------------------------------- Auth --------------------------------
  if (path === '/auth/login' && method === 'POST') return { token: 'demo', user: DEMO_USER };
  if (path === '/auth/logout') return { ok: true };
  if (path === '/auth/me') return { user: DEMO_USER };
  if (path === '/auth/password') return { ok: true };

  // ----------------------------- Tashkilot -----------------------------
  if (path === '/org' && method === 'GET') return get('SELECT * FROM org WHERE id = 1');
  if (path === '/org' && method === 'PUT') {
    run(`UPDATE org SET name=?, inn=?, address=?, phone=?, director=?, mechanic=?, winter_months=? WHERE id = 1`,
      [str(b.name), str(b.inn), str(b.address), str(b.phone), str(b.director), str(b.mechanic),
       str(b.winter_months) || '11,12,1,2,3']);
    return get('SELECT * FROM org WHERE id = 1');
  }

  // ---------------------- Texnika turkumlari (GSE) ----------------------
  if (seg[0] === 'equipment-categories') {
    if (method === 'GET') {
      const where: string[] = [];
      const params: any[] = [];
      if (q.get('active') === '1') where.push('ec.active = 1');
      if (q.get('group')) { where.push('ec.group_code = ?'); params.push(q.get('group')!); }
      return all(
        `SELECT ec.*, (SELECT COUNT(*) FROM vehicles v WHERE v.category_id = ec.id) AS vehicle_count
           FROM equipment_categories ec ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY ec.group_code, ec.name_uz`, params);
    }
    const catBody = () => [
      str(b.code).toUpperCase(), str(b.name_uz), str(b.name_ru),
      str(b.group_code) || 'road', str(b.norm_basis) || 'km',
      num(b.default_norm_km), num(b.default_norm_hour), bool(b.active ?? 1),
    ];
    if (method === 'POST') {
      const v = catBody();
      if (get('SELECT id FROM equipment_categories WHERE code = ?', [v[0] as string])) throw bad('Bu kod band');
      const res = run(
        `INSERT INTO equipment_categories (code, name_uz, name_ru, group_code, norm_basis,
           default_norm_km, default_norm_hour, active) VALUES (?,?,?,?,?,?,?,?)`, v);
      return get('SELECT * FROM equipment_categories WHERE id = ?', [res.lastInsertRowid]);
    }
    if (method === 'PUT' && seg.length === 2) {
      const id = Number(seg[1]);
      if (!get('SELECT id FROM equipment_categories WHERE id = ?', [id])) throw notFound();
      run(`UPDATE equipment_categories SET code=?, name_uz=?, name_ru=?, group_code=?, norm_basis=?,
             default_norm_km=?, default_norm_hour=?, active=? WHERE id=?`, [...catBody(), id]);
      return get('SELECT * FROM equipment_categories WHERE id = ?', [id]);
    }
    if (method === 'DELETE' && seg.length === 2) {
      const id = Number(seg[1]);
      if (get('SELECT id FROM vehicles WHERE category_id = ? LIMIT 1', [id])) {
        run('UPDATE equipment_categories SET active = 0 WHERE id = ?', [id]);
        return { ok: true, archived: true };
      }
      run('DELETE FROM equipment_categories WHERE id = ?', [id]);
      return { ok: true, archived: false };
    }
  }

  // ---------------------------- Zonalar ----------------------------
  if (seg[0] === 'zones') {
    if (method === 'GET') {
      return all(`SELECT * FROM zones ${q.get('active') === '1' ? 'WHERE active = 1' : ''} ORDER BY active DESC, id`);
    }
    if (method === 'POST') {
      const code = str(b.code).toUpperCase();
      if (get('SELECT id FROM zones WHERE code = ?', [code])) throw bad('Bu kod band');
      const res = run('INSERT INTO zones (code, name_uz, name_ru) VALUES (?,?,?)',
                      [code, str(b.name_uz), str(b.name_ru)]);
      return get('SELECT * FROM zones WHERE id = ?', [res.lastInsertRowid]);
    }
    if (method === 'PUT' && seg.length === 2) {
      const id = Number(seg[1]);
      run('UPDATE zones SET name_uz=?, name_ru=?, active=? WHERE id=?',
          [str(b.name_uz), str(b.name_ru), bool(b.active ?? 1), id]);
      return get('SELECT * FROM zones WHERE id = ?', [id]);
    }
  }

  // ------------------------- Xizmat turlari -------------------------
  if (seg[0] === 'service-types') {
    if (method === 'GET') {
      return all(`SELECT * FROM service_types ${q.get('active') === '1' ? 'WHERE active = 1' : ''} ORDER BY active DESC, id`);
    }
    if (method === 'POST') {
      const code = str(b.code).toUpperCase();
      if (get('SELECT id FROM service_types WHERE code = ?', [code])) throw bad('Bu kod band');
      const res = run('INSERT INTO service_types (code, name_uz, name_ru, unit) VALUES (?,?,?,?)',
                      [code, str(b.name_uz), str(b.name_ru), str(b.unit) || 'flight']);
      return get('SELECT * FROM service_types WHERE id = ?', [res.lastInsertRowid]);
    }
    if (method === 'PUT' && seg.length === 2) {
      const id = Number(seg[1]);
      run('UPDATE service_types SET name_uz=?, name_ru=?, unit=?, active=? WHERE id=?',
          [str(b.name_uz), str(b.name_ru), str(b.unit) || 'flight', bool(b.active ?? 1), id]);
      return get('SELECT * FROM service_types WHERE id = ?', [id]);
    }
  }

  // -------------------------- Yoqilg'i turlari --------------------------
  if (path === '/fuel-types' && method === 'GET') {
    return all('SELECT * FROM fuel_types ORDER BY active DESC, id');
  }
  if (seg[0] === 'fuel-types' && seg.length === 2 && method === 'PUT') {
    const id = Number(seg[1]);
    if (!get('SELECT id FROM fuel_types WHERE id = ?', [id])) throw notFound();
    run('UPDATE fuel_types SET price = ?, active = ? WHERE id = ?', [num(b.price), bool(b.active ?? 1), id]);
    return get('SELECT * FROM fuel_types WHERE id = ?', [id]);
  }

  // ---------------------------- Avtomobillar ----------------------------
  if (seg[0] === 'vehicles') {
    if (method === 'GET' && seg.length === 1) {
      const where: string[] = [];
      const params: any[] = [];
      if (q.get('active') === '1') where.push('v.active = 1');
      if (q.get('category_id')) { where.push('v.category_id = ?'); params.push(Number(q.get('category_id'))); }
      if (q.get('group')) { where.push('ec.group_code = ?'); params.push(q.get('group')!); }
      if (q.get('zone_id')) { where.push('v.zone_id = ?'); params.push(Number(q.get('zone_id'))); }
      if (q.get('basis')) { where.push('v.norm_basis = ?'); params.push(q.get('basis')!); }
      const search = str(q.get('q'));
      if (search) {
        where.push('(v.garage_no LIKE ? OR v.plate LIKE ? OR v.model LIKE ? OR v.serial_no LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      return all(`${VEHICLE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                  ORDER BY v.active DESC, ec.group_code, v.garage_no`, params);
    }
    if (method === 'GET' && seg.length === 2) {
      const row = get(`${VEHICLE_SELECT} WHERE v.id = ?`, [Number(seg[1])]);
      if (!row) throw notFound();
      return row;
    }

    const vehicleBody = () => {
      const garage_no = str(b.garage_no);
      if (!garage_no) throw bad('Garaj/inventar raqami to\'ldirilishi shart');
      if (!str(b.model)) throw bad('Rusum to\'ldirilishi shart');
      return [garage_no, str(b.plate) || '—', str(b.model),
              b.category_id ? num(b.category_id) : null, b.zone_id ? num(b.zone_id) : null,
              str(b.norm_basis) || 'km', str(b.power_type) || 'diesel',
              str(b.serial_no), b.made_year ? num(b.made_year) : null,
              num(b.fuel_type_id), num(b.tank_capacity),
              num(b.norm_per_100km), num(b.winter_pct), num(b.norm_engine_hour), num(b.norm_per_ton_km),
              num(b.init_odometer), num(b.init_hours), num(b.init_fuel), bool(b.active ?? 1), str(b.notes)];
    };

    if (method === 'POST') {
      const v = vehicleBody();
      if (get('SELECT id FROM vehicles WHERE garage_no = ?', [v[0] as string])) throw bad('Bu garaj raqami band');
      const res = run(`INSERT INTO vehicles (garage_no, plate, model, category_id, zone_id, norm_basis,
          power_type, serial_no, made_year, fuel_type_id, tank_capacity, norm_per_100km, winter_pct,
          norm_engine_hour, norm_per_ton_km, init_odometer, init_hours, init_fuel, active, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, v);
      recalcVehicle(res.lastInsertRowid);
      audit(1, 'create', 'vehicle', res.lastInsertRowid);
      return get(`${VEHICLE_SELECT} WHERE v.id = ?`, [res.lastInsertRowid]);
    }
    if (method === 'PUT' && seg.length === 2) {
      const id = Number(seg[1]);
      if (!get('SELECT id FROM vehicles WHERE id = ?', [id])) throw notFound();
      const v = vehicleBody();
      if (get('SELECT id FROM vehicles WHERE garage_no = ? AND id <> ?', [v[0] as string, id])) throw bad('Bu garaj raqami band');
      run(`UPDATE vehicles SET garage_no=?, plate=?, model=?, category_id=?, zone_id=?, norm_basis=?,
             power_type=?, serial_no=?, made_year=?, fuel_type_id=?, tank_capacity=?, norm_per_100km=?,
             winter_pct=?, norm_engine_hour=?, norm_per_ton_km=?, init_odometer=?, init_hours=?,
             init_fuel=?, active=?, notes=? WHERE id=?`, [...v, id]);
      recalcVehicle(id);
      return get(`${VEHICLE_SELECT} WHERE v.id = ?`, [id]);
    }
    if (method === 'DELETE' && seg.length === 2) {
      const id = Number(seg[1]);
      const used = get('SELECT id FROM waybills WHERE vehicle_id = ? LIMIT 1', [id])
                || get('SELECT id FROM fuel_issues WHERE vehicle_id = ? LIMIT 1', [id]);
      if (used) { run('UPDATE vehicles SET active = 0 WHERE id = ?', [id]); return { ok: true, archived: true }; }
      run('DELETE FROM vehicles WHERE id = ?', [id]);
      return { ok: true, archived: false };
    }
  }

  // ---------------------------- Haydovchilar ----------------------------
  if (seg[0] === 'drivers') {
    if (method === 'GET') {
      const where: string[] = [];
      const params: any[] = [];
      if (q.get('active') === '1') where.push('active = 1');
      const search = str(q.get('q'));
      if (search) { where.push('(full_name LIKE ? OR tab_no LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
      return all(`SELECT * FROM drivers ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                  ORDER BY active DESC, full_name`, params);
    }
    const driverBody = () => {
      if (!str(b.full_name)) throw bad('F.I.Sh. to\'ldirilishi shart');
      return [str(b.full_name), str(b.tab_no), str(b.license_no), str(b.phone), str(b.class),
              str(b.position) || 'driver', str(b.apron_permit), str(b.permit_until) || null,
              bool(b.active ?? 1)];
    };
    if (method === 'POST') {
      const res = run(`INSERT INTO drivers (full_name, tab_no, license_no, phone, class, position,
                         apron_permit, permit_until, active) VALUES (?,?,?,?,?,?,?,?,?)`, driverBody());
      return get('SELECT * FROM drivers WHERE id = ?', [res.lastInsertRowid]);
    }
    if (method === 'PUT' && seg.length === 2) {
      const id = Number(seg[1]);
      if (!get('SELECT id FROM drivers WHERE id = ?', [id])) throw notFound();
      run(`UPDATE drivers SET full_name=?, tab_no=?, license_no=?, phone=?, class=?, position=?,
             apron_permit=?, permit_until=?, active=? WHERE id=?`, [...driverBody(), id]);
      return get('SELECT * FROM drivers WHERE id = ?', [id]);
    }
    if (method === 'DELETE' && seg.length === 2) {
      const id = Number(seg[1]);
      if (get('SELECT id FROM waybills WHERE driver_id = ? LIMIT 1', [id])) {
        run('UPDATE drivers SET active = 0 WHERE id = ?', [id]);
        return { ok: true, archived: true };
      }
      run('DELETE FROM drivers WHERE id = ?', [id]);
      return { ok: true, archived: false };
    }
  }

  // -------------------------- Foydalanuvchilar --------------------------
  if (seg[0] === 'users') {
    if (method === 'GET') return all('SELECT id, username, full_name, role, active, created_at FROM users ORDER BY active DESC, username');
    if (method === 'POST') {
      const username = str(b.username).toLowerCase();
      if (!username) throw bad('Login to\'ldirilishi shart');
      if (get('SELECT id FROM users WHERE lower(username) = ?', [username])) throw bad('Bu login band');
      const res = run('INSERT INTO users (username, full_name, password_hash, role, active) VALUES (?,?,?,?,?)',
        [username, str(b.full_name), 'demo', str(b.role) || 'operator', bool(b.active ?? 1)]);
      return get('SELECT id, username, full_name, role, active FROM users WHERE id = ?', [res.lastInsertRowid]);
    }
    if (method === 'PUT' && seg.length === 2) {
      const id = Number(seg[1]);
      if (!get('SELECT id FROM users WHERE id = ?', [id])) throw notFound();
      run('UPDATE users SET full_name=?, role=?, active=? WHERE id=?',
          [str(b.full_name), str(b.role) || 'operator', bool(b.active ?? 1), id]);
      return get('SELECT id, username, full_name, role, active FROM users WHERE id = ?', [id]);
    }
  }

  // --------------------------- Yo'l varaqalari ---------------------------
  if (seg[0] === 'waybills') {
    if (path === '/waybills/next-number') return { number: nextNumber() };
    if (path === '/waybills/meta/period') return monthRange();

    if (path === '/waybills/defaults') {
      const v = get<any>('SELECT * FROM vehicles WHERE id = ?', [Number(q.get('vehicle_id'))]);
      if (!v) throw notFound('Avtomobil topilmadi');
      const org = get<{ winter_months: string }>('SELECT winter_months FROM org WHERE id = 1');
      const d = str(q.get('date')) || today();
      return {
        number: nextNumber(), odo_start: v.odometer, hours_start: v.hour_meter,
        fuel_start: v.fuel_balance,
        norm_per_100km: v.norm_per_100km, norm_engine_hour: v.norm_engine_hour,
        norm_per_ton_km: v.norm_per_ton_km, winter_pct: v.winter_pct,
        winter: isWinterDate(d, org?.winter_months),
        norm_basis: v.norm_basis, zone_id: v.zone_id, tank_capacity: v.tank_capacity,
      };
    }

    if (method === 'GET' && seg.length === 1) {
      const where: string[] = [];
      const params: any[] = [];
      if (q.get('from')) { where.push('date_from >= ?'); params.push(q.get('from')!); }
      if (q.get('to')) { where.push('date_from <= ?'); params.push(q.get('to')!); }
      if (q.get('vehicle_id')) { where.push('vehicle_id = ?'); params.push(Number(q.get('vehicle_id'))); }
      if (q.get('driver_id')) { where.push('driver_id = ?'); params.push(Number(q.get('driver_id'))); }
      if (q.get('status')) { where.push('status = ?'); params.push(q.get('status')!); }
      const search = str(q.get('q'));
      if (search) {
        where.push('(number LIKE ? OR garage_no LIKE ? OR plate LIKE ? OR driver_name LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const limit = Math.min(Number(q.get('limit')) || 200, 1000);
      const offset = Math.max(Number(q.get('offset')) || 0, 0);
      const rows = all<any>(
        `${CALC} ${clause} ORDER BY date_from DESC, CAST(number AS INTEGER) DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ).map((w) => ({ ...w, deviation: w.fact_liters == null ? null : r2(w.fact_liters - w.norm_liters) }));
      const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM v_waybill_calc ${clause}`, params)!.c;
      return { rows, total, limit, offset };
    }

    if (method === 'GET' && seg.length === 2) return loadWaybill(Number(seg[1]));

    const baseFields = (vehicle: any) => {
      const date_from = str(b.date_from);
      if (!date_from) throw bad('Sana ko\'rsatilishi shart');
      const date_to = str(b.date_to) || date_from;
      if (date_to < date_from) throw bad('«Gacha» sanasi «dan» sanasidan oldin bo\'lishi mumkin emas');
      return {
        date_from, date_to,
        odo_start: num(b.odo_start), hours_start: num(b.hours_start), fuel_start: num(b.fuel_start),
        engine_hours: num(b.engine_hours), cargo_ton_km: num(b.cargo_ton_km),
        zone_id: b.zone_id ? num(b.zone_id) : (vehicle.zone_id ?? null),
        shift: str(b.shift) || 'day',
        winter: bool(b.winter),
        norm_per_100km: num(b.norm_per_100km, vehicle.norm_per_100km),
        norm_engine_hour: num(b.norm_engine_hour, vehicle.norm_engine_hour),
        norm_per_ton_km: num(b.norm_per_ton_km, vehicle.norm_per_ton_km),
        winter_pct: num(b.winter_pct, vehicle.winter_pct),
        task: str(b.task), notes: str(b.notes),
      };
    };

    if (method === 'POST' && seg.length === 1) {
      const vehicle = get<any>('SELECT * FROM vehicles WHERE id = ?', [Number(b.vehicle_id)]);
      if (!vehicle) throw bad('Avtomobil tanlanmagan');
      const driver = get<any>('SELECT * FROM drivers WHERE id = ?', [Number(b.driver_id)]);
      if (!driver) throw bad('Haydovchi tanlanmagan');
      const number = str(b.number) || nextNumber();
      if (get('SELECT id FROM waybills WHERE number = ?', [number])) throw bad(`№ ${number} varaqa allaqachon mavjud`);
      const f = baseFields(vehicle);
      const status = ['draft', 'issued'].includes(b.status) ? b.status : 'issued';

      const id = tx(() => {
        const res = run(
          `INSERT INTO waybills (number, date_from, date_to, vehicle_id, driver_id, status,
             odo_start, hours_start, fuel_start, engine_hours, cargo_ton_km, zone_id, shift, winter,
             norm_per_100km, norm_engine_hour, norm_per_ton_km, winter_pct, task, notes, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
          [number, f.date_from, f.date_to, vehicle.id, driver.id, status,
           f.odo_start, f.hours_start, f.fuel_start, f.engine_hours, f.cargo_ton_km, f.zone_id, f.shift, f.winter,
           f.norm_per_100km, f.norm_engine_hour, f.norm_per_ton_km, f.winter_pct, f.task, f.notes]);
        saveRoutes(res.lastInsertRowid, b.routes);
        return res.lastInsertRowid;
      });
      audit(1, 'create', 'waybill', id, `№${number}`);
      return loadWaybill(id);
    }

    if (method === 'PUT' && seg.length === 2) {
      const id = Number(seg[1]);
      const cur = get<any>('SELECT * FROM waybills WHERE id = ?', [id]);
      if (!cur) throw notFound('Yo\'l varaqasi topilmadi');
      const vehicle = get<any>('SELECT * FROM vehicles WHERE id = ?', [Number(b.vehicle_id ?? cur.vehicle_id)]);
      if (!vehicle) throw bad('Avtomobil topilmadi');
      const driver = get<any>('SELECT * FROM drivers WHERE id = ?', [Number(b.driver_id ?? cur.driver_id)]);
      if (!driver) throw bad('Haydovchi topilmadi');
      const number = str(b.number) || cur.number;
      if (get('SELECT id FROM waybills WHERE number = ? AND id <> ?', [number, id])) throw bad(`№ ${number} varaqa allaqachon mavjud`);

      const f = baseFields(vehicle);
      const odo_end = optNum(b.odo_end);
      const hours_end = optNum(b.hours_end);
      const fuel_end = optNum(b.fuel_end);
      if (odo_end != null && odo_end < f.odo_start) throw bad('Qaytgandagi spidometr chiqishdagidan kam bo\'lishi mumkin emas');
      if (hours_end != null && hours_end < f.hours_start) throw bad('Motosoat hisoblagichi kamayishi mumkin emas');

      tx(() => {
        run(`UPDATE waybills SET number=?, date_from=?, date_to=?, vehicle_id=?, driver_id=?,
               odo_start=?, odo_end=?, hours_start=?, hours_end=?, fuel_start=?, fuel_end=?,
               engine_hours=?, cargo_ton_km=?, zone_id=?, shift=?, winter=?,
               norm_per_100km=?, norm_engine_hour=?, norm_per_ton_km=?, winter_pct=?, task=?, notes=?
             WHERE id=?`,
          [number, f.date_from, f.date_to, vehicle.id, driver.id,
           f.odo_start, odo_end, f.hours_start, hours_end, f.fuel_start, fuel_end,
           f.engine_hours, f.cargo_ton_km, f.zone_id, f.shift, f.winter,
           f.norm_per_100km, f.norm_engine_hour, f.norm_per_ton_km, f.winter_pct, f.task, f.notes, id]);
        if (b.routes !== undefined) saveRoutes(id, b.routes);
      });
      recalcVehicle(vehicle.id);
      if (vehicle.id !== cur.vehicle_id) recalcVehicle(cur.vehicle_id);
      return loadWaybill(id);
    }

    if (method === 'POST' && seg.length === 3 && seg[2] === 'close') {
      const id = Number(seg[1]);
      const w = get<any>('SELECT * FROM waybills WHERE id = ?', [id]);
      if (!w) throw notFound('Yo\'l varaqasi topilmadi');
      if (w.status === 'closed') throw bad('Varaqa allaqachon yopilgan');

      const odo_end = num(b.odo_end, w.odo_start);
      const fuel_end = num(b.fuel_end);
      if (odo_end < w.odo_start) throw bad('Qaytgandagi spidometr chiqishdagidan kam bo\'lishi mumkin emas');

      const hours_end = optNum(b.hours_end);
      if (hours_end != null && hours_end < w.hours_start) throw bad('Motosoat hisoblagichi kamayishi mumkin emas');

      const issued = get<{ s: number }>('SELECT COALESCE(SUM(liters),0) AS s FROM fuel_issues WHERE waybill_id = ?', [id])!.s;
      const available = r2(w.fuel_start + issued);
      if (fuel_end > available + 0.001) {
        throw bad(`Qaytgandagi qoldiq ${available} l dan oshmasligi kerak (chiqishdagi ${w.fuel_start} + quyilgan ${r2(issued)})`);
      }

      run(`UPDATE waybills SET odo_end=?, hours_end=?, fuel_end=?, engine_hours=?, cargo_ton_km=?,
             status='closed', closed_at=datetime('now'), closed_by=1 WHERE id=?`,
        [odo_end, hours_end, fuel_end, num(b.engine_hours, w.engine_hours), num(b.cargo_ton_km, w.cargo_ton_km), id]);
      recalcVehicle(w.vehicle_id);
      audit(1, 'close', 'waybill', id, `№${w.number}`);
      return loadWaybill(id);
    }

    if (method === 'POST' && seg.length === 3 && seg[2] === 'reopen') {
      const id = Number(seg[1]);
      const w = get<any>('SELECT * FROM waybills WHERE id = ?', [id]);
      if (!w) throw notFound('Yo\'l varaqasi topilmadi');
      if (w.status !== 'closed') throw bad('Varaqa yopilmagan');
      run(`UPDATE waybills SET status='issued', closed_at=NULL, closed_by=NULL WHERE id=?`, [id]);
      recalcVehicle(w.vehicle_id);
      return loadWaybill(id);
    }

    if (method === 'DELETE' && seg.length === 2) {
      const id = Number(seg[1]);
      const w = get<any>('SELECT * FROM waybills WHERE id = ?', [id]);
      if (!w) throw notFound('Yo\'l varaqasi topilmadi');
      tx(() => {
        run('UPDATE fuel_issues SET waybill_id = NULL WHERE waybill_id = ?', [id]);
        run('DELETE FROM waybills WHERE id = ?', [id]);
      });
      recalcVehicle(w.vehicle_id);
      return { ok: true };
    }
  }

  // ------------------------------- Yoqilg'i -------------------------------
  if (seg[0] === 'fuel') {
    if (path === '/fuel/meta/open-waybills') {
      const vid = Number(q.get('vehicle_id'));
      if (!vid) return [];
      return all(`SELECT id, number, date_from, date_to, driver_id FROM waybills
                   WHERE vehicle_id = ? AND status <> 'closed' ORDER BY date_from DESC LIMIT 50`, [vid]);
    }

    if (method === 'GET' && seg.length === 1) {
      const where: string[] = [];
      const params: any[] = [];
      if (q.get('from')) { where.push('fi.date >= ?'); params.push(q.get('from')!); }
      if (q.get('to')) { where.push('fi.date <= ?'); params.push(q.get('to')!); }
      if (q.get('vehicle_id')) { where.push('fi.vehicle_id = ?'); params.push(Number(q.get('vehicle_id'))); }
      if (q.get('fuel_type_id')) { where.push('fi.fuel_type_id = ?'); params.push(Number(q.get('fuel_type_id'))); }
      if (q.get('source')) { where.push('fi.source = ?'); params.push(q.get('source')!); }
      const search = str(q.get('q'));
      if (search) {
        where.push('(v.garage_no LIKE ? OR v.plate LIKE ? OR fi.station LIKE ? OR fi.doc_no LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const limit = Math.min(Number(q.get('limit')) || 300, 2000);
      const offset = Math.max(Number(q.get('offset')) || 0, 0);
      const rows = all(`${FUEL_SELECT} ${clause} ORDER BY fi.date DESC, fi.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
      const totals = get(`SELECT COUNT(*) AS count, COALESCE(SUM(fi.liters),0) AS liters, COALESCE(SUM(fi.amount),0) AS amount
                            FROM fuel_issues fi JOIN vehicles v ON v.id = fi.vehicle_id ${clause}`, params);
      return { rows, totals, limit, offset };
    }

    if (method === 'GET' && seg.length === 2) {
      const row = get(`${FUEL_SELECT} WHERE fi.id = ?`, [Number(seg[1])]);
      if (!row) throw notFound();
      return row;
    }

    const fuelBody = () => {
      const vehicle = get<any>('SELECT * FROM vehicles WHERE id = ?', [Number(b.vehicle_id)]);
      if (!vehicle) throw bad('Avtomobil tanlanmagan');
      const fuel_type_id = Number(b.fuel_type_id) || vehicle.fuel_type_id;
      if (!get('SELECT id FROM fuel_types WHERE id = ?', [fuel_type_id])) throw bad('Yoqilg\'i turi topilmadi');

      let driver_id: number | null = b.driver_id ? Number(b.driver_id) : null;
      if (driver_id && !get('SELECT id FROM drivers WHERE id = ?', [driver_id])) driver_id = null;

      let waybill_id: number | null = b.waybill_id ? Number(b.waybill_id) : null;
      if (waybill_id) {
        const w = get<any>('SELECT * FROM waybills WHERE id = ?', [waybill_id]);
        if (!w) throw bad('Yo\'l varaqasi topilmadi');
        if (w.vehicle_id !== vehicle.id) throw bad('Yo\'l varaqasi boshqa avtomobilga tegishli');
        if (w.status === 'closed') throw bad('Yopilgan varaqaga yoqilg\'i qo\'shib bo\'lmaydi');
        if (!driver_id) driver_id = w.driver_id;
      }

      const liters = num(b.liters);
      if (liters <= 0) throw bad('Miqdori noldan katta bo\'lishi kerak');
      const price = num(b.price);
      const source = str(b.source) || 'azs';
      if (!['azs', 'ombor', 'talon', 'karta'].includes(source)) throw bad('Noto\'g\'ri manba turi');
      const date = str(b.date);
      if (!date) throw bad('Sana ko\'rsatilishi shart');

      return [date, vehicle.id, driver_id, waybill_id, fuel_type_id, r2(liters), r2(price), r2(liters * price),
              source, str(b.station), str(b.doc_no), str(b.notes)];
    };

    if (method === 'POST' && seg.length === 1) {
      const f = fuelBody();
      const res = run(`INSERT INTO fuel_issues (date, vehicle_id, driver_id, waybill_id, fuel_type_id,
          liters, price, amount, source, station, doc_no, notes, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`, f);
      recalcVehicle(f[1] as number);
      return get(`${FUEL_SELECT} WHERE fi.id = ?`, [res.lastInsertRowid]);
    }

    if (method === 'PUT' && seg.length === 2) {
      const id = Number(seg[1]);
      const cur = get<any>('SELECT * FROM fuel_issues WHERE id = ?', [id]);
      if (!cur) throw notFound();
      const f = fuelBody();
      run(`UPDATE fuel_issues SET date=?, vehicle_id=?, driver_id=?, waybill_id=?, fuel_type_id=?,
             liters=?, price=?, amount=?, source=?, station=?, doc_no=?, notes=? WHERE id=?`, [...f, id]);
      recalcVehicle(f[1] as number);
      if (cur.vehicle_id !== f[1]) recalcVehicle(cur.vehicle_id);
      return get(`${FUEL_SELECT} WHERE fi.id = ?`, [id]);
    }

    if (method === 'DELETE' && seg.length === 2) {
      const id = Number(seg[1]);
      const cur = get<any>('SELECT * FROM fuel_issues WHERE id = ?', [id]);
      if (!cur) throw notFound();
      run('DELETE FROM fuel_issues WHERE id = ?', [id]);
      recalcVehicle(cur.vehicle_id);
      return { ok: true };
    }
  }

  // ------------------------------ Hisobotlar ------------------------------
  if (seg[0] === 'reports') return reports(seg[1], q);

  throw notFound(`Marshrut topilmadi: ${method} ${path}`);
}

// ========================== Hisobot so'rovlari ==========================
const WB_AGG = (groupBy: string) => `
  SELECT vehicle_id, driver_id, category_id, zone_code,
         COUNT(*) AS waybills,
         COALESCE(SUM(distance_km),0)    AS distance_km,
         COALESCE(SUM(worked_hours),0)   AS engine_hours,
         COALESCE(SUM(cargo_ton_km),0)   AS cargo_ton_km,
         COALESCE(SUM(flights_served),0) AS flights,
         COALESCE(SUM(cargo_ton),0)      AS cargo_ton,
         COALESCE(SUM(uld_count),0)      AS uld_count,
         COALESCE(SUM(pax_count),0)      AS pax_count,
         COALESCE(SUM(norm_liters),0)    AS norm_liters,
         COALESCE(SUM(fact_liters),0)    AS fact_liters
    FROM v_waybill_calc
   WHERE status = 'closed' AND date_from BETWEEN ? AND ?
   GROUP BY ${groupBy}`;

const FUEL_AGG = `
  SELECT vehicle_id, COALESCE(SUM(liters),0) AS issued_liters, COALESCE(SUM(amount),0) AS issued_amount
    FROM fuel_issues WHERE date BETWEEN ? AND ? GROUP BY vehicle_id`;

function sumRows(rows: any[]) {
  const keys = ['waybills', 'distance_km', 'engine_hours', 'norm_liters', 'fact_liters',
                'deviation', 'issued_liters', 'issued_amount', 'records',
                'flights', 'cargo_ton', 'uld_count', 'pax_count', 'units'];
  const out: Record<string, number> = {};
  for (const k of keys) {
    if (rows.some((r) => r[k] !== undefined)) {
      out[k] = r2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
    }
  }
  return out;
}

function reports(kind: string, q: URLSearchParams) {
  const def = monthRange();
  const from = q.get('from') || def.from;
  const to = q.get('to') || def.to;

  if (kind === 'vehicles') {
    const rows = all(
      `SELECT v.id, v.garage_no, v.plate, v.model, v.fuel_balance, v.odometer, v.hour_meter,
              v.norm_basis, v.power_type,
              ec.code AS category_code, ec.group_code,
              ec.name_uz AS category_name_uz, ec.name_ru AS category_name_ru,
              z.name_uz AS zone_name_uz, z.name_ru AS zone_name_ru,
              ft.code AS fuel_code, ft.name_uz AS fuel_name_uz, ft.name_ru AS fuel_name_ru,
              COALESCE(w.waybills,0) AS waybills, COALESCE(w.distance_km,0) AS distance_km,
              COALESCE(w.engine_hours,0) AS engine_hours,
              COALESCE(w.flights,0) AS flights, COALESCE(w.cargo_ton,0) AS cargo_ton,
              COALESCE(w.uld_count,0) AS uld_count,
              COALESCE(w.norm_liters,0) AS norm_liters, COALESCE(w.fact_liters,0) AS fact_liters,
              ROUND(COALESCE(w.fact_liters,0) - COALESCE(w.norm_liters,0), 2) AS deviation,
              COALESCE(f.issued_liters,0) AS issued_liters, COALESCE(f.issued_amount,0) AS issued_amount,
              CASE WHEN COALESCE(w.distance_km,0) > 0
                   THEN ROUND(COALESCE(w.fact_liters,0) / w.distance_km * 100, 2) END AS fact_per_100km,
              CASE WHEN COALESCE(w.engine_hours,0) > 0
                   THEN ROUND(COALESCE(w.fact_liters,0) / w.engine_hours, 2) END AS fact_per_hour
         FROM vehicles v
         JOIN fuel_types ft ON ft.id = v.fuel_type_id
         LEFT JOIN equipment_categories ec ON ec.id = v.category_id
         LEFT JOIN zones z ON z.id = v.zone_id
         LEFT JOIN (${WB_AGG('vehicle_id')}) w ON w.vehicle_id = v.id
         LEFT JOIN (${FUEL_AGG}) f ON f.vehicle_id = v.id
        WHERE COALESCE(w.waybills,0) > 0 OR COALESCE(f.issued_liters,0) > 0 OR v.active = 1
        ORDER BY ec.group_code, v.garage_no`,
      [from, to, from, to]);
    return { from, to, rows, totals: sumRows(rows) };
  }

  if (kind === 'categories') {
    const rows = all(
      `SELECT ec.id, ec.code, ec.name_uz, ec.name_ru, ec.group_code, ec.norm_basis,
              (SELECT COUNT(*) FROM vehicles v WHERE v.category_id = ec.id AND v.active = 1) AS units,
              COALESCE(w.waybills,0) AS waybills, COALESCE(w.distance_km,0) AS distance_km,
              COALESCE(w.engine_hours,0) AS engine_hours, COALESCE(w.flights,0) AS flights,
              COALESCE(w.cargo_ton,0) AS cargo_ton,
              COALESCE(w.norm_liters,0) AS norm_liters, COALESCE(w.fact_liters,0) AS fact_liters,
              ROUND(COALESCE(w.fact_liters,0) - COALESCE(w.norm_liters,0), 2) AS deviation
         FROM equipment_categories ec
         LEFT JOIN (${WB_AGG('category_id')}) w ON w.category_id = ec.id
        WHERE COALESCE(w.waybills,0) > 0
           OR EXISTS (SELECT 1 FROM vehicles v WHERE v.category_id = ec.id AND v.active = 1)
        ORDER BY ec.group_code, COALESCE(w.fact_liters,0) DESC, ec.name_uz`,
      [from, to]);
    return { from, to, rows, totals: sumRows(rows) };
  }

  if (kind === 'zones') {
    const rows = all(
      `SELECT COALESCE(zone_code, '—') AS zone_code,
              MAX(zone_name_uz) AS name_uz, MAX(zone_name_ru) AS name_ru,
              COUNT(*) AS waybills, COUNT(DISTINCT vehicle_id) AS units,
              COALESCE(SUM(distance_km),0) AS distance_km,
              COALESCE(SUM(worked_hours),0) AS engine_hours,
              COALESCE(SUM(flights_served),0) AS flights,
              COALESCE(SUM(cargo_ton),0) AS cargo_ton,
              COALESCE(SUM(uld_count),0) AS uld_count,
              COALESCE(SUM(pax_count),0) AS pax_count,
              COALESCE(SUM(norm_liters),0) AS norm_liters,
              COALESCE(SUM(fact_liters),0) AS fact_liters,
              ROUND(COALESCE(SUM(fact_liters),0) - COALESCE(SUM(norm_liters),0), 2) AS deviation
         FROM v_waybill_calc
        WHERE status = 'closed' AND date_from BETWEEN ? AND ?
        GROUP BY zone_code ORDER BY fact_liters DESC`,
      [from, to]);
    return { from, to, rows, totals: sumRows(rows) };
  }

  if (kind === 'flights') {
    const rows = all<any>(
      `SELECT r.flight_no, r.aircraft_type, r.aircraft_reg, r.stand,
              w.date_from AS date, w.number AS waybill_number,
              c.garage_no, c.model, c.category_name_uz, c.category_name_ru, c.driver_name,
              st.code AS service_code, st.name_uz AS service_name_uz, st.name_ru AS service_name_ru,
              r.time_out, r.time_in, r.cargo_ton, r.uld_count, r.pax_count, r.op_hours
         FROM waybill_routes r
         JOIN waybills w ON w.id = r.waybill_id
         JOIN v_waybill_calc c ON c.id = w.id
         LEFT JOIN service_types st ON st.id = r.service_type_id
        WHERE TRIM(r.flight_no) <> '' AND w.date_from BETWEEN ? AND ?
        ORDER BY w.date_from DESC, r.flight_no, r.seq LIMIT 500`,
      [from, to]);
    return {
      from, to, rows,
      totals: {
        flights: new Set(rows.map((r) => `${r.date}|${r.flight_no}`)).size,
        records: rows.length,
        cargo_ton: r2(rows.reduce((s, r) => s + (r.cargo_ton || 0), 0)),
        uld_count: rows.reduce((s, r) => s + (r.uld_count || 0), 0),
        pax_count: rows.reduce((s, r) => s + (r.pax_count || 0), 0),
      },
    };
  }

  if (kind === 'drivers') {
    const rows = all(
      `SELECT d.id, d.full_name, d.tab_no, d.position,
              COALESCE(w.waybills,0) AS waybills, COALESCE(w.distance_km,0) AS distance_km,
              COALESCE(w.engine_hours,0) AS engine_hours, COALESCE(w.flights,0) AS flights,
              COALESCE(w.cargo_ton,0) AS cargo_ton,
              COALESCE(w.norm_liters,0) AS norm_liters, COALESCE(w.fact_liters,0) AS fact_liters,
              ROUND(COALESCE(w.fact_liters,0) - COALESCE(w.norm_liters,0), 2) AS deviation
         FROM drivers d
         LEFT JOIN (${WB_AGG('driver_id')}) w ON w.driver_id = d.id
        WHERE COALESCE(w.waybills,0) > 0 OR d.active = 1
        ORDER BY d.full_name`, [from, to]);
    return { from, to, rows, totals: sumRows(rows) };
  }

  if (kind === 'fuel-types') {
    const rows = all(
      `SELECT ft.id, ft.code, ft.name_uz, ft.name_ru, ft.unit_uz, ft.unit_ru,
              COUNT(fi.id) AS records,
              COALESCE(SUM(fi.liters),0) AS issued_liters,
              COALESCE(SUM(fi.amount),0) AS issued_amount,
              CASE WHEN SUM(fi.liters) > 0 THEN ROUND(SUM(fi.amount) / SUM(fi.liters), 2) END AS avg_price
         FROM fuel_types ft
         LEFT JOIN fuel_issues fi ON fi.fuel_type_id = ft.id AND fi.date BETWEEN ? AND ?
        GROUP BY ft.id HAVING records > 0 OR ft.active = 1
        ORDER BY issued_liters DESC, ft.id`, [from, to]);
    return { from, to, rows, totals: sumRows(rows) };
  }

  if (kind === 'monthly') {
    const year = String(Number(q.get('year')) || new Date().getFullYear());
    const rows = all<any>(
      `WITH m(month) AS (VALUES ('01'),('02'),('03'),('04'),('05'),('06'),
                                ('07'),('08'),('09'),('10'),('11'),('12'))
       SELECT m.month,
              (SELECT COUNT(*) FROM waybills w
                WHERE w.status='closed' AND substr(w.date_from,1,7) = ? || '-' || m.month) AS waybills,
              (SELECT COALESCE(SUM(distance_km),0) FROM v_waybill_calc c
                WHERE c.status='closed' AND substr(c.date_from,1,7) = ? || '-' || m.month) AS distance_km,
              (SELECT COALESCE(SUM(worked_hours),0) FROM v_waybill_calc c
                WHERE c.status='closed' AND substr(c.date_from,1,7) = ? || '-' || m.month) AS engine_hours,
              (SELECT COALESCE(SUM(flights_served),0) FROM v_waybill_calc c
                WHERE c.status='closed' AND substr(c.date_from,1,7) = ? || '-' || m.month) AS flights,
              (SELECT COALESCE(SUM(cargo_ton),0) FROM v_waybill_calc c
                WHERE c.status='closed' AND substr(c.date_from,1,7) = ? || '-' || m.month) AS cargo_ton,
              (SELECT COALESCE(SUM(norm_liters),0) FROM v_waybill_calc c
                WHERE c.status='closed' AND substr(c.date_from,1,7) = ? || '-' || m.month) AS norm_liters,
              (SELECT COALESCE(SUM(fact_liters),0) FROM v_waybill_calc c
                WHERE c.status='closed' AND substr(c.date_from,1,7) = ? || '-' || m.month) AS fact_liters,
              (SELECT COALESCE(SUM(liters),0) FROM fuel_issues f
                WHERE substr(f.date,1,7) = ? || '-' || m.month) AS issued_liters,
              (SELECT COALESCE(SUM(amount),0) FROM fuel_issues f
                WHERE substr(f.date,1,7) = ? || '-' || m.month) AS issued_amount
         FROM m ORDER BY m.month`,
      Array(9).fill(year)
    ).map((r) => ({ ...r, deviation: r2(r.fact_liters - r.norm_liters) }));
    return { year, rows, totals: sumRows(rows) };
  }

  if (kind === 'dashboard') {
    const { from: mFrom, to: mTo } = monthRange();
    const stats = get(
      `SELECT
         (SELECT COUNT(*) FROM vehicles WHERE active = 1) AS vehicles,
         (SELECT COUNT(*) FROM drivers  WHERE active = 1) AS drivers,
         (SELECT COUNT(*) FROM waybills WHERE status <> 'closed') AS open_waybills,
         (SELECT COUNT(*) FROM waybills WHERE date_from BETWEEN ? AND ?) AS month_waybills,
         (SELECT COALESCE(SUM(liters),0) FROM fuel_issues WHERE date BETWEEN ? AND ?) AS month_liters,
         (SELECT COALESCE(SUM(amount),0) FROM fuel_issues WHERE date BETWEEN ? AND ?) AS month_amount,
         (SELECT COALESCE(SUM(distance_km),0) FROM v_waybill_calc
           WHERE status='closed' AND date_from BETWEEN ? AND ?) AS month_distance,
         (SELECT COALESCE(SUM(worked_hours),0) FROM v_waybill_calc
           WHERE status='closed' AND date_from BETWEEN ? AND ?) AS month_hours,
         (SELECT COALESCE(SUM(flights_served),0) FROM v_waybill_calc
           WHERE status='closed' AND date_from BETWEEN ? AND ?) AS month_flights,
         (SELECT COALESCE(SUM(cargo_ton),0) FROM v_waybill_calc
           WHERE status='closed' AND date_from BETWEEN ? AND ?) AS month_cargo,
         (SELECT COALESCE(SUM(uld_count),0) FROM v_waybill_calc
           WHERE status='closed' AND date_from BETWEEN ? AND ?) AS month_uld,
         (SELECT COALESCE(SUM(fact_liters),0) - COALESCE(SUM(norm_liters),0) FROM v_waybill_calc
           WHERE status='closed' AND date_from BETWEEN ? AND ?) AS month_deviation`,
      Array(9).fill([mFrom, mTo]).flat());

    return {
      period: { from: mFrom, to: mTo },
      stats,
      openWaybills: all(`SELECT id, number, date_from, garage_no, plate, model, driver_name, status,
                                category_name_uz, category_name_ru
                           FROM v_waybill_calc WHERE status <> 'closed'
                          ORDER BY date_from DESC LIMIT 10`),
      byGroup: all(
        `SELECT COALESCE(ec.group_code, 'road') AS group_code,
                COUNT(DISTINCT v.id) AS units,
                COALESCE(SUM(w.fact_liters), 0) AS fact_liters,
                COALESCE(SUM(w.worked_hours), 0) AS engine_hours,
                COALESCE(SUM(w.flights_served), 0) AS flights
           FROM vehicles v
           LEFT JOIN equipment_categories ec ON ec.id = v.category_id
           LEFT JOIN v_waybill_calc w ON w.vehicle_id = v.id AND w.status = 'closed'
                                     AND w.date_from BETWEEN ? AND ?
          WHERE v.active = 1
          GROUP BY COALESCE(ec.group_code, 'road')
          ORDER BY fact_liters DESC`, [mFrom, mTo]),
      lowFuel: all(`SELECT v.id, v.garage_no, v.plate, v.model, v.fuel_balance, v.tank_capacity,
                           ROUND(v.fuel_balance / NULLIF(v.tank_capacity,0) * 100, 0) AS pct
                      FROM vehicles v WHERE v.active = 1 AND v.tank_capacity > 0
                       AND v.power_type <> 'electric'
                       AND v.fuel_balance < v.tank_capacity * 0.15
                     ORDER BY pct LIMIT 10`),
      daily: all(`SELECT date, COALESCE(SUM(liters),0) AS liters FROM fuel_issues
                   WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date`, [mFrom, mTo]),
      topDeviation: all(`SELECT garage_no, plate, number, date_from,
                                ROUND(fact_liters - norm_liters, 2) AS deviation
                           FROM v_waybill_calc
                          WHERE status='closed' AND fact_liters IS NOT NULL AND date_from BETWEEN ? AND ?
                          ORDER BY ABS(fact_liters - norm_liters) DESC LIMIT 5`, [mFrom, mTo]),
    };
  }

  throw notFound(`Hisobot topilmadi: ${kind}`);
}
