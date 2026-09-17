import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, archiveFormatUrl, faviconSrc, formatBytes, formatDate, hostnameOf } from '../api';
import { useApp, useMenu } from '../App';
import { useCollections, useTags } from '../hooks';
import LinkFormDialog from '../components/LinkFormDialog';
import type { LinkRecord } from '../types';

type ViewerFormat = 'html' | 'readable' | 'screenshot' | 'pdf' | 'wayback';

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: '#f5d76e',
  green: '#7bd88f',
  blue: '#6fb3f2',
  pink: '#f28fb2',
  purple: '#b18cf2',
};

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
  const [format, setFormat] = useState<ViewerFormat | null>(null);
  const [readable, setReadable] = useState<string | null>(null);
  const [readableLoading, setReadableLoading] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [highlightColor, setHighlightColor] = useState('yellow');
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);
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

  const createHighlight = () => {
    if (!link || !selectedText.trim()) return;
    const text = selectedText.trim();
    void run(async () => {
      await api.addHighlight(link.id, { text, color: highlightColor });
      setSelectedText('');
      window.getSelection()?.removeAllRanges();
    });
  };

  const scrollToQuote = (quote: string) => {
    setHighlightTarget(quote);
    setFormat('readable');
  };

  useEffect(() => {
    if (!highlightTarget || !readable) return;
    const element = document.getElementById('reader-highlight-target');
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightTarget, readable]);

  const formats: Array<{
    key: ViewerFormat;
    label: string;
    available: boolean;
    size?: number | null;
  }> = link
    ? [
        {
          key: 'html',
          label: '网页存档',
          available: Boolean(link.archivePath),
          size: link.archiveSize,
        },
        {
          key: 'readable',
          label: '阅读版',
          available: Boolean(link.readablePath),
          size: link.readableSize,
        },
        {
          key: 'screenshot',
          label: '截图',
          available: Boolean(link.screenshotPath),
          size: link.screenshotSize,
        },
        { key: 'pdf', label: 'PDF', available: Boolean(link.pdfPath), size: link.pdfSize },
        { key: 'wayback', label: 'Wayback', available: Boolean(link.waybackUrl) },
      ]
    : [];
  const availableFormats = formats.filter((item) => item.available);
  const activeFormat: ViewerFormat | null =
    format && availableFormats.some((item) => item.key === format)
      ? format
      : (availableFormats[0]?.key ?? null);
  const readerLines = readable ? readable.split('\n') : [];
  const targetIndex = highlightTarget
    ? readerLines.findIndex((line) => line.includes(highlightTarget.slice(0, 80)))
    : -1;
  const lineHasHighlight = (line: string): boolean =>
    (link?.highlights ?? []).some((item) => line.includes(item.text.slice(0, 30)));

  useEffect(() => {
    if (activeFormat !== 'readable' || !link?.readablePath) return;
    let alive = true;
    setReadableLoading(true);
    setReadable(null);
    fetch(archiveFormatUrl(link.id, 'readable'), { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (alive) setReadable(text);
      })
      .catch((err) => {
        if (alive) setReadable(`加载失败：${(err as Error).message}`);
      })
      .finally(() => {
        if (alive) setReadableLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activeFormat, link?.id, link?.readablePath]);

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
            <button
              className="btn"
              disabled={busy || link.archiveStatus === 'pending'}
              onClick={() => void run(() => api.archiveLink(link.id))}
            >
              {link.archiveStatus === 'pending'
                ? '存档中…'
                : link.archivedAt
                  ? '重新存档'
                  : '抓取网页存档'}
            </button>
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

          {availableFormats.length > 0 && (
            <>
              <div className="format-tabs">
                {availableFormats.map((item) => (
                  <button
                    key={item.key}
                    className={`format-tab ${activeFormat === item.key ? 'active' : ''}`}
                    onClick={() => setFormat(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="format-viewer">
                {activeFormat === 'html' && (
                  <iframe
                    className="archive-frame"
                    src={archiveFormatUrl(link.id, 'html')}
                    sandbox="allow-same-origin"
                    title="网页存档"
                  />
                )}
                {activeFormat === 'screenshot' && (
                  <img
                    className="archive-image"
                    src={archiveFormatUrl(link.id, 'screenshot')}
                    alt="页面截图"
                  />
                )}
                {activeFormat === 'pdf' && (
                  <iframe
                    className="archive-frame"
                    src={archiveFormatUrl(link.id, 'pdf')}
                    title="PDF 存档"
                  />
                )}
                {activeFormat === 'readable' && (
                  <div
                    className="panel reader"
                    onMouseUp={() =>
                      setSelectedText(window.getSelection()?.toString().trim() ?? '')
                    }
                  >
                    <div className="reader-toolbar">
                      <div className="color-swatches">
                        {Object.entries(HIGHLIGHT_COLORS).map(([name, color]) => (
                          <button
                            key={name}
                            className={`color-swatch ${highlightColor === name ? 'active' : ''}`}
                            style={{ background: color }}
                            title={name}
                            onClick={() => setHighlightColor(name)}
                          />
                        ))}
                      </div>
                      <button className="btn small" disabled={!selectedText || busy} onClick={createHighlight}>
                        高亮选中文字
                      </button>
                      {selectedText && <span className="field-hint">已选 {selectedText.length} 字</span>}
                    </div>
                    {readableLoading && <div className="field-hint">加载中…</div>}
                    {readerLines.map((line, index) =>
                      line ? (
                        <p
                          key={`${index}-${line.slice(0, 12)}`}
                          id={index === targetIndex ? 'reader-highlight-target' : undefined}
                          className={`${index === targetIndex ? 'reader-target' : ''} ${
                            lineHasHighlight(line) ? 'has-highlight' : ''
                          }`}
                        >
                          {line}
                        </p>
                      ) : null
                    )}
                  </div>
                )}
                {activeFormat === 'wayback' && link.waybackUrl && (
                  <div className="panel">
                    <h3>Wayback Machine 快照</h3>
                    <div style={{ wordBreak: 'break-all' }}>
                      <a href={link.waybackUrl} target="_blank" rel="noreferrer noopener">
                        {link.waybackUrl}
                      </a>
                    </div>
                    <div className="field-hint" style={{ marginTop: 8 }}>
                      存档时间：{formatDate(link.waybackAt)}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {link.archivedAt && link.formatErrors && Object.keys(link.formatErrors).length > 0 && (
            <div className="field-hint">
              部分格式失败：
              {Object.entries(link.formatErrors)
                .map(([key, value]) => `${key}: ${value}`)
                .join('；')}
            </div>
          )}

          {(link.highlights ?? []).length > 0 && (
            <div className="panel">
              <h3>高亮与批注（{link.highlights?.length}）</h3>
              <div className="highlights">
                {(link.highlights ?? []).map((item) => (
                  <div className="highlight-item" key={item.id}>
                    <div className="highlight-head">
                      <span
                        className="highlight-dot"
                        style={{
                          background:
                            HIGHLIGHT_COLORS[item.color ?? 'yellow'] ?? HIGHLIGHT_COLORS.yellow,
                        }}
                      />
                      <button
                        className="highlight-quote"
                        title="在阅读版中定位"
                        onClick={() => scrollToQuote(item.text)}
                      >
                        {item.text.length > 120 ? `${item.text.slice(0, 120)}…` : item.text}
                      </button>
                      <span className="spacer" />
                      <button
                        className="icon-btn danger"
                        disabled={busy}
                        onClick={() => void run(() => api.deleteHighlight(link.id, item.id))}
                      >
                        删除
                      </button>
                    </div>
                    <textarea
                      className="highlight-note"
                      defaultValue={item.note ?? ''}
                      placeholder="添加批注…"
                      onBlur={(event) => {
                        if (event.target.value !== (item.note ?? '')) {
                          void run(() =>
                            api.updateHighlight(link.id, item.id, { note: event.target.value })
                          );
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
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
                  ? `已存档（${link.archiveEngine ?? '未知引擎'}，${formatDate(link.archivedAt)}）`
                  : !link.archivedAt && '未存档'}
              </dd>
              <dt>存档格式</dt>
              <dd>
                {availableFormats.length > 0
                  ? availableFormats
                      .filter((item) => item.key !== 'wayback')
                      .map((item) => `${item.label} ${formatBytes(item.size)}`)
                      .concat(link.waybackUrl ? ['Wayback'] : [])
                      .join('，')
                  : '-'}
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
