import { useI18n } from '../i18n';

interface PagerProps {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
}

export default function Pager({ page, perPage, total, onPage }: PagerProps) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('上一页')}
      </button>
      <span>{t('第 {page} / {pages} 页（共 {total} 条）', { page, pages, total })}</span>
      <button className="btn small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('下一页')}
      </button>
    </div>
  );
}
