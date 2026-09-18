import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import Modal from './Modal';

export default function AiChatDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Array<{ id: string; title: string; url: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    const text = question.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await api.aiChat(text);
      setAnswer(result.answer);
      setSources(result.sources);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('AI 问答')} onClose={onClose} width={640}>
      <div className="field">
        <label>{t('提问…')}</label>
        <textarea
          value={question}
          autoFocus
          rows={3}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void ask();
          }}
        />
      </div>

      {error && <div className="field-error">{error}</div>}

      {answer && (
        <div className="panel" style={{ background: 'var(--panel-2)' }}>
          <h3>{t('AI 建议')}</h3>
          <div style={{ whiteSpace: 'pre-wrap' }}>{answer}</div>
          {sources.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="field-hint" style={{ marginBottom: 6 }}>
                {t('参考链接')}
              </div>
              <div className="card-tags">
                {sources.map((source) => (
                  <Link key={source.id} className="mini-tag" to={`/links/${source.id}`}>
                    {source.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="modal-footer">
        <button className="btn" onClick={onClose} disabled={busy}>
          {t('关闭')}
        </button>
        <button className="btn primary" onClick={() => void ask()} disabled={busy || !question.trim()}>
          {busy && <span className="spinner" />}
          {busy ? t('思考中…') : t('AI 问答')}
        </button>
      </div>
    </Modal>
  );
}
