-- =====================================================================
--  GSM hisobi — ma'lumotlar bazasi sxemasi (SQLite)
--  Yo'l varaqalari (путевые листы) va yoqilg'i hisobi
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ============================ FILIALLAR ==============================
--  Har bir aeroport — alohida filial. Ma'lumotlar bitta bazada saqlanadi,
--  ajratish har bir yozuvdagi branch_id orqali amalga oshiriladi.
--  users.branch_id = NULL  →  bosh ofis: barcha filiallarni ko'radi.
CREATE TABLE IF NOT EXISTS branches (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code    TEXT NOT NULL UNIQUE,          -- IATA kodi: TAS, SKD, BHK, KSQ
  name_uz TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  active  INTEGER NOT NULL DEFAULT 1
);

-- ------------------------- Foydalanuvchilar --------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id     INTEGER REFERENCES branches(id),   -- NULL = bosh ofis
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

-- ===================== AEROPORT TEXNIKASI TURKUMLARI =====================
--  Yer usti xizmati texnikasi (GSE — Ground Support Equipment) va oddiy
--  avtotransport turkumlari. Har bir turkum uchun norma qanday o'lchanishi:
--    km       — 100 km ga (yo'l transporti)
--    hour     — motosoatga (perron texnikasi, generatorlar, pogruzchiklar)
--    both     — ham km, ham motosoat (yurib borib, joyida ishlaydigan texnika)
--    electric — elektr energiya, kVt·soat/motosoat (elektr pogruzchiklar)
CREATE TABLE IF NOT EXISTS equipment_categories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,
  name_uz      TEXT NOT NULL,
  name_ru      TEXT NOT NULL,
  -- aircraft: havo kemasiga xizmat | passenger: yo'lovchi | cargo: yuk terminali
  -- airfield: aerodrom xizmati     | road: umumiy avtotransport
  group_code   TEXT NOT NULL DEFAULT 'road'
               CHECK (group_code IN ('aircraft','passenger','cargo','airfield','road')),
  norm_basis   TEXT NOT NULL DEFAULT 'km'
               CHECK (norm_basis IN ('km','hour','both','electric')),
  default_norm_km   REAL NOT NULL DEFAULT 0,
  default_norm_hour REAL NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1
);

-- --------------------------- Aeroport zonalari ---------------------------
CREATE TABLE IF NOT EXISTS zones (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code    TEXT NOT NULL UNIQUE,
  name_uz TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  active  INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------- Xizmat turlari -----------------------------
CREATE TABLE IF NOT EXISTS service_types (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code    TEXT NOT NULL UNIQUE,
  name_uz TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  -- operatsiya nimada o'lchanadi: reys / tonna / ULD / yo'lovchi / soat
  unit    TEXT NOT NULL DEFAULT 'flight'
          CHECK (unit IN ('flight','ton','uld','pax','hour')),
  active  INTEGER NOT NULL DEFAULT 1
);

-- ---------------------- Texnika (avtomobil va GSE) -----------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id        INTEGER NOT NULL DEFAULT 1 REFERENCES branches(id),
  -- Garaj raqami filial ichida noyob: ikki aeroportda GSE-01 bo'lishi mumkin
  garage_no        TEXT NOT NULL,
  plate            TEXT NOT NULL,                 -- davlat raqami (perron texnikasida bo'lmasligi mumkin)
  model            TEXT NOT NULL,
  category_id      INTEGER REFERENCES equipment_categories(id),
  zone_id          INTEGER REFERENCES zones(id),  -- doimiy ish zonasi
  norm_basis       TEXT NOT NULL DEFAULT 'km'
                   CHECK (norm_basis IN ('km','hour','both','electric')),
  power_type       TEXT NOT NULL DEFAULT 'diesel'
                   CHECK (power_type IN ('diesel','petrol','gas','electric','hybrid')),
  serial_no        TEXT NOT NULL DEFAULT '',      -- zavod raqami
  made_year        INTEGER,                       -- ishlab chiqarilgan yil
  fuel_type_id     INTEGER NOT NULL REFERENCES fuel_types(id),
  tank_capacity    REAL NOT NULL DEFAULT 0,       -- bak hajmi, l
  norm_per_100km   REAL NOT NULL DEFAULT 0,       -- asosiy norma, l/100 km
  winter_pct       REAL NOT NULL DEFAULT 0,       -- qishki ustama, %
  norm_engine_hour REAL NOT NULL DEFAULT 0,       -- motosoat normasi, l/soat
  norm_per_ton_km  REAL NOT NULL DEFAULT 0,       -- yuk normasi, l/100 t·km
  -- Boshlang'ich holat (tizimga kiritilgan paytdagi) — qo'lda kiritiladi:
  init_odometer    REAL NOT NULL DEFAULT 0,
  init_hours       REAL NOT NULL DEFAULT 0,       -- boshlang'ich motosoat hisoblagichi
  init_fuel        REAL NOT NULL DEFAULT 0,
  -- Quyidagilar HOSILA qiymat: recalcVehicle() qayta hisoblaydi.
  --   odometer     = init_odometer + Σ(yopilgan varaqalar masofasi)
  --   hour_meter   = init_hours    + Σ(yopilgan varaqalar motosoati)
  --   fuel_balance = init_fuel + Σ(quyilgan) − Σ(yopilgan varaqalar fakt sarfi)
  odometer         REAL NOT NULL DEFAULT 0,       -- joriy spidometr
  hour_meter       REAL NOT NULL DEFAULT 0,       -- joriy motosoat
  fuel_balance     REAL NOT NULL DEFAULT 0,       -- bakdagi joriy qoldiq, l
  active           INTEGER NOT NULL DEFAULT 1,
  notes            TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vehicles_active ON vehicles(active);
CREATE INDEX IF NOT EXISTS idx_vehicles_category ON vehicles(category_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_branch ON vehicles(branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_branch_garage ON vehicles(branch_id, garage_no);

-- ------------------ Haydovchilar / texnika operatorlari ----------------
CREATE TABLE IF NOT EXISTS drivers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id  INTEGER NOT NULL DEFAULT 1 REFERENCES branches(id),
  full_name  TEXT NOT NULL,
  tab_no     TEXT NOT NULL DEFAULT '',            -- tabel raqami
  license_no TEXT NOT NULL DEFAULT '',            -- guvohnoma
  phone      TEXT NOT NULL DEFAULT '',
  class      TEXT NOT NULL DEFAULT '',
  position   TEXT NOT NULL DEFAULT 'driver'       -- lavozimi
             CHECK (position IN ('driver','operator','mechanic','loader')),
  -- perronda ishlash ruxsatnomasi (aerodrom propuski)
  apron_permit TEXT NOT NULL DEFAULT '',
  permit_until TEXT,                              -- ruxsatnoma amal qilish muddati
  active     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_drivers_active ON drivers(active);

-- ------------------------- Yo'l varaqalari ---------------------------
CREATE TABLE IF NOT EXISTS waybills (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id      INTEGER NOT NULL DEFAULT 1 REFERENCES branches(id),
  number         TEXT    NOT NULL,          -- filial ichida noyob
  date_from      TEXT    NOT NULL,                -- YYYY-MM-DD
  date_to        TEXT    NOT NULL,
  vehicle_id     INTEGER NOT NULL REFERENCES vehicles(id),
  driver_id      INTEGER NOT NULL REFERENCES drivers(id),
  -- draft: qoralama | issued: berilgan | closed: yopilgan (hisobga olingan)
  status         TEXT    NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','issued','closed')),
  odo_start      REAL    NOT NULL DEFAULT 0,      -- chiqishdagi spidometr
  odo_end        REAL,                            -- qaytgandagi spidometr
  hours_start    REAL    NOT NULL DEFAULT 0,      -- smena boshidagi motosoat hisoblagichi
  hours_end      REAL,                            -- smena oxiridagi motosoat hisoblagichi
  fuel_start     REAL    NOT NULL DEFAULT 0,      -- chiqishdagi bak qoldig'i
  fuel_end       REAL,                            -- qaytgandagi bak qoldig'i
  -- Motosoat: hisoblagich ko'rsatilgan bo'lsa (hours_end − hours_start) ustun turadi
  engine_hours   REAL    NOT NULL DEFAULT 0,
  cargo_ton_km   REAL    NOT NULL DEFAULT 0,      -- bajarilgan t·km
  zone_id        INTEGER REFERENCES zones(id),    -- asosiy ish zonasi
  shift          TEXT    NOT NULL DEFAULT 'day'   -- smena
                         CHECK (shift IN ('day','night','full')),
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
CREATE INDEX IF NOT EXISTS idx_waybills_branch  ON waybills(branch_id, date_from);
CREATE UNIQUE INDEX IF NOT EXISTS uq_waybills_branch_number ON waybills(branch_id, number);

-- ---------------------- Bajarilgan ishlar qatorlari ----------------------
--  Bitta jadval ikki xil ishlatiladi:
--   • yo'l transporti — marshrut qatori (qayerdan → qayerga, masofa);
--   • perron texnikasi — reysga xizmat operatsiyasi (reys, bort, stoyanka, xizmat turi).
--  Qaysi ustunlar ko'rsatilishi texnika turkumining norm_basis qiymatiga bog'liq.
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
  cargo_ton   REAL NOT NULL DEFAULT 0,
  -- Aeroport operatsiyasi maydonlari:
  flight_no       TEXT NOT NULL DEFAULT '',       -- reys raqami, mas. HY-601
  aircraft_type   TEXT NOT NULL DEFAULT '',       -- havo kemasi turi, mas. B767-300
  aircraft_reg    TEXT NOT NULL DEFAULT '',       -- bort raqami, mas. UK-67001
  stand           TEXT NOT NULL DEFAULT '',       -- stoyanka (parking stand)
  service_type_id INTEGER REFERENCES service_types(id),
  zone_id         INTEGER REFERENCES zones(id),
  uld_count       INTEGER NOT NULL DEFAULT 0,     -- ULD (konteyner/palet) soni
  pax_count       INTEGER NOT NULL DEFAULT 0,     -- yo'lovchilar soni
  op_hours        REAL NOT NULL DEFAULT 0         -- operatsiya davomiyligi, motosoat
);
CREATE INDEX IF NOT EXISTS idx_routes_waybill ON waybill_routes(waybill_id);
CREATE INDEX IF NOT EXISTS idx_routes_flight  ON waybill_routes(flight_no);

-- --------------------- Yoqilg'i quyish (kirim) -----------------------
CREATE TABLE IF NOT EXISTS fuel_issues (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id    INTEGER NOT NULL DEFAULT 1 REFERENCES branches(id),
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
--  KO'RINISH: varaqa (smena) bo'yicha to'liq hisob-kitob
--
--   motosoat = hisoblagich ko'rsatilgan bo'lsa (hours_end − hours_start),
--              aks holda qo'lda kiritilgan engine_hours
--
--   norma = ( masofa/100 × l/100km
--           + motosoat  × l/soat
--           + t·km/100  × l/100t·km ) × (1 + qish%)
--
--   fakt  = boshlang'ich qoldiq + quyilgan − oxirgi qoldiq
--   farq  = fakt − norma   (musbat = ortiqcha sarf, manfiy = tejalgan)
-- =====================================================================
DROP VIEW IF EXISTS v_waybill_calc;
CREATE VIEW v_waybill_calc AS
SELECT
  w.*,
  v.garage_no, v.plate, v.model, v.fuel_type_id, v.norm_basis, v.power_type,
  v.category_id, ec.code AS category_code, ec.group_code,
  ec.name_uz AS category_name_uz, ec.name_ru AS category_name_ru,
  z.code AS zone_code, z.name_uz AS zone_name_uz, z.name_ru AS zone_name_ru,
  br.code AS branch_code, br.name_uz AS branch_name_uz, br.name_ru AS branch_name_ru,
  ft.code AS fuel_code, ft.name_uz AS fuel_name_uz, ft.name_ru AS fuel_name_ru,
  ft.unit_uz, ft.unit_ru,
  d.full_name AS driver_name, d.tab_no, d.position,
  COALESCE(fi.liters, 0) AS fuel_issued,
  COALESCE(op.flights, 0)    AS flights_served,
  COALESCE(op.cargo_ton, 0)  AS cargo_ton,
  COALESCE(op.uld_count, 0)  AS uld_count,
  COALESCE(op.pax_count, 0)  AS pax_count,
  CASE WHEN w.odo_end IS NULL THEN NULL
       ELSE ROUND(w.odo_end - w.odo_start, 2) END AS distance_km,
  ROUND(
    CASE WHEN w.hours_end IS NOT NULL THEN MAX(0, w.hours_end - w.hours_start)
         ELSE w.engine_hours END
  , 2) AS worked_hours,
  ROUND(
    (
      CASE WHEN w.odo_end IS NULL THEN 0
           ELSE (w.odo_end - w.odo_start) / 100.0 * w.norm_per_100km END
      + CASE WHEN w.hours_end IS NOT NULL THEN MAX(0, w.hours_end - w.hours_start)
             ELSE w.engine_hours END * w.norm_engine_hour
      + w.cargo_ton_km / 100.0 * w.norm_per_ton_km
    ) * (1 + CASE WHEN w.winter = 1 THEN w.winter_pct / 100.0 ELSE 0 END)
  , 2) AS norm_liters,
  CASE WHEN w.fuel_end IS NULL THEN NULL
       ELSE ROUND(w.fuel_start + COALESCE(fi.liters, 0) - w.fuel_end, 2) END AS fact_liters
FROM waybills w
JOIN vehicles   v  ON v.id = w.vehicle_id
JOIN fuel_types ft ON ft.id = v.fuel_type_id
JOIN drivers    d  ON d.id = w.driver_id
LEFT JOIN equipment_categories ec ON ec.id = v.category_id
LEFT JOIN zones z ON z.id = COALESCE(w.zone_id, v.zone_id)
LEFT JOIN branches br ON br.id = w.branch_id
LEFT JOIN (
  SELECT waybill_id, SUM(liters) AS liters
  FROM fuel_issues WHERE waybill_id IS NOT NULL GROUP BY waybill_id
) fi ON fi.waybill_id = w.id
LEFT JOIN (
  SELECT waybill_id,
         COUNT(NULLIF(TRIM(flight_no), '')) AS flights,
         SUM(cargo_ton) AS cargo_ton,
         SUM(uld_count) AS uld_count,
         SUM(pax_count) AS pax_count
  FROM waybill_routes GROUP BY waybill_id
) op ON op.waybill_id = w.id;
