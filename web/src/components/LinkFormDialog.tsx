import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useI18n } from '../i18n';
import type { Collection, LinkRecord, MetadataPreview } from '../types';
import Modal from './Modal';
import TagInput from './TagInput';
import CollectionSelect from './CollectionSelect';

interface LinkFormDialogProps {
  initial?: LinkRecord;
  collections: Collection[];
  tagSuggestions: string[];
  defaultCollectionId?: string | null;
  initialUrl?: string;
  initialTitle?: string;
  onClose: () => void;
  onSaved: (link: LinkRecord) => void;
}

export default function LinkFormDialog({
  initial,
  collections,
  tagSuggestions,
  defaultCollectionId,
  initialUrl,
  initialTitle,
  onClose,
  onSaved,
}: LinkFormDialogProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const isEdit = Boolean(initial);
  const [url, setUrl] = useState(initial?.url ?? initialUrl ?? '');
  const [title, setTitle] = useState(initial?.title ?? initialTitle ?? '');
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
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const lastFetched = useRef('');

  useEffect(() => {
    setDuplicateId(null);
  }, [url]);

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
      setError(t('请输入链接地址'));
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
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        typeof err.details?.existingId === 'string'
      ) {
        setDuplicateId(err.details.existingId);
        setError(null);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  const mergeIntoExisting = async () => {
    if (!duplicateId) return;
    setSaving(true);
    try {
      const existing = await api.getLink(duplicateId);
      const mergedTags = [...existing.tags];
      for (const tag of tags) {
        if (!mergedTags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
          mergedTags.push(tag);
        }
      }
      await api.updateLink(duplicateId, {
        title:
          existing.title && existing.title !== existing.url
            ? existing.title
            : title || existing.title,
        description: existing.description || description,
        notes: existing.notes || notes,
        icon: existing.icon ?? (icon || null),
        tags: mergedTags,
        collectionId: existing.collectionId ?? (collectionId || null),
        pinned: Boolean(existing.pinned || pinned),
      });
      onSaved(existing);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isEdit ? t('编辑链接') : t('添加链接')} onClose={onClose} width={620}>
      <div className="field">
        <label>{t('链接地址')}</label>
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
          {t('正在抓取页面信息…')}
        </div>
      )}
      {!isEdit && metaError && (
        <div className="field-hint">
          {t('自动抓取失败：{msg}（仍可手动填写）', { msg: metaError })}
        </div>
      )}
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
            <div className="meta-title">{meta.title ?? t('未命名页面')}</div>
            <div className="meta-desc">{meta.description || meta.resolvedUrl}</div>
          </div>
        </div>
      )}

      <div className="field">
        <label>{t('标题')}</label>
        <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>

      <div className="field">
        <label>{t('描述')}</label>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>

      <div className="field-row">
        <div className="field">
          <label>{t('收藏夹')}</label>
          <CollectionSelect value={collectionId} onChange={setCollectionId} collections={collections} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('标签')}</label>
          <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
        </div>
      </div>

      <div className="field">
        <label>{t('备注')}</label>
        <textarea
          value={notes}
          placeholder={t('自己的笔记、摘录…')}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="field">
        <label>{t('自定义图标（可选）')}</label>
        <input
          type="text"
          value={icon}
          placeholder={t('留空使用网站 favicon，可填入图标图片 URL')}
          onChange={(event) => setIcon(event.target.value)}
        />
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
        {t('置顶')}
      </label>

      {!isEdit && (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={archiveNow}
            onChange={(event) => setArchiveNow(event.target.checked)}
          />
          {t('保存后立即抓取网页存档')}
        </label>
      )}

      {duplicateId && (
        <div className="result-box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>{t('该链接已存在，你可以打开已有条目，或把当前填写的信息合并过去。')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn small" onClick={() => navigate(`/links/${duplicateId}`)}>
              {t('打开已有条目')}
            </button>
            <button
              className="btn small primary"
              disabled={saving}
              onClick={() => void mergeIntoExisting()}
            >
              {t('合并到已有链接')}
            </button>
          </div>
        </div>
      )}

      {error && <div className="field-error">{error}</div>}

      <div className="modal-footer">
        <button className="btn" onClick={onClose} disabled={saving}>
          {t('取消')}
        </button>
        <button className="btn primary" onClick={() => void save()} disabled={saving}>
          {saving && <span className="spinner" />}
          {isEdit ? t('保存修改') : t('添加')}
        </button>
      </div>
    </Modal>
  );
}
