import { useState, type FormEvent } from 'react';
import { api } from '../api';

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <div className="brand-mark">G</div>
          <div>
            <div className="brand-name">RepoMarks</div>
            <div className="brand-sub">数据存于 Git 仓库</div>
          </div>
        </div>
        <div className="field">
          <label>访问密码</label>
          <input
            type="password"
            value={password}
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入 AUTH_PASSWORD"
          />
        </div>
        {error && <div className="field-error">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy || !password}>
          {busy && <span className="spinner" />}
          登录
        </button>
      </form>
    </div>
  );
}
