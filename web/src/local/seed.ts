// Demo bazani to'ldirish: spravochniklar + joriy oy uchun yo'l varaqalari.
// server/seed.js va scripts/demo-data.js mantig'ining brauzer uchun ko'chirmasi.
import { all, get, run } from './db';
import { isWinterDate, r2, recalcVehicle } from './calc';

const pad = (n: number) => String(n).padStart(2, '0');

export function seedReference() {
  if (!get('SELECT id FROM org WHERE id = 1')) {
    run(`INSERT INTO org (id, name, inn, address, phone, director, mechanic)
         VALUES (1, ?, ?, ?, ?, ?, ?)`,
      ['"Namuna Transport" MChJ', '301234567', 'Toshkent sh., Amir Temur ko\'chasi 1',
       '+998 71 200-00-00', 'Karimov A. B.', 'Tursunov M. R.']);
  }

  const fuels: [string, string, string, string, string, number][] = [
    ['AI80',   'AI-80 benzin',               'Бензин АИ-80',      'l',  'л',  10800],
    ['AI91',   'AI-91 benzin',               'Бензин АИ-91',      'l',  'л',  11900],
    ['AI92',   'AI-92 benzin',               'Бензин АИ-92',      'l',  'л',  12400],
    ['AI95',   'AI-95 benzin',               'Бензин АИ-95',      'l',  'л',  13900],
    ['DT',     "Dizel yoqilg'isi",           'Дизельное топливо', 'l',  'л',  11200],
    ['METAN',  'Siqilgan gaz (metan)',       'Метан (СПГ)',       'm³', 'м³', 4500],
    ['PROPAN', 'Suyultirilgan gaz (propan)', 'Пропан (СУГ)',      'l',  'л',  5800],
  ];
  for (const [code, uz, ru, uUz, uRu, price] of fuels) {
    if (!get('SELECT id FROM fuel_types WHERE code = ?', [code])) {
      run('INSERT INTO fuel_types (code, name_uz, name_ru, unit_uz, unit_ru, price) VALUES (?,?,?,?,?,?)',
          [code, uz, ru, uUz, uRu, price]);
    }
  }

  if (!get('SELECT id FROM users LIMIT 1')) {
    run('INSERT INTO users (username, full_name, password_hash, role) VALUES (?,?,?,?)',
        ['admin', 'Administrator', 'demo', 'admin']);
  }
}

export function seedDemo() {
  if (get('SELECT id FROM vehicles LIMIT 1')) return;   // allaqachon to'ldirilgan

  const fuelId = (code: string) => get<{ id: number }>('SELECT id FROM fuel_types WHERE code = ?', [code])!.id;
  const dt = fuelId('DT');
  const ai92 = fuelId('AI92');

  //            garaj, raqam,        rusum,              yoqilg'i, bak, l/100, qish%, l/soat, l/100tkm, spidometr, qoldiq
  const vehicles: any[][] = [
    ['01', '01 A 123 BC', 'Isuzu NQR 71',      dt,   100, 18.0, 10, 2.5, 1.3, 145200, 40],
    ['02', '01 B 456 CD', 'Chevrolet Cobalt',  ai92,  44,  7.8, 10, 0,   0,    88300, 20],
    ['03', '01 C 789 DE', 'GAZ-3307',          ai92, 105, 24.5, 10, 0,   2.0, 210500, 55],
    ['04', '01 D 321 EF', 'Damas',             ai92,  35,  8.6, 10, 0,   0,    62740, 15],
  ];
  for (const v of vehicles) {
    run(`INSERT INTO vehicles (garage_no, plate, model, fuel_type_id, tank_capacity, norm_per_100km,
           winter_pct, norm_engine_hour, norm_per_ton_km, init_odometer, init_fuel, odometer, fuel_balance)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...v, v[9], v[10]]);
  }

  const drivers: any[][] = [
    ['Karimov Alisher Baxtiyorovich', '101', 'AB1234567', '+998 90 123-45-67', 'B, C'],
    ['Rasulov Sardor Ilhomovich',     '102', 'AB7654321', '+998 91 234-56-78', 'B, C, E'],
    ['Yusupov Jasur Nodirovich',      '103', 'AB1112223', '+998 93 345-67-89', 'B'],
    ['Ergashev Doniyor Shavkatovich', '104', 'AB4445556', '+998 94 456-78-90', 'B, C'],
  ];
  for (const d of drivers) {
    run('INSERT INTO drivers (full_name, tab_no, license_no, phone, class) VALUES (?,?,?,?,?)', d);
  }

  generateWaybills();
}

/** Joriy va o'tgan oy uchun yopilgan yo'l varaqalarini yaratadi. */
function generateWaybills() {
  const vehicleList = all<any>('SELECT * FROM vehicles WHERE active = 1 ORDER BY id');
  const driverList = all<any>('SELECT * FROM drivers WHERE active = 1 ORDER BY id');
  const winterMonths = get<{ winter_months: string }>('SELECT winter_months FROM org WHERE id = 1')?.winter_months;
  const stations = ['UzGasOil', 'Neftgaz AZS', 'Sardor Petrol', 'Ombor'];

  const now = new Date();
  const months = [
    new Date(now.getFullYear(), now.getMonth() - 1, 1),
    new Date(now.getFullYear(), now.getMonth(), 1),
  ];

  let number = 1;
  for (const monthStart of months) {
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth() + 1;
    const isCurrent = month === now.getMonth() + 1 && year === now.getFullYear();
    const lastDay = isCurrent ? now.getDate() : new Date(year, month, 0).getDate();

    for (let day = 1; day <= lastDay; day++) {
      const date = `${year}-${pad(month)}-${pad(day)}`;
      if (new Date(year, month - 1, day).getDay() === 0) continue;   // yakshanba

      for (let vi = 0; vi < vehicleList.length; vi++) {
        if ((day + vi) % 3 === 0) continue;

        const vehicle = get<any>('SELECT * FROM vehicles WHERE id = ?', [vehicleList[vi].id])!;
        const driver = driverList[(day + vi) % driverList.length];
        const winter = isWinterDate(date, winterMonths);

        const odoStart = vehicle.odometer;
        const fuelStart = vehicle.fuel_balance;
        const distance = 60 + ((day * 37 + vi * 53) % 200);
        const cargoTon = (day % 5) + 1;

        const res = run(
          `INSERT INTO waybills (number, date_from, date_to, vehicle_id, driver_id, status,
             odo_start, fuel_start, engine_hours, cargo_ton_km, winter,
             norm_per_100km, norm_engine_hour, norm_per_ton_km, winter_pct, task, created_by)
           VALUES (?,?,?,?,?,'issued',?,?,0,0,?,?,?,?,?,?,1)`,
          [String(number), date, date, vehicle.id, driver.id, odoStart, fuelStart, winter,
           vehicle.norm_per_100km, vehicle.norm_engine_hour, vehicle.norm_per_ton_km, vehicle.winter_pct,
           ['Yuk tashish', 'Xizmat safari', "Ta'minot", 'Filialga yetkazish'][(day + vi) % 4]]
        );
        const wbId = res.lastInsertRowid;
        number++;

        run(`INSERT INTO waybill_routes (waybill_id, seq, point_from, point_to, time_out, time_in, distance_km, cargo, cargo_ton)
             VALUES (?,1,?,?,?,?,?,?,?)`,
          [wbId, 'Baza', ['Ombor', 'Filial', 'Zavod', 'Bozor'][(day + vi) % 4],
           '08:00', '17:30', distance, 'Aralash yuk', cargoTon]);

        const norm = r2((distance / 100) * vehicle.norm_per_100km * (winter ? 1 + vehicle.winter_pct / 100 : 1));

        // Qoldiq reysga yetmasa — yoqilg'i quyiladi
        let issued = 0;
        const needed = norm * 1.2;
        if (fuelStart < needed || day % 3 === 1) {
          const target = Math.min(vehicle.tank_capacity * 0.85, fuelStart + needed * 2.5);
          issued = Math.max(20, Math.round((target - fuelStart) * 10) / 10);
          run(`INSERT INTO fuel_issues (date, vehicle_id, driver_id, waybill_id, fuel_type_id,
                 liters, price, amount, source, station, doc_no, created_by)
               VALUES (?,?,?,?,?,?,?,?,'azs',?,?,1)`,
            [date, vehicle.id, driver.id, wbId, vehicle.fuel_type_id, issued,
             vehicle.fuel_type_id === 5 ? 11200 : 12400,
             r2(issued * (vehicle.fuel_type_id === 5 ? 11200 : 12400)),
             stations[(day + vi) % stations.length], `${pad(day)}${pad(month)}-${vehicle.garage_no}`]);
        }

        const drift = 1 + (((day * 13 + vi * 29) % 17) - 8) / 100;
        const fact = norm * drift;
        const fuelEnd = Math.max(0, r2(fuelStart + issued - fact));

        run(`UPDATE waybills SET odo_end = ?, fuel_end = ?, status = 'closed',
               closed_at = datetime('now'), closed_by = 1 WHERE id = ?`,
            [odoStart + distance, fuelEnd, wbId]);
        recalcVehicle(vehicle.id);
      }
    }
  }
}
