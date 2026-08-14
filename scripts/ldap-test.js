// LDAP autentifikatsiyasini haqiqiy katalogsiz tekshiradi.
// Ichida kichik LDAP server ko'tariladi (ldapjs), unga test xodimlari joylanadi,
// so'ng platforma shu katalog orqali kirishni sinaydi.
//
// Ishlatish:  node scripts/ldap-test.js   (GSM serveri ishlab turishi kerak)
import ldap from 'ldapjs';

const PORT = Number(process.env.LDAP_TEST_PORT) || 13890;
const BASE = 'dc=aeroport,dc=uz';
const BIND_DN = `cn=service,${BASE}`;
const BIND_PW = 'service-secret';
const API = process.env.GSM_URL || 'http://localhost:3000';

let failed = 0;
const check = (label, actual, expected) => {
  const ok = String(actual) === String(expected);
  console.log(`${ok ? '  OK  ' : ' XATO '} ${label}: ${actual}${ok ? '' : ` (kutilgan ${expected})`}`);
  if (!ok) failed++;
};

// --------------------------- Test katalogi ---------------------------
const USERS = {
  'a.karimov': {
    password: 'Parol123!',
    dn: `cn=a.karimov,ou=xodimlar,${BASE}`,
    attributes: {
      objectclass: ['inetOrgPerson'],
      cn: 'a.karimov',
      samaccountname: 'a.karimov',
      displayname: 'Karimov Alisher Baxtiyorovich',
      mail: 'a.karimov@aeroport.uz',
      memberof: [`cn=GSM-Dispetcher,ou=guruhlar,${BASE}`, `cn=Aeroport-TAS,ou=guruhlar,${BASE}`],
    },
  },
  's.rasulov': {
    password: 'Parol456!',
    dn: `cn=s.rasulov,ou=xodimlar,${BASE}`,
    attributes: {
      objectclass: ['inetOrgPerson'],
      cn: 's.rasulov',
      samaccountname: 's.rasulov',
      displayname: 'Rasulov Sardor Ilhomovich',
      mail: 's.rasulov@aeroport.uz',
      memberof: [`cn=GSM-Operator,ou=guruhlar,${BASE}`, `cn=Aeroport-SKD,ou=guruhlar,${BASE}`],
    },
  },
  'b.nazarov': {
    password: 'Parol789!',
    dn: `cn=b.nazarov,ou=xodimlar,${BASE}`,
    attributes: {
      objectclass: ['inetOrgPerson'],
      cn: 'b.nazarov',
      samaccountname: 'b.nazarov',
      displayname: 'Nazarov Bekzod',
      mail: 'b.nazarov@aeroport.uz',
      memberof: [`cn=Boshqa-Bolim,ou=guruhlar,${BASE}`],   // moslashuv yo'q → standart rol
    },
  },
};

function startDirectory() {
  const server = ldap.createServer();

  server.bind(BASE, (req, res, next) => {
    const dn = req.dn.toString().toLowerCase();
    const pw = req.credentials;
    if (dn === BIND_DN.toLowerCase() && pw === BIND_PW) { res.end(); return next(); }
    const user = Object.values(USERS).find((u) => u.dn.toLowerCase() === dn);
    if (user && pw === user.password) { res.end(); return next(); }
    return next(new ldap.InvalidCredentialsError());
  });

  // Yozuv atributlari kichik harfda saqlanadi (OpenLDAP shunday qaytaradi),
  // filtr esa AD uslubidagi sAMAccountName bilan kelishi mumkin. LDAP da
  // atribut nomlari registrga sezgir emas, shuning uchun moslashtirish uchun
  // ikkala ko'rinishni ham beramiz.
  const ALIASES = {
    samaccountname: 'sAMAccountName', displayname: 'displayName',
    memberof: 'memberOf', objectclass: 'objectClass',
  };
  const forMatching = (attrs) => {
    const out = { ...attrs };
    for (const [lower, camel] of Object.entries(ALIASES)) {
      if (attrs[lower] !== undefined) out[camel] = attrs[lower];
    }
    return out;
  };

  server.search(BASE, (req, res, next) => {
    for (const u of Object.values(USERS)) {
      if (req.filter.matches(forMatching(u.attributes))) {
        res.send({ dn: u.dn, attributes: u.attributes });
      }
    }
    res.end();
    return next();
  });

  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

// ------------------------------ Platforma ------------------------------
const api = async (method, path, body, token) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

const run = async () => {
  const server = await startDirectory();
  console.log(`Test katalogi: ldap://127.0.0.1:${PORT}  (${Object.keys(USERS).length} xodim)\n`);

  try {
    const admin = (await api('POST', '/api/auth/login', { username: 'admin', password: 'admin' })).data;
    if (!admin.token) throw new Error('admin bilan kirib bo\'lmadi');

    // 1) Katalogni sozlaymiz
    const cfg = {
      enabled: 1,
      url: `ldap://127.0.0.1:${PORT}`,
      bind_dn: BIND_DN,
      bind_password: BIND_PW,
      base_dn: BASE,
      user_filter: '(sAMAccountName={{username}})',
      attr_name: 'displayName',
      attr_mail: 'mail',
      attr_groups: 'memberOf',
      role_map: 'gsm-dispetcher = dispatcher\ngsm-operator = operator\ngsm-admin = admin',
      branch_map: 'aeroport-tas = TAS\naeroport-skd = SKD\naeroport-bhk = BHK\naeroport-ksq = KSQ',
      default_role: 'viewer',
      auto_create: 1,
      allow_local_fallback: 1,
    };
    await api('PUT', '/api/ldap', cfg, admin.token);
    console.log('Katalog sozlandi.\n');

    // 2) Ulanishni tekshirish
    const test = (await api('POST', '/api/ldap/test', { ...cfg, probe_user: 'a.karimov' }, admin.token)).data;
    check('Ulanish testi', test.ok, 'true');
    check('Topilgan yozuvlar', test.found, '1');
    console.log('');

    // 3) Katalog orqali kirish — hisob avtomatik yaratiladi
    console.log('— Avtomatik ro\'yxatdan o\'tish —');
    const r1 = await api('POST', '/api/auth/login', { username: 'a.karimov', password: 'Parol123!' });
    check('Kirish holati', r1.status, '200');
    check('F.I.Sh. katalogdan olindi', r1.data.user?.full_name, 'Karimov Alisher Baxtiyorovich');
    check('Guruh → rol', r1.data.user?.role, 'dispatcher');
    check('Guruh → filial', r1.data.user?.branch_code, 'TAS');

    const r2 = await api('POST', '/api/auth/login', { username: 's.rasulov', password: 'Parol456!' });
    check('Ikkinchi xodim roli', r2.data.user?.role, 'operator');
    check('Ikkinchi xodim filiali', r2.data.user?.branch_code, 'SKD');

    const r3 = await api('POST', '/api/auth/login', { username: 'b.nazarov', password: 'Parol789!' });
    check('Moslashuv yo\'q → standart rol', r3.data.user?.role, 'viewer');
    console.log('');

    // 4) Noto'g'ri parol
    console.log('— Xavfsizlik —');
    const bad1 = await api('POST', '/api/auth/login', { username: 'a.karimov', password: 'notogri' });
    check('Noto\'g\'ri parol rad etildi', bad1.status, '401');

    const bad2 = await api('POST', '/api/auth/login', { username: 'yoq.odam', password: 'x' });
    check('Katalogda yo\'q xodim rad etildi', bad2.status, '401');

    // LDAP hisobiga lokal parol bilan kirib bo'lmasligi kerak
    const bad3 = await api('POST', '/api/auth/login', { username: 'a.karimov', password: '' });
    check('Bo\'sh parol rad etildi', bad3.status, '401');
    console.log('');

    // 5) Lokal hisob katalog yoqilganda ham ishlaydi
    console.log('— Lokal hisoblar —');
    const local = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin' });
    check('Lokal admin kira oladi', local.status, '200');

    // 6) Katalog o'chganda: lokal hisob ishlaydi, LDAP hisobi yo'q
    server.close();
    console.log('\n— Katalog o\'chirildi —');
    const afterLocal = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin' });
    check('Lokal hisob baribir ishlaydi', afterLocal.status, '200');
    const afterLdap = await api('POST', '/api/auth/login', { username: 'a.karimov', password: 'Parol123!' });
    check('Katalog hisobi kira olmaydi', afterLdap.status, '401');

    // 7) Sozlamani o'chirib qo'yamiz — keyingi ishlarga xalaqit bermasin
    await api('PUT', '/api/ldap', { ...cfg, enabled: 0 }, admin.token);
    console.log('\nKatalog sozlamasi o\'chirildi (enabled = 0).');
  } finally {
    try { server.close(); } catch { /* allaqachon yopilgan */ }
  }

  console.log(failed ? `\n${failed} ta tekshiruv muvaffaqiyatsiz.` : '\nBarcha tekshiruvlar o\'tdi.');
  process.exit(failed ? 1 : 0);
};

run().catch((e) => { console.error('XATOLIK:', e.message); process.exit(1); });
