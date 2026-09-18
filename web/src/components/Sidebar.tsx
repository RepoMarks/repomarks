import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { useCollections, useStatus, useTags } from '../hooks';
import { useI18n } from '../i18n';
import { useThemeMode, type ThemeMode } from '../theme';
import CollectionDialog from './CollectionDialog';
import type { Collection } from '../types';

function nextTheme(mode: ThemeMode): ThemeMode {
  if (mode === 'dark') return 'light';
  if (mode === 'light') return 'system';
  return 'dark';
}

const THEME_LABELS: Record<ThemeMode, string> = {
  dark: '深色主题',
  light: '浅色主题',
  system: '跟随系统',
};

const THEME_DOTS: Record<ThemeMode, string> = {
  dark: '#5b8def',
  light: '#e8a33d',
  system: '#9b6ee0',
};

function CollectionTree({
  collections,
  parentId,
  depth,
  activeId,
  onSelect,
  onEdit,
}: {
  collections: Collection[];
  parentId: string | null;
  depth: number;
  activeId: string;
  onSelect: (id: string) => void;
  onEdit: (collection: Collection) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {collections
        .filter((collection) => (collection.parentId ?? null) === parentId)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
        .map((collection) => (
          <div key={collection.id}>
            <div className="collection-row">
              <button
                className={`nav-item ${activeId === collection.id ? 'active' : ''}`}
                style={{ paddingLeft: 9 + depth * 14 }}
                onClick={() => onSelect(collection.id)}
                title={collection.name}
              >
                {collection.icon ? (
                  <img
                    className="nav-icon"
                    src={`/api/favicon?url=${encodeURIComponent(collection.icon)}`}
                    alt=""
                  />
                ) : (
                  <span
                    className="nav-dot"
                    style={{ background: collection.color || '#5b8def' }}
                  />
                )}
                <span className="site-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {collection.name}
                </span>
                <span className="count">
                  {collection.isPublic ? '· ' : ''}
                  {collection.linkCount ?? 0}
                </span>
              </button>
              <button
                className="icon-btn collection-edit"
                title={t('收藏夹设置')}
                onClick={() => onEdit(collection)}
              >
                ✎
              </button>
            </div>
            <CollectionTree
              collections={collections}
              parentId={collection.id}
              depth={depth + 1}
              activeId={activeId}
              onSelect={onSelect}
              onEdit={onEdit}
            />
          </div>
        ))}
    </>
  );
}

export default function Sidebar({ open }: { open: boolean }) {
  const { refreshKey, notifyChange } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const collections = useCollections(refreshKey);
  const tags = useTags(refreshKey);
  const status = useStatus(refreshKey, 15000);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [themeMode, setThemeMode] = useThemeMode();
  const { lang, setLang, t } = useI18n();

  const collectionId = params.get('collection') ?? '';
  const tag = params.get('tag') ?? '';
  const archived = params.get('archived') ?? '';
  const isHome = location.pathname === '/';

  useEffect(() => {
    setCreating(false);
    setNewName('');
  }, [location.pathname, location.search]);

  const apply = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const key of ['q', 'sort', 'order', 'view']) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
    }
    navigate({ pathname: '/', search: next.toString() });
  };

  const createCollection = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await api.createCollection({ name });
      setNewName('');
      setCreating(false);
      notifyChange();
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  const syncLabel = (() => {
    if (!status) return t('状态加载中…');
    if (status.sync.syncing) return t('正在同步…');
    if (status.sync.lastError) {
      return t('同步失败：{msg}', { msg: status.sync.lastError.slice(0, 40) });
    }
    if (status.sync.pendingPush) return t('有待推送的本地提交');
    if (status.sync.lastSyncAt) {
      const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
      return t('已同步 {time}', {
        time: new Date(status.sync.lastSyncAt).toLocaleTimeString(locale, { hour12: false }),
      });
    }
    return t('尚未同步');
  })();

  const syncDot = !status
    ? 'warn'
    : status.sync.lastError
      ? 'err'
      : status.sync.pendingPush || status.sync.syncing
        ? 'warn'
        : 'ok';

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-mark">G</div>
        <div>
          <div className="brand-name">RepoMarks</div>
          <div className="brand-sub">{t('数据存于 Git 仓库')}</div>
        </div>
      </div>

      <div className="sidebar-scroll">
        <nav className="nav-group">
          <button
            className={`nav-item ${isHome && !collectionId && !tag && !archived ? 'active' : ''}`}
            onClick={() => apply({})}
          >
            <span className="nav-dot" style={{ background: '#5b8def' }} />
            {t('全部链接')}
            <span className="count">{status?.stats.links ?? ''}</span>
          </button>
          <button
            className={`nav-item ${isHome && collectionId === '__none__' ? 'active' : ''}`}
            onClick={() => apply({ collection: '__none__' })}
          >
            <span className="nav-dot" style={{ background: '#7a8b3f' }} />
            {t('未分类')}
            <span className="count">{status?.stats.uncategorized ?? ''}</span>
          </button>
          <button
            className={`nav-item ${isHome && archived === 'true' ? 'active' : ''}`}
            onClick={() => apply({ archived: archived === 'true' ? undefined : 'true' })}
          >
            <span className="nav-dot" style={{ background: '#34b27b' }} />
            {t('已存档')}
            <span className="count">{status?.stats.archived ?? ''}</span>
          </button>
        </nav>

        <section className="nav-group">
          <div className="nav-group-title">
            <span>{t('收藏夹')}</span>
            <button
              className="icon-btn"
              title={t('新建收藏夹')}
              onClick={() => setCreating((value) => !value)}
            >
              ＋
            </button>
          </div>
          {creating && (
            <div style={{ display: 'flex', gap: 6, padding: '4px 8px' }}>
              <input
                type="text"
                autoFocus
                value={newName}
                placeholder={t('名称')}
                style={{
                  flex: 1,
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  padding: '6px 9px',
                  minWidth: 0,
                }}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createCollection();
                  if (event.key === 'Escape') setCreating(false);
                }}
              />
              <button className="btn small" onClick={() => void createCollection()}>
                {t('建')}
              </button>
            </div>
          )}
          <CollectionTree
            collections={collections}
            parentId={null}
            depth={0}
            activeId={isHome ? collectionId : ''}
            onSelect={(id) => apply({ collection: id })}
            onEdit={setEditing}
          />
          {collections.length === 0 && !creating && (
            <div className="field-hint" style={{ padding: '2px 10px' }}>
              {t('暂无收藏夹')}
            </div>
          )}
        </section>

        {tags.length > 0 && (
          <section className="nav-group">
            <div className="nav-group-title">
              <span>{t('标签')}</span>
            </div>
            <div className="tag-cloud">
              {tags.slice(0, 30).map((item) => (
                <button
                  key={item.tag}
                  className={`tag-chip ${isHome && tag === item.tag ? 'active' : ''}`}
                  onClick={() => apply({ tag: tag === item.tag ? undefined : item.tag })}
                >
                  {item.tag}
                  <span className="tag-count">{item.count}</span>
                </button>
              ))}
            </div>
            <button
              className="nav-item"
              onClick={() => navigate('/tags')}
              style={location.pathname === '/tags' ? { background: 'var(--accent-soft)' } : undefined}
            >
              <span className="nav-dot" style={{ background: '#c96f3c' }} />
              {t('标签管理')}
            </button>
          </section>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="sync-note">
          <span className={`dot ${syncDot}`} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {syncLabel}
          </span>
        </div>
        <button
          className="nav-item"
          onClick={() => navigate('/import')}
          style={location.pathname === '/import' ? { background: 'var(--accent-soft)' } : undefined}
        >
          <span className="nav-dot" style={{ background: '#9b6ee0' }} />
          {t('导入书签')}
        </button>
        <button
          className="nav-item"
          onClick={() => navigate('/settings')}
          style={location.pathname === '/settings' ? { background: 'var(--accent-soft)' } : undefined}
        >
          <span className="nav-dot" style={{ background: '#29a4b8' }} />
          {t('仓库与状态')}
        </button>
        <button className="nav-item" onClick={() => setThemeMode(nextTheme(themeMode))}>
          <span className="nav-dot" style={{ background: THEME_DOTS[themeMode] }} />
          {t(THEME_LABELS[themeMode])}
        </button>
        <button
          className="nav-item"
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        >
          <span className="nav-dot" style={{ background: '#4f9e8f' }} />
          {lang === 'zh' ? 'English' : '中文'}
        </button>
        <button
          className="nav-item"
          onClick={async () => {
            await api.logout().catch(() => undefined);
            window.location.reload();
          }}
        >
          <span className="nav-dot" style={{ background: '#e05666' }} />
          {t('退出登录')}
        </button>
      </div>

      {editing && (
        <CollectionDialog
          collection={editing}
          collections={collections}
          onClose={() => setEditing(null)}
          onChanged={notifyChange}
        />
      )}
    </aside>
  );
}
