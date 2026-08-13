// Namuna ma'lumotlar: joriy oy uchun yo'l varaqalari va yoqilg'i quyishlari.
// Ishlatish:  node scripts/demo-data.js     (server ishlab turishi kerak)
const BASE = process.env.GSM_URL || 'http://localhost:3000';
let token = '';

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

const pad = (n) => String(n).padStart(2, '0');

async function main() {
  ({ token } = await api('POST', '/api/auth/login', {
    username: process.env.GSM_USER || 'admin',
    password: process.env.GSM_PASS || 'admin',
  }));

  const vehicles = await api('GET', '/api/vehicles?active=1');
  const drivers = await api('GET', '/api/drivers?active=1');
  if (!vehicles.length || !drivers.length) {
    console.log('Avval avtomobil va haydovchi qo\'shing (GSM_DEMO=1 bilan ishga tushiring).');
    return;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastDay = Math.min(now.getDate(), daysInMonth);

  const stations = ['UzGasOil', 'Neftgaz AZS', 'Sardor Petrol', 'Ombor'];
  let created = 0;

  for (let day = 1; day <= lastDay; day++) {
    const date = `${year}-${pad(month)}-${pad(day)}`;
    const dow = new Date(year, month - 1, day).getDay();
    if (dow === 0) continue;                       // yakshanba — dam olish

    for (let vi = 0; vi < vehicles.length; vi++) {
      if ((day + vi) % 3 === 0) continue;          // har bir mashina har kuni chiqmaydi

      const vehicle = await api('GET', `/api/vehicles/${vehicles[vi].id}`);
      const driver = drivers[(day + vi) % drivers.length];
      const defaults = await api('GET', `/api/waybills/defaults?vehicle_id=${vehicle.id}&date=${date}`);

      // Kunlik masofa: 60…260 km oralig'ida, takrorlanuvchi (tasodifsiz) tarzda
      const distance = 60 + ((day * 37 + vi * 53) % 200);
      const wb = await api('POST', '/api/waybills', {
        ...defaults,
        vehicle_id: vehicle.id,
        driver_id: driver.id,
        date_from: date,
        date_to: date,
        task: ['Yuk tashish', 'Xizmat safari', 'Ta\'minot', 'Filialga yetkazish'][(day + vi) % 4],
        routes: [{
          point_from: 'Baza', point_to: ['Ombor', 'Filial', 'Zavod', 'Bozor'][(day + vi) % 4],
          time_out: '08:00', time_in: '17:30', distance_km: distance, cargo: 'Aralash yuk',
          cargo_ton: (day % 5) + 1,
        }],
      });

      const norm = (distance / 100) * wb.norm_per_100km * (wb.winter ? 1 + wb.winter_pct / 100 : 1);

      // Bakdagi qoldiq reysga yetmasa yoki navbatdagi kun kelsa — yoqilg'i quyiladi
      let issued = 0;
      const needed = norm * 1.2;
      if (wb.fuel_start < needed || day % 3 === 1) {
        const target = Math.min(vehicle.tank_capacity * 0.85, wb.fuel_start + needed * 2.5);
        issued = Math.max(20, Math.round((target - wb.fuel_start) * 10) / 10);
        await api('POST', '/api/fuel', {
          date, vehicle_id: vehicle.id, waybill_id: wb.id, driver_id: driver.id,
          fuel_type_id: vehicle.fuel_type_id, liters: issued,
          price: vehicle.fuel_code === 'DT' ? 11200 : 12400,
          source: 'azs', station: stations[(day + vi) % stations.length],
          doc_no: `${pad(day)}${pad(month)}-${vehicle.garage_no}`,
        });
      }

      // Yopish: fakt sarf normadan ±8% chetlanadi
      const drift = 1 + (((day * 13 + vi * 29) % 17) - 8) / 100;
      const fact = norm * drift;
      const fuelEnd = Math.round((wb.fuel_start + issued - fact) * 100) / 100;

      await api('POST', `/api/waybills/${wb.id}/close`, {
        odo_end: wb.odo_start + distance,
        fuel_end: Math.max(0, fuelEnd),
      });
      created++;
    }
  }

  console.log(`${created} ta yo'l varaqasi yaratildi va yopildi (${year}-${pad(month)}).`);
}

main().catch((e) => { console.error('XATOLIK:', e.message); process.exit(1); });
