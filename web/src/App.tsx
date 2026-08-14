import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nContext, pick, useI18n, type Lang } from './i18n';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider } from './ui';
import { api, getBranch, setBranch, LOCAL_MODE, type Branch } from './api';
import CommandPalette, { CommandHint } from './CommandPalette';
import { getTheme, setTheme, type Theme } from './theme';
import { getLayout, setLayout, type Layout } from './layout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Waybills from './pages/Waybills';
import WaybillForm from './pages/WaybillForm';
import WaybillPrint from './pages/WaybillPrint';
import Fuel from './pages/Fuel';
import Vehicles from './pages/Vehicles';
import Categories from './pages/Categories';
import Drivers from './pages/Drivers';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export default function App() {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('gsm_lang') as Lang) || 'uz');
  const setLang = (l: Lang) => { localStorage.setItem('gsm_lang', l); setLangState(l); };

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang }}>
      <AuthProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </AuthProvider>
    </I18nContext.Provider>
  );
}

/** Navigatsiya bo'limlari — yon panel ham, yuqori menyu ham shundan foydalanadi. */
function useNavItems() {
  const { t } = useI18n();
  const { can } = useAuth();
  return [
    { to: '/', icon: '🏠', label: t('navDashboard'), end: true },
    { to: '/waybills', icon: '📋', label: t('navWaybills') },
    { to: '/fuel', icon: '⛽', label: t('navFuel') },
    { to: '/vehicles', icon: '🚜', label: t('navVehicles') },
    { to: '/categories', icon: '🗂️', label: t('navCategories') },
    { to: '/drivers', icon: '👷', label: t('navDrivers') },
    { to: '/reports', icon: '📊', label: t('navReports') },
    ...(can('admin') ? [{ to: '/settings', icon: '⚙️', label: t('navSettings') }] : []),
  ];
}

/** Joriy sahifa nomi. */
function usePageTitle() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const titles: Record<string, string> = {
    '/': t('navDashboard'), '/waybills': t('navWaybills'), '/fuel': t('navFuel'),
    '/vehicles': t('navVehicles'), '/categories': t('navCategories'),
    '/drivers': t('navDrivers'), '/reports': t('navReports'), '/settings': t('navSettings'),
  };
  return titles[pathname] ?? (pathname.startsWith('/waybills') ? t('waybill') : t('appName'));
}

function Shell() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const [layout, setLayoutState] = useState<Layout>(getLayout);

  useEffect(() => {
    const sync = () => setLayoutState(getLayout());
    window.addEventListener('gsm-layout', sync);
    return () => window.removeEventListener('gsm-layout', sync);
  }, []);

  if (!ready) return <Booting />;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  return (
    <div className={`app layout-${layout}`}>
      {layout !== 'top' && <Sidebar />}
      <CommandPalette />
      <div className="main">
        <Topbar layout={layout} />
        <div className="content">
          {layout === 'top' && <PageTitle />}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/waybills" element={<Waybills />} />
            <Route path="/waybills/new" element={<WaybillForm />} />
            <Route path="/waybills/:id" element={<WaybillForm />} />
            <Route path="/waybills/:id/print" element={<WaybillPrint />} />
            <Route path="/fuel" element={<Fuel />} />
            <Route path="/vehicles" element={<Vehicles />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const items = useNavItems();

  const roleLabel: Record<string, string> = {
    admin: t('roleAdmin'), dispatcher: t('roleDispatcher'),
    operator: t('roleOperator'), viewer: t('roleViewer'),
  };

  return (
    <aside className="sidebar no-print">
      <div className="brand">
        <div className="brand-logo">⛽</div>
        <div>
          <div className="brand-name">{t('appName')}</div>
          <div className="brand-sub">{t('appSub')}</div>
        </div>
      </div>

      <BranchBar />

      <nav className="nav">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} title={it.label}>
            <span className="nav-icon">{it.icon}</span>
            <span className="nav-text">{it.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="user-box">
          <div className="avatar">{user?.full_name?.[0]?.toUpperCase() ?? '?'}</div>
          <div style={{ minWidth: 0 }}>
            <div className="user-name">{user?.full_name}</div>
            <div className="user-role">{roleLabel[user?.role ?? ''] ?? user?.role}</div>
          </div>
        </div>
        {LOCAL_MODE ? (
          <div className="hint" style={{ textAlign: 'center' }}>
            {t('demoStorage')}
          </div>
        ) : (
          <button className="btn btn-sm" style={{ width: '100%' }} onClick={logout} title={t('logout')}>
            <span aria-hidden="true">⏻</span> <span className="btn-text">{t('logout')}</span>
          </button>
        )}
      </div>
    </aside>
  );
}

/**
 * Filial ko'rsatkichi. Filial xodimiga — o'z aeroporti nomi (o'zgartirib bo'lmaydi),
 * bosh ofis xodimiga — filial almashtirgich va "barcha filiallar" varianti.
 */
function BranchBar({ compact = false }: { compact?: boolean }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [sel, setSel] = useState(getBranch());
  const isHq = user?.branch_id == null;

  useEffect(() => {
    if (!isHq) return;
    api.get<Branch[]>('/branches').then(setBranches).catch(() => {});
  }, [isHq]);

  const cls = `branch-bar${compact ? ' branch-compact' : ''}`;

  if (!isHq) {
    return (
      <div className={cls}>
        <span className="branch-label">{t('branch')}</span>
        {/* Qisqa kod — belgilar ustuni rejimida shu ko'rinadi */}
        <div className="branch-code">{user?.branch_code ?? '—'}</div>
        <div className="branch-name">{pick(lang, user, 'branch_name') || '—'}</div>
      </div>
    );
  }

  const change = (v: string) => { setBranch(v); setSel(v); location.reload(); };
  const code = branches.find((b) => String(b.id) === sel)?.code ?? '∗';

  return (
    <div className={cls}>
      <span className="branch-label">{t('branch')}</span>
      <div className="branch-code" title={t('branch')}>{code}</div>
      <select value={sel} onChange={(e) => change(e.target.value)} aria-label={t('branch')}>
        <option value="">{t('allBranches')}</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.code} · {pick(lang, b, 'name')}</option>
        ))}
      </select>
    </div>
  );
}

/** Demo rejimida baza brauzerda ochilguncha ko'rsatiladigan ekran. */
function Booting() {
  const { t } = useI18n();
  return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div className="login-logo">⛽</div>
        <h1 className="login-title">{t('appName')}</h1>
        <div className="login-sub">{LOCAL_MODE ? t('demoLoading') : t('loading')}</div>
      </div>
    </div>
  );
}

function Topbar({ layout }: { layout: Layout }) {
  const { t, lang, setLang } = useI18n();
  const title = usePageTitle();
  const items = useNavItems();
  const isTop = layout === 'top';

  const controls = (
    <>
      {LOCAL_MODE && <span className="badge amber" title={t('demoStorage')}>{t('demoBadge')}</span>}
      <div className="spacer" />
      <CommandHint />
      <LayoutSwitch />
      <ThemeSwitch />
      <div className="lang-switch">
        <button className={lang === 'uz' ? 'active' : ''} onClick={() => setLang('uz')}>UZ</button>
        <button className={lang === 'ru' ? 'active' : ''} onClick={() => setLang('ru')}>RU</button>
      </div>
    </>
  );

  // Yuqori menyu rejimida yon panel yo'q — brend, filial va foydalanuvchi
  // sarlavhaga ko'chadi, menyu esa ikkinchi qatorda turadi.
  if (isTop) {
    return (
      <header className="topbar topbar-stack no-print">
        <div className="topbar-row">
          <div className="top-brand">
            <div className="brand-logo">⛽</div>
            <span>{t('appName')}</span>
          </div>
          <BranchBar compact />
          {controls}
          <UserChip />
        </div>
        <nav className="top-nav">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}>
              <span className="nav-icon">{it.icon}</span>
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
    );
  }

  return (
    <header className="topbar no-print">
      <h1>{title}</h1>
      {controls}
    </header>
  );
}

/** Yuqori menyu rejimida sahifa nomi kontent ustida turadi. */
function PageTitle() {
  return <h1 className="page-title no-print">{usePageTitle()}</h1>;
}

/** Yuqori menyu rejimida yon paneldagi foydalanuvchi blokining o'rnini bosadi. */
function UserChip() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  return (
    <div className="user-chip">
      <span className="avatar">{user?.full_name?.[0]?.toUpperCase() ?? '?'}</span>
      {!LOCAL_MODE && (
        <button className="btn btn-sm" onClick={logout} title={t('logout')} aria-label={t('logout')}>⏻</button>
      )}
    </div>
  );
}

/** Mavzu: yorug' · tizim · qorong'i */
function ThemeSwitch() {
  const { t } = useI18n();
  const [theme, set] = useState<Theme>(getTheme);
  const choose = (v: Theme) => { setTheme(v); set(v); };
  const opts: [Theme, string, string][] = [
    ['light', '☀', t('themeLight')],
    ['system', '◐', t('themeSystem')],
    ['dark', '☾', t('themeDark')],
  ];
  return (
    <div className="theme-switch" role="group" aria-label={t('theme')}>
      {opts.map(([v, icon, label]) => (
        <button key={v} type="button" title={label} aria-label={label}
                aria-pressed={theme === v}
                className={theme === v ? 'active' : ''} onClick={() => choose(v)}>{icon}</button>
      ))}
    </div>
  );
}

/** Ko'rinish: yon panel · belgilar ustuni · yuqori menyu */
function LayoutSwitch() {
  const { t } = useI18n();
  const [layout, set] = useState<Layout>(getLayout);
  const choose = (v: Layout) => { setLayout(v); set(v); };
  const opts: [Layout, string, string][] = [
    ['side', '▤', t('layoutSide')],
    ['rail', '▥', t('layoutRail')],
    ['top', '▬', t('layoutTop')],
  ];
  return (
    <div className="theme-switch layout-switch" role="group" aria-label={t('layout')}>
      {opts.map(([v, icon, label]) => (
        <button key={v} type="button" title={label} aria-label={label}
                aria-pressed={layout === v}
                className={layout === v ? 'active' : ''} onClick={() => choose(v)}>{icon}</button>
      ))}
    </div>
  );
}
