// Buyruq paneli uchun yagona qidiruv nuqtasi.
// Bitta so'rovda varaqa, texnika va xodim qidiriladi — panel har bir turdagi
// ma'lumot uchun alohida so'rov yubormaydi.
import express from 'express';
import { all } from '../db.js';
import { requireAuth } from '../auth.js';
import { pushBranch } from '../branch.js';
import { h, str } from '../util.js';

export const router = express.Router();

const LIMIT = 6;

router.get('/', requireAuth(), h((req, res) => {
  const q = str(req.query.q, 'q').trim();
  if (q.length < 1) return res.json({ q, waybills: [], vehicles: [], drivers: [] });

  const like = `%${q}%`;
  // «№370» yoki «# 370» kabi yozuvdan raqamni ajratamiz
  const numeric = q.replace(/[^\d]/g, '');

  // ------------------------------ Varaqalar ------------------------------
  const wbWhere = [];
  const wbParams = [];
  pushBranch(wbWhere, wbParams, req);
  wbWhere.push(`(number LIKE ? OR garage_no LIKE ? OR plate LIKE ? OR driver_name LIKE ? OR model LIKE ?)`);
  wbParams.push(like, like, like, like, like);

  const waybills = all(
    `SELECT id, number, date_from, status, garage_no, plate, model, driver_name,
            branch_code, group_code
       FROM v_waybill_calc
      WHERE ${wbWhere.join(' AND ')}
      ORDER BY CASE WHEN number = ? THEN 0 ELSE 1 END, date_from DESC, id DESC
      LIMIT ?`,
    [...wbParams, numeric || q, LIMIT]
  );

  // ------------------------------- Texnika -------------------------------
  const vWhere = [];
  const vParams = [];
  pushBranch(vWhere, vParams, req, 'v.branch_id');
  vWhere.push(`(v.garage_no LIKE ? OR v.plate LIKE ? OR v.model LIKE ? OR v.serial_no LIKE ?)`);
  vParams.push(like, like, like, like);

  const vehicles = all(
    `SELECT v.id, v.garage_no, v.plate, v.model, v.active,
            ec.group_code, ec.name_uz AS category_name_uz, ec.name_ru AS category_name_ru,
            b.code AS branch_code
       FROM vehicles v
       LEFT JOIN equipment_categories ec ON ec.id = v.category_id
       LEFT JOIN branches b ON b.id = v.branch_id
      WHERE ${vWhere.join(' AND ')}
      ORDER BY v.active DESC, v.garage_no
      LIMIT ?`,
    [...vParams, LIMIT]
  );

  // ------------------------------- Xodimlar ------------------------------
  const dWhere = [];
  const dParams = [];
  pushBranch(dWhere, dParams, req, 'd.branch_id');
  dWhere.push(`(d.full_name LIKE ? OR d.tab_no LIKE ? OR d.apron_permit LIKE ?)`);
  dParams.push(like, like, like);

  const drivers = all(
    `SELECT d.id, d.full_name, d.tab_no, d.position, d.active, b.code AS branch_code
       FROM drivers d
       LEFT JOIN branches b ON b.id = d.branch_id
      WHERE ${dWhere.join(' AND ')}
      ORDER BY d.active DESC, d.full_name
      LIMIT ?`,
    [...dParams, LIMIT]
  );

  res.json({ q, waybills, vehicles, drivers });
}));
