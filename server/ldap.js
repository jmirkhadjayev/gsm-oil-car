// LDAP / Active Directory orqali autentifikatsiya.
//
// Oqim:
//   1. Xizmat hisobi bilan katalogga ulanamiz (bind)
//   2. Foydalanuvchini filtr bo'yicha qidiramiz  →  uning DN si topiladi
//   3. O'sha DN va foydalanuvchi paroli bilan qayta bind qilamiz — parol shunday tekshiriladi
//   4. Atributlarini o'qiymiz: F.I.Sh., pochta, guruhlar
//   5. Guruhlarni rol va filialga moslaymiz, hisobni bazada yaratamiz yoki yangilaymiz
//
// Shu tufayli alohida ro'yxatdan o'tish kerak emas: xodim korporativ hisobi bilan
// birinchi marta kirganda hisob avtomatik ochiladi.
import { Client } from 'ldapts';
import { get, run } from './db.js';

const ROLES = ['admin', 'dispatcher', 'operator', 'viewer'];

/** Joriy sozlama (bo'lmasa — bo'sh yozuv yaratiladi). */
export function ldapConfig() {
  let cfg = get('SELECT * FROM ldap_config WHERE id = 1');
  if (!cfg) {
    run(`INSERT INTO ldap_config (id, url, bind_dn, bind_password, base_dn, user_filter)
         VALUES (1, ?, ?, ?, ?, ?)`, [
      process.env.GSM_LDAP_URL || '',
      process.env.GSM_LDAP_BIND_DN || '',
      process.env.GSM_LDAP_BIND_PASSWORD || '',
      process.env.GSM_LDAP_BASE_DN || '',
      process.env.GSM_LDAP_USER_FILTER || '(sAMAccountName={{username}})',
    ]);
    if (process.env.GSM_LDAP_URL) run('UPDATE ldap_config SET enabled = 1 WHERE id = 1');
    cfg = get('SELECT * FROM ldap_config WHERE id = 1');
  }
  return cfg;
}

export const ldapEnabled = () => {
  const c = ldapConfig();
  return !!(c.enabled && c.url && c.base_dn);
};

/**
 * "guruh = qiymat" ko'rinishidagi qatorlarni obyektga aylantiradi.
 * Guruh nomi katalogdagi to'liq DN ning bir bo'lagi bo'lsa ham yetarli.
 */
function parseMap(text) {
  const out = [];
  for (const line of String(text || '').split(/[\n;]/)) {
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key && val) out.push([key, val]);
  }
  return out;
}

/** Guruhlar ro'yxatidan birinchi mos qiymatni topadi. */
function matchMap(groups, mapText) {
  const map = parseMap(mapText);
  const lower = groups.map((g) => String(g).toLowerCase());
  for (const [needle, value] of map) {
    if (lower.some((g) => g.includes(needle))) return value;
  }
  return null;
}

const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/**
 * Atributni katta-kichik harfga qaramay o'qiydi.
 * LDAP da atribut nomlari registrga sezgir emas, lekin serverlar ularni
 * turlicha qaytaradi: AD — displayName, OpenLDAP — displayname.
 */
function attr(entry, name) {
  if (!name) return undefined;
  if (entry[name] !== undefined) return entry[name];
  const lower = String(name).toLowerCase();
  const key = Object.keys(entry).find((k) => k.toLowerCase() === lower);
  return key ? entry[key] : undefined;
}

/** Bo'sh massiv ham "yo'q" hisoblanadi. */
const firstValue = (v) => {
  const a = asArray(v);
  return a.length ? String(a[0]) : '';
};

/** Katalogga ulanib, foydalanuvchini tekshiradi. Muvaffaqiyatli bo'lsa ma'lumotini qaytaradi. */
export async function ldapAuthenticate(username, password, cfg = ldapConfig()) {
  if (!password) throw new Error('Parol bo\'sh');

  const options = { url: cfg.url, timeout: 8000, connectTimeout: 8000 };
  if (cfg.url.startsWith('ldaps://') && !cfg.tls_reject_unauthorized) {
    options.tlsOptions = { rejectUnauthorized: false };
  }

  const searcher = new Client(options);
  let entry;
  try {
    // 1) Xizmat hisobi (yoki anonim) bilan ulanish
    if (cfg.bind_dn) await searcher.bind(cfg.bind_dn, cfg.bind_password);
    else await searcher.bind('', '');

    // 2) Foydalanuvchini qidirish
    const filter = String(cfg.user_filter || '(sAMAccountName={{username}})')
      .replace(/\{\{\s*username\s*\}\}/g, escapeFilter(username));
    const { searchEntries } = await searcher.search(cfg.base_dn, {
      scope: 'sub',
      filter,
      attributes: wantedAttributes(cfg),
    });
    if (!searchEntries.length) throw new Error('Katalogda bunday xodim topilmadi');
    entry = searchEntries[0];
  } finally {
    await searcher.unbind().catch(() => {});
  }

  // 3) Foydalanuvchining o'z DN va paroli bilan bind — parol shu yerda tekshiriladi
  const verifier = new Client(options);
  try {
    await verifier.bind(entry.dn, password);
  } catch {
    throw new Error('Parol noto\'g\'ri');
  } finally {
    await verifier.unbind().catch(() => {});
  }

  const groups = asArray(attr(entry, cfg.attr_groups)).map(String);
  const mappedRole = normalizeRole(matchMap(groups, cfg.role_map));
  return {
    dn: entry.dn,
    username: firstValue(attr(entry, 'sAMAccountName')) || firstValue(attr(entry, 'uid')) || username,
    full_name: firstValue(attr(entry, cfg.attr_name)) || firstValue(attr(entry, 'cn')) || username,
    email: firstValue(attr(entry, cfg.attr_mail)),
    groups,
    role: mappedRole || cfg.default_role || 'viewer',
    role_matched: !!mappedRole,        // guruh moslashuvi topildimi
    branch_code: matchMap(groups, cfg.branch_map),
  };
}

const normalizeRole = (r) => (ROLES.includes(String(r)) ? String(r) : null);

/**
 * So'raladigan atributlar ro'yxati.
 * Standart bo'yicha atribut nomlari registrga sezgir emas, lekin ba'zi serverlar
 * so'ralgan yozuvni aynan solishtiradi va boshqa registrdagi atributni qaytarmaydi.
 * Shuning uchun har bir nomni asl va kichik harfli ko'rinishda so'raymiz.
 */
function wantedAttributes(cfg) {
  const base = ['dn', cfg.attr_name, cfg.attr_mail, cfg.attr_groups, 'cn', 'sAMAccountName', 'uid'];
  const out = new Set();
  for (const a of base) {
    if (!a) continue;
    out.add(a);
    out.add(String(a).toLowerCase());
  }
  return [...out];
}

/** LDAP filtridagi maxsus belgilarni ekranlash (RFC 4515). */
function escapeFilter(v) {
  return String(v).replace(/[\\*()\0/]/g, (c) => ({
    '\\': '\\5c', '*': '\\2a', '(': '\\28', ')': '\\29', '\0': '\\00', '/': '\\2f',
  })[c]);
}

/**
 * Katalogdan kelgan ma'lumot asosida lokal hisobni yaratadi yoki yangilaydi.
 * Bu — "avtomatik ro'yxatdan o'tish": xodim birinchi kirganda hisobi ochiladi.
 */
export function upsertLdapUser(info, cfg = ldapConfig()) {
  const branch = info.branch_code
    ? get('SELECT id FROM branches WHERE upper(code) = upper(?)', [info.branch_code])
    : null;

  const existing = get('SELECT * FROM users WHERE lower(username) = lower(?)', [info.username]);

  if (!existing) {
    if (!cfg.auto_create) throw new Error('Hisob tizimda ro\'yxatdan o\'tkazilmagan');
    const r = run(
      `INSERT INTO users (username, full_name, password_hash, role, branch_id,
         auth_source, email, ldap_dn, last_login, active)
       VALUES (?,?,'',?,?,'ldap',?,?,datetime('now'),1)`,
      [info.username.toLowerCase(), info.full_name, info.role, branch?.id ?? null, info.email, info.dn]
    );
    return get('SELECT * FROM users WHERE id = ?', [r.lastInsertRowid]);
  }

  if (!existing.active) throw new Error('Foydalanuvchi bloklangan');

  // Mavjud hisob: ism, pochta, rol va filial katalogdan yangilanadi.
  // Rol/filial faqat moslashuv topilgan bo'lsa yangilanadi — aks holda qo'lda
  // qo'yilgan qiymat saqlanib qoladi.
  run(
    `UPDATE users SET full_name = ?, email = ?, ldap_dn = ?, auth_source = 'ldap',
       role = ?, branch_id = ?, last_login = datetime('now') WHERE id = ?`,
    [
      info.full_name || existing.full_name,
      info.email || existing.email,
      info.dn,
      info.role_matched ? info.role : existing.role,      // moslashuv bo'lmasa — qo'lda qo'yilgani qoladi
      branch ? branch.id : existing.branch_id,
      existing.id,
    ]
  );
  return get('SELECT * FROM users WHERE id = ?', [existing.id]);
}

/** Sozlamani tekshirish: ulanish + ixtiyoriy foydalanuvchini qidirish. */
export async function testLdap(cfg, probeUser) {
  const options = { url: cfg.url, timeout: 8000, connectTimeout: 8000 };
  if (cfg.url.startsWith('ldaps://') && !cfg.tls_reject_unauthorized) {
    options.tlsOptions = { rejectUnauthorized: false };
  }
  const client = new Client(options);
  try {
    if (cfg.bind_dn) await client.bind(cfg.bind_dn, cfg.bind_password);
    else await client.bind('', '');

    const filter = String(cfg.user_filter || '(sAMAccountName={{username}})')
      .replace(/\{\{\s*username\s*\}\}/g, escapeFilter(probeUser || '*'));
    const { searchEntries } = await client.search(cfg.base_dn, {
      scope: 'sub', filter, attributes: wantedAttributes(cfg), sizeLimit: 5,
    });

    return {
      ok: true,
      found: searchEntries.length,
      sample: searchEntries.slice(0, 3).map((e) => ({
        dn: e.dn,
        name: firstValue(attr(e, cfg.attr_name)) || firstValue(attr(e, 'cn')),
        groups: asArray(attr(e, cfg.attr_groups)).map(String).slice(0, 6),
      })),
    };
  } finally {
    await client.unbind().catch(() => {});
  }
}
