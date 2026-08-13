# GSM hisobi — yo'l varaqalari va yoqilg'i hisobi dasturi

Avtotransport xo'jaligi uchun ko'p foydalanuvchili veb-ilova: yo'l varaqalarini (путевые листы)
rasmiylashtirish, yoqilg'i sarfini norma bo'yicha nazorat qilish va hisobotlar tayyorlash.
Interfeys **o'zbek va rus** tillarida.

### ▶ Onlayn demo: **https://jmirkhadjayev.github.io/gsm-oil-car/**

O'rnatishsiz sinab ko'rish mumkin — havolani ochsangiz ilova darhol ishlaydi, namuna ma'lumotlar bilan.
Demoda baza **brauzeringiz ichida** (SQLite/WebAssembly + IndexedDB) ishlaydi: ma'lumot hech qayerga
yuborilmaydi va faqat shu qurilmada saqlanadi. Shuning uchun demoda parol so'ralmaydi va
ko'p foydalanuvchilik yo'q — buning uchun quyidagi server versiyasi ishlatiladi.

---

## Tez ishga tushirish

```bash
npm run setup     # paketlarni o'rnatadi va frontendni yig'adi (bir marta)
npm start         # http://localhost:3000
```

Birinchi kirish: **login `admin` / parol `admin`** — kirgach *Sozlamalar → Parolni o'zgartirish*
bo'limidan albatta almashtiring.

> **Baza hozir namuna ma'lumotlar bilan to'ldirilgan** — joriy oy uchun 22 ta yopilgan
> yo'l varaqasi, quyishlar va 3 ta avtomobil. Bu ilova bilan tanishish uchun.
> **Haqiqiy ish uchun bazani tozalang:** serverni to'xtating, `data/` papkasidagi
> `gsm.db*` fayllarni o'chiring va `npm start` qiling — bo'sh baza yaratiladi
> (faqat `admin` foydalanuvchisi va yoqilg'i turlari qoladi).

Namuna ma'lumotlarni qaytadan yaratish:

```bash
GSM_DEMO=1 npm start           # 3 avtomobil + 3 haydovchi qo'shadi
node scripts/demo-data.js      # joriy oy uchun varaqa va quyishlar (server ishlab turganda)
```

### Ishlab chiqish rejimi

```bash
npm run dev       # backend (avto-qayta ishga tushish) + Vite → http://localhost:5173
```

### Tekshiruv

```bash
node scripts/smoke.js       # server ishlab turganda: hisob-kitob mantig'ini tekshiradi
```

---

## Imkoniyatlar

### Yo'l varaqalari
- Varaqa ochish, marshrut qatorlari (qayerdan–qayerga, vaqt, masofa, yuk)
- Avtomobil tanlanganda spidometr, bak qoldig'i va normalar **avtomatik to'ldiriladi**
- Varaqani yopish: qaytgandagi spidometr va bak qoldig'i kiritiladi, natijalar darhol ko'rinadi
- Holatlar: qoralama → berilgan → yopilgan; qayta ochish imkoniyati
- **A4 bosma shakli** (gorizontal): yoqilg'i harakati, marshrut jadvali, imzo joylari

### Yoqilg'i hisobi
- Quyish yozuvlari: sana, avtomobil, haydovchi, tur, miqdor, narx, summa, AZS, hujjat №
- Manbalar: AZS / ombor / talon / karta
- Varaqaga bog'lash — quyilgan yoqilg'i o'sha varaqaning sarfiga kiradi
- Bak sig'imidan oshib ketishi haqida ogohlantirish

### Normativ hisob-kitob
```
norma = masofa/100 × norma_l_100km × (1 + qish%)
      + ish_soati × norma_l_soat
      + t·km/100  × norma_l_100tkm

fakt  = chiqishdagi qoldiq + quyilgan − qaytgandagi qoldiq
farq  = fakt − norma        (+ ortiqcha sarf,  − tejamkorlik)
```
Normalar varaqa ochilganda **nusxalanadi** — spravochnikda norma keyin o'zgarsa ham,
eski varaqalarning hisobi buzilmaydi.

### Hisobotlar
Avtomobillar / haydovchilar / yoqilg'i turlari kesimida va oylar bo'yicha.
Har biri Excel uchun CSV ga eksport qilinadi (BOM + `;` ajratgichi) va bosmaga chiqariladi.

### Rollar
| Rol | Imkoniyatlari |
|---|---|
| `admin` | Hammasi: spravochniklar, foydalanuvchilar, yopilgan varaqalarni tahrirlash |
| `dispatcher` | Yo'l varaqalari + yoqilg'i |
| `operator` | Faqat yoqilg'i quyish yozuvlari |
| `viewer` | Faqat ko'rish va hisobotlar |

---

## Texnik tuzilishi

| Qatlam | Texnologiya |
|---|---|
| Backend | Node.js 22+ / Express, **`node:sqlite`** (ichki modul — native paket kerak emas) |
| Frontend | React 19 + TypeScript + Vite |
| Autentifikatsiya | scrypt parol xeshi + bazadagi sessiya tokenlari (30 kun) |

```
GSM/
├─ server/
│  ├─ schema.sql        ma'lumotlar bazasi sxemasi + v_waybill_calc ko'rinishi
│  ├─ db.js             SQLite ulanishi, tranzaksiya, audit
│  ├─ calc.js           norma/fakt hisobi va avtomobil holatini qayta hisoblash
│  ├─ auth.js           parol xeshlash, sessiyalar, rol tekshiruvi
│  ├─ seed.js           boshlang'ich ma'lumotlar
│  └─ routes/           auth · refs · waybills · fuel · reports
├─ web/src/
│  ├─ i18n.ts           uz/ru lug'ati
│  ├─ api.ts            REST qatlami va turlar
│  ├─ ui.tsx            modal, maydon, bildirishnoma komponentlari
│  └─ pages/            Dashboard · Waybills · WaybillForm · WaybillPrint ·
│                       Fuel · Vehicles · Drivers · Reports · Settings
│  └─ local/            DEMO REJIMI: brauzer ichidagi "server"
│     ├─ db.ts          sql.js (SQLite WASM) + IndexedDB da saqlash
│     ├─ api.ts         server/routes/* marshrutlarining ko'chirmasi
│     ├─ calc.ts        server/calc.js ning ko'chirmasi
│     └─ seed.ts        namuna ma'lumotlar generatori
├─ scripts/dev.js       ishlab chiqish rejimi
├─ scripts/smoke.js     uchidan-uchiga tekshiruv
├─ scripts/copy-schema.js  schema.sql → web/src/local/ (bitta manba)
└─ data/gsm.db          baza (avtomatik yaratiladi, .gitignore da)
```

### Demo (GitHub Pages) versiyasi

`npm run build:pages` — `web/dist` ichiga serversiz versiyani yig'adi
(`--mode pages`, `VITE_LOCAL=1`). Farqlari:

| | Server versiyasi | Demo versiyasi |
|---|---|---|
| Baza | `data/gsm.db` (Node) | brauzer IndexedDB (sql.js) |
| Kirish | login/parol, rollar | parolsiz, administrator |
| Marshrutlash | oddiy URL | hash (`#/waybills`) — Pages uchun |
| Ma'lumot | umumiy, barcha uchun | har bir brauzerda alohida |

Baza sxemasi ikkalasida bir xil: `server/schema.sql` build paytida
`web/src/local/schema.generated.sql` ga nusxalanadi, shuning uchun `v_waybill_calc`
ko'rinishidagi norma/fakt hisobi ham aynan bir xil.

Har bir `main` ga push'da [GitHub Actions](.github/workflows/pages.yml) demo versiyani
avtomatik yig'ib Pages'ga joylaydi.

### Muhim: qoldiqlar qanday hisoblanadi

Avtomobilning **joriy spidometri** va **bak qoldig'i** — hosila qiymatlar:

```
spidometr = boshlang'ich_spidometr + Σ(yopilgan varaqalar masofasi)
qoldiq    = boshlang'ich_qoldiq    + Σ(quyilgan) − Σ(yopilgan varaqalar fakt sarfi)
```

Shu sababli har qanday o'zgarish (varaqani yopish, qayta ochish, o'chirish, quyishni
tahrirlash) `recalcVehicle()` orqali butun tarixdan qayta hisoblanadi — tartibga bog'liq
emas va nomuvofiqlik to'planmaydi. Avtomobil kartochkasida faqat **boshlang'ich** qiymatlar
qo'lda kiritiladi.

---

## Muhit o'zgaruvchilari

| O'zgaruvchi | Standart | Ma'nosi |
|---|---|---|
| `GSM_PORT` | `3000` | Server porti |
| `GSM_HOST` | `0.0.0.0` | Tarmoqdagi boshqa kompyuterlardan kirish uchun |
| `GSM_DB` | `data/gsm.db` | Baza fayli yo'li |
| `GSM_DEMO` | — | `1` bo'lsa namuna ma'lumotlar qo'shiladi |

Lokal tarmoqda ishlatish uchun serverni bitta kompyuterda ishga tushiring, qolganlari
brauzerdan `http://<server-ip>:3000` manziliga kiradi.

## Zaxira nusxa

`data/` papkasini nusxalash kifoya (`gsm.db`, `gsm.db-wal`, `gsm.db-shm`).
Server to'xtatilgan holatda nusxalash tavsiya etiladi.
