// Boshlang'ich ma'lumotlar: tashkilot, yoqilg'i turlari, admin foydalanuvchi.
// Har safar xavfsiz ishlaydi — mavjud yozuvlarni takrorlamaydi.
import { get, run, all } from './db.js';
import { hashPassword } from './auth.js';

export function seed({ demo = false, log = () => {} } = {}) {
  if (!get('SELECT id FROM org WHERE id = 1')) {
    run(
      `INSERT INTO org (id, name, inn, address, phone, director, mechanic)
       VALUES (1, ?, '', '', '', '', '')`,
      ['Tashkilot nomi']
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
  ];
  for (const [code, uz, ru, uUz, uRu] of fuels) {
    if (!get('SELECT id FROM fuel_types WHERE code = ?', [code])) {
      run(
        'INSERT INTO fuel_types (code, name_uz, name_ru, unit_uz, unit_ru) VALUES (?,?,?,?,?)',
        [code, uz, ru, uUz, uRu]
      );
    }
  }
  log(`• Yoqilg'i turlari: ${all('SELECT id FROM fuel_types').length} ta`);

  if (!get('SELECT id FROM users LIMIT 1')) {
    run(
      'INSERT INTO users (username, full_name, password_hash, role) VALUES (?,?,?,?)',
      ['admin', 'Administrator', hashPassword('admin'), 'admin']
    );
    log('• Admin yaratildi — login: admin / parol: admin  (albatta o\'zgartiring!)');
  }

  if (demo && !get('SELECT id FROM vehicles LIMIT 1')) {
    const dt = get('SELECT id FROM fuel_types WHERE code = ?', ['DT']).id;
    const ai92 = get('SELECT id FROM fuel_types WHERE code = ?', ['AI92']).id;
    const demoVehicles = [
      ['01', '01 A 123 BC', 'Isuzu NQR 71', dt,   100, 18.0, 10, 2.5, 0, 145200, 40],
      ['02', '01 B 456 CD', 'Chevrolet Cobalt', ai92, 44, 7.8, 10, 0,   0, 88300, 20],
      ['03', '01 C 789 DE', 'GAZ-3307',      ai92, 105, 24.5, 10, 0,   2.0, 210500, 55],
    ];
    for (const v of demoVehicles) {
      run(
        `INSERT INTO vehicles (garage_no, plate, model, fuel_type_id, tank_capacity,
                               norm_per_100km, winter_pct, norm_engine_hour, norm_per_ton_km,
                               init_odometer, init_fuel, odometer, fuel_balance)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [...v, v[9], v[10]]
      );
    }
    const demoDrivers = [
      ['Karimov Alisher Baxtiyorovich', '101', 'AB1234567', '+998 90 123-45-67', 'B, C'],
      ['Rasulov Sardor Ilhomovich',      '102', 'AB7654321', '+998 91 234-56-78', 'B, C, E'],
      ['Yusupov Jasur Nodirovich',       '103', 'AB1112223', '+998 93 345-67-89', 'B'],
    ];
    for (const d of demoDrivers) {
      run('INSERT INTO drivers (full_name, tab_no, license_no, phone, class) VALUES (?,?,?,?,?)', d);
    }
    log('• Namuna avtomobil va haydovchilar qo\'shildi');
  }
}

// `npm run seed` orqali to'g'ridan-to'g'ri ishga tushirish
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed({ demo: process.argv.includes('--demo'), log: (m) => console.log(m) });
  console.log('Tayyor.');
}
