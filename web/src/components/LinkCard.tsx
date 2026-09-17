import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, faviconSrc, formatBytes, hostnameOf } from '../api';
import type { Collection, LinkRecord } from '../types';

interface LinkCardProps {
  link: LinkRecord;
  collections: Collection[];
  onChanged: () => void;
}

function ArchiveBadge({ link }: { link: LinkRecord }) {
  if (link.archiveStatus === 'pending') {
    return (
      <span className="badge pending">
        <span className="spinner" style={{ marginRight: 5 }} /> 存档中
      </span>
    );
  }
  if (link.archiveStatus === 'failed') {
    return (
      <span className="badge failed" title={link.archiveError ?? ''}>
        存档失败
      </span>
    );
  }
  if (link.archivedAt) {
    return (
      <span className="badge ok" title={`${link.archiveEngine ?? ''} 存档，${formatBytes(link.archiveSize)}`}>
        已存档
      </span>
    );
  }
  return null;
}

export default function LinkCard({ link, collections, onChanged }: LinkCardProps) {
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
    if (!window.confirm(`确定删除「${link.title}」吗？`)) return;
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
    <article className="card">
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
              {hostnameOf(link.url)}
            </span>
            {link.pinned && (
              <span className="pin-mark" title="已置顶">
                ★
              </span>
            )}
          </div>
          <h3 className="card-title">{link.title}</h3>
          {link.description && <p className="card-desc">{link.description}</p>}
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
        <span className="spacer" />
        <a className="icon-btn" href={link.url} target="_blank" rel="noreferrer noopener">
          打开
        </a>
        <Link className="icon-btn" to={`/links/${link.id}`}>
          详情
        </Link>
        <button
          className="icon-btn"
          onClick={archive}
          disabled={busy || link.archiveStatus === 'pending'}
          title={link.archivedAt ? '重新抓取网页存档' : '抓取网页存档'}
        >
          {link.archivedAt ? '重新存档' : '存档'}
        </button>
        <button className="icon-btn danger" onClick={remove} disabled={busy}>
          删除
        </button>
      </div>
    </article>
  );
}
