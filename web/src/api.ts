// Backend bilan aloqa qatlami.
//
// Ikki rejim:
//   • server rejimi  — so'rovlar `/api/...` ga fetch orqali yuboriladi;
//   • demo rejimi    — VITE_LOCAL=1 bilan yig'ilganda so'rovlar brauzer ichidagi
//                      SQLite (sql.js) bazasiga tushadi, server umuman kerak emas.
export const LOCAL_MODE = import.meta.env.VITE_LOCAL === '1';

const TOKEN_KEY = 'gsm_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  if (LOCAL_MODE) {
    const { localRequest, LocalError } = await import('./local/api');
    try {
      return (await localRequest(method, url, body)) as T;
    } catch (err) {
      if (err instanceof LocalError) throw new ApiError(err.status, err.message);
      throw err;
    }
  }

  const token = getToken();
  const res = await fetch(`/api${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new ApiError(401, 'Sessiya tugadi');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data as any)?.error || `Xatolik (${res.status})`);
  return data as T;
}

export const api = {
  get: <T,>(url: string) => request<T>('GET', url),
  post: <T,>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T,>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T,>(url: string) => request<T>('DELETE', url),
};

/** So'rov satrini yig'adi, bo'sh qiymatlarni tashlab yuboradi. */
export function qs(params: Record<string, unknown>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ------------------------------- Turlar -------------------------------
export type Role = 'admin' | 'dispatcher' | 'operator' | 'viewer';
export type User = { id: number; username: string; full_name: string; role: Role; active?: number };

export type FuelType = {
  id: number; code: string; name_uz: string; name_ru: string;
  unit_uz: string; unit_ru: string; price: number; active: number;
};

export type NormBasis = 'km' | 'hour' | 'both' | 'electric';
export type EquipGroup = 'aircraft' | 'passenger' | 'cargo' | 'airfield' | 'road';
export type PowerType = 'diesel' | 'petrol' | 'gas' | 'electric' | 'hybrid';
export type Position = 'driver' | 'operator' | 'mechanic' | 'loader';
export type Shift = 'day' | 'night' | 'full';

export type EquipmentCategory = {
  id: number; code: string; name_uz: string; name_ru: string;
  group_code: EquipGroup; norm_basis: NormBasis;
  default_norm_km: number; default_norm_hour: number;
  active: number; vehicle_count?: number;
};

export type Zone = { id: number; code: string; name_uz: string; name_ru: string; active: number };

export type ServiceType = {
  id: number; code: string; name_uz: string; name_ru: string;
  unit: 'flight' | 'ton' | 'uld' | 'pax' | 'hour'; active: number;
};

export type Vehicle = {
  id: number; garage_no: string; plate: string; model: string; fuel_type_id: number;
  category_id: number | null; zone_id: number | null;
  norm_basis: NormBasis; power_type: PowerType;
  serial_no: string; made_year: number | null;
  tank_capacity: number; norm_per_100km: number; winter_pct: number;
  norm_engine_hour: number; norm_per_ton_km: number;
  init_odometer: number; init_hours: number; init_fuel: number;
  odometer: number; hour_meter: number; fuel_balance: number;
  active: number; notes: string;
  fuel_code?: string; fuel_name_uz?: string; fuel_name_ru?: string;
  unit_uz?: string; unit_ru?: string; fuel_price?: number;
  category_code?: string; group_code?: EquipGroup;
  category_name_uz?: string; category_name_ru?: string;
  zone_code?: string; zone_name_uz?: string; zone_name_ru?: string;
};

export type Driver = {
  id: number; full_name: string; tab_no: string; license_no: string;
  phone: string; class: string; position: Position;
  apron_permit: string; permit_until: string | null; active: number;
};

/** Bajarilgan ish qatori: yo'l marshruti yoki reysga xizmat operatsiyasi. */
export type RouteRow = {
  id?: number; seq?: number;
  point_from: string; point_to: string;
  time_out: string; time_in: string;
  distance_km: number; cargo: string; cargo_ton: number;
  flight_no: string; aircraft_type: string; aircraft_reg: string; stand: string;
  service_type_id: number | null; zone_id: number | null;
  uld_count: number; pax_count: number; op_hours: number;
};

export const emptyRoute = (): RouteRow => ({
  point_from: '', point_to: '', time_out: '', time_in: '',
  distance_km: 0, cargo: '', cargo_ton: 0,
  flight_no: '', aircraft_type: '', aircraft_reg: '', stand: '',
  service_type_id: null, zone_id: null, uld_count: 0, pax_count: 0, op_hours: 0,
});

export type Waybill = {
  id: number; number: string; date_from: string; date_to: string;
  vehicle_id: number; driver_id: number; status: 'draft' | 'issued' | 'closed';
  odo_start: number; odo_end: number | null;
  hours_start: number; hours_end: number | null;
  fuel_start: number; fuel_end: number | null;
  engine_hours: number; cargo_ton_km: number;
  zone_id: number | null; shift: Shift; winter: number;
  norm_per_100km: number; norm_engine_hour: number; norm_per_ton_km: number; winter_pct: number;
  task: string; notes: string; created_at: string; closed_at: string | null;
  // ko'rinishdan keladigan hisob-kitob maydonlari
  garage_no: string; plate: string; model: string; driver_name: string; tab_no: string;
  norm_basis: NormBasis; power_type: PowerType; position: Position;
  category_id: number | null; category_code?: string; group_code?: EquipGroup;
  category_name_uz?: string; category_name_ru?: string;
  zone_code?: string; zone_name_uz?: string; zone_name_ru?: string;
  fuel_code: string; fuel_name_uz: string; fuel_name_ru: string;
  unit_uz?: string; unit_ru?: string;
  fuel_issued: number; distance_km: number | null; worked_hours: number;
  flights_served: number; cargo_ton: number; uld_count: number; pax_count: number;
  norm_liters: number; fact_liters: number | null; deviation?: number | null;
  routes?: RouteRow[]; fuel?: FuelIssue[];
};

export type FuelIssue = {
  id: number; date: string; vehicle_id: number; driver_id: number | null; waybill_id: number | null;
  fuel_type_id: number; liters: number; price: number; amount: number;
  source: 'azs' | 'ombor' | 'talon' | 'karta'; station: string; doc_no: string; notes: string;
  garage_no?: string; plate?: string; model?: string; driver_name?: string;
  waybill_number?: string; fuel_code?: string; fuel_name_uz?: string; fuel_name_ru?: string;
};

export type Org = {
  id: number; name: string; inn: string; address: string; phone: string;
  director: string; mechanic: string; winter_months: string;
};
