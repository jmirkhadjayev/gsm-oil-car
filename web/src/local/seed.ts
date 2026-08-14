// Demo bazani to'ldirish: aeroport spravochniklari, texnika parki va smena varaqalari.
// server/seed.js + scripts/demo-data.js mantig'ining brauzer uchun ko'chirmasi.
import { all, get, run } from './db';
import { isWinterDate, r2, recalcVehicle } from './calc';
import catalog from './catalog.generated.json';

const pad = (n: number) => String(n).padStart(2, '0');

type CatalogItem = { code: string; uz: string; ru: string; group: string; basis: string; km: number; hour: number };

// Filiallar — server/seed.js dagi ro'yxat bilan bir xil
const BRANCHES: [string, string, string, number][] = [
  ['TAS', 'Toshkent xalqaro aeroporti',  'Международный аэропорт Ташкент',   44],
  ['SKD', 'Samarqand xalqaro aeroporti', 'Международный аэропорт Самарканд', 20],
  ['BHK', 'Buxoro xalqaro aeroporti',    'Международный аэропорт Бухара',    14],
  ['KSQ', 'Qarshi aeroporti',            'Аэропорт Карши',                    9],
];

export function seedReference() {
  for (const [code, uz, ru] of BRANCHES) {
    if (!get('SELECT id FROM branches WHERE code = ?', [code])) {
      run('INSERT INTO branches (code, name_uz, name_ru) VALUES (?,?,?)', [code, uz, ru]);
    }
  }

  if (!get('SELECT id FROM org WHERE id = 1')) {
    run(`INSERT INTO org (id, name, inn, address, phone, director, mechanic)
         VALUES (1, ?, ?, ?, ?, ?, ?)`,
      ['Xalqaro aeroport', '301234567', 'Toshkent sh., Aeroport ko\'chasi 1',
       '+998 71 140-28-01', 'Karimov A. B.', 'Tursunov M. R.']);
  }

  const fuels: [string, string, string, string, string, number][] = [
    ['AI80',   'AI-80 benzin',               'Бензин АИ-80',      'l',     'л',     10800],
    ['AI91',   'AI-91 benzin',               'Бензин АИ-91',      'l',     'л',     11900],
    ['AI92',   'AI-92 benzin',               'Бензин АИ-92',      'l',     'л',     12400],
    ['AI95',   'AI-95 benzin',               'Бензин АИ-95',      'l',     'л',     13900],
    ['DT',     "Dizel yoqilg'isi",           'Дизельное топливо', 'l',     'л',     11200],
    ['METAN',  'Siqilgan gaz (metan)',       'Метан (СПГ)',       'm³',    'м³',    4500],
    ['PROPAN', 'Suyultirilgan gaz (propan)', 'Пропан (СУГ)',      'l',     'л',     5800],
    ['ELEKTR', 'Elektr energiya',            'Электроэнергия',    'kVt·s', 'кВт·ч', 950],
    ['TS1',    'Aviakerosin TS-1',           'Авиакеросин ТС-1',  'l',     'л',     9800],
    ['JETA1',  'Aviakerosin Jet A-1',        'Авиакеросин Jet A-1', 'l',   'л',     10400],
  ];
  for (const [code, uz, ru, uUz, uRu, price] of fuels) {
    if (!get('SELECT id FROM fuel_types WHERE code = ?', [code])) {
      run('INSERT INTO fuel_types (code, name_uz, name_ru, unit_uz, unit_ru, price) VALUES (?,?,?,?,?,?)',
          [code, uz, ru, uUz, uRu, price]);
    }
  }

  // ----------------------- Aeroport spravochniklari -----------------------
  for (const z of (catalog as any).zones as CatalogItem[]) {
    if (!get('SELECT id FROM zones WHERE code = ?', [z.code])) {
      run('INSERT INTO zones (code, name_uz, name_ru) VALUES (?,?,?)', [z.code, z.uz, z.ru]);
    }
  }
  for (const s of (catalog as any).services as (CatalogItem & { unit: string })[]) {
    if (!get('SELECT id FROM service_types WHERE code = ?', [s.code])) {
      run('INSERT INTO service_types (code, name_uz, name_ru, unit) VALUES (?,?,?,?)',
          [s.code, s.uz, s.ru, s.unit]);
    }
  }
  for (const c of (catalog as any).categories as CatalogItem[]) {
    if (!get('SELECT id FROM equipment_categories WHERE code = ?', [c.code])) {
      run(`INSERT INTO equipment_categories (code, name_uz, name_ru, group_code, norm_basis,
             default_norm_km, default_norm_hour) VALUES (?,?,?,?,?,?,?)`,
          [c.code, c.uz, c.ru, c.group, c.basis, c.km, c.hour]);
    }
  }

  if (!get('SELECT id FROM users LIMIT 1')) {
    run('INSERT INTO users (username, full_name, password_hash, role) VALUES (?,?,?,?)',
        ['admin', 'Administrator', 'demo', 'admin']);
  }
}

export function seedDemo() {
  if (get('SELECT id FROM vehicles LIMIT 1')) return;   // allaqachon to'ldirilgan
  for (const [code, , , size] of BRANCHES) {
    const b = get<{ id: number }>('SELECT id FROM branches WHERE code = ?', [code]);
    if (b) seedBranch(b.id, size);
  }
}

/** Bitta filial uchun park, xodimlar va joriy oy varaqalari. */
function seedBranch(branchId: number, limit: number) {
  const catId = (code: string) => get<{ id: number }>('SELECT id FROM equipment_categories WHERE code = ?', [code])?.id ?? null;
  const zoneId = (code: string) => get<{ id: number }>('SELECT id FROM zones WHERE code = ?', [code])?.id ?? null;
  const fuelId = (code: string) => get<{ id: number }>('SELECT id FROM fuel_types WHERE code = ?', [code])?.id ?? null;

  // [garaj, raqam, rusum, turkum, zona, yoqilg'i, bak, spidometr, motosoat, qoldiq, yil, gibrid?]
  // gibrid = [ikkinchi manba kodi, sig'imi, norma/100km, norma/motosoat, boshlang'ich zaryad]
  const HY_DEICER = ['ELEKTR', 90, 0, 6, 62];
  const HY_CAR = ['ELEKTR', 18, 6.5, 0, 12];
  const fleet: any[][] = [
    ['GSE-01', '10 A 001 AP', 'Goldhofer AST-1X',         'PUSHBACK',   'APRON',    'DT',     240, 18400,  6120, 120, 2019],
    ['GSE-02', '10 A 002 AP', 'TLD TMX-150',              'PUSHBACK',   'APRON',    'DT',     200, 22150,  7340,  95, 2017],
    ['GSE-03', '—',           'TLD GPU-4090',             'GPU',        'APRON',    'DT',     150,     0,  9880,  70, 2018],
    ['GSE-04', '—',           'GUINAULT ASU-600',         'ASU',        'APRON',    'DT',     180,     0,  4210,  85, 2020],
    ['GSE-05', '—',           'TLD ACU-302',              'ACU',        'APRON',    'DT',     160,     0,  3760,  60, 2021],
    ['GSE-06', '10 A 006 AP', 'Vestergaard Elephant BETA e-drive','DEICER','APRON', 'DT',     400,  9120,  2480, 210, 2020, HY_DEICER],
    ['GSE-07', '10 A 007 AP', 'Mercedes Actros TZ-60',    'REFUELLER',  'APRON',    'DT',     300, 41250,  5610, 140, 2016],
    ['GSE-08', '10 A 008 AP', 'Kamaz AC-45 hydrant',      'HYDRANT',    'APRON',    'DT',     250, 33800,  4950, 115, 2018],
    ['GSE-09', '10 A 009 AP', 'Mallaghan CT6000',         'CATERING',   'APRON',    'DT',     180, 15600,  3120,  80, 2019],
    ['GSE-10', '10 A 010 AP', 'Mallaghan LS500 lavatory', 'LAVATORY',   'APRON',    'DT',     120, 12480,  2140,  55, 2019],
    ['GSE-11', '10 A 011 AP', 'Mallaghan WS400 water',    'WATER',      'APRON',    'DT',     120, 11350,  1980,  50, 2019],
    ['GSE-12', '10 A 012 AP', 'Toyota RAV4 Hybrid (Follow me)','FOLLOWME','APRON',  'AI92',    55, 64200,     0,  45, 2021, HY_CAR],
    ['GSE-13', '10 A 013 AP', 'Mallaghan PS150',          'AIRSTAIRS',  'APRON',    'DT',     100,  8760,  1520,  42, 2020],
    ['GSE-14', '10 B 014 AP', 'Cobus 3000',               'APRONBUS',   'TERMINAL', 'DT',     250, 96400,     0, 130, 2015],
    ['GSE-15', '10 B 015 AP', 'Cobus 2700S',              'APRONBUS',   'TERMINAL', 'DT',     250, 78900,     0, 118, 2017],
    ['GSE-16', '10 B 016 AP', 'Mallaghan AL2000',         'AMBULIFT',   'TERMINAL', 'DT',     140, 10250,  1340,  62, 2020],
    ['GSE-17', '10 B 017 AP', 'Mercedes Sprinter',        'CREWBUS',    'TERMINAL', 'DT',      75, 142300,    0,  38, 2018],

    ['CRG-01', '—',           'TLD MDL-7000 main deck',   'MAINDECK',   'CARGO',    'DT',     220,     0,  5280, 105, 2018],
    ['CRG-02', '—',           'TLD MDL-7000 main deck',   'MAINDECK',   'CARGO',    'DT',     220,     0,  4870,  98, 2019],
    ['CRG-03', '10 C 003 CG', 'Mallaghan BL200 belt',     'BELTLOADER', 'CARGO',    'DT',      90,  6420,  2310,  40, 2020],
    ['CRG-04', '10 C 004 CG', 'Mallaghan BL200 belt',     'BELTLOADER', 'CARGO',    'DT',      90,  5980,  2180,  38, 2020],
    ['CRG-05', '—',           'Toyota 8FD30 (3 t)',       'FORKLIFT_D', 'CARGO',    'DT',      70,     0,  7640,  32, 2017],
    ['CRG-06', '—',           'Toyota 8FD50 (5 t)',       'FORKLIFT_D', 'CARGO',    'DT',      95,     0,  6210,  45, 2018],
    ['CRG-07', '—',           'Komatsu FG25 (2,5 t)',     'FORKLIFT_G', 'CARGO',    'PROPAN',  60,     0,  8120,  28, 2016],
    ['CRG-08', '—',           'Linde E30 (3 t)',          'FORKLIFT_E', 'CARGO',    'ELEKTR',   0,     0,  4380,   0, 2021],
    ['CRG-09', '—',           'Linde E16 (1,6 t)',        'FORKLIFT_E', 'CARGO',    'ELEKTR',   0,     0,  3950,   0, 2021],
    ['CRG-10', '—',           'Jungheinrich ETV 216',     'REACHTRUCK', 'CARGO',    'ELEKTR',   0,     0,  2870,   0, 2022],
    ['CRG-11', '—',           'Jungheinrich EJC 112',     'STACKER',    'CARGO',    'ELEKTR',   0,     0,  1940,   0, 2022],
    ['CRG-12', '—',           'BT LWE180 transpaleta',    'PALLETTRUCK','CARGO',    'ELEKTR',   0,     0,  1260,   0, 2022],
    ['CRG-13', '10 C 013 CG', 'Charlatte T135 tractor',   'BAGTRACTOR', 'CARGO',    'DT',      60, 24800,  1820,  26, 2019],
    ['CRG-14', '10 C 014 CG', 'Charlatte T135 tractor',   'BAGTRACTOR', 'CARGO',    'DT',      60, 21350,  1640,  24, 2019],
    ['CRG-15', '10 C 015 CG', 'Isuzu NQR 71 (yuk)',       'CARGOTRUCK', 'CARGO',    'DT',     100, 145200,    0,  55, 2018],
    ['CRG-16', '—',           'Kalmar DRF450 richstacker','REACHSTACK', 'CARGO',    'DT',     360,     0,  3410, 170, 2017],

    ['AFD-01', '10 D 001 AF', 'Bucher CityCat sweeper',   'SWEEPER',    'RUNWAY',   'DT',     180, 18900,  3240,  85, 2018],
    ['AFD-02', '10 D 002 AF', 'Schmidt TJS-630 (UQY)',    'RWSWEEPER',  'RUNWAY',   'DT',     400, 12600,  2980, 190, 2019],
    ['AFD-03', '10 D 003 AF', 'Rosenbauer Panther 6x6',   'FIRETRUCK',  'RUNWAY',   'DT',     600,  8400,  1120, 290, 2020],
    ['AFD-04', '10 D 004 AF', 'MAN TGS qor tozalagich',   'SNOWPLOUGH', 'RUNWAY',   'DT',     350, 15200,  2460, 165, 2016],
    ['AFD-05', '10 D 005 AF', 'Sprinter (tez yordam)',    'AMBULANCE',  'TERMINAL', 'DT',      75, 68300,     0,  36, 2019],
    ['AFD-06', '10 D 006 AF', 'ASFT T-10 friction tester','FRICTION',   'RUNWAY',   'AI92',    80, 42100,     0,  38, 2018],
    ['AFD-07', '—',           'Caterpillar 428 loader',   'LOADER',     'HANGAR',   'DT',     130,     0,  5620,  60, 2017],
    ['AFD-08', '—',           'FG Wilson P110 generator', 'GENERATOR',  'HANGAR',   'DT',     200,     0,  6940,  95, 2015],

    ['SVC-01', '10 E 001 SV', 'Toyota Corolla Hybrid',    'CAR',        'CITY',     'AI92',    43, 88300,     0,  20, 2021, HY_CAR],
    ['SVC-02', '10 E 002 SV', 'Chevrolet Damas',          'MINIBUS',    'CITY',     'AI92',    35, 62740,     0,  16, 2020],
    ['SVC-03', '10 E 003 SV', 'Isuzu texnik xizmat',      'SERVICEVAN', 'HANGAR',   'DT',      90, 51200,     0,  42, 2019],
  ];

  // Filiallar bir-biriga o'xshamasligi uchun hisoblagichlar farqlanadi
  const k = 0.7 + (branchId % 5) * 0.15;
  const r0 = (n: number) => Math.round(n * k);

  for (const [garage, plate, model, cat, zone, fuel, tank, odo, hours, fuelBal, year, hy] of fleet.slice(0, limit)) {
    const c = get<any>('SELECT * FROM equipment_categories WHERE code = ?', [cat])!;
    const [f2, tank2, n2km, n2h, bal2] = hy ?? [null, 0, 0, 0, 0];
    run(
      `INSERT INTO vehicles (branch_id, garage_no, plate, model, category_id, zone_id, norm_basis, power_type,
         made_year, fuel_type_id, tank_capacity, norm_per_100km, winter_pct, norm_engine_hour,
         fuel_type2_id, tank_capacity2, norm2_per_100km, norm2_engine_hour,
         init_odometer, init_hours, init_fuel, init_fuel2,
         odometer, hour_meter, fuel_balance, fuel_balance2)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [branchId, garage, plate, model, catId(cat), zoneId(zone), c.norm_basis,
       hy ? 'hybrid'
          : fuel === 'ELEKTR' ? 'electric' : fuel === 'PROPAN' ? 'gas' : fuel === 'DT' ? 'diesel' : 'petrol',
       year, fuelId(fuel), tank, c.default_norm_km, 10, c.default_norm_hour,
       f2 ? fuelId(f2) : null, tank2, n2km, n2h,
       r0(odo), r0(hours), fuelBal, bal2,
       r0(odo), r0(hours), fuelBal, bal2]
    );
  }

  const staff: any[][] = [
    ['Karimov Alisher Baxtiyorovich',  '101', 'AB1234567', '+998 90 123-45-67', 'B, C',    'driver',   'AP-1042'],
    ['Rasulov Sardor Ilhomovich',      '102', 'AB7654321', '+998 91 234-56-78', 'B, C, E', 'driver',   'AP-1043'],
    ['Yusupov Jasur Nodirovich',       '103', 'AB1112223', '+998 93 345-67-89', 'B',       'operator', 'AP-1044'],
    ['Ergashev Doniyor Shavkatovich',  '104', 'AB4445556', '+998 94 456-78-90', 'B, C',    'operator', 'AP-1045'],
    ['Tursunov Bekzod Anvarovich',     '105', 'AB7778889', '+998 97 567-89-01', 'C, D',    'driver',   'AP-1046'],
    ['Nazarov Otabek Farhodovich',     '106', 'AB2223334', '+998 99 678-90-12', 'B, C',    'operator', 'AP-1047'],
    ['Sobirov Rustam Qodirovich',      '107', 'AB5556667', '+998 90 789-01-23', 'C, E',    'driver',   'AP-1048'],
    ["Xolmatov Sanjar Ulug'bekovich",  '108', 'AB8889990', '+998 91 890-12-34', 'B',       'operator', 'AP-1049'],
    ['Abdullayev Shohruh Baxodirovich','109', 'AB3334445', '+998 93 901-23-45', 'C',       'mechanic', 'AP-1050'],
    ['Qosimov Aziz Tolibovich',        '110', 'AB6667778', '+998 94 012-34-56', 'B, C',    'loader',   'AP-1051'],
  ];
  const staffCount = Math.max(4, Math.round(staff.length * Math.min(1, limit / 44)));
  for (const [name, tab, lic, phone, cls, pos, permit] of staff.slice(0, staffCount)) {
    run(`INSERT INTO drivers (branch_id, full_name, tab_no, license_no, phone, class, position, apron_permit)
         VALUES (?,?,?,?,?,?,?,?)`, [branchId, name, `${branchId}${tab}`, lic, phone, cls, pos, permit]);
  }

  generateWaybills(branchId);
}

// Turkum → tipik xizmat turlari
const SERVICE_BY_CATEGORY: Record<string, string[]> = {
  PUSHBACK: ['PUSHBACK', 'TOW'], TOWBARLESS: ['TOW', 'PUSHBACK'],
  GPU: ['GPU'], ASU: ['ASU'], ACU: ['ACU'], DEICER: ['DEICE'],
  REFUELLER: ['REFUEL'], HYDRANT: ['REFUEL'],
  CATERING: ['CATERING'], LAVATORY: ['LAV'], WATER: ['WATER'],
  AIRSTAIRS: ['STAIRS'], AIRCLEAN: ['CLEAN'],
  APRONBUS: ['PAX'], CREWBUS: ['PAX'], AMBULIFT: ['PAX'], FOLLOWME: ['PATROL'],
  MAINDECK: ['LOAD', 'UNLOAD'], BELTLOADER: ['LOAD', 'UNLOAD'], SLAVELOADER: ['ULD'],
  FORKLIFT_D: ['LOAD', 'UNLOAD'], FORKLIFT_G: ['LOAD', 'UNLOAD'], FORKLIFT_E: ['LOAD', 'UNLOAD'],
  REACHTRUCK: ['ULD'], STACKER: ['ULD'], PALLETTRUCK: ['ULD'], REACHSTACK: ['ULD'],
  BAGTRACTOR: ['BAGGAGE'], CARGOTRUCK: ['LOAD'],
  SWEEPER: ['SNOW'], RWSWEEPER: ['SNOW'], SNOWPLOUGH: ['SNOW'],
  FIRETRUCK: ['PATROL'], AMBULANCE: ['PATROL'], FRICTION: ['PATROL'],
};

const FLIGHTS: [string, string, string][] = [
  ['HY-601', 'A320-200', 'UK-32011'], ['HY-602', 'A320-200', 'UK-32012'],
  ['HY-273', 'B767-300', 'UK-67003'], ['HY-274', 'B767-300', 'UK-67004'],
  ['HY-101', 'B787-8', 'UK-78701'],   ['HY-102', 'B787-8', 'UK-78702'],
  ['HY-411', 'A321neo', 'UK-32101'],  ['HY-412', 'A321neo', 'UK-32102'],
  ['TK-370', 'A321-200', 'TC-JSK'],   ['SU-1874', 'A320-200', 'VP-BZQ'],
  ['FZ-1721', 'B737-800', 'A6-FED'],  ['KC-185', 'E190', 'P4-KCA'],
  ['CX-2077', 'B777F', 'B-LJA'],      ['EK-9881', 'B777F', 'A6-EFG'],
  ['TK-6501', 'A330-200F', 'TC-JDP'], ['HY-8001', 'B767-300F', 'UK-67F01'],
];

/** Joriy oy uchun yopilgan smena varaqalari va reysga xizmat operatsiyalari (bitta filial). */
function generateWaybills(branchId: number) {
  const vehicleIds = all<{ id: number }>(
    'SELECT id FROM vehicles WHERE active = 1 AND branch_id = ? ORDER BY id', [branchId]).map((r) => r.id);
  const drivers = all<any>('SELECT * FROM drivers WHERE active = 1 AND branch_id = ? ORDER BY id', [branchId]);
  const winterMonths = get<{ winter_months: string }>('SELECT winter_months FROM org WHERE id = 1')?.winter_months;
  const serviceId = (code: string) =>
    get<{ id: number }>('SELECT id FROM service_types WHERE code = ?', [code])?.id ?? null;
  const stations = ['Perron AZS-1', 'Perron AZS-2', 'Texnik baza ombori', 'Yuk terminali AZS'];

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = Math.min(now.getDate(), new Date(year, month, 0).getDate());

  let number = 1;
  for (let day = 1; day <= lastDay; day++) {
    const date = `${year}-${pad(month)}-${pad(day)}`;
    const winter = isWinterDate(date, winterMonths);

    for (let vi = 0; vi < vehicleIds.length; vi++) {
      if ((day * 7 + vi * 3) % 5 >= 3) continue;         // parkning ~60 % i ishlaydi

      const v = get<any>(
        `SELECT v.*, ec.code AS category_code, ec.group_code
           FROM vehicles v LEFT JOIN equipment_categories ec ON ec.id = v.category_id
          WHERE v.id = ?`, [vehicleIds[vi]])!;
      const driver = drivers[(day + vi) % drivers.length];
      const basis = v.norm_basis as string;
      const withKm = basis === 'km' || basis === 'both';
      const withHours = basis !== 'km';

      const odoStart = v.odometer;
      const hoursStart = v.hour_meter;
      const fuelStart = v.fuel_balance;
      const distance = withKm ? 12 + ((day * 37 + vi * 53) % 90) : 0;
      const hours = withHours ? Math.round((2 + ((day * 11 + vi * 17) % 60) / 10) * 10) / 10 : 0;
      const shift = (day + vi) % 3 === 0 ? 'night' : 'day';

      const res = run(
        `INSERT INTO waybills (branch_id, number, date_from, date_to, vehicle_id, driver_id, status,
           odo_start, hours_start, fuel_start, fuel2_start, engine_hours, cargo_ton_km, zone_id, shift, winter,
           norm_per_100km, norm_engine_hour, norm_per_ton_km, norm2_per_100km, norm2_engine_hour,
           winter_pct, task, created_by)
         VALUES (?,?,?,?,?,?,'issued',?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,1)`,
        [branchId, String(number), date, date, v.id, driver.id, odoStart, hoursStart, fuelStart,
         v.fuel_balance2, hours,
         v.zone_id, shift, winter, v.norm_per_100km, v.norm_engine_hour, v.norm_per_ton_km,
         v.norm2_per_100km, v.norm2_engine_hour, v.winter_pct,
         ({
           aircraft: 'Havo kemalariga perron xizmati',
           cargo: 'Yuk terminalida yuklash-tushirish',
           passenger: "Yo'lovchilarni tashish",
           airfield: 'Aerodromga texnik xizmat',
           road: 'Xizmat safari',
         } as Record<string, string>)[v.group_code] ?? 'Smena topshirig\'i']
      );
      const wbId = res.lastInsertRowid;
      number++;

      // ------------------------- Operatsiyalar -------------------------
      const codes = SERVICE_BY_CATEGORY[v.category_code] ?? ['OTHER'];
      const opCount = ['OTHER', 'SNOW', 'PATROL'].includes(codes[0]) ? 1 : 1 + ((day + vi) % 3);
      for (let k = 0; k < opCount; k++) {
        const fl = FLIGHTS[(day * 3 + vi * 5 + k) % FLIGHTS.length];
        const svc = codes[k % codes.length];
        const withFlight = !['SNOW', 'PATROL', 'OTHER'].includes(svc);
        const hourFrom = 6 + ((k * 4 + day) % 14);
        run(
          `INSERT INTO waybill_routes (waybill_id, seq, point_from, point_to, time_out, time_in,
             distance_km, cargo, cargo_ton, flight_no, aircraft_type, aircraft_reg, stand,
             service_type_id, zone_id, uld_count, pax_count, op_hours)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [wbId, k + 1,
           withKm && !withFlight ? 'Texnik baza' : '',
           withKm && !withFlight ? ['Perron', 'Yuk terminali', 'UQY', 'Angar'][(day + k) % 4] : '',
           `${pad(hourFrom)}:${pad((k * 15) % 60)}`, `${pad(hourFrom + 1)}:${pad((k * 25) % 60)}`,
           withKm ? Math.round((distance / opCount) * 10) / 10 : 0,
           ['LOAD', 'UNLOAD'].includes(svc) ? 'Aviayuk' : '',
           ['LOAD', 'UNLOAD'].includes(svc) ? Math.round((1.5 + ((day + k) % 18)) * 10) / 10 : 0,
           withFlight ? fl[0] : '', withFlight ? fl[1] : '', withFlight ? fl[2] : '',
           withFlight ? String(1 + ((day + vi + k) % 24)) : '',
           serviceId(svc), v.zone_id,
           ['ULD', 'LOAD', 'UNLOAD'].includes(svc) ? 2 + ((day + vi + k) % 9) : 0,
           svc === 'PAX' ? 40 + ((day * 7 + k * 13) % 140) : 0,
           withHours ? Math.round((hours / opCount) * 10) / 10 : 0]
        );
      }

      // ---------------------- Yoqilg'i va yopish ----------------------
      const winterK = winter ? 1 + v.winter_pct / 100 : 1;
      const norm = r2(((distance / 100) * v.norm_per_100km + hours * v.norm_engine_hour) * winterK);

      let issued = 0;
      const needed = norm * 1.2;
      if (fuelStart < needed || day % 3 === 1) {
        const cap = v.tank_capacity > 0 ? v.tank_capacity * 0.85 : needed * 3;
        const target = Math.min(cap, fuelStart + needed * 2.5);
        issued = Math.max(5, Math.round((target - fuelStart) * 10) / 10);
        const price = get<{ price: number }>('SELECT price FROM fuel_types WHERE id = ?', [v.fuel_type_id])?.price ?? 11200;
        run(
          `INSERT INTO fuel_issues (branch_id, date, vehicle_id, driver_id, waybill_id, fuel_type_id,
             liters, price, amount, source, station, doc_no, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`,
          [branchId, date, v.id, driver.id, wbId, v.fuel_type_id, issued, price, r2(issued * price),
           v.power_type === 'electric' ? 'ombor' : 'azs',
           v.power_type === 'electric' ? 'Zaryadlash stansiyasi' : stations[(day + vi) % stations.length],
           `${pad(day)}${pad(month)}-${v.garage_no}`]
        );
      }

      // Gibrid texnika: batareya alohida zaryadlanadi va alohida hisoblanadi
      const charge2Start = v.fuel_balance2;
      let issued2 = 0;
      const norm2 = v.fuel_type2_id
        ? r2(((distance / 100) * v.norm2_per_100km + hours * v.norm2_engine_hour) * winterK) : 0;
      if (v.fuel_type2_id) {
        const needed2 = norm2 * 1.2;
        if (charge2Start < needed2 || day % 2 === 0) {
          const cap2 = v.tank_capacity2 > 0 ? v.tank_capacity2 * 0.9 : needed2 * 3;
          const target2 = Math.min(cap2, charge2Start + needed2 * 2);
          issued2 = Math.max(1, Math.round((target2 - charge2Start) * 10) / 10);
          const price2 = get<{ price: number }>('SELECT price FROM fuel_types WHERE id = ?', [v.fuel_type2_id])?.price ?? 450;
          run(
            `INSERT INTO fuel_issues (branch_id, date, vehicle_id, driver_id, waybill_id, fuel_type_id,
               liters, price, amount, source, station, doc_no, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,'ombor','Zaryadlash stansiyasi',?,1)`,
            [branchId, date, v.id, driver.id, wbId, v.fuel_type2_id, issued2, price2, r2(issued2 * price2),
             `${pad(day)}${pad(month)}-${v.garage_no}-E`]
          );
        }
      }

      const drift = 1 + (((day * 13 + vi * 29) % 17) - 8) / 100;
      const fuelEnd = Math.max(0, r2(fuelStart + issued - norm * drift));
      const fuel2End = v.fuel_type2_id
        ? Math.max(0, r2(charge2Start + issued2 - norm2 * drift)) : null;

      run(`UPDATE waybills SET odo_end = ?, hours_end = ?, fuel_end = ?, fuel2_end = ?, status = 'closed',
             closed_at = datetime('now'), closed_by = 1 WHERE id = ?`,
          [odoStart + distance, withHours ? r2(hoursStart + hours) : null, fuelEnd, fuel2End, wbId]);
      recalcVehicle(v.id);
    }
  }
}
