import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useApp, useMenu } from '../App';
import { useCollections, useTags } from '../hooks';
import LinkCard from '../components/LinkCard';
import LinkFormDialog from '../components/LinkFormDialog';
import Pager from '../components/Pager';
import AiChatDialog from '../components/AiChatDialog';
import { collectionOptions } from '../components/CollectionSelect';
import { useI18n } from '../i18n';
import type { SearchResult } from '../types';

export default function HomePage() {
  const { t } = useI18n();
  const SORT_OPTIONS = [
    { value: 'updated:desc', label: t('最近更新') },
    { value: 'updated:asc', label: t('最久未更新') },
    { value: 'created:desc', label: t('最近添加') },
    { value: 'created:asc', label: t('最早添加') },
    { value: 'title:asc', label: t('标题 A-Z') },
    { value: 'title:desc', label: t('标题 Z-A') },
  ];
  const openMenu = useMenu();
  const { refreshKey, notifyChange } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const collections = useCollections(refreshKey);
  const tags = useTags(refreshKey);

  const q = searchParams.get('q') ?? '';
  const collectionId = searchParams.get('collection') ?? '';
  const tag = searchParams.get('tag') ?? '';
  const archived = searchParams.get('archived') ?? '';
  const readFilter = searchParams.get('read') ?? '';
  const sort = searchParams.get('sort') ?? 'updated';
  const order = searchParams.get('order') ?? 'desc';
  const view = searchParams.get('view') ?? 'grid';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const perPage = 48;

  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => setSearchInput(q), [q]);

  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ url: string; title: string } | null>(null);
  const [showAiChat, setShowAiChat] = useState(false);
  const requestId = useRef(0);
  const uploadInput = useRef<HTMLInputElement>(null);

  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(t('读取文件失败')));
      reader.readAsDataURL(file);
    });

  const uploadFile = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      window.alert(t('文件不能超过 {size}MB', { size: 25 }));
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      await api.addFileLink({
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        dataBase64: dataUrl.slice(dataUrl.indexOf(',') + 1),
      });
      notifyChange();
      load();
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    api
      .searchLinks({
        q,
        collection: collectionId || undefined,
        tag: tag || undefined,
        archived: archived || undefined,
        read: readFilter || undefined,
        sort,
        order,
        page,
        perPage,
      })
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        setError((err as Error).message);
        setLoading(false);
      });
  }, [q, collectionId, tag, archived, sort, order, page, perPage]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const hasPending = Boolean(data?.items.some((link) => link.archiveStatus === 'pending'));
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  useEffect(() => {
    if (searchInput === q) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (searchInput) next.set('q', searchInput);
      else next.delete('q');
      next.delete('page');
      setSearchParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, q]);

  const setParam = (updates: Record<string, string | undefined>): void => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!('page' in updates)) next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const hasFilter = Boolean(q || collectionId || tag || archived || readFilter);

  useEffect(() => {
    const incomingUrl = searchParams.get('new');
    if (!incomingUrl) return;
    const incomingTitle = searchParams.get('newTitle') ?? '';
    setShareTarget({ url: incomingUrl, title: incomingTitle });
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    next.delete('newTitle');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const activeCollection = collections.find((item) => item.id === collectionId);
  const highlightTerms = q
    .split(/\s+/)
    .filter((term) => term && !term.includes(':'))
    .map((term) => term.toLowerCase());

  const runCheck = async () => {
    setChecking(true);
    try {
      const result = await api.checkLinks(selected.size > 0 ? [...selected] : undefined);
      window.alert(
        t('检查完成：{checked} 条链接，{dead} 条失效', {
          checked: result.checked,
          dead: result.dead,
        })
      );
      exitSelectMode();
      notifyChange();
      load();
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const runBulk = async (
    action: string,
    payload: { tags?: string[]; collectionId?: string | null } = {}
  ) => {
    if (selected.size === 0) return;
    if (
      action === 'delete' &&
      !window.confirm(t('确定删除选中的 {count} 条链接吗？', { count: selected.size }))
    ) {
      return;
    }
    try {
      await api.bulkUpdate([...selected], action, payload);
      exitSelectMode();
      notifyChange();
      load();
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  const promptTags = (action: 'addTags' | 'removeTags') => {
    const input = window.prompt(
      action === 'addTags' ? t('要添加的标签（逗号分隔）') : t('要移除的标签（逗号分隔）')
    );
    if (!input) return;
    const tags = input
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length > 0) void runBulk(action, { tags });
  };

  return (
    <>
      <div className="topbar">
        <button className="icon-btn menu-btn" onClick={openMenu} title={t('菜单')}>
          ☰
        </button>
        <div className="search-box">
          <input
            value={searchInput}
            placeholder={t('搜索标题、网址、描述、标签…')}
            title={t('搜索支持 site:、after:、before:、is:pinned、is:dead、is:archived')}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          {loading && <span className="spinner" />}
        </div>
        <select
          value={`${sort}:${order}`}
          onChange={(event) => {
            const [nextSort, nextOrder] = event.target.value.split(':');
            setParam({ sort: nextSort, order: nextOrder });
          }}
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '7px 9px',
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="btn ghost"
          title={t('切换视图')}
          onClick={() => setParam({ view: view === 'grid' ? 'list' : 'grid' })}
        >
          {view === 'grid' ? t('列表视图') : t('网格视图')}
        </button>
        <button className="btn ghost" onClick={() => setShowAiChat(true)}>
          {t('AI 问答')}
        </button>
        <button
          className="btn ghost"
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
        >
          {selectMode ? t('退出选择') : t('选择')}
        </button>
        <button
          className="btn ghost"
          title="PNG / PDF / HTML"
          onClick={() => uploadInput.current?.click()}
        >
          {t('上传文件')}
        </button>
        <input
          ref={uploadInput}
          type="file"
          hidden
          accept="image/*,application/pdf,text/html,.html"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
            event.target.value = '';
          }}
        />
        <button className="btn primary" onClick={() => setShowAdd(true)}>
          {t('添加链接')}
        </button>
      </div>

      <div className="content">
        {selectMode && (
          <div className="bulk-bar">
            <span className="bulk-count">{t('已选 {count} 条', { count: selected.size })}</span>
            <button
              className="btn small"
              onClick={() =>
                setSelected(new Set((data?.items ?? []).map((item) => item.id)))
              }
            >
              {t('全选本页')}
            </button>
            <button
              className="btn small"
              disabled={selected.size === 0}
              onClick={() => promptTags('addTags')}
            >
              {t('添加标签')}
            </button>
            <button
              className="btn small"
              disabled={selected.size === 0}
              onClick={() => promptTags('removeTags')}
            >
              {t('移除标签')}
            </button>
            <select
              className="bulk-select"
              value=""
              disabled={selected.size === 0}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                void runBulk('setCollection', {
                  collectionId: value === '__none__' ? null : value,
                });
              }}
            >
              <option value="">{t('移动到收藏夹…')}</option>
              <option value="__none__">{t('未分类')}</option>
              {collectionOptions(collections).map(({ collection, depth }) => (
                <option key={collection.id} value={collection.id}>
                  {'　'.repeat(depth)}
                  {collection.name}
                </option>
              ))}
            </select>
            <button
              className="btn small"
              disabled={selected.size === 0}
              onClick={() => void runBulk('pin')}
            >
              {t('置顶')}
            </button>
            <button
              className="btn small"
              disabled={selected.size === 0}
              onClick={() => void runBulk('unpin')}
            >
              {t('取消置顶')}
            </button>
            <button
              className="btn small"
              disabled={selected.size === 0}
              onClick={() => void runBulk('archive')}
            >
              {t('抓取存档')}
            </button>
            <button
              className="btn small"
              disabled={selected.size === 0}
              onClick={() => void runBulk('read')}
            >
              {t('标记已读')}
            </button>
            <button
              className="btn small"
              disabled={selected.size === 0}
              onClick={() => void runBulk('unread')}
            >
              {t('标记未读')}
            </button>
            <button className="btn small" disabled={checking} onClick={() => void runCheck()}>
              {checking ? t('检查中…') : t('检查链接')}
            </button>
            <button
              className="btn small danger"
              disabled={selected.size === 0}
              onClick={() => void runBulk('delete')}
            >
              {t('删除')}
            </button>
          </div>
        )}
        {hasFilter && (
          <div className="field-hint" style={{ marginBottom: 12 }}>
            {t('当前筛选：')}
            {q && ` ${t('搜索「{q}」', { q })}`}
            {activeCollection && ` ${t('收藏夹「{name}」', { name: activeCollection.name })}`}
            {collectionId === '__none__' && ` ${t('未分类')}`}
            {tag && ` ${t('标签「{tag}」', { tag })}`}
            {archived === 'true' && ` ${t('已存档')}`}
            {readFilter === 'unread' && ` ${t('稍后读')}`}
            <button
              className="icon-btn"
              style={{ marginLeft: 8 }}
              onClick={() => {
                setSearchInput('');
                setSearchParams('', { replace: true });
              }}
            >
              {t('清除')}
            </button>
          </div>
        )}

        {error && <div className="page-error">{error}</div>}

        {data && data.items.length === 0 && !loading ? (
          <div className="empty">
            <h3>{hasFilter ? t('没有匹配的链接') : t('还没有链接')}</h3>
            <p>
              {hasFilter
                ? t('试试调整关键词或筛选条件。')
                : t('添加第一条链接，数据会自动提交到你的 Git 仓库。')}
            </p>
            <button className="btn primary" onClick={() => setShowAdd(true)}>
              {t('添加链接')}
            </button>
          </div>
        ) : (
          <div className={view === 'grid' ? 'links-grid' : 'links-list'}>
            {data?.items.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                collections={collections}
                selectable={selectMode}
                selected={selected.has(link.id)}
                onSelectToggle={toggleSelect}
                highlight={highlightTerms}
                onChanged={() => {
                  load();
                  notifyChange();
                }}
              />
            ))}
          </div>
        )}

        {data && <Pager page={data.page} perPage={data.perPage} total={data.total} onPage={(next) => setParam({ page: String(next) })} />}
      </div>

      {showAdd && (
        <LinkFormDialog
          collections={collections}
          tagSuggestions={tags.map((item) => item.tag)}
          defaultCollectionId={collectionId && collectionId !== '__none__' ? collectionId : null}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            notifyChange();
            load();
          }}
        />
      )}

      {showAiChat && <AiChatDialog onClose={() => setShowAiChat(false)} />}

      {shareTarget && (
        <LinkFormDialog
          collections={collections}
          tagSuggestions={tags.map((item) => item.tag)}
          initialUrl={shareTarget.url}
          initialTitle={shareTarget.title}
          onClose={() => setShareTarget(null)}
          onSaved={() => {
            setShareTarget(null);
            notifyChange();
            load();
          }}
        />
      )}
    </>
  );
}
