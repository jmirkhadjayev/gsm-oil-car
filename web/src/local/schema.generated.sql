-- AVTOMATIK YARATILGAN FAYL — tahrirlamang.
-- Manba: server/schema.sql (scripts/copy-schema.js)

-- =====================================================================
--  GSM hisobi — ma'lumotlar bazasi sxemasi (SQLite)
--  Yo'l varaqalari (путевые листы) va yoqilg'i hisobi
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ------------------------- Foydalanuvchilar --------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  full_name     TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  -- admin: hammasi | dispatcher: varaqa+yoqilg'i | operator: yoqilg'i | viewer: faqat ko'rish
  role          TEXT    NOT NULL DEFAULT 'operator'
                        CHECK (role IN ('admin','dispatcher','operator','viewer')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- --------------------------- Tashkilot -------------------------------
CREATE TABLE IF NOT EXISTS org (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  name     TEXT NOT NULL DEFAULT '',
  inn      TEXT NOT NULL DEFAULT '',
  address  TEXT NOT NULL DEFAULT '',
  phone    TEXT NOT NULL DEFAULT '',
  director TEXT NOT NULL DEFAULT '',
  mechanic TEXT NOT NULL DEFAULT '',
  -- qish davri normaga qo'shimcha foiz uchun oylar (1-12), vergul bilan
  winter_months TEXT NOT NULL DEFAULT '11,12,1,2,3'
);

-- ------------------------ Yoqilg'i turlari ---------------------------
CREATE TABLE IF NOT EXISTS fuel_types (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code    TEXT NOT NULL UNIQUE,
  name_uz TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  unit_uz TEXT NOT NULL DEFAULT 'l',
  unit_ru TEXT NOT NULL DEFAULT 'л',
  price   REAL NOT NULL DEFAULT 0,   -- joriy narx (so'm/birlik)
  active  INTEGER NOT NULL DEFAULT 1
);

-- -------------------------- Avtomobillar -----------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  garage_no        TEXT NOT NULL UNIQUE,          -- garaj raqami
  plate            TEXT NOT NULL,                 -- davlat raqami
  model            TEXT NOT NULL,
  fuel_type_id     INTEGER NOT NULL REFERENCES fuel_types(id),
  tank_capacity    REAL NOT NULL DEFAULT 0,       -- bak hajmi, l
  norm_per_100km   REAL NOT NULL DEFAULT 0,       -- asosiy norma, l/100 km
  winter_pct       REAL NOT NULL DEFAULT 0,       -- qishki ustama, %
  norm_engine_hour REAL NOT NULL DEFAULT 0,       -- ish soati normasi, l/soat
  norm_per_ton_km  REAL NOT NULL DEFAULT 0,       -- yuk normasi, l/100 t·km
  -- Boshlang'ich holat (tizimga kiritilgan paytdagi) — qo'lda kiritiladi:
  init_odometer    REAL NOT NULL DEFAULT 0,
  init_fuel        REAL NOT NULL DEFAULT 0,
  -- Quyidagi ikkitasi HOSILA qiymat: recalcVehicle() qayta hisoblaydi.
  --   odometer     = init_odometer + Σ(yopilgan varaqalar masofasi)
  --   fuel_balance = init_fuel + Σ(quyilgan) − Σ(yopilgan varaqalar fakt sarfi)
  odometer         REAL NOT NULL DEFAULT 0,       -- joriy spidometr
  fuel_balance     REAL NOT NULL DEFAULT 0,       -- bakdagi joriy qoldiq, l
  active           INTEGER NOT NULL DEFAULT 1,
  notes            TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vehicles_active ON vehicles(active);

-- --------------------------- Haydovchilar ----------------------------
CREATE TABLE IF NOT EXISTS drivers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name  TEXT NOT NULL,
  tab_no     TEXT NOT NULL DEFAULT '',            -- tabel raqami
  license_no TEXT NOT NULL DEFAULT '',            -- guvohnoma
  phone      TEXT NOT NULL DEFAULT '',
  class      TEXT NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_drivers_active ON drivers(active);

-- ------------------------- Yo'l varaqalari ---------------------------
CREATE TABLE IF NOT EXISTS waybills (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  number         TEXT    NOT NULL UNIQUE,
  date_from      TEXT    NOT NULL,                -- YYYY-MM-DD
  date_to        TEXT    NOT NULL,
  vehicle_id     INTEGER NOT NULL REFERENCES vehicles(id),
  driver_id      INTEGER NOT NULL REFERENCES drivers(id),
  -- draft: qoralama | issued: berilgan | closed: yopilgan (hisobga olingan)
  status         TEXT    NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','issued','closed')),
  odo_start      REAL    NOT NULL DEFAULT 0,      -- chiqishdagi spidometr
  odo_end        REAL,                            -- qaytgandagi spidometr
  fuel_start     REAL    NOT NULL DEFAULT 0,      -- chiqishdagi bak qoldig'i
  fuel_end       REAL,                            -- qaytgandagi bak qoldig'i
  engine_hours   REAL    NOT NULL DEFAULT 0,      -- maxsus jihoz ish soati
  cargo_ton_km   REAL    NOT NULL DEFAULT 0,      -- bajarilgan t·km
  winter         INTEGER NOT NULL DEFAULT 0,      -- qishki ustama qo'llanilsinmi
  -- norma ko'rsatkichlari varaqa ochilgandagi holatda saqlanadi (keyin o'zgarsa ham hisob buzilmaydi)
  norm_per_100km   REAL NOT NULL DEFAULT 0,
  norm_engine_hour REAL NOT NULL DEFAULT 0,
  norm_per_ton_km  REAL NOT NULL DEFAULT 0,
  winter_pct       REAL NOT NULL DEFAULT 0,
  task           TEXT    NOT NULL DEFAULT '',     -- topshiriq
  notes          TEXT    NOT NULL DEFAULT '',
  created_by     INTEGER REFERENCES users(id),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  closed_at      TEXT,
  closed_by      INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_waybills_date    ON waybills(date_from);
CREATE INDEX IF NOT EXISTS idx_waybills_vehicle ON waybills(vehicle_id, date_from);
CREATE INDEX IF NOT EXISTS idx_waybills_driver  ON waybills(driver_id, date_from);
CREATE INDEX IF NOT EXISTS idx_waybills_status  ON waybills(status);

-- Varaqadagi marshrut qatorlari
CREATE TABLE IF NOT EXISTS waybill_routes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  waybill_id  INTEGER NOT NULL REFERENCES waybills(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL DEFAULT 1,
  point_from  TEXT NOT NULL DEFAULT '',
  point_to    TEXT NOT NULL DEFAULT '',
  time_out    TEXT NOT NULL DEFAULT '',
  time_in     TEXT NOT NULL DEFAULT '',
  distance_km REAL NOT NULL DEFAULT 0,
  cargo       TEXT NOT NULL DEFAULT '',
  cargo_ton   REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_routes_waybill ON waybill_routes(waybill_id);

-- --------------------- Yoqilg'i quyish (kirim) -----------------------
CREATE TABLE IF NOT EXISTS fuel_issues (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT    NOT NULL,                  -- YYYY-MM-DD
  vehicle_id   INTEGER NOT NULL REFERENCES vehicles(id),
  driver_id    INTEGER REFERENCES drivers(id),
  waybill_id   INTEGER REFERENCES waybills(id) ON DELETE SET NULL,
  fuel_type_id INTEGER NOT NULL REFERENCES fuel_types(id),
  liters       REAL    NOT NULL DEFAULT 0,
  price        REAL    NOT NULL DEFAULT 0,        -- birlik narxi
  amount       REAL    NOT NULL DEFAULT 0,        -- summa = liters * price
  source       TEXT    NOT NULL DEFAULT 'azs'
                       CHECK (source IN ('azs','ombor','talon','karta')),
  station      TEXT    NOT NULL DEFAULT '',       -- AZS nomi
  doc_no       TEXT    NOT NULL DEFAULT '',       -- chek / talon raqami
  notes        TEXT    NOT NULL DEFAULT '',
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fuel_date    ON fuel_issues(date);
CREATE INDEX IF NOT EXISTS idx_fuel_vehicle ON fuel_issues(vehicle_id, date);
CREATE INDEX IF NOT EXISTS idx_fuel_waybill ON fuel_issues(waybill_id);

-- ---------------------------- Audit izi ------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  details    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- =====================================================================
--  KO'RINISH: varaqa bo'yicha to'liq hisob-kitob
--  norma  = masofa/100*norma*(1+qish%) + ish_soati*norma + t·km/100*norma
--  fakt   = boshlang'ich qoldiq + quyilgan - oxirgi qoldiq
--  farq   = fakt - norma   (musbat = ortiqcha sarf, manfiy = tejalgan)
-- =====================================================================
DROP VIEW IF EXISTS v_waybill_calc;
CREATE VIEW v_waybill_calc AS
SELECT
  w.*,
  v.garage_no, v.plate, v.model, v.fuel_type_id,
  ft.code AS fuel_code, ft.name_uz AS fuel_name_uz, ft.name_ru AS fuel_name_ru,
  d.full_name AS driver_name, d.tab_no,
  COALESCE(fi.liters, 0) AS fuel_issued,
  CASE WHEN w.odo_end IS NULL THEN NULL
       ELSE ROUND(w.odo_end - w.odo_start, 2) END AS distance_km,
  ROUND(
    CASE WHEN w.odo_end IS NULL THEN 0
         ELSE (w.odo_end - w.odo_start) / 100.0 * w.norm_per_100km
              * (1 + CASE WHEN w.winter = 1 THEN w.winter_pct / 100.0 ELSE 0 END)
    END
    + w.engine_hours * w.norm_engine_hour
    + w.cargo_ton_km / 100.0 * w.norm_per_ton_km
  , 2) AS norm_liters,
  CASE WHEN w.fuel_end IS NULL THEN NULL
       ELSE ROUND(w.fuel_start + COALESCE(fi.liters, 0) - w.fuel_end, 2) END AS fact_liters
FROM waybills w
JOIN vehicles   v  ON v.id = w.vehicle_id
JOIN fuel_types ft ON ft.id = v.fuel_type_id
JOIN drivers    d  ON d.id = w.driver_id
LEFT JOIN (
  SELECT waybill_id, SUM(liters) AS liters
  FROM fuel_issues WHERE waybill_id IS NOT NULL GROUP BY waybill_id
) fi ON fi.waybill_id = w.id;
