// Namuna ma'lumotlar: aeroport texnikasi uchun smena varaqalari, reysga xizmat
// operatsiyalari va yoqilg'i quyishlari.
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

// Turkum → tipik xizmat turlari
const SERVICE_BY_CATEGORY = {
  PUSHBACK: ['PUSHBACK', 'TOW'], TOWBARLESS: ['TOW', 'PUSHBACK'],
  GPU: ['GPU'], ASU: ['ASU'], ACU: ['ACU'], DEICER: ['DEICE'],
  REFUELLER: ['REFUEL'], HYDRANT: ['REFUEL'],
  CATERING: ['CATERING'], LAVATORY: ['LAV'], WATER: ['WATER'],
  AIRSTAIRS: ['STAIRS'], PAXSTAIRS: ['STAIRS'], AIRCLEAN: ['CLEAN'],
  APRONBUS: ['PAX'], CREWBUS: ['PAX'], AMBULIFT: ['PAX'], FOLLOWME: ['PATROL'],
  MAINDECK: ['LOAD', 'UNLOAD'], BELTLOADER: ['LOAD', 'UNLOAD'], SLAVELOADER: ['ULD'],
  FORKLIFT_D: ['LOAD', 'UNLOAD'], FORKLIFT_G: ['LOAD', 'UNLOAD'], FORKLIFT_E: ['LOAD', 'UNLOAD'],
  REACHTRUCK: ['ULD'], STACKER: ['ULD'], PALLETTRUCK: ['ULD'], REACHSTACK: ['ULD'],
  BAGTRACTOR: ['BAGGAGE'], CARGOTRACT: ['LOAD'], CARGOTRUCK: ['LOAD'], VAN: ['LOAD'],
  SWEEPER: ['SNOW'], RWSWEEPER: ['SNOW'], SNOWPLOUGH: ['SNOW'], SNOWBLOWER: ['SNOW'],
  FIRETRUCK: ['PATROL'], AMBULANCE: ['PATROL'], FRICTION: ['PATROL'], BIRDCONTROL: ['PATROL'],
};

const FLIGHTS = [
  ['HY-601',  'A320-200',  'UK-32011'], ['HY-602',  'A320-200',  'UK-32012'],
  ['HY-273',  'B767-300',  'UK-67003'], ['HY-274',  'B767-300',  'UK-67004'],
  ['HY-101',  'B787-8',    'UK-78701'], ['HY-102',  'B787-8',    'UK-78702'],
  ['HY-411',  'A321neo',   'UK-32101'], ['HY-412',  'A321neo',   'UK-32102'],
  ['TK-370',  'A321-200',  'TC-JSK'],   ['SU-1874', 'A320-200',  'VP-BZQ'],
  ['FZ-1721', 'B737-800',  'A6-FED'],   ['KC-185',  'E190',      'P4-KCA'],
  ['CX-2077', 'B777F',     'B-LJA'],    ['EK-9881', 'B777F',     'A6-EFG'],
  ['TK-6501', 'A330-200F', 'TC-JDP'],   ['HY-8001', 'B767-300F', 'UK-67F01'],
];

async function main() {
  ({ token } = await api('POST', '/api/auth/login', {
    username: process.env.GSM_USER || 'admin',
    password: process.env.GSM_PASS || 'admin',
  }));

  const vehicles = await api('GET', '/api/vehicles?active=1');
  const drivers = await api('GET', '/api/drivers?active=1');
  const services = await api('GET', '/api/service-types');
  const zones = await api('GET', '/api/zones');
  if (!vehicles.length || !drivers.length) {
    console.log('Avval texnika va xodimlarni qo\'shing (GSM_DEMO=1 bilan ishga tushiring).');
    return;
  }
  const serviceId = (code) => services.find((s) => s.code === code)?.id ?? null;
  const zoneId = (code) => zones.find((z) => z.code === code)?.id ?? null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = Math.min(now.getDate(), new Date(year, month, 0).getDate());
  const stations = ['Perron AZS-1', 'Perron AZS-2', 'Texnik baza ombori', 'Yuk terminali AZS'];

  let created = 0;
  let operations = 0;

  for (let day = 1; day <= lastDay; day++) {
    const date = `${year}-${pad(month)}-${pad(day)}`;

    for (let vi = 0; vi < vehicles.length; vi++) {
      // Har bir texnika har kuni chiqmaydi — parkning ~60 % i ishlaydi
      if ((day * 7 + vi * 3) % 5 >= 3) continue;

      const vehicle = await api('GET', `/api/vehicles/${vehicles[vi].id}`);
      // Haydovchi texnika bilan bir filialdan bo'lishi shart
      const pool = drivers.filter((d) => d.branch_id === vehicle.branch_id);
      if (!pool.length) continue;
      const driver = pool[(day + vi) % pool.length];
      const defaults = await api('GET', `/api/waybills/defaults?vehicle_id=${vehicle.id}&date=${date}`);
      const basis = vehicle.norm_basis;
      const usesKm = basis === 'km' || basis === 'both';
      const usesHours = basis !== 'km';

      // Smena ko'rsatkichlari (takrorlanuvchi, tasodifsiz)
      const distance = usesKm ? 12 + ((day * 37 + vi * 53) % 90) : 0;
      const hours = usesHours ? Math.round((2 + ((day * 11 + vi * 17) % 60) / 10) * 10) / 10 : 0;
      const shift = (day + vi) % 3 === 0 ? 'night' : 'day';

      // Reysga xizmat operatsiyalari
      const codes = SERVICE_BY_CATEGORY[vehicle.category_code] ?? ['OTHER'];
      const opCount = codes[0] === 'OTHER' || codes[0] === 'SNOW' || codes[0] === 'PATROL'
        ? 1 : 1 + ((day + vi) % 3);
      const routes = [];
      for (let k = 0; k < opCount; k++) {
        const fl = FLIGHTS[(day * 3 + vi * 5 + k) % FLIGHTS.length];
        const isCargoFlight = /F$/.test(fl[1]) || fl[1].includes('F');
        const svc = codes[k % codes.length];
        const withFlight = !['SNOW', 'PATROL', 'OTHER'].includes(svc);
        const hourFrom = 6 + ((k * 4 + day) % 14);
        routes.push({
          seq: k + 1,
          flight_no: withFlight ? fl[0] : '',
          aircraft_type: withFlight ? fl[1] : '',
          aircraft_reg: withFlight ? fl[2] : '',
          stand: withFlight ? String(1 + ((day + vi + k) % 24)) : '',
          service_type_id: serviceId(svc),
          zone_id: vehicle.zone_id ?? zoneId('APRON'),
          time_out: `${pad(hourFrom)}:${pad((k * 15) % 60)}`,
          time_in: `${pad(hourFrom + 1)}:${pad((k * 25) % 60)}`,
          distance_km: usesKm ? Math.round((distance / opCount) * 10) / 10 : 0,
          op_hours: usesHours ? Math.round((hours / opCount) * 10) / 10 : 0,
          cargo_ton: ['LOAD', 'UNLOAD'].includes(svc) ? Math.round((1.5 + ((day + k) % 18)) * 10) / 10 : 0,
          uld_count: ['ULD', 'LOAD', 'UNLOAD'].includes(svc) ? 2 + ((day + vi + k) % 9) : 0,
          pax_count: svc === 'PAX' ? 40 + ((day * 7 + k * 13) % 140) : 0,
          point_from: usesKm && !withFlight ? 'Texnik baza' : '',
          point_to: usesKm && !withFlight ? ['Perron', 'Yuk terminali', 'UQY', 'Angar'][(day + k) % 4] : '',
          cargo: isCargoFlight && ['LOAD', 'UNLOAD'].includes(svc) ? 'Aviayuk' : '',
        });
      }
      operations += routes.length;

      const wb = await api('POST', '/api/waybills', {
        ...defaults,
        vehicle_id: vehicle.id,
        driver_id: driver.id,
        date_from: date,
        date_to: date,
        shift,
        zone_id: vehicle.zone_id,
        task: {
          aircraft: 'Havo kemalariga perron xizmati',
          cargo: 'Yuk terminalida yuklash-tushirish',
          passenger: 'Yo\'lovchilarni tashish',
          airfield: 'Aerodromga texnik xizmat',
          road: 'Xizmat safari',
        }[vehicle.group_code] ?? 'Smena topshirig\'i',
        routes,
      });

      // Normativ sarf (server bilan bir xil formula)
      const winterK = wb.winter ? 1 + wb.winter_pct / 100 : 1;
      const norm = ((distance / 100) * wb.norm_per_100km + hours * wb.norm_engine_hour) * winterK;

      // Elektr texnika "quyilmaydi" — zaryadlash yozuvi sifatida kiritiladi
      let issued = 0;
      const needed = norm * 1.2;
      if (wb.fuel_start < needed || day % 3 === 1) {
        const cap = vehicle.tank_capacity > 0 ? vehicle.tank_capacity * 0.85 : needed * 3;
        const target = Math.min(cap, wb.fuel_start + needed * 2.5);
        issued = Math.max(5, Math.round((target - wb.fuel_start) * 10) / 10);
        await api('POST', '/api/fuel', {
          date, vehicle_id: vehicle.id, waybill_id: wb.id, driver_id: driver.id,
          fuel_type_id: vehicle.fuel_type_id, liters: issued,
          price: vehicle.fuel_price || 11200,
          source: vehicle.power_type === 'electric' ? 'ombor' : 'azs',
          station: vehicle.power_type === 'electric' ? 'Zaryadlash stansiyasi' : stations[(day + vi) % stations.length],
          doc_no: `${pad(day)}${pad(month)}-${vehicle.garage_no}`,
        });
      }

      // Gibrid texnika: ikkinchi manba (batareya) alohida hisoblanadi va alohida zaryadlanadi
      let issued2 = 0;
      const norm2 = vehicle.fuel_type2_id
        ? ((distance / 100) * wb.norm2_per_100km + hours * wb.norm2_engine_hour) * winterK : 0;
      if (vehicle.fuel_type2_id) {
        const needed2 = norm2 * 1.2;
        if (wb.fuel2_start < needed2 || day % 2 === 0) {
          const cap2 = vehicle.tank_capacity2 > 0 ? vehicle.tank_capacity2 * 0.9 : needed2 * 3;
          const target2 = Math.min(cap2, wb.fuel2_start + needed2 * 2);
          issued2 = Math.max(1, Math.round((target2 - wb.fuel2_start) * 10) / 10);
          await api('POST', '/api/fuel', {
            date, vehicle_id: vehicle.id, waybill_id: wb.id, driver_id: driver.id,
            fuel_type_id: vehicle.fuel_type2_id, liters: issued2,
            price: vehicle.fuel2_price || 450,
            source: 'ombor', station: 'Zaryadlash stansiyasi',
            doc_no: `${pad(day)}${pad(month)}-${vehicle.garage_no}-E`,
          });
        }
      }

      const drift = 1 + (((day * 13 + vi * 29) % 17) - 8) / 100;
      const fact = norm * drift;
      const fuelEnd = Math.max(0, Math.round((wb.fuel_start + issued - fact) * 100) / 100);
      const fact2 = norm2 * drift;
      const fuel2End = Math.max(0, Math.round((wb.fuel2_start + issued2 - fact2) * 100) / 100);

      await api('POST', `/api/waybills/${wb.id}/close`, {
        odo_end: wb.odo_start + distance,
        hours_end: usesHours ? Math.round((wb.hours_start + hours) * 10) / 10 : null,
        fuel_end: fuelEnd,
        fuel2_end: vehicle.fuel_type2_id ? fuel2End : undefined,
      });
      created++;
    }
  }

  console.log(`${created} ta smena varaqasi yaratildi va yopildi, ${operations} ta operatsiya (${year}-${pad(month)}).`);
}

main().catch((e) => { console.error('XATOLIK:', e.message); process.exit(1); });
