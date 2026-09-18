import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, faviconSrc, fileUrl, formatBytes, hostnameOf } from '../api';
import { useI18n } from '../i18n';
import Highlight from './Highlight';
import type { Collection, LinkRecord } from '../types';

interface LinkCardProps {
  link: LinkRecord;
  collections: Collection[];
  onChanged: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelectToggle?: (id: string) => void;
  highlight?: string[];
}

function ArchiveBadge({ link }: { link: LinkRecord }) {
  const { t } = useI18n();
  if (link.archiveStatus === 'pending') {
    return (
      <span className="badge pending">
        <span className="spinner" style={{ marginRight: 5 }} /> {t('存档中')}
      </span>
    );
  }
  if (link.archiveStatus === 'failed') {
    return (
      <span className="badge failed" title={link.archiveError ?? ''}>
        {t('存档失败')}
      </span>
    );
  }
  if (link.archivedAt) {
    return (
      <span
        className="badge ok"
        title={`${link.archiveEngine ?? ''} ${formatBytes(link.archiveSize)}`}
      >
        {t('已存档')}
      </span>
    );
  }
  return null;
}

export default function LinkCard({
  link,
  collections,
  onChanged,
  selectable = false,
  selected = false,
  onSelectToggle,
  highlight,
}: LinkCardProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const collection = collections.find((item) => item.id === link.collectionId);
  const icon = faviconSrc(link);

  const archive = async () => {
    setBusy(true);
    try {
      await api.archiveLink(link.id);
      onChanged();
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('确定删除「{title}」吗？', { title: link.title }))) return;
    setBusy(true);
    try {
      await api.deleteLink(link.id);
      onChanged();
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`card ${selected ? 'selected' : ''}`}>
      {selectable && (
        <label className="card-check" title={t('选择')}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelectToggle?.(link.id)}
          />
        </label>
      )}
      <Link className="card-link" to={`/links/${link.id}`}>
        {link.previewImage && (
          <div className="card-image">
            <img
              src={link.previewImage}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(event) => {
                const parent = event.currentTarget.parentElement;
                if (parent) parent.style.display = 'none';
              }}
            />
          </div>
        )}
        <div className="card-body">
          <div className="card-site">
            {icon && (
              <img
                className="favicon"
                src={icon}
                alt=""
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
              />
            )}
            <span className="site-name">
              {collection ? `${collection.name} · ` : ''}
              {link.kind === 'file' ? t('本地文件') : hostnameOf(link.url)}
            </span>
            {link.pinned && (
              <span className="pin-mark" title={t('已置顶')}>
                ★
              </span>
            )}
            {!link.readAt && link.archivedAt && (
              <span className="unread-dot" title={t('未读')} />
            )}
          </div>
          <h3 className="card-title">
            <Highlight text={link.title} terms={highlight} />
          </h3>
          {link.snippet && (
            <p className="card-snippet">
              <Highlight text={link.snippet} terms={highlight} />
            </p>
          )}
          {link.description && (
            <p className="card-desc">
              <Highlight text={link.description} terms={highlight} />
            </p>
          )}
          {link.tags.length > 0 && (
            <div className="card-tags">
              {link.tags.slice(0, 5).map((tag) => (
                <span className="mini-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
      <div className="card-actions">
        <ArchiveBadge link={link} />
        {link.isDead && (
          <span className="badge failed" title={link.checkError ?? `HTTP ${link.httpStatus ?? '-'}`}>
            {t('已失效')}
          </span>
        )}
        <span className="spacer" />
        <a
          className="icon-btn"
          href={link.kind === 'file' ? fileUrl(link.id) : link.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          {t('打开')}
        </a>
        <Link className="icon-btn" to={`/links/${link.id}`}>
          {t('详情')}
        </Link>
        <button
          className="icon-btn"
          onClick={archive}
          disabled={busy || link.archiveStatus === 'pending'}
          title={link.archivedAt ? t('重新抓取网页存档') : t('抓取网页存档')}
        >
          {link.archivedAt ? t('重新存档') : t('存档')}
        </button>
        <button className="icon-btn danger" onClick={remove} disabled={busy}>
          {t('删除')}
        </button>
      </div>
    </article>
  );
}
