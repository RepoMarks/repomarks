import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { api } from './api';
import { useI18n } from './i18n';
import Sidebar from './components/Sidebar';
import HomePage from './pages/HomePage';
import LinkDetailPage from './pages/LinkDetailPage';
import ImportPage from './pages/ImportPage';
import SettingsPage from './pages/SettingsPage';
import TagsPage from './pages/TagsPage';
import ShareTargetPage from './pages/ShareTargetPage';
import LoginPage from './pages/LoginPage';

interface AppContextValue {
  refreshKey: number;
  notifyChange: () => void;
  openMenu: () => void;
}

const AppContext = createContext<AppContextValue>({
  refreshKey: 0,
  notifyChange: () => undefined,
  openMenu: () => undefined,
});

const MenuContext = createContext<() => void>(() => undefined);

export function useApp(): AppContextValue {
  return useContext(AppContext);
}

export function useMenu(): () => void {
  return useContext(MenuContext);
}

function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className="app">
      <Sidebar open={menuOpen} />
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div className="main">
        <MenuContext.Provider value={() => setMenuOpen(true)}>
          <Outlet />
        </MenuContext.Provider>
      </div>
    </div>
  );
}

export default function App() {
  const { t } = useI18n();
  const [session, setSession] = useState<{ enabled: boolean; authenticated: boolean } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const notifyChange = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    let alive = true;
    api
      .session()
      .then((result) => {
        if (alive) setSession(result);
      })
      .catch(() => {
        if (alive) setSession({ enabled: true, authenticated: false });
      });
    const off = api.onUnauthorized(() => setSession({ enabled: true, authenticated: false }));
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!session) {
    return <div className="loading-page">{t('加载中…')}</div>;
  }

  if (session.enabled && !session.authenticated) {
    return (
      <LoginPage
        onSuccess={() => {
          setSession({ enabled: true, authenticated: true });
          notifyChange();
        }}
      />
    );
  }

  return (
    <AppContext.Provider value={{ refreshKey, notifyChange, openMenu: () => undefined }}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/links/:id" element={<LinkDetailPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/share-target" element={<ShareTargetPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppContext.Provider>
  );
}
