import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';

export default function ShareTargetPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const text = params.get('text') ?? '';
    const urlParam = params.get('url') ?? '';
    const urlMatch = text.match(/https?:\/\/\S+/);
    const url = urlParam || (urlMatch ? urlMatch[0] : '');
    const title = params.get('title') ?? '';
    const next = new URLSearchParams();
    if (url) next.set('new', url);
    if (title) next.set('newTitle', title);
    navigate(`/?${next.toString()}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return <div className="loading-page">{t('加载中…')}</div>;
}
