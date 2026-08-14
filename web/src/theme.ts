// Mavzu (yorug' / qorong'i / tizim bo'yicha).
//
// Uch holat bor:
//   light  — root'ga data-theme="light" qo'yiladi
//   dark   — root'ga data-theme="dark"
//   system — atribut olib tashlanadi, prefers-color-scheme hal qiladi
//
// Tanlov localStorage'da saqlanadi va index.html dagi kichik skript uni
// React yuklanishidan oldin qo'llaydi — shuning uchun sahifa ochilganda
// bir lahzaga oq ekran chaqnamaydi.
export type Theme = 'light' | 'dark' | 'system';

const KEY = 'gsm_theme';

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function setTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    localStorage.removeItem(KEY);
    root.removeAttribute('data-theme');
  } else {
    localStorage.setItem(KEY, theme);
    root.setAttribute('data-theme', theme);
  }
  window.dispatchEvent(new CustomEvent('gsm-theme'));
}

/** Hozir aslida qaysi mavzu ko'rinayotgani (tizim tanlovi hisobga olinadi). */
export function effectiveTheme(): 'light' | 'dark' {
  const t = getTheme();
  if (t !== 'system') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
