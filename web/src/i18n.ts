// Ikki tilli lug'at: [o'zbekcha, ruscha]
import { createContext, useContext } from 'react';

export type Lang = 'uz' | 'ru';

const dict = {
  // --- Umumiy ---
  appName: ['GSM hisobi', 'Учёт ГСМ'],
  appSub: ["Yo'l varaqalari va yoqilg'i hisobi", 'Путевые листы и учёт топлива'],
  save: ['Saqlash', 'Сохранить'],
  cancel: ['Bekor qilish', 'Отмена'],
  delete: ["O'chirish", 'Удалить'],
  edit: ['Tahrirlash', 'Изменить'],
  add: ["Qo'shish", 'Добавить'],
  search: ['Qidirish', 'Поиск'],
  filter: ['Filtr', 'Фильтр'],
  reset: ['Tozalash', 'Сбросить'],
  print: ['Chop etish', 'Печать'],
  export: ['Excel', 'Excel'],
  total: ['Jami', 'Итого'],
  from: ['dan', 'с'],
  to: ['gacha', 'по'],
  all: ['Barchasi', 'Все'],
  yes: ['Ha', 'Да'],
  no: ["Yo'q", 'Нет'],
  loading: ['Yuklanmoqda…', 'Загрузка…'],
  empty: ["Ma'lumot yo'q", 'Нет данных'],
  confirmDelete: ["Ushbu yozuvni o'chirishni tasdiqlaysizmi?", 'Подтвердите удаление записи?'],
  saved: ['Saqlandi', 'Сохранено'],
  deleted: ["O'chirildi", 'Удалено'],
  actions: ['Amallar', 'Действия'],
  close: ['Yopish', 'Закрыть'],
  back: ['Orqaga', 'Назад'],
  new: ['Yangi', 'Новый'],
  period: ['Davr', 'Период'],
  today: ['Bugun', 'Сегодня'],
  month: ['Joriy oy', 'Текущий месяц'],
  year: ['Yil', 'Год'],
  notes: ['Izoh', 'Примечание'],
  status: ['Holati', 'Статус'],
  date: ['Sana', 'Дата'],
  required: ["To'ldirilishi shart", 'Обязательное поле'],

  // --- Kirish ---
  login: ['Kirish', 'Вход'],
  logout: ['Chiqish', 'Выход'],
  username: ['Login', 'Логин'],
  password: ['Parol', 'Пароль'],
  signIn: ['Tizimga kirish', 'Войти в систему'],
  changePassword: ["Parolni o'zgartirish", 'Сменить пароль'],
  oldPassword: ['Joriy parol', 'Текущий пароль'],
  newPassword: ['Yangi parol', 'Новый пароль'],

  // --- Navigatsiya ---
  navDashboard: ['Bosh sahifa', 'Главная'],
  navWaybills: ["Yo'l varaqalari", 'Путевые листы'],
  navFuel: ["Yoqilg'i", 'Топливо'],
  navVehicles: ['Avtomobillar', 'Автомобили'],
  navDrivers: ['Haydovchilar', 'Водители'],
  navReports: ['Hisobotlar', 'Отчёты'],
  navSettings: ['Sozlamalar', 'Настройки'],

  // --- Bosh sahifa ---
  statVehicles: ['Faol avtomobillar', 'Активных ТС'],
  statDrivers: ['Haydovchilar', 'Водителей'],
  statOpen: ['Ochiq varaqalar', 'Открытых листов'],
  statMonthWaybills: ['Oylik varaqalar', 'Листов за месяц'],
  statMonthLiters: ["Oylik yoqilg'i", 'Топлива за месяц'],
  statMonthAmount: ['Oylik summa', 'Сумма за месяц'],
  statMonthDistance: ['Oylik yurish', 'Пробег за месяц'],
  statDeviation: ['Norma farqi', 'Отклонение от нормы'],
  openWaybills: ['Yopilmagan varaqalar', 'Незакрытые листы'],
  lowFuel: ["Yoqilg'i kam", 'Мало топлива'],
  topDeviation: ['Eng katta chetlanishlar', 'Наибольшие отклонения'],
  fuelByDay: ["Kunlik yoqilg'i quyish", 'Заправки по дням'],

  // --- Yo'l varaqasi ---
  waybill: ["Yo'l varaqasi", 'Путевой лист'],
  waybillNo: ['Varaqa №', 'Лист №'],
  newWaybill: ["Yangi yo'l varaqasi", 'Новый путевой лист'],
  editWaybill: ['Varaqani tahrirlash', 'Изменение листа'],
  vehicle: ['Avtomobil', 'Автомобиль'],
  driver: ['Haydovchi', 'Водитель'],
  garageNo: ['Garaj №', 'Гаражный №'],
  plate: ['Davlat raqami', 'Госномер'],
  model: ['Rusumi', 'Марка'],
  dateFrom: ['Sana (dan)', 'Дата (с)'],
  dateTo: ['Sana (gacha)', 'Дата (по)'],
  task: ['Topshiriq', 'Задание'],
  odoStart: ['Chiqishda spidometr', 'Спидометр при выезде'],
  odoEnd: ['Qaytishda spidometr', 'Спидометр при возврате'],
  fuelStart: ["Chiqishda qoldiq, l", 'Остаток при выезде, л'],
  fuelEnd: ['Qaytishda qoldiq, l', 'Остаток при возврате, л'],
  fuelIssued: ['Quyilgan, l', 'Заправлено, л'],
  engineHours: ['Ish soati', 'Часы работы'],
  cargoTonKm: ['Bajarilgan t·km', 'Выполнено т·км'],
  winter: ['Qishki ustama', 'Зимняя надбавка'],
  distance: ['Masofa, km', 'Пробег, км'],
  normLiters: ['Norma bo\'yicha, l', 'По норме, л'],
  factLiters: ['Haqiqiy sarf, l', 'Факт. расход, л'],
  deviation: ['Farq, l', 'Отклонение, л'],
  economy: ['Tejalgan', 'Экономия'],
  overrun: ['Ortiqcha sarf', 'Перерасход'],
  statusDraft: ['Qoralama', 'Черновик'],
  statusIssued: ['Berilgan', 'Выдан'],
  statusClosed: ['Yopilgan', 'Закрыт'],
  closeWaybill: ['Varaqani yopish', 'Закрыть лист'],
  reopenWaybill: ['Qayta ochish', 'Переоткрыть'],
  route: ['Marshrut', 'Маршрут'],
  pointFrom: ['Qayerdan', 'Откуда'],
  pointTo: ['Qayerga', 'Куда'],
  timeOut: ['Chiqish', 'Выезд'],
  timeIn: ['Kelish', 'Возврат'],
  cargo: ['Yuk', 'Груз'],
  cargoTon: ['Tonna', 'Тонн'],
  addRoute: ["Qator qo'shish", 'Добавить строку'],
  closeHint: ['Yopish uchun spidometr va bakdagi qoldiqni kiriting', 'Для закрытия укажите спидометр и остаток в баке'],

  // --- Yoqilg'i ---
  fuelIssue: ["Yoqilg'i quyish", 'Заправка'],
  newFuelIssue: ["Yangi quyish", 'Новая заправка'],
  fuelType: ["Yoqilg'i turi", 'Вид топлива'],
  liters: ['Miqdori', 'Количество'],
  price: ['Narxi', 'Цена'],
  amount: ['Summasi', 'Сумма'],
  source: ['Manba', 'Источник'],
  srcAzs: ['AZS', 'АЗС'],
  srcOmbor: ['Ombor', 'Склад'],
  srcTalon: ['Talon', 'Талон'],
  srcKarta: ['Karta', 'Карта'],
  station: ['Shoxobcha', 'Станция'],
  docNo: ['Hujjat №', 'Документ №'],
  linkWaybill: ["Yo'l varaqasiga bog'lash", 'Привязать к путевому листу'],
  noWaybill: ["Varaqasiz", 'Без листа'],
  tankBalance: ['Bak qoldig\'i', 'Остаток в баке'],

  // --- Spravochniklar ---
  newVehicle: ['Yangi avtomobil', 'Новый автомобиль'],
  newDriver: ['Yangi haydovchi', 'Новый водитель'],
  tankCapacity: ['Bak hajmi, l', 'Объём бака, л'],
  norm100: ['Norma, l/100km', 'Норма, л/100км'],
  winterPct: ['Qishki ustama, %', 'Зимняя надбавка, %'],
  normHour: ['Norma, l/soat', 'Норма, л/час'],
  normTonKm: ['Norma, l/100 t·km', 'Норма, л/100 т·км'],
  initOdometer: ["Boshlang'ich spidometr", 'Начальный спидометр'],
  initFuel: ["Boshlang'ich qoldiq, l", 'Начальный остаток, л'],
  currentOdometer: ['Joriy spidometr', 'Текущий спидометр'],
  derivedHint: ['Joriy qiymatlar yopilgan varaqalar asosida avtomatik hisoblanadi',
                'Текущие значения рассчитываются автоматически по закрытым листам'],
  fullName: ['F.I.Sh.', 'Ф.И.О.'],
  tabNo: ['Tabel №', 'Табельный №'],
  licenseNo: ['Guvohnoma №', 'Удостоверение №'],
  phone: ['Telefon', 'Телефон'],
  driverClass: ['Toifa', 'Категория'],
  active: ['Faol', 'Активен'],
  archived: ['Arxivda', 'В архиве'],

  // --- Hisobotlar ---
  repVehicles: ['Avtomobillar kesimida', 'По автомобилям'],
  repDrivers: ['Haydovchilar kesimida', 'По водителям'],
  repFuelTypes: ["Yoqilg'i turlari", 'По видам топлива'],
  repMonthly: ['Oylar bo\'yicha', 'По месяцам'],
  waybillsCount: ['Varaqalar', 'Листов'],
  factPer100: ['Fakt, l/100km', 'Факт, л/100км'],
  avgPrice: ["O'rtacha narx", 'Средняя цена'],
  records: ['Yozuvlar', 'Записей'],

  // --- Sozlamalar ---
  orgSettings: ['Tashkilot', 'Организация'],
  orgName: ['Tashkilot nomi', 'Наименование'],
  inn: ['STIR', 'ИНН'],
  address: ['Manzil', 'Адрес'],
  director: ['Rahbar', 'Руководитель'],
  mechanic: ['Mexanik', 'Механик'],
  winterMonths: ['Qish oylari (raqamlar)', 'Зимние месяцы (номера)'],
  users: ['Foydalanuvchilar', 'Пользователи'],
  newUser: ['Yangi foydalanuvchi', 'Новый пользователь'],
  role: ['Rol', 'Роль'],
  roleAdmin: ['Administrator', 'Администратор'],
  roleDispatcher: ['Dispetcher', 'Диспетчер'],
  roleOperator: ['Operator', 'Оператор'],
  roleViewer: ['Kuzatuvchi', 'Наблюдатель'],
  fuelPrices: ["Yoqilg'i narxlari", 'Цены на топливо'],
  passwordHint: ["Bo'sh qoldirilsa — o'zgarmaydi", 'Оставьте пустым — не изменится'],

  // --- Demo rejimi ---
  demoBadge: ['DEMO', 'ДЕМО'],
  demoStorage: ["Ma'lumot faqat shu brauzerda saqlanadi", 'Данные хранятся только в этом браузере'],
  demoLoading: ["Baza brauzerda tayyorlanmoqda…", 'Подготовка базы в браузере…'],
  demoTitle: ['Demo rejimi', 'Демо-режим'],
  demoAbout: [
    "Bu — dasturning tanishtiruv versiyasi. Baza brauzeringiz ichida (SQLite/WebAssembly) ishlaydi, "
    + "ma'lumotlaringiz hech qayerga yuborilmaydi va faqat shu qurilmada saqlanadi. "
    + "Ko'p foydalanuvchili to'liq versiya server bilan ishlaydi.",
    'Это ознакомительная версия. База работает внутри браузера (SQLite/WebAssembly), '
    + 'данные никуда не отправляются и хранятся только на этом устройстве. '
    + 'Полная многопользовательская версия работает с сервером.',
  ],
  demoReset: ["Demo ma'lumotni tiklash", 'Восстановить демо-данные'],
  demoResetHint: ["Barcha o'zgarishlaringiz o'chadi va boshlang'ich namuna ma'lumot qaytariladi",
                  'Все ваши изменения будут удалены и восстановлены исходные данные'],
  demoResetConfirm: ["Barcha ma'lumot o'chiriladi va demo qayta yaratiladi. Davom etasizmi?",
                     'Все данные будут удалены и демо создано заново. Продолжить?'],
  demoBackup: ['Bazani yuklab olish', 'Скачать базу'],
  demoBackupHint: ['SQLite fayli sifatida saqlanadi — server versiyasiga ko\'chirish mumkin',
                   'Сохраняется как файл SQLite — можно перенести в серверную версию'],

  // --- Bosma shakl ---
  printTitle: ["YO'L VARAQASI", 'ПУТЕВОЙ ЛИСТ'],
  printOrg: ['Tashkilot', 'Организация'],
  printDriverSign: ['Haydovchi imzosi', 'Подпись водителя'],
  printMechanicSign: ['Mexanik imzosi', 'Подпись механика'],
  printDirectorSign: ['Rahbar', 'Руководитель'],
  printFuelBlock: ["Yoqilg'i harakati", 'Движение топлива'],
  printRouteBlock: ['Marshrut varaqasi', 'Маршрутный лист'],
  printResults: ['Natijalar', 'Результаты'],
} as const;

export type Key = keyof typeof dict;

export const I18nContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: 'uz',
  setLang: () => {},
});

export function useI18n() {
  const { lang, setLang } = useContext(I18nContext);
  const t = (key: Key) => dict[key][lang === 'uz' ? 0 : 1];
  return { t, lang, setLang };
}

/** Bazadagi ikki tilli nomlar uchun (name_uz / name_ru). */
export const pick = (lang: Lang, row: any, base: string) =>
  (lang === 'uz' ? row?.[`${base}_uz`] : row?.[`${base}_ru`]) ?? row?.[base] ?? '';
