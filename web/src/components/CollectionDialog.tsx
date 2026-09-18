import { useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { collectionOptions } from './CollectionSelect';
import Modal from './Modal';
import type { Collection } from '../types';

interface CollectionDialogProps {
  collection: Collection;
  collections: Collection[];
  onClose: () => void;
  onChanged: () => void;
}

export default function CollectionDialog({
  collection,
  collections,
  onClose,
  onChanged,
}: CollectionDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? '');
  const [parentId, setParentId] = useState(collection.parentId ?? '');
  const [icon, setIcon] = useState(collection.icon ?? '');
  const [color, setColor] = useState(collection.color ?? '#5b8def');
  const [isPublic, setIsPublic] = useState(Boolean(collection.isPublic));
  const [slug, setSlug] = useState(collection.slug ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const descendants = new Set<string>();
  const collectDescendants = (id: string): void => {
    descendants.add(id);
    for (const item of collections) {
      if (item.parentId === id) collectDescendants(item.id);
    }
  };
  collectDescendants(collection.id);
  const parentOptions = collectionOptions(collections).filter(
    ({ collection: item }) => !descendants.has(item.id)
  );

  const shareUrl = slug ? `${window.location.origin}/share/${slug}` : '';
  const feedUrl = slug ? `${window.location.origin}/share/${slug}/feed.xml` : '';

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(t('已复制到剪贴板'));
    } catch {
      window.prompt(t('复制链接'), value);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updateCollection(collection.id, {
        name,
        description,
        icon,
        color,
        parentId: parentId || null,
        isPublic,
      });
      setSlug(updated.slug ?? '');
      setMessage(t('已保存'));
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('删除收藏夹「{name}」？其中的链接会变为未分类。', { name: collection.name }))) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteCollection(collection.id);
      onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={t('收藏夹设置')} onClose={onClose} width={520}>
      <div className="field">
        <label>{t('名称')}</label>
        <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="field">
        <label>{t('描述')}</label>
        <textarea
          value={description}
          placeholder={t('公开分享页会显示这段描述')}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="field">
        <label>{t('颜色')}</label>
        <div className="color-swatches">
          {['#5b8def', '#2fb37e', '#e8a33d', '#d95c7a', '#9b6ee0', '#29a4b8', '#c96f3c', '#7a8b3f'].map(
            (preset) => (
              <button
                key={preset}
                type="button"
                className={`color-swatch ${color === preset ? 'active' : ''}`}
                style={{ background: preset }}
                onClick={() => setColor(preset)}
              />
            )
          )}
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'transparent' }}
          />
        </div>
      </div>

      <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <label style={{ margin: 0 }}>{t('上移')} / {t('下移')}</label>
        <button
          className="btn small"
          type="button"
          onClick={() => {
            void api
              .moveCollection(collection.id, 'up')
              .then(() => onChanged())
              .catch((err) => setError((err as Error).message));
          }}
        >
          {t('上移')}
        </button>
        <button
          className="btn small"
          type="button"
          onClick={() => {
            void api
              .moveCollection(collection.id, 'down')
              .then(() => onChanged())
              .catch((err) => setError((err as Error).message));
          }}
        >
          {t('下移')}
        </button>
      </div>

      <div className="field">
        <label>{t('自定义图标（可选）')}</label>
        <input
          type="text"
          value={icon}
          placeholder={t('图标图片 URL，留空显示颜色圆点')}
          onChange={(event) => setIcon(event.target.value)}
        />
      </div>

      <div className="field">
        <label>{t('上级收藏夹')}</label>
        <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">{t('（顶级）')}</option>
          {parentOptions.map(({ collection: item, depth }) => (
            <option key={item.id} value={item.id}>
              {'　'.repeat(depth)}
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(event) => setIsPublic(event.target.checked)}
        />
        {t('公开分享这个收藏夹（包含子收藏夹）')}
      </label>

      {isPublic && shareUrl && (
        <div className="field">
          <label>{t('分享链接')}</label>
          <div className="share-row">
            <input type="text" readOnly value={shareUrl} />
            <button className="btn small" onClick={() => void copy(shareUrl)}>
              {t('复制')}
            </button>
          </div>
          <div className="share-row" style={{ marginTop: 8 }}>
            <input type="text" readOnly value={feedUrl} />
            <button className="btn small" onClick={() => void copy(feedUrl)}>
              {t('复制 RSS')}
            </button>
          </div>
          <div className="field-hint">
            {t('任何人都可以通过这个链接浏览；RSS 可直接添加到阅读器。关闭开关后链接立即失效。')}
          </div>
        </div>
      )}

      {isPublic && !shareUrl && (
        <div className="field-hint">{t('保存后会生成分享链接。')}</div>
      )}

      {error && <div className="field-error">{error}</div>}
      {message && <div className="field-hint">{message}</div>}

      <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
        <button className="btn danger" disabled={busy} onClick={() => void remove()}>
          {t('删除')}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={busy}>
            {t('关闭')}
          </button>
          <button className="btn primary" disabled={busy} onClick={() => void save()}>
            {busy && <span className="spinner" />}
            {t('保存')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
