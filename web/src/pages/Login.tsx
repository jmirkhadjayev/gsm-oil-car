import { useState } from 'react';
import { useI18n } from '../i18n';
import { useAuth } from '../auth';

export default function Login() {
  const { t, lang, setLang } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

        {error && <div className="login-error">{error}</div>}

        <div className="field">
          <label>{t('username')}</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
        </div>
        <div className="field">
          <label>{t('password')}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={busy || !username || !password}>
          {busy ? '…' : t('signIn')}
        </button>

        <div className="lang-switch" style={{ margin: '18px auto 0', width: 'fit-content' }}>
          <button type="button" className={lang === 'uz' ? 'active' : ''} onClick={() => setLang('uz')}>UZ</button>
          <button type="button" className={lang === 'ru' ? 'active' : ''} onClick={() => setLang('ru')}>RU</button>
        </div>
      </form>
    </div>
  );
}
