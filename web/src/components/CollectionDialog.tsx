import { useState } from 'react';
import { api } from '../api';
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
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? '');
  const [parentId, setParentId] = useState(collection.parentId ?? '');
  const [icon, setIcon] = useState(collection.icon ?? '');
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
      setMessage('已复制到剪贴板');
    } catch {
      window.prompt('复制链接', value);
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
        parentId: parentId || null,
        isPublic,
      });
      setSlug(updated.slug ?? '');
      setMessage('已保存');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`删除收藏夹「${collection.name}」？其中的链接会变为未分类。`)) return;
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
    <Modal title="收藏夹设置" onClose={onClose} width={520}>
      <div className="field">
        <label>名称</label>
        <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="field">
        <label>描述</label>
        <textarea
          value={description}
          placeholder="公开分享页会显示这段描述"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="field">
        <label>自定义图标（可选）</label>
        <input
          type="text"
          value={icon}
          placeholder="图标图片 URL，留空显示颜色圆点"
          onChange={(event) => setIcon(event.target.value)}
        />
      </div>

      <div className="field">
        <label>上级收藏夹</label>
        <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">（顶级）</option>
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
        公开分享这个收藏夹（包含子收藏夹）
      </label>

      {isPublic && shareUrl && (
        <div className="field">
          <label>分享链接</label>
          <div className="share-row">
            <input type="text" readOnly value={shareUrl} />
            <button className="btn small" onClick={() => void copy(shareUrl)}>
              复制
            </button>
          </div>
          <div className="share-row" style={{ marginTop: 8 }}>
            <input type="text" readOnly value={feedUrl} />
            <button className="btn small" onClick={() => void copy(feedUrl)}>
              复制 RSS
            </button>
          </div>
          <div className="field-hint">
            任何人都可以通过这个链接浏览；RSS 可直接添加到阅读器。关闭开关后链接立即失效。
          </div>
        </div>
      )}

      {isPublic && !shareUrl && (
        <div className="field-hint">保存后会生成分享链接。</div>
      )}

      {error && <div className="field-error">{error}</div>}
      {message && <div className="field-hint">{message}</div>}

      <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
        <button className="btn danger" disabled={busy} onClick={() => void remove()}>
          删除
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={busy}>
            关闭
          </button>
          <button className="btn primary" disabled={busy} onClick={() => void save()}>
            {busy && <span className="spinner" />}
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
}
