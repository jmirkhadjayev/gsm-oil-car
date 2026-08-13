import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nContext, useI18n, type Lang } from './i18n';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider } from './ui';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Waybills from './pages/Waybills';
import WaybillForm from './pages/WaybillForm';
import WaybillPrint from './pages/WaybillPrint';
import Fuel from './pages/Fuel';
import Vehicles from './pages/Vehicles';
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

function Shell() {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <div className="empty-state" style={{ paddingTop: 80 }}>…</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar />
        <div className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/waybills" element={<Waybills />} />
            <Route path="/waybills/new" element={<WaybillForm />} />
            <Route path="/waybills/:id" element={<WaybillForm />} />
            <Route path="/waybills/:id/print" element={<WaybillPrint />} />
            <Route path="/fuel" element={<Fuel />} />
            <Route path="/vehicles" element={<Vehicles />} />
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
  const { user, logout, can } = useAuth();

  const items = [
    { to: '/', icon: '🏠', label: t('navDashboard'), end: true },
    { to: '/waybills', icon: '📋', label: t('navWaybills') },
    { to: '/fuel', icon: '⛽', label: t('navFuel') },
    { to: '/vehicles', icon: '🚚', label: t('navVehicles') },
    { to: '/drivers', icon: '👷', label: t('navDrivers') },
    { to: '/reports', icon: '📊', label: t('navReports') },
    ...(can('admin') ? [{ to: '/settings', icon: '⚙️', label: t('navSettings') }] : []),
  ];

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

      <nav className="nav">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}>
            <span className="nav-icon">{it.icon}</span>
            <span>{it.label}</span>
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
        <button className="btn btn-sm" style={{ width: '100%' }} onClick={logout}>
          ⏻ {t('logout')}
        </button>
      </div>
    </aside>
  );
}

function Topbar() {
  const { t, lang, setLang } = useI18n();
  const location = useLocation();

  const titles: Record<string, string> = {
    '/': t('navDashboard'),
    '/waybills': t('navWaybills'),
    '/fuel': t('navFuel'),
    '/vehicles': t('navVehicles'),
    '/drivers': t('navDrivers'),
    '/reports': t('navReports'),
    '/settings': t('navSettings'),
  };
  const title = titles[location.pathname]
    ?? (location.pathname.startsWith('/waybills') ? t('waybill') : t('appName'));

  return (
    <header className="topbar no-print">
      <h1>{title}</h1>
      <div className="spacer" />
      <div className="lang-switch">
        <button className={lang === 'uz' ? 'active' : ''} onClick={() => setLang('uz')}>UZ</button>
        <button className={lang === 'ru' ? 'active' : ''} onClick={() => setLang('ru')}>RU</button>
      </div>
    </header>
  );
}
