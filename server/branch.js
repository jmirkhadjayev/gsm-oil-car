// Filial qamrovi (multi-branch).
//
//   users.branch_id  = son  →  filial xodimi: faqat o'z filialini ko'radi
//   users.branch_id  = NULL →  bosh ofis: barcha filiallar; kerak bo'lsa
//                              ?branch_id=N bilan bittasiga cheklanadi
//
// req.branchId  — so'rovni cheklash uchun filial (null = cheklanmagan)
// req.isHq      — bosh ofis foydalanuvchisimi
import { get } from './db.js';

export function attachBranch(req, _res, next) {
  const u = req.user;
  if (!u) { req.branchId = null; req.isHq = false; return next(); }

  req.isHq = u.branch_id == null;
  if (!req.isHq) {
    req.branchId = u.branch_id;
  } else {
    const asked = Number(req.query.branch_id || req.headers['x-branch-id']) || null;
    req.branchId = asked && get('SELECT id FROM branches WHERE id = ?', [asked]) ? asked : null;
  }
  next();
}

/**
 * WHERE uchun filial sharti. Bosh ofis butun tarmoqni ko'rayotganda — shartsiz.
 * @param col  ustun nomi, kerak bo'lsa alias bilan: 'v.branch_id'
 */
export function branchWhere(req, col = 'branch_id') {
  return req.branchId ? { sql: `${col} = ?`, params: [req.branchId] } : { sql: null, params: [] };
}

/** where/params massivlariga filial shartini qo'shadi. */
export function pushBranch(where, params, req, col = 'branch_id') {
  const b = branchWhere(req, col);
  if (b.sql) { where.push(b.sql); params.push(...b.params); }
  return { where, params };
}

/**
 * Yangi yozuv qaysi filialga tegishli.
 * Filial xodimi uchun — o'z filiali. Bosh ofis uchun — tanlangani yoki so'rovdagi qiymat.
 */
export function branchForInsert(req, body = {}) {
  if (!req.isHq) return req.branchId;
  const explicit = Number(body.branch_id) || req.branchId;
  return explicit || 1;
}
