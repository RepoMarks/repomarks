import { useState } from 'react';
import { api } from '../api';
import { useApp, useMenu } from '../App';
import { useTags } from '../hooks';
import { useI18n } from '../i18n';

export default function TagsPage() {
  const { t } = useI18n();
  const openMenu = useMenu();
  const { refreshKey, notifyChange } = useApp();
  const tags = useTags(refreshKey);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<{ updated: number }>) => {
    try {
      const result = await action();
      setMessage(t('已更新 {count} 条链接', { count: result.updated }));
      setRenaming(null);
      setMerging(null);
      notifyChange();
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  return (
    <>
      <div className="topbar">
        <button className="icon-btn menu-btn" onClick={openMenu}>
          ☰
        </button>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('标签管理')}</h2>
        {message && <span className="field-hint">{message}</span>}
      </div>

      <div className="content">
        <div className="page-narrow">
          <div className="panel">
            {tags.length === 0 && <div className="field-hint">{t('没有标签')}</div>}
            <div className="highlights">
              {tags.map((item) => (
                <div className="highlight-item" key={item.tag}>
                  <div className="highlight-head">
                    <strong style={{ fontSize: 13.5 }}>#{item.tag}</strong>
                    <span className="field-hint">{item.count}</span>
                    <span className="spacer" />
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setRenaming(item.tag);
                        setRenameValue(item.tag);
                        setMerging(null);
                      }}
                    >
                      {t('重命名')}
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setMerging(item.tag);
                        setMergeTarget('');
                        setRenaming(null);
                      }}
                    >
                      {t('合并到')}
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={() => {
                        if (
                          !window.confirm(
                            t('确定删除标签「{tag}」吗？将从 {count} 条链接中移除。', {
                              tag: item.tag,
                              count: item.count,
                            })
                          )
                        ) {
                          return;
                        }
                        void run(() => api.deleteTag(item.tag));
                      }}
                    >
                      {t('删除')}
                    </button>
                  </div>

                  {renaming === item.tag && (
                    <div className="share-row" style={{ marginTop: 8 }}>
                      <input
                        type="text"
                        value={renameValue}
                        placeholder={t('标签名')}
                        autoFocus
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && renameValue.trim()) {
                            void run(() => api.renameTag(item.tag, renameValue));
                          }
                        }}
                      />
                      <button
                        className="btn small primary"
                        disabled={!renameValue.trim()}
                        onClick={() => void run(() => api.renameTag(item.tag, renameValue))}
                      >
                        {t('保存')}
                      </button>
                    </div>
                  )}

                  {merging === item.tag && (
                    <div className="share-row" style={{ marginTop: 8 }}>
                      <select
                        value={mergeTarget}
                        onChange={(event) => setMergeTarget(event.target.value)}
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <option value="">{t('合并到')}…</option>
                        {tags
                          .filter((other) => other.tag !== item.tag)
                          .map((other) => (
                            <option key={other.tag} value={other.tag}>
                              #{other.tag}
                            </option>
                          ))}
                      </select>
                      <button
                        className="btn small primary"
                        disabled={!mergeTarget}
                        onClick={() => void run(() => api.mergeTags(item.tag, mergeTarget))}
                      >
                        {t('确认')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
