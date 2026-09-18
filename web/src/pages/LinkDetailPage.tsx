import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  archiveFormatUrl,
  faviconSrc,
  fileUrl,
  formatBytes,
  formatDate,
  hostnameOf,
} from '../api';
import { useApp, useMenu } from '../App';
import { useCollections, useTags } from '../hooks';
import { useI18n } from '../i18n';
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
  const { t } = useI18n();
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
  const [aiResult, setAiResult] = useState<{ tags: string[]; summary: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const archiveInput = useRef<HTMLInputElement>(null);

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

  const uploadArchiveFile = async (file: File) => {
    if (!link) return;
    if (file.size > 50 * 1024 * 1024) {
      window.alert(t('文件不能超过 {size}MB', { size: 50 }));
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const format = ext === 'pdf' ? 'pdf' : ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? 'screenshot' : 'html';
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(t('读取文件失败')));
      reader.readAsDataURL(file);
    }).catch((err) => {
      window.alert((err as Error).message);
      return '';
    });
    if (!dataUrl) return;
    await run(() => api.uploadArchive(link.id, format, dataUrl.slice(dataUrl.indexOf(',') + 1)));
  };

  const runAi = async () => {
    if (!link) return;
    setAiBusy(true);
    try {
      const result = await api.suggestAi(link.id, false);
      setAiResult({ tags: result.tags, summary: result.summary });
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setAiBusy(false);
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
          label: t('网页存档'),
          available: Boolean(link.archivePath),
          size: link.archiveSize,
        },
        {
          key: 'readable',
          label: t('阅读版'),
          available: Boolean(link.readablePath),
          size: link.readableSize,
        },
        {
          key: 'screenshot',
          label: t('截图'),
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
        if (alive) setReadable(t('加载失败：{msg}', { msg: (err as Error).message }));
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
            {t('返回')}
          </button>
        </div>
        <div className="content">
          <div className="page-error">{error}</div>
        </div>
      </>
    );
  }

  if (!link) {
    return <div className="loading-page">{t('加载中…')}</div>;
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
          {t('返回')}
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
              <div className="detail-url">
                {link.kind === 'file'
                  ? `${link.fileName ?? t('本地文件')}${link.fileType ? ` (${link.fileType})` : ''}`
                  : link.url}
              </div>
            </div>
          </div>

          <div className="detail-actions">
            {link.kind === 'file' ? (
              <a
                className="btn primary"
                href={fileUrl(link.id)}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t('打开文件')}
              </a>
            ) : (
              <a className="btn primary" href={link.url} target="_blank" rel="noreferrer noopener">
                {t('打开原链接')}
              </a>
            )}
            <button
              className="btn"
              disabled={busy || link.archiveStatus === 'pending'}
              onClick={() => void run(() => api.archiveLink(link.id))}
            >
              {link.archiveStatus === 'pending'
                ? t('存档中…')
                : link.archivedAt
                  ? t('重新存档')
                  : t('抓取网页存档')}
            </button>
            {link.kind !== 'file' && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => void run(() => api.refetchLink(link.id))}
              >
                {t('重新抓取元数据')}
              </button>
            )}
            <button className="btn" onClick={() => archiveInput.current?.click()}>
              {t('上传存档')}
            </button>
            <input
              ref={archiveInput}
              type="file"
              hidden
              accept=".html,.htm,.pdf,.png,.jpg,.jpeg,.webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadArchiveFile(file);
                event.target.value = '';
              }}
            />
            <button className="btn" disabled={aiBusy} onClick={() => void runAi()}>
              {aiBusy ? t('AI 生成中…') : t('AI 标签与摘要')}
            </button>
            <button className="btn" onClick={() => setEditing(true)}>
              {t('编辑')}
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => void run(() => api.updateLink(link.id, { pinned: !link.pinned }))}
            >
              {link.pinned ? t('取消置顶') : t('置顶')}
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t('确定删除「{title}」吗？', { title: link.title }))) return;
                void run(async () => {
                  await api.deleteLink(link.id);
                  navigate('/');
                });
              }}
            >
              {t('删除')}
            </button>
          </div>

          {link.kind === 'file' && (
            <div className="panel" style={{ padding: 10 }}>
              {(link.fileType ?? '').startsWith('image/') ? (
                <img
                  className="archive-image"
                  src={fileUrl(link.id)}
                  alt={link.fileName ?? t('本地文件')}
                />
              ) : (
                <iframe
                  className="archive-frame"
                  src={fileUrl(link.id)}
                  title={link.fileName ?? t('本地文件')}
                />
              )}
            </div>
          )}

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
                    title={t('网页存档')}
                  />
                )}
                {activeFormat === 'screenshot' && (
                  <img
                    className="archive-image"
                    src={archiveFormatUrl(link.id, 'screenshot')}
                    alt={t('页面截图')}
                  />
                )}
                {activeFormat === 'pdf' && (
                  <iframe
                    className="archive-frame"
                    src={archiveFormatUrl(link.id, 'pdf')}
                    title={t('PDF 存档')}
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
                        {t('高亮选中文字')}
                      </button>
                      {selectedText && (
                        <span className="field-hint">
                          {t('已选 {count} 字', { count: selectedText.length })}
                        </span>
                      )}
                    </div>
                    {readableLoading && <div className="field-hint">{t('加载中…')}</div>}
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
                    <h3>{t('Wayback Machine 快照')}</h3>
                    <div style={{ wordBreak: 'break-all' }}>
                      <a href={link.waybackUrl} target="_blank" rel="noreferrer noopener">
                        {link.waybackUrl}
                      </a>
                    </div>
                    <div className="field-hint" style={{ marginTop: 8 }}>
                      {t('存档时间：{date}', { date: formatDate(link.waybackAt) })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {link.archivedAt && link.formatErrors && Object.keys(link.formatErrors).length > 0 && (
            <div className="field-hint">
              {t('部分格式失败：')}
              {Object.entries(link.formatErrors)
                .map(([key, value]) => `${key}: ${value}`)
                .join('; ')}
            </div>
          )}

          {aiResult && (
            <div className="panel">
              <h3>{t('AI 建议')}</h3>
              {aiResult.tags.length > 0 && (
                <div className="card-tags">
                  {aiResult.tags.map((tag) => (
                    <span className="mini-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {aiResult.summary && (
                <p style={{ margin: '10px 0 0' }}>{aiResult.summary}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.suggestAi(link.id, true);
                      setAiResult(null);
                    })
                  }
                >
                  {t('应用（合并标签、补全描述）')}
                </button>
                <button className="btn" onClick={() => setAiResult(null)}>
                  {t('忽略')}
                </button>
              </div>
            </div>
          )}

          {(link.highlights ?? []).length > 0 && (
            <div className="panel">
              <h3>{t('高亮与批注（{count}）', { count: link.highlights?.length ?? 0 })}</h3>
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
                        title={t('在阅读版中定位')}
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
                        {t('删除')}
                      </button>
                    </div>
                    <textarea
                      className="highlight-note"
                      defaultValue={item.note ?? ''}
                      placeholder={t('添加批注…')}
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
              <h3>{t('描述')}</h3>
              <div style={{ whiteSpace: 'pre-wrap' }}>{link.description}</div>
            </div>
          )}

          {link.notes && (
            <div className="panel">
              <h3>{t('备注')}</h3>
              <div style={{ whiteSpace: 'pre-wrap' }}>{link.notes}</div>
            </div>
          )}

          <div className="panel">
            <h3>{t('信息')}</h3>
            <dl className="kv">
              <dt>{t('收藏夹')}</dt>
              <dd>
                {collection ? (
                  <Link to={`/?collection=${collection.id}`}>{collection.name}</Link>
                ) : (
                  t('未分类')
                )}
              </dd>
              <dt>{t('标签')}</dt>
              <dd>
                {link.tags.length > 0
                  ? link.tags.map((tag) => (
                      <Link key={tag} to={`/?tag=${encodeURIComponent(tag)}`} className="mini-tag" style={{ marginRight: 6 }}>
                        {tag}
                      </Link>
                    ))
                  : '-'}
              </dd>
              <dt>{t('站点')}</dt>
              <dd>{link.siteName ?? hostnameOf(link.url)}</dd>
              <dt>{t('添加时间')}</dt>
              <dd>{formatDate(link.createdAt)}</dd>
              <dt>{t('更新时间')}</dt>
              <dd>{formatDate(link.updatedAt)}</dd>
              <dt>{t('存档状态')}</dt>
              <dd>
                {link.archiveStatus === 'pending' && t('存档中…')}
                {link.archiveStatus === 'failed' &&
                  t('失败：{msg}', { msg: link.archiveError ?? '' })}
                {link.archiveStatus !== 'pending' && link.archiveStatus !== 'failed' && link.archivedAt
                  ? t('已存档（{engine}，{date}）', {
                      engine: link.archiveEngine ?? '-',
                      date: formatDate(link.archivedAt),
                    })
                  : !link.archivedAt && t('未存档')}
              </dd>
              <dt>{t('存档格式')}</dt>
              <dd>
                {availableFormats.length > 0
                  ? availableFormats
                      .filter((item) => item.key !== 'wayback')
                      .map((item) => `${item.label} ${formatBytes(item.size)}`)
                      .concat(link.waybackUrl ? ['Wayback'] : [])
                      .join('，')
                  : '-'}
              </dd>
              <dt>{t('本地 ID')}</dt>
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
