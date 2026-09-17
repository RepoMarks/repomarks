import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, faviconSrc, formatBytes, formatDate, hostnameOf } from '../api';
import { useApp, useMenu } from '../App';
import { useCollections, useTags } from '../hooks';
import LinkFormDialog from '../components/LinkFormDialog';
import type { LinkRecord } from '../types';

export default function LinkDetailPage() {
  const openMenu = useMenu();
  const { refreshKey, notifyChange } = useApp();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const collections = useCollections(refreshKey);
  const tags = useTags(refreshKey);

  const [link, setLink] = useState<LinkRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .getLink(id)
      .then((result) => {
        setLink(result);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (link?.archiveStatus !== 'pending') return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [link?.archiveStatus, load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      load();
      notifyChange();
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <>
        <div className="topbar">
          <button className="icon-btn menu-btn" onClick={openMenu}>
            ☰
          </button>
          <button className="btn" onClick={() => navigate(-1)}>
            返回
          </button>
        </div>
        <div className="content">
          <div className="page-error">{error}</div>
        </div>
      </>
    );
  }

  if (!link) {
    return <div className="loading-page">加载中…</div>;
  }

  const collection = collections.find((item) => item.id === link.collectionId);
  const icon = faviconSrc(link);

  return (
    <>
      <div className="topbar">
        <button className="icon-btn menu-btn" onClick={openMenu}>
          ☰
        </button>
        <button className="btn" onClick={() => navigate(-1)}>
          返回
        </button>
        <span className="field-hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {link.title}
        </span>
      </div>

      <div className="content">
        <div className="detail">
          <div className="detail-head">
            {icon && (
              <img
                className="favicon-lg"
                src={icon}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
              />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 className="detail-title">
                {link.pinned && <span className="pin-mark">★ </span>}
                {link.title}
              </h1>
              <div className="detail-url">{link.url}</div>
            </div>
          </div>

          <div className="detail-actions">
            <a className="btn primary" href={link.url} target="_blank" rel="noreferrer noopener">
              打开原链接
            </a>
            {link.archivedAt ? (
              <button className="btn" onClick={() => setShowArchive((value) => !value)}>
                {showArchive ? '收起存档' : '查看网页存档'}
              </button>
            ) : (
              <button
                className="btn"
                disabled={busy || link.archiveStatus === 'pending'}
                onClick={() => void run(() => api.archiveLink(link.id))}
              >
                {link.archiveStatus === 'pending' ? '存档中…' : '抓取网页存档'}
              </button>
            )}
            {link.archivedAt && (
              <button
                className="btn"
                disabled={busy || link.archiveStatus === 'pending'}
                onClick={() => void run(() => api.archiveLink(link.id))}
              >
                重新存档
              </button>
            )}
            <button className="btn" disabled={busy} onClick={() => void run(() => api.refetchLink(link.id))}>
              重新抓取元数据
            </button>
            <button className="btn" onClick={() => setEditing(true)}>
              编辑
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => void run(() => api.updateLink(link.id, { pinned: !link.pinned }))}
            >
              {link.pinned ? '取消置顶' : '置顶'}
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(`确定删除「${link.title}」吗？`)) return;
                void run(async () => {
                  await api.deleteLink(link.id);
                  navigate('/');
                });
              }}
            >
              删除
            </button>
          </div>

          {showArchive && link.archivedAt && (
            <div className="panel" style={{ padding: 10 }}>
              <iframe
                className="archive-frame"
                src={`/api/links/${link.id}/archive`}
                sandbox="allow-same-origin"
                title="网页存档"
              />
            </div>
          )}

          {link.description && (
            <div className="panel">
              <h3>描述</h3>
              <div style={{ whiteSpace: 'pre-wrap' }}>{link.description}</div>
            </div>
          )}

          {link.notes && (
            <div className="panel">
              <h3>备注</h3>
              <div style={{ whiteSpace: 'pre-wrap' }}>{link.notes}</div>
            </div>
          )}

          <div className="panel">
            <h3>信息</h3>
            <dl className="kv">
              <dt>收藏夹</dt>
              <dd>
                {collection ? (
                  <Link to={`/?collection=${collection.id}`}>{collection.name}</Link>
                ) : (
                  '未分类'
                )}
              </dd>
              <dt>标签</dt>
              <dd>
                {link.tags.length > 0
                  ? link.tags.map((tag) => (
                      <Link key={tag} to={`/?tag=${encodeURIComponent(tag)}`} className="mini-tag" style={{ marginRight: 6 }}>
                        {tag}
                      </Link>
                    ))
                  : '-'}
              </dd>
              <dt>站点</dt>
              <dd>{link.siteName ?? hostnameOf(link.url)}</dd>
              <dt>添加时间</dt>
              <dd>{formatDate(link.createdAt)}</dd>
              <dt>更新时间</dt>
              <dd>{formatDate(link.updatedAt)}</dd>
              <dt>存档状态</dt>
              <dd>
                {link.archiveStatus === 'pending' && '存档中…'}
                {link.archiveStatus === 'failed' && `失败：${link.archiveError ?? ''}`}
                {link.archiveStatus !== 'pending' && link.archiveStatus !== 'failed' && link.archivedAt
                  ? `已存档（${link.archiveEngine ?? '未知引擎'}，${formatBytes(link.archiveSize)}，${formatDate(link.archivedAt)}）`
                  : !link.archivedAt && '未存档'}
              </dd>
              <dt>本地 ID</dt>
              <dd style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 12.5 }}>{link.id}</dd>
            </dl>
          </div>
        </div>
      </div>

      {editing && (
        <LinkFormDialog
          initial={link}
          collections={collections}
          tagSuggestions={tags.map((item) => item.tag)}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
            notifyChange();
          }}
        />
      )}
    </>
  );
}
