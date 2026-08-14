// Boshlang'ich ma'lumotlar: tashkilot, yoqilg'i turlari, aeroport spravochniklari, admin.
// Har safar xavfsiz ishlaydi — mavjud yozuvlarni takrorlamaydi.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, run, all } from './db.js';
import { hashPassword } from './auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const catalog = JSON.parse(fs.readFileSync(path.join(here, 'catalog.json'), 'utf8'));

// Filiallar — O'zbekiston aeroportlari (IATA kodi bo'yicha)
const BRANCHES = [
  ['TAS', 'Toshkent xalqaro aeroporti',   'Международный аэропорт Ташкент'],
  ['SKD', 'Samarqand xalqaro aeroporti',  'Международный аэропорт Самарканд'],
  ['BHK', 'Buxoro xalqaro aeroporti',     'Международный аэропорт Бухара'],
  ['KSQ', 'Qarshi aeroporti',             'Аэропорт Карши'],
];

export function seed({ demo = false, log = () => {} } = {}) {
  for (const [code, uz, ru] of BRANCHES) {
    if (!get('SELECT id FROM branches WHERE code = ?', [code])) {
      run('INSERT INTO branches (code, name_uz, name_ru) VALUES (?,?,?)', [code, uz, ru]);
    }
  }

  if (!get('SELECT id FROM org WHERE id = 1')) {
    run(
      `INSERT INTO org (id, name, inn, address, phone, director, mechanic)
       VALUES (1, ?, '', '', '', '', '')`,
      ['Xalqaro aeroport']
    );
    log('• Tashkilot yozuvi yaratildi');
  }

  const fuels = [
    ['AI80',   'AI-80 benzin',    'Бензин АИ-80',   'l', 'л'],
    ['AI91',   'AI-91 benzin',    'Бензин АИ-91',   'l', 'л'],
    ['AI92',   'AI-92 benzin',    'Бензин АИ-92',   'l', 'л'],
    ['AI95',   'AI-95 benzin',    'Бензин АИ-95',   'l', 'л'],
    ['DT',     'Dizel yoqilg\'isi', 'Дизельное топливо', 'l', 'л'],
    ['METAN',  'Siqilgan gaz (metan)', 'Метан (СПГ)', 'm³', 'м³'],
    ['PROPAN', 'Suyultirilgan gaz (propan)', 'Пропан (СУГ)', 'l', 'л'],
    // Aeroport texnikasi uchun qo'shimcha turlar
    ['ELEKTR', 'Elektr energiya', 'Электроэнергия', 'kVt·s', 'кВт·ч'],
    ['TS1',    'Aviakerosin TS-1', 'Авиакеросин ТС-1', 'l', 'л'],
    ['JETA1',  'Aviakerosin Jet A-1', 'Авиакеросин Jet A-1', 'l', 'л'],
  ];
  for (const [code, uz, ru, uUz, uRu] of fuels) {
    if (!get('SELECT id FROM fuel_types WHERE code = ?', [code])) {
      run(
        'INSERT INTO fuel_types (code, name_uz, name_ru, unit_uz, unit_ru) VALUES (?,?,?,?,?)',
        [code, uz, ru, uUz, uRu]
      );
    }
  }

  // ----------------------- Aeroport spravochniklari -----------------------
  for (const z of catalog.zones) {
    if (!get('SELECT id FROM zones WHERE code = ?', [z.code])) {
      run('INSERT INTO zones (code, name_uz, name_ru) VALUES (?,?,?)', [z.code, z.uz, z.ru]);
    }
  }
  for (const s of catalog.services) {
    if (!get('SELECT id FROM service_types WHERE code = ?', [s.code])) {
      run('INSERT INTO service_types (code, name_uz, name_ru, unit) VALUES (?,?,?,?)',
          [s.code, s.uz, s.ru, s.unit]);
    }
  }
  for (const c of catalog.categories) {
    if (!get('SELECT id FROM equipment_categories WHERE code = ?', [c.code])) {
      run(
        `INSERT INTO equipment_categories (code, name_uz, name_ru, group_code, norm_basis,
           default_norm_km, default_norm_hour) VALUES (?,?,?,?,?,?,?)`,
        [c.code, c.uz, c.ru, c.group, c.basis, c.km, c.hour]
      );
    }
  }
  log(`• Spravochniklar: ${all('SELECT id FROM equipment_categories').length} texnika turkumi, `
    + `${all('SELECT id FROM zones').length} zona, ${all('SELECT id FROM service_types').length} xizmat turi`);

  if (!get('SELECT id FROM users LIMIT 1')) {
    // branch_id = NULL → bosh ofis: barcha filiallarni ko'radi
    run(
      'INSERT INTO users (username, full_name, password_hash, role, branch_id) VALUES (?,?,?,?,NULL)',
      ['admin', 'Bosh ofis administratori', hashPassword('admin'), 'admin']
    );
    // Har bir filial uchun administrator: tas / skd / bhk / ksq, parol — login bilan bir xil
    for (const [code, uz] of BRANCHES) {
      const b = get('SELECT id FROM branches WHERE code = ?', [code]);
      run(
        'INSERT INTO users (username, full_name, password_hash, role, branch_id) VALUES (?,?,?,?,?)',
        [code.toLowerCase(), `${uz} — administrator`, hashPassword(code.toLowerCase()), 'admin', b.id]
      );
    }
    log('• Foydalanuvchilar: admin/admin (bosh ofis) va tas, skd, bhk, ksq (filiallar)');
  }

  if (demo && !get('SELECT id FROM vehicles LIMIT 1')) {
    // Toshkent — to'liq park, qolgan aeroportlar kichikroq
    const size = { TAS: 44, SKD: 20, BHK: 14, KSQ: 9 };
    for (const [code] of BRANCHES) {
      const b = get('SELECT id FROM branches WHERE code = ?', [code]);
      seedFleet(b.id, size[code]);
    }
    log(`• Namuna park: ${all('SELECT id FROM vehicles').length} texnika, `
      + `${all('SELECT id FROM drivers').length} xodim, ${BRANCHES.length} filial`);
  }
}

/**
 * Namuna texnika parki va xodimlar.
 * @param branchId  qaysi filialga
 * @param limit     nechta birlik (ro'yxat boshidan)
 */
export function seedFleet(branchId = 1, limit = 99) {
  const catId = (code) => get('SELECT id FROM equipment_categories WHERE code = ?', [code])?.id ?? null;
  const zoneId = (code) => get('SELECT id FROM zones WHERE code = ?', [code])?.id ?? null;
  const fuelId = (code) => get('SELECT id FROM fuel_types WHERE code = ?', [code])?.id ?? null;

  // [garaj, raqam, rusum, turkum, zona, yoqilg'i, bak, init_odo, init_hours, init_fuel, yil, gibrid?]
  // gibrid = [ikkinchi manba kodi, sig'imi, norma/100km, norma/motosoat, boshlang'ich zaryad]
  const HY_DEICER = ['ELEKTR', 90, 0, 6, 62];   // elektr yuritmali deicer
  const HY_CAR    = ['ELEKTR', 18, 6.5, 0, 12]; // gibrid yengil avtomobil
  const fleet = [
    ['GSE-01', '10 A 001 AP', 'Goldhofer AST-1X',        'PUSHBACK',   'APRON', 'DT',     240, 18400,  6120, 120, 2019],
    ['GSE-02', '10 A 002 AP', 'TLD TMX-150',             'PUSHBACK',   'APRON', 'DT',     200, 22150,  7340,  95, 2017],
    ['GSE-03', '—',           'TLD GPU-4090',            'GPU',        'APRON', 'DT',     150,     0,  9880,  70, 2018],
    ['GSE-04', '—',           'GUINAULT ASU-600',        'ASU',        'APRON', 'DT',     180,     0,  4210,  85, 2020],
    ['GSE-05', '—',           'TLD ACU-302',             'ACU',        'APRON', 'DT',     160,     0,  3760,  60, 2021],
    ['GSE-06', '10 A 006 AP', 'Vestergaard Elephant BETA e-drive','DEICER','APRON','DT',  400,  9120,  2480, 210, 2020, HY_DEICER],
    ['GSE-07', '10 A 007 AP', 'Mercedes Actros TZ-60',   'REFUELLER',  'APRON', 'DT',     300, 41250,  5610, 140, 2016],
    ['GSE-08', '10 A 008 AP', 'Kamaz AC-45 hydrant',     'HYDRANT',    'APRON', 'DT',     250, 33800,  4950, 115, 2018],
    ['GSE-09', '10 A 009 AP', 'Mallaghan CT6000',        'CATERING',   'APRON', 'DT',     180, 15600,  3120,  80, 2019],
    ['GSE-10', '10 A 010 AP', 'Mallaghan LS500 lavatory','LAVATORY',   'APRON', 'DT',     120, 12480,  2140,  55, 2019],
    ['GSE-11', '10 A 011 AP', 'Mallaghan WS400 water',   'WATER',      'APRON', 'DT',     120, 11350,  1980,  50, 2019],
    ['GSE-12', '10 A 012 AP', 'Toyota RAV4 Hybrid (Follow me)','FOLLOWME','APRON','AI92',  55, 64200,     0,  45, 2021, HY_CAR],
    ['GSE-13', '10 A 013 AP', 'Mallaghan PS150',         'AIRSTAIRS',  'APRON', 'DT',     100,  8760,  1520,  42, 2020],

    ['GSE-14', '10 B 014 AP', 'Cobus 3000',              'APRONBUS',   'TERMINAL','DT',   250, 96400,     0, 130, 2015],
    ['GSE-15', '10 B 015 AP', 'Cobus 2700S',             'APRONBUS',   'TERMINAL','DT',   250, 78900,     0, 118, 2017],
    ['GSE-16', '10 B 016 AP', 'Mallaghan AL2000',        'AMBULIFT',   'TERMINAL','DT',   140, 10250,  1340,  62, 2020],
    ['GSE-17', '10 B 017 AP', 'Mercedes Sprinter',       'CREWBUS',    'TERMINAL','DT',    75, 142300,    0,  38, 2018],

    ['CRG-01', '—',           'TLD MDL-7000 main deck',  'MAINDECK',   'CARGO', 'DT',     220,     0,  5280, 105, 2018],
    ['CRG-02', '—',           'TLD MDL-7000 main deck',  'MAINDECK',   'CARGO', 'DT',     220,     0,  4870,  98, 2019],
    ['CRG-03', '10 C 003 CG', 'Mallaghan BL200 belt',    'BELTLOADER', 'CARGO', 'DT',      90,  6420,  2310,  40, 2020],
    ['CRG-04', '10 C 004 CG', 'Mallaghan BL200 belt',    'BELTLOADER', 'CARGO', 'DT',      90,  5980,  2180,  38, 2020],
    ['CRG-05', '—',           'Toyota 8FD30 (3 t)',      'FORKLIFT_D', 'CARGO', 'DT',      70,     0,  7640,  32, 2017],
    ['CRG-06', '—',           'Toyota 8FD50 (5 t)',      'FORKLIFT_D', 'CARGO', 'DT',      95,     0,  6210,  45, 2018],
    ['CRG-07', '—',           'Komatsu FG25 (2,5 t)',    'FORKLIFT_G', 'CARGO', 'PROPAN',  60,     0,  8120,  28, 2016],
    ['CRG-08', '—',           'Linde E30 (3 t)',         'FORKLIFT_E', 'CARGO', 'ELEKTR',   0,     0,  4380,   0, 2021],
    ['CRG-09', '—',           'Linde E16 (1,6 t)',       'FORKLIFT_E', 'CARGO', 'ELEKTR',   0,     0,  3950,   0, 2021],
    ['CRG-10', '—',           'Jungheinrich ETV 216',    'REACHTRUCK', 'CARGO', 'ELEKTR',   0,     0,  2870,   0, 2022],
    ['CRG-11', '—',           'Jungheinrich EJC 112',    'STACKER',    'CARGO', 'ELEKTR',   0,     0,  1940,   0, 2022],
    ['CRG-12', '—',           'BT LWE180 transpaleta',   'PALLETTRUCK','CARGO', 'ELEKTR',   0,     0,  1260,   0, 2022],
    ['CRG-13', '10 C 013 CG', 'Charlatte T135 tractor',  'BAGTRACTOR', 'CARGO', 'DT',      60, 24800,  1820,  26, 2019],
    ['CRG-14', '10 C 014 CG', 'Charlatte T135 tractor',  'BAGTRACTOR', 'CARGO', 'DT',      60, 21350,  1640,  24, 2019],
    ['CRG-15', '10 C 015 CG', 'Isuzu NQR 71 (yuk)',      'CARGOTRUCK', 'CARGO', 'DT',     100, 145200,    0,  55, 2018],
    ['CRG-16', '—',           'Kalmar DRF450 richstacker','REACHSTACK','CARGO', 'DT',     360,     0,  3410, 170, 2017],

    ['AFD-01', '10 D 001 AF', 'Bucher CityCat sweeper',  'SWEEPER',    'RUNWAY','DT',     180, 18900,  3240,  85, 2018],
    ['AFD-02', '10 D 002 AF', 'Schmidt TJS-630 (VPP)',   'RWSWEEPER',  'RUNWAY','DT',     400, 12600,  2980, 190, 2019],
    ['AFD-03', '10 D 003 AF', 'Rosenbauer Panther 6x6',  'FIRETRUCK',  'RUNWAY','DT',     600,  8400,  1120, 290, 2020],
    ['AFD-04', '10 D 004 AF', 'MAN TGS qor tozalagich',  'SNOWPLOUGH', 'RUNWAY','DT',     350, 15200,  2460, 165, 2016],
    ['AFD-05', '10 D 005 AF', 'Mercedes Sprinter (tez yordam)','AMBULANCE','TERMINAL','DT',75, 68300,     0,  36, 2019],
    ['AFD-06', '10 D 006 AF', 'ASFT T-10 friction tester','FRICTION',  'RUNWAY','AI92',    80, 42100,     0,  38, 2018],
    ['AFD-07', '—',           'Caterpillar 428 loader',  'LOADER',     'HANGAR','DT',     130,     0,  5620,  60, 2017],
    ['AFD-08', '—',           'FG Wilson P110 generator','GENERATOR',  'HANGAR','DT',     200,     0,  6940,  95, 2015],

    ['SVC-01', '10 E 001 SV', 'Toyota Corolla Hybrid',   'CAR',        'CITY',  'AI92',    43, 88300,     0,  20, 2021, HY_CAR],
    ['SVC-02', '10 E 002 SV', 'Chevrolet Damas',         'MINIBUS',    'CITY',  'AI92',    35, 62740,     0,  16, 2020],
    ['SVC-03', '10 E 003 SV', 'Isuzu texnik xizmat',     'SERVICEVAN', 'HANGAR','DT',      90, 51200,     0,  42, 2019],
  ];

  // Filiallar bir-biriga o'xshamasligi uchun hisoblagichlar biroz farqlanadi
  const k = 0.7 + (branchId % 5) * 0.15;
  const r0 = (n) => Math.round(n * k);

  for (const [garage, plate, model, cat, zone, fuel, tank, odo, hours, fuelBal, year, hy] of fleet.slice(0, limit)) {
    const c = get('SELECT * FROM equipment_categories WHERE code = ?', [cat]);
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

  const staff = [
    ['Karimov Alisher Baxtiyorovich',  '101', 'AB1234567', '+998 90 123-45-67', 'B, C',    'driver',   'AP-1042'],
    ['Rasulov Sardor Ilhomovich',      '102', 'AB7654321', '+998 91 234-56-78', 'B, C, E', 'driver',   'AP-1043'],
    ['Yusupov Jasur Nodirovich',       '103', 'AB1112223', '+998 93 345-67-89', 'B',       'operator', 'AP-1044'],
    ['Ergashev Doniyor Shavkatovich',  '104', 'AB4445556', '+998 94 456-78-90', 'B, C',    'operator', 'AP-1045'],
    ['Tursunov Bekzod Anvarovich',     '105', 'AB7778889', '+998 97 567-89-01', 'C, D',    'driver',   'AP-1046'],
    ['Nazarov Otabek Farhodovich',     '106', 'AB2223334', '+998 99 678-90-12', 'B, C',    'operator', 'AP-1047'],
    ['Sobirov Rustam Qodirovich',      '107', 'AB5556667', '+998 90 789-01-23', 'C, E',    'driver',   'AP-1048'],
    ['Xolmatov Sanjar Ulug\'bekovich', '108', 'AB8889990', '+998 91 890-12-34', 'B',       'operator', 'AP-1049'],
    ['Abdullayev Shohruh Baxodirovich','109', 'AB3334445', '+998 93 901-23-45', 'C',       'mechanic', 'AP-1050'],
    ['Qosimov Aziz Tolibovich',        '110', 'AB6667778', '+998 94 012-34-56', 'B, C',    'loader',   'AP-1051'],
  ];
  const staffCount = Math.max(4, Math.round(staff.length * Math.min(1, limit / 44)));
  for (const [name, tab, lic, phone, cls, pos, permit] of staff.slice(0, staffCount)) {
    run(
      `INSERT INTO drivers (branch_id, full_name, tab_no, license_no, phone, class, position, apron_permit)
       VALUES (?,?,?,?,?,?,?,?)`,
      [branchId, name, `${branchId}${tab}`, lic, phone, cls, pos, permit]
    );
  }
}

// `npm run seed` orqali to'g'ridan-to'g'ri ishga tushirish
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed({ demo: process.argv.includes('--demo'), log: (m) => console.log(m) });
  console.log('Tayyor.');
}
