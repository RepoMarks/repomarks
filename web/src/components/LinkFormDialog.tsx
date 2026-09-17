import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Collection, LinkRecord, MetadataPreview } from '../types';
import Modal from './Modal';
import TagInput from './TagInput';
import CollectionSelect from './CollectionSelect';

interface LinkFormDialogProps {
  initial?: LinkRecord;
  collections: Collection[];
  tagSuggestions: string[];
  defaultCollectionId?: string | null;
  onClose: () => void;
  onSaved: (link: LinkRecord) => void;
}

export default function LinkFormDialog({
  initial,
  collections,
  tagSuggestions,
  defaultCollectionId,
  onClose,
  onSaved,
}: LinkFormDialogProps) {
  const isEdit = Boolean(initial);
  const [url, setUrl] = useState(initial?.url ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [collectionId, setCollectionId] = useState(initial?.collectionId ?? defaultCollectionId ?? '');
  const [pinned, setPinned] = useState(Boolean(initial?.pinned));
  const [archiveNow, setArchiveNow] = useState(false);
  const [meta, setMeta] = useState<MetadataPreview | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetched = useRef('');

  useEffect(() => {
    if (isEdit) return;
    const candidate = url.trim();
    if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/.test(candidate)) return;
    if (candidate === lastFetched.current) return;
    const timer = setTimeout(async () => {
      lastFetched.current = candidate;
      setMetaLoading(true);
      setMetaError(null);
      try {
        const result = await api.metadata(
          candidate.startsWith('http') ? candidate : `https://${candidate}`
        );
        setMeta(result);
        setTitle((current) => current || result.title || '');
        setDescription((current) => current || result.description || '');
      } catch (err) {
        setMeta(null);
        setMetaError((err as Error).message);
      } finally {
        setMetaLoading(false);
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [url, isEdit]);

  const save = async () => {
    if (!url.trim()) {
      setError('请输入链接地址');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let saved: LinkRecord;
      if (initial) {
        saved = await api.updateLink(initial.id, {
          url,
          title,
          description,
          notes,
          icon,
          tags,
          collectionId: collectionId || null,
          pinned,
        });
      } else {
        saved = await api.addLink({
          url,
          title: title || undefined,
          description: description || undefined,
          notes,
          icon: icon || null,
          tags,
          collectionId: collectionId || null,
          pinned,
          fetchMetadata: !meta,
        });
        if (archiveNow) {
          await api.archiveLink(saved.id);
        }
      }
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isEdit ? '编辑链接' : '添加链接'} onClose={onClose} width={620}>
      <div className="field">
        <label>链接地址</label>
        <input
          type="text"
          value={url}
          autoFocus={!isEdit}
          placeholder="https://example.com/article"
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save();
          }}
        />
      </div>

      {!isEdit && metaLoading && (
        <div className="field-hint">
          <span className="spinner" style={{ marginRight: 6 }} />
          正在抓取页面信息…
        </div>
      )}
      {!isEdit && metaError && <div className="field-hint">自动抓取失败：{metaError}（仍可手动填写）</div>}
      {!isEdit && meta && (
        <div className="meta-preview">
          {meta.previewImage ? (
            <img
              src={meta.previewImage}
              alt=""
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="meta-preview placeholder" />
          )}
          <div className="meta-text">
            <div className="meta-title">{meta.title ?? '未命名页面'}</div>
            <div className="meta-desc">{meta.description || meta.resolvedUrl}</div>
          </div>
        </div>
      )}

      <div className="field">
        <label>标题</label>
        <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>

      <div className="field">
        <label>描述</label>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>

      <div className="field-row">
        <div className="field">
          <label>收藏夹</label>
          <CollectionSelect value={collectionId} onChange={setCollectionId} collections={collections} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>标签</label>
          <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
        </div>
      </div>

      <div className="field">
        <label>备注</label>
        <textarea
          value={notes}
          placeholder="自己的笔记、摘录…"
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="field">
        <label>自定义图标（可选）</label>
        <input
          type="text"
          value={icon}
          placeholder="留空使用网站 favicon，可填入图标图片 URL"
          onChange={(event) => setIcon(event.target.value)}
        />
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
        置顶
      </label>

      {!isEdit && (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={archiveNow}
            onChange={(event) => setArchiveNow(event.target.checked)}
          />
          保存后立即抓取网页存档
        </label>
      )}

      {error && <div className="field-error">{error}</div>}

      <div className="modal-footer">
        <button className="btn" onClick={onClose} disabled={saving}>
          取消
        </button>
        <button className="btn primary" onClick={() => void save()} disabled={saving}>
          {saving && <span className="spinner" />}
          {isEdit ? '保存修改' : '添加'}
        </button>
      </div>
    </Modal>
  );
}
