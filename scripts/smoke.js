// Uchidan-uchiga tekshiruv: varaqa ochish → yoqilg'i quyish → yopish → hisob-kitob.
// Ishlatish:  node scripts/smoke.js   (server 3000-portda ishlab turishi kerak)
const BASE = process.env.GSM_URL || 'http://localhost:3000';
let token = '';
let failed = 0;

async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${data.error || ''}`);
  return data;
}

function check(label, actual, expected) {
  const ok = Math.abs(Number(actual) - Number(expected)) < 0.011;
  console.log(`${ok ? '  OK  ' : ' XATO '} ${label}: ${actual}${ok ? '' : ` (kutilgan ${expected})`}`);
  if (!ok) failed++;
}

const run = async () => {
  ({ token } = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin' }));
  console.log('Kirish muvaffaqiyatli\n');

  // Sinov uchun alohida avtomobil va haydovchi
  const stamp = Date.now().toString().slice(-6);
  const fuelTypes = await api('GET', '/api/fuel-types');
  const dt = fuelTypes.find((f) => f.code === 'DT');

  const vehicle = await api('POST', '/api/vehicles', {
    garage_no: `T-${stamp}`, plate: `01 T ${stamp}`, model: 'Sinov avtomobili',
    fuel_type_id: dt.id, tank_capacity: 200, norm_per_100km: 18, winter_pct: 10,
    norm_engine_hour: 2, norm_per_ton_km: 1.3, init_odometer: 145200, init_fuel: 40,
  });
  const driver = await api('POST', '/api/drivers', { full_name: `Sinov Haydovchi ${stamp}`, tab_no: stamp });
  check('Boshlang\'ich spidometr', vehicle.odometer, 145200);
  check('Boshlang\'ich bak qoldig\'i', vehicle.fuel_balance, 40);

  // 1) Varaqa ochish
  const wb = await api('POST', '/api/waybills', {
    vehicle_id: vehicle.id, driver_id: driver.id, date_from: '2026-08-13',
    odo_start: 145200, fuel_start: 40, winter: 0, task: 'Sinov reysi',
    routes: [{ point_from: 'Baza', point_to: 'Ombor', distance_km: 300, time_out: '08:00', time_in: '17:00' }],
  });
  console.log(`\nVaraqa № ${wb.number} ochildi (status: ${wb.status})`);

  // 2) Yoqilg'i quyish — 100 l, 9 500 so'm/l
  await api('POST', '/api/fuel', {
    date: '2026-08-13', vehicle_id: vehicle.id, waybill_id: wb.id,
    fuel_type_id: dt.id, liters: 100, price: 9500, source: 'azs', station: 'UzGasOil',
  });

  // 3) Yopish: 300 km yurdi, bakda 85 l qoldi
  const closed = await api('POST', `/api/waybills/${wb.id}/close`, { odo_end: 145500, fuel_end: 85 });

  console.log('\n— Yopilgan varaqa hisob-kitobi —');
  check('Masofa, km', closed.distance_km, 300);            // 145500 − 145200
  check('Quyilgan, l', closed.fuel_issued, 100);
  check('Norma bo\'yicha, l', closed.norm_liters, 54);      // 300/100 × 18
  check('Haqiqiy sarf, l', closed.fact_liters, 55);         // 40 + 100 − 85
  check('Farq (ortiqcha sarf), l', closed.deviation, 1);

  const v2 = await api('GET', `/api/vehicles/${vehicle.id}`);
  console.log('\n— Avtomobil holati yangilandi —');
  check('Joriy spidometr', v2.odometer, 145500);
  check('Joriy bak qoldig\'i', v2.fuel_balance, 85);

  // 4) Qishki ustama tekshiruvi: aynan shu varaqani qishki rejimga o'tkazamiz
  await api('PUT', `/api/waybills/${wb.id}`, {
    ...closed, winter: 1, odo_end: 145500, fuel_end: 85,
    vehicle_id: vehicle.id, driver_id: driver.id,
  });
  const winterWb = await api('GET', `/api/waybills/${wb.id}`);
  console.log('\n— Qishki ustama (+10%) —');
  check('Norma bo\'yicha, l', winterWb.norm_liters, 59.4);  // 54 × 1.1

  // 5) Varaqani qayta ochish → avtomobil holati orqaga qaytadi
  await api('POST', `/api/waybills/${wb.id}/reopen`);
  const v3 = await api('GET', `/api/vehicles/${vehicle.id}`);
  console.log('\n— Qayta ochilgandan keyin —');
  check('Spidometr boshlang\'ichga qaytdi', v3.odometer, 145200);
  check('Qoldiq = boshlang\'ich + quyilgan', v3.fuel_balance, 140);   // 40 + 100

  // 6) Hisobot
  const rep = await api('GET', '/api/reports/vehicles?from=2026-08-01&to=2026-08-31');
  console.log(`\nHisobotda ${rep.rows.length} ta avtomobil, jami quyilgan: ${rep.totals.issued_liters} l`);

  // ------------------- 7) Gibrid texnika: ikkita manba -------------------
  const el = fuelTypes.find((f) => f.code === 'ELEKTR');
  const hyb = await api('POST', '/api/vehicles', {
    garage_no: `H-${stamp}`, plate: `01 H ${stamp}`, model: 'Sinov gibrid',
    fuel_type_id: dt.id, tank_capacity: 60, norm_per_100km: 6, winter_pct: 10,
    fuel_type2_id: el.id, tank_capacity2: 20, norm2_per_100km: 8,
    init_odometer: 10000, init_fuel: 30, init_fuel2: 10,
  });
  console.log('\n— Gibrid texnika —');
  check('Quvvat manbai gibridga o\'tdi', hyb.power_type === 'hybrid' ? 1 : 0, 1);
  check('Bak qoldig\'i, l', hyb.fuel_balance, 30);
  check('Batareya qoldig\'i, kVt·s', hyb.fuel_balance2, 10);

  const hw = await api('POST', '/api/waybills', {
    vehicle_id: hyb.id, driver_id: driver.id, date_from: '2026-08-13',
    odo_start: 10000, fuel_start: 30, fuel2_start: 10, winter: 0, task: 'Gibrid sinovi',
  });
  check('Varaqada zaryad qoldig\'i', hw.fuel2_start, 10);

  // Ikkala manbaga alohida quyish: 20 l dizel va 15 kVt·s zaryad
  await api('POST', '/api/fuel', {
    date: '2026-08-13', vehicle_id: hyb.id, waybill_id: hw.id,
    fuel_type_id: dt.id, liters: 20, price: 9500, source: 'azs',
  });
  await api('POST', '/api/fuel', {
    date: '2026-08-13', vehicle_id: hyb.id, waybill_id: hw.id,
    fuel_type_id: el.id, liters: 15, price: 450, source: 'ombor', station: 'Zaryadlash stansiyasi',
  });
  const hOpen = await api('GET', `/api/waybills/${hw.id}`);
  check('Quyilgan yoqilg\'i, l', hOpen.fuel_issued, 20);
  check('Quyilgan zaryad, kVt·s', hOpen.fuel2_issued, 15);

  // Yopish: 200 km, bakda 38 l, batareyada 9 kVt·s
  const hClosed = await api('POST', `/api/waybills/${hw.id}/close`, {
    odo_end: 10200, fuel_end: 38, fuel2_end: 9,
  });
  check('Norma (yoqilg\'i), l', hClosed.norm_liters, 12);        // 200/100 × 6
  check('Fakt (yoqilg\'i), l', hClosed.fact_liters, 12);         // 30 + 20 − 38
  check('Norma (zaryad), kVt·s', hClosed.norm2_liters, 16);      // 200/100 × 8
  check('Fakt (zaryad), kVt·s', hClosed.fact2_liters, 16);       // 10 + 15 − 9
  check('Farq (zaryad)', hClosed.deviation2, 0);

  const hv = await api('GET', `/api/vehicles/${hyb.id}`);
  check('Bak qoldig\'i yangilandi', hv.fuel_balance, 38);
  check('Batareya qoldig\'i yangilandi', hv.fuel_balance2, 9);

  // Yot yoqilg'i turi gibridga tushmasligi kerak
  const ai = fuelTypes.find((f) => f.code === 'AI92');
  let rejected = 0;
  try {
    await api('POST', '/api/fuel', {
      date: '2026-08-13', vehicle_id: hyb.id, fuel_type_id: ai.id, liters: 5, price: 10000,
    });
  } catch { rejected = 1; }
  check('Begona yoqilg\'i turi rad etildi', rejected, 1);

  // Tozalash
  await api('DELETE', `/api/waybills/${wb.id}`);
  await api('DELETE', `/api/waybills/${hw.id}`);
  for (const id of [vehicle.id, hyb.id]) {
    const list = await api('GET', `/api/fuel?vehicle_id=${id}`);
    for (const f of list.rows) await api('DELETE', `/api/fuel/${f.id}`);
    await api('DELETE', `/api/vehicles/${id}`);
  }
  await api('DELETE', `/api/drivers/${driver.id}`);

  console.log(failed ? `\n${failed} ta tekshiruv muvaffaqiyatsiz.` : '\nBarcha tekshiruvlar muvaffaqiyatli o\'tdi.');
  process.exit(failed ? 1 : 0);
};

run().catch((err) => { console.error('XATOLIK:', err.message); process.exit(1); });
