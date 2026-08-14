// Buyruq paneli — Ctrl+K (macOS'da ⌘K).
//
// Bir oynada uch xil narsa topiladi:
//   • bo'limlar    — sahifaga o'tish
//   • amallar      — yangi varaqa, yangi texnika va h.k.
//   • ma'lumot     — varaqa raqami, texnika, xodim (serverdan qidiriladi)
//
// Klaviatura: ↑↓ tanlash, ↵ ochish, Esc yopish. Sichqoncha ham ishlaydi.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs, setBranch, type Branch } from './api';
import { useAuth } from './auth';
import { pick, useI18n, type Key } from './i18n';
import { GROUP_ICON } from './lib/airport';
import { dmy } from './lib/format';

type Item = {
  id: string;
  group: string;          // guruh sarlavhasi
  icon: string;
  title: string;
  hint?: string;
  badge?: string;
  run: () => void;
};

type SearchResult = {
  waybills: any[];
  vehicles: any[];
  drivers: any[];
};

const RECENT_KEY = 'gsm_cmd_recent';
const loadRecent = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
};
const pushRecent = (id: string) => {
  const next = [id, ...loadRecent().filter((x) => x !== id)].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
};

export default function CommandPalette() {
  const { t, lang, setLang } = useI18n();
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isHq = user?.branch_id == null;

  // --------------------------- Ochish / yopish ---------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) { setQuery(''); setResult(null); setCursor(0); return; }
    document.body.style.overflow = 'hidden';
    // Fokus darhol qo'yiladi: kechikish bo'lsa tez yozgan odam birinchi
    // harflarni yo'qotadi. Effekt render'dan keyin ishlaydi, element tayyor.
    inputRef.current?.focus();
    if (isHq && !branches.length) api.get<Branch[]>('/branches').then(setBranches).catch(() => {});
    return () => { document.body.style.overflow = ''; };
  }, [open, isHq, branches.length]);

  // ----------------------------- Ma'lumot qidiruvi -----------------------
  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2) { setResult(null); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      api.get<SearchResult>(`/search${qs({ q: term })}`)
        .then(setResult)
        .catch(() => setResult(null))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  // ------------------------------- Buyruqlar -----------------------------
  const go = useCallback((path: string) => () => { navigate(path); setOpen(false); }, [navigate]);

  const staticItems = useMemo<Item[]>(() => {
    const pages: [string, string, Key][] = [
      ['/', '🏠', 'navDashboard'],
      ['/waybills', '📋', 'navWaybills'],
      ['/fuel', '⛽', 'navFuel'],
      ['/vehicles', '🚜', 'navVehicles'],
      ['/categories', '🗂️', 'navCategories'],
      ['/drivers', '👷', 'navDrivers'],
      ['/reports', '📊', 'navReports'],
    ];
    const items: Item[] = pages.map(([path, icon, key]) => ({
      id: `page:${path}`, group: t('cmdPages'), icon, title: t(key), run: go(path),
    }));
    if (can('admin')) {
      items.push({ id: 'page:/settings', group: t('cmdPages'), icon: '⚙️', title: t('navSettings'), run: go('/settings') });
    }

    if (can('waybills')) {
      items.push({
        id: 'act:new-waybill', group: t('cmdActions'), icon: '＋',
        title: t('newWaybill'), hint: t('cmdActionHint'), run: go('/waybills/new'),
      });
    }
    if (can('fuel')) {
      items.push({
        id: 'act:new-fuel', group: t('cmdActions'), icon: '＋',
        title: t('newFuelIssue'), hint: t('cmdActionHint'), run: go('/fuel'),
      });
    }
    if (can('refs')) {
      items.push({ id: 'act:new-vehicle', group: t('cmdActions'), icon: '＋', title: t('newVehicle'), run: go('/vehicles') });
      items.push({ id: 'act:new-driver', group: t('cmdActions'), icon: '＋', title: t('newDriver'), run: go('/drivers') });
    }

    // Filial almashtirish — faqat bosh ofis uchun
    if (isHq) {
      items.push({
        id: 'branch:all', group: t('branches'), icon: '🌐', title: t('allBranches'),
        run: () => { setBranch(''); location.reload(); },
      });
      for (const b of branches) {
        items.push({
          id: `branch:${b.id}`, group: t('branches'), icon: '📍',
          title: pick(lang, b, 'name'), badge: b.code,
          run: () => { setBranch(String(b.id)); location.reload(); },
        });
      }
    }

    items.push({
      id: 'sys:lang', group: t('cmdSystem'), icon: '🌍',
      title: lang === 'uz' ? 'Ruscha / Русский' : "O'zbekcha / Узбекский",
      run: () => { setLang(lang === 'uz' ? 'ru' : 'uz'); setOpen(false); },
    });
    items.push({
      id: 'sys:print', group: t('cmdSystem'), icon: '🖨',
      title: t('print'), run: () => { setOpen(false); setTimeout(() => window.print(), 120); },
    });
    items.push({
      id: 'sys:logout', group: t('cmdSystem'), icon: '⏻', title: t('logout'),
      run: () => { setOpen(false); logout(); },
    });

    return items;
  }, [t, lang, can, isHq, branches, go, setLang, logout]);

  // Serverdan kelgan ma'lumot buyruqlari
  const dataItems = useMemo<Item[]>(() => {
    if (!result) return [];
    const out: Item[] = [];
    for (const w of result.waybills) {
      out.push({
        id: `wb:${w.id}`, group: t('navWaybills'),
        icon: GROUP_ICON[(w.group_code ?? 'road') as keyof typeof GROUP_ICON] ?? '📋',
        title: `№${w.number} · ${w.garage_no}`,
        hint: `${dmy(w.date_from)} · ${w.driver_name}`,
        badge: w.branch_code, run: go(`/waybills/${w.id}`),
      });
    }
    for (const v of result.vehicles) {
      out.push({
        id: `veh:${v.id}`, group: t('navVehicles'),
        icon: GROUP_ICON[(v.group_code ?? 'road') as keyof typeof GROUP_ICON] ?? '🚜',
        title: `${v.garage_no} · ${v.model}`,
        hint: pick(lang, v, 'category_name') || v.plate,
        badge: v.branch_code, run: go('/vehicles'),
      });
    }
    for (const d of result.drivers) {
      out.push({
        id: `drv:${d.id}`, group: t('navDrivers'), icon: '👷',
        title: d.full_name, hint: d.tab_no ? `${t('tabNo')} ${d.tab_no}` : undefined,
        badge: d.branch_code, run: go('/drivers'),
      });
    }
    return out;
  }, [result, t, lang, go]);

  // --------------------------- Ko'rsatiladigan ro'yxat --------------------
  const items = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      // So'rov bo'sh: oxirgi ochilganlar, keyin amallar va bo'limlar
      const recent = loadRecent();
      const byId = new Map(staticItems.map((i) => [i.id, i]));
      const recentItems = recent.map((id) => byId.get(id)).filter(Boolean) as Item[];
      const rest = staticItems.filter((i) => !recent.includes(i.id));
      return [
        ...recentItems.map((i) => ({ ...i, group: t('cmdRecent') })),
        ...rest,
      ];
    }
    const matched = staticItems.filter((i) =>
      i.title.toLowerCase().includes(term) || (i.badge ?? '').toLowerCase().includes(term));
    return [...matched, ...dataItems];
  }, [query, staticItems, dataItems, t]);

  useEffect(() => { setCursor(0); }, [query, result]);

  // Tanlangan qatorni ko'rinish maydonida ushlab turish
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const choose = (item: Item) => { pushRecent(item.id); item.run(); };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && items[cursor]) { e.preventDefault(); choose(items[cursor]); }
  };

  if (!open) return null;

  // Guruhlar bo'yicha sarlavha qo'yish uchun oldingi guruhni eslab boramiz
  let lastGroup = '';

  return (
    <div className="cmd-backdrop no-print" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label={t('cmdTitle')}>
        <div className="cmd-input">
          <span className="cmd-glass" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t('cmdPlaceholder')}
            aria-label={t('cmdPlaceholder')}
          />
          {loading && <span className="cmd-loading">…</span>}
          <kbd className="cmd-esc">esc</kbd>
        </div>

        <div className="cmd-list" ref={listRef}>
          {items.length === 0 && <div className="cmd-empty">{t('cmdNothing')}</div>}
          {items.map((item, i) => {
            const head = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {head && <div className="cmd-group">{head}</div>}
                <button
                  type="button"
                  data-i={i}
                  className={`cmd-item${i === cursor ? ' on' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(item)}
                >
                  <span className="cmd-icon">{item.icon}</span>
                  <span className="cmd-text">
                    <span className="cmd-title">{item.title}</span>
                    {item.hint && <span className="cmd-sub">{item.hint}</span>}
                  </span>
                  {item.badge && <span className="cmd-badge">{item.badge}</span>}
                </button>
              </div>
            );
          })}
        </div>

        <div className="cmd-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('cmdNav')}</span>
          <span><kbd>↵</kbd> {t('cmdOpen')}</span>
          <span><kbd>esc</kbd> {t('cmdClose')}</span>
          <span className="spacer" />
          <span>{t('cmdCount').replace('{n}', String(items.length))}</span>
        </div>
      </div>
    </div>
  );
}

/** Topbar'dagi ko'rsatkich — panel borligini bildiradi va bosilsa ochadi. */
export function CommandHint() {
  const { t } = useI18n();
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const fire = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: !mac, metaKey: mac, bubbles: true }));
  };
  return (
    <button type="button" className="cmd-hint no-print" onClick={fire} title={t('cmdTitle')}>
      <span aria-hidden="true">⌕</span>
      <span className="cmd-hint-text">{t('cmdPlaceholderShort')}</span>
      <kbd>{mac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  );
}
