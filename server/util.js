// Kichik yordamchilar: validatsiya, xatoliklar, marshrut o'ramchisi.

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const bad = (msg, details) => new HttpError(400, msg, details);
export const notFound = (msg = 'not_found') => new HttpError(404, msg);

/** Marshrut ichidagi xatolarni Express xato ishlovchisiga uzatadi. */
export const h = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res, next);
    if (out && typeof out.then === 'function') out.catch(next);
  } catch (err) {
    next(err);
  }
};

export function num(value, field, { min = -Infinity, max = Infinity, def = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (def !== null) return def;
    throw bad(`"${field}" — son bo'lishi shart`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw bad(`"${field}" — noto'g'ri son`);
  if (n < min || n > max) throw bad(`"${field}" — qiymat oralig'i buzilgan (${min}…${max})`);
  return n;
}

export function optNum(value, field, opts = {}) {
  if (value === undefined || value === null || value === '') return null;
  return num(value, field, opts);
}

export function str(value, field, { required = false, max = 500 } = {}) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (required && !s) throw bad(`"${field}" — to'ldirilishi shart`);
  if (s.length > max) throw bad(`"${field}" — juda uzun (maks. ${max})`);
  return s;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function date(value, field, { required = true, def = null } = {}) {
  const s = str(value, field);
  if (!s) {
    if (def) return def;
    if (required) throw bad(`"${field}" — sana ko'rsatilishi shart`);
    return null;
  }
  if (!DATE_RE.test(s)) throw bad(`"${field}" — sana formati YYYY-MM-DD bo'lishi kerak`);
  return s;
}

export const bool = (value) => (value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0);

export const today = () => new Date().toISOString().slice(0, 10);

/** Oy boshi/oxiri — hisobot filtrlari uchun standart oraliq. */
export function monthRange(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`,
  };
}
