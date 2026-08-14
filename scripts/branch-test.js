// Filiallar izolyatsiyasini tekshiradi: har bir foydalanuvchi faqat o'z
// filialining ma'lumotini ko'rishi, bosh ofis esa barchasini ko'rishi kerak.
// Ishlatish:  node scripts/branch-test.js   (server ishlab turishi kerak)
const BASE = process.env.GSM_URL || 'http://localhost:3000';
let failed = 0;

async function api(token, url, branchHeader) {
  const res = await fetch(BASE + url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(branchHeader ? { 'X-Branch-Id': String(branchHeader) } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${data.error || ''}`);
  return data;
}

const login = async (username, password) => {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username}: ${res.status}`);
  return res.json();
};

const check = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`${ok ? '  OK  ' : ' XATO '} ${label}: ${actual}${ok ? '' : ` (kutilgan ${expected})`}`);
  if (!ok) failed++;
};

const run = async () => {
  const hq = await login('admin', 'admin');
  console.log(`Bosh ofis: ${hq.user.full_name}, filial = ${hq.user.branch_id ?? 'NULL (barchasi)'}\n`);

  const branches = await api(hq.token, '/api/branches');
  console.log(`Filiallar: ${branches.map((b) => b.code).join(', ')}\n`);

  // --- Har bir filial alohida ---
  const seen = {};
  for (const b of branches) {
    const u = await login(b.code.toLowerCase(), b.code.toLowerCase());
    const veh = await api(u.token, '/api/vehicles');
    const wb = await api(u.token, '/api/waybills?limit=1000');
    const drv = await api(u.token, '/api/drivers');
    const own = veh.every((v) => v.branch_id === b.id);
    seen[b.code] = { vehicles: veh.length, waybills: wb.total, drivers: drv.length, own };

    console.log(`${b.code} — ${u.user.full_name}`);
    console.log(`  texnika: ${veh.length}, xodim: ${drv.length}, varaqa: ${wb.total}`);
    if (!own) { console.log('  XATO: begona filial texnikasi ko\'rinyapti'); failed++; }
    else console.log('  OK   faqat o\'z filiali ma\'lumoti');

    // Boshqa filialning ma'lumotini so'rab ko'ramiz — e'tiborga olinmasligi kerak
    const other = branches.find((x) => x.id !== b.id);
    const spoof = await api(u.token, '/api/vehicles', other.id);
    check(`  ${b.code} ${other.code} ni so'rasa ham o'z soni qoladi`, spoof.length, veh.length);
    console.log('');
  }

  // --- Bosh ofis: barchasi ---
  const allVeh = await api(hq.token, '/api/vehicles');
  const allWb = await api(hq.token, '/api/waybills?limit=5000');
  const sumV = Object.values(seen).reduce((s, x) => s + x.vehicles, 0);
  const sumW = Object.values(seen).reduce((s, x) => s + x.waybills, 0);
  console.log('Bosh ofis (barcha filiallar)');
  check('  texnika = filiallar yig\'indisi', allVeh.length, sumV);
  check('  varaqa = filiallar yig\'indisi', allWb.total, sumW);

  // --- Bosh ofis bitta filialga cheklanadi ---
  const one = branches[1];
  const scoped = await api(hq.token, '/api/vehicles', one.id);
  check(`  ${one.code} ga cheklanganda`, scoped.length, seen[one.code].vehicles);

  // --- Hisobot ham filtrlanadi ---
  const repAll = await api(hq.token, '/api/reports/vehicles');
  const repOne = await api(hq.token, '/api/reports/vehicles', one.id);
  console.log(`\nHisobot: barchasi ${repAll.rows.length} qator, ${one.code} ${repOne.rows.length} qator`);
  if (repOne.rows.length >= repAll.rows.length) { console.log(' XATO  hisobot filtrlanmadi'); failed++; }
  else console.log('  OK   hisobot filialga cheklandi');

  console.log(failed ? `\n${failed} ta tekshiruv muvaffaqiyatsiz.` : '\nBarcha tekshiruvlar o\'tdi.');
  process.exit(failed ? 1 : 0);
};

run().catch((e) => { console.error('XATOLIK:', e.message); process.exit(1); });
