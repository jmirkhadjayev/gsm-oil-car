import { useEffect, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useAuth } from '../auth';

type Mode = { ldap: boolean; local_fallback: boolean };

export default function Login() {
  const { t, lang, setLang } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);

  // Katalog yoqilganmi — matn va tavsiya shunga qarab o'zgaradi
  useEffect(() => {
    api.get<Mode>('/auth/mode').then(setMode).catch(() => setMode({ ldap: false, local_fallback: true }));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Xatolik');
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">⛽</div>
        <h1 className="login-title">{t('appName')}</h1>
        <div className="login-sub">{t('appSub')}</div>

        {mode && (
          <div className={`login-mode${mode.ldap ? ' ldap' : ''}`}>
            {mode.ldap ? `🔐 ${t('loginLdap')}` : `🔑 ${t('loginLocal')}`}
          </div>
        )}

        {error && <div className="login-error">{error}</div>}

        <div className="field">
          <label>{mode?.ldap ? t('loginCorporate') : t('username')}</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            placeholder={mode?.ldap ? 'a.karimov' : ''}
          />
        </div>
        <div className="field">
          <label>{t('password')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }}
                disabled={busy || !username || !password}>
          {busy ? '…' : t('signIn')}
        </button>

        {mode?.ldap && <div className="login-foot">{t('loginLdapHint')}</div>}

        <div className="lang-switch" style={{ margin: '22px auto 0', width: 'fit-content' }}>
          <button type="button" className={lang === 'uz' ? 'active' : ''} onClick={() => setLang('uz')}>UZ</button>
          <button type="button" className={lang === 'ru' ? 'active' : ''} onClick={() => setLang('ru')}>RU</button>
        </div>
      </form>
    </div>
  );
}
