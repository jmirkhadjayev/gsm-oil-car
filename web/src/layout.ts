// Navigatsiya ko'rinishi.
//
//   side — chapda to'liq yon panel (odatiy)
//   rail — chapda faqat belgilar ustuni; sichqoncha yaqinlashsa ochiladi
//   top  — menyu yuqoriga ko'chadi, butun kenglik jadvalga qoladi
//
// Tanlov localStorage'da saqlanadi, har bir foydalanuvchi o'zi tanlaydi.
export type Layout = 'side' | 'rail' | 'top';

const KEY = 'gsm_layout';

export function getLayout(): Layout {
  const v = localStorage.getItem(KEY);
  return v === 'rail' || v === 'top' ? v : 'side';
}

export function setLayout(layout: Layout) {
  if (layout === 'side') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, layout);
  window.dispatchEvent(new CustomEvent('gsm-layout'));
}
