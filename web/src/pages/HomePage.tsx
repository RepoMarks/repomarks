import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useApp, useMenu } from '../App';
import { useCollections, useTags } from '../hooks';
import LinkCard from '../components/LinkCard';
import LinkFormDialog from '../components/LinkFormDialog';
import Pager from '../components/Pager';
import type { SearchResult } from '../types';

const SORT_OPTIONS = [
  { value: 'updated:desc', label: '最近更新' },
  { value: 'updated:asc', label: '最久未更新' },
  { value: 'created:desc', label: '最近添加' },
  { value: 'created:asc', label: '最早添加' },
  { value: 'title:asc', label: '标题 A-Z' },
  { value: 'title:desc', label: '标题 Z-A' },
];

export default function HomePage() {
  const openMenu = useMenu();
  const { refreshKey, notifyChange } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const collections = useCollections(refreshKey);
  const tags = useTags(refreshKey);

  const q = searchParams.get('q') ?? '';
  const collectionId = searchParams.get('collection') ?? '';
  const tag = searchParams.get('tag') ?? '';
  const archived = searchParams.get('archived') ?? '';
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
  const requestId = useRef(0);

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

  const hasFilter = Boolean(q || collectionId || tag || archived);
  const activeCollection = collections.find((item) => item.id === collectionId);

  return (
    <>
      <div className="topbar">
        <button className="icon-btn menu-btn" onClick={openMenu} title="菜单">
          ☰
        </button>
        <div className="search-box">
          <input
            value={searchInput}
            placeholder="搜索标题、网址、描述、标签…"
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
          title="切换视图"
          onClick={() => setParam({ view: view === 'grid' ? 'list' : 'grid' })}
        >
          {view === 'grid' ? '列表视图' : '网格视图'}
        </button>
        <button className="btn primary" onClick={() => setShowAdd(true)}>
          添加链接
        </button>
      </div>

      <div className="content">
        {hasFilter && (
          <div className="field-hint" style={{ marginBottom: 12 }}>
            当前筛选：
            {q && ` 搜索「${q}」`}
            {activeCollection && ` 收藏夹「${activeCollection.name}」`}
            {collectionId === '__none__' && ' 未分类'}
            {tag && ` 标签「${tag}」`}
            {archived === 'true' && ' 已存档'}
            <button
              className="icon-btn"
              style={{ marginLeft: 8 }}
              onClick={() => {
                setSearchInput('');
                setSearchParams('', { replace: true });
              }}
            >
              清除
            </button>
          </div>
        )}

        {error && <div className="page-error">{error}</div>}

        {data && data.items.length === 0 && !loading ? (
          <div className="empty">
            <h3>{hasFilter ? '没有匹配的链接' : '还没有链接'}</h3>
            <p>
              {hasFilter
                ? '试试调整关键词或筛选条件。'
                : '添加第一条链接，数据会自动提交到你的 Git 仓库。'}
            </p>
            <button className="btn primary" onClick={() => setShowAdd(true)}>
              添加链接
            </button>
          </div>
        ) : (
          <div className={view === 'grid' ? 'links-grid' : 'links-list'}>
            {data?.items.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                collections={collections}
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
    </>
  );
}
