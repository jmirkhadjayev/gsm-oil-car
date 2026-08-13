// Raqam, sana va CSV formatlash yordamchilari.

export const nf = (n: unknown, digits = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export const ni = (n: unknown) => nf(n, 0);

export const money = (n: unknown) => `${nf(n, 0)} so'm`;

/** 2026-08-13 → 13.08.2026 */
export const dmy = (d?: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}.${m}.${y}`;
};

export const todayStr = () => new Date().toISOString().slice(0, 10);

export function monthRange(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`,
  };
}

/**
 * Jadvalni CSV ko'rinishida yuklab beradi.
 * Excel (rus/o'zbek lokali) uchun: BOM + nuqtali vergul ajratgichi.
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
