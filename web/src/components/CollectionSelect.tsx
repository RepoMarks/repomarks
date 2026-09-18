import { useI18n } from '../i18n';
import type { Collection } from '../types';

export function collectionOptions(
  collections: Collection[],
  parentId: string | null = null,
  depth = 0
): Array<{ collection: Collection; depth: number }> {
  return collections
    .filter((collection) => (collection.parentId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .flatMap((collection) => [
      { collection, depth },
      ...collectionOptions(collections, collection.id, depth + 1),
    ]);
}

interface CollectionSelectProps {
  value: string;
  onChange: (value: string) => void;
  collections: Collection[];
  emptyLabel?: string;
}

export default function CollectionSelect({
  value,
  onChange,
  collections,
  emptyLabel,
}: CollectionSelectProps) {
  const { t } = useI18n();
  const options = collectionOptions(collections);
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{emptyLabel ?? t('未分类')}</option>
      {options.map(({ collection, depth }) => (
        <option key={collection.id} value={collection.id}>
          {`${'　'.repeat(depth)}${collection.name}`}
        </option>
      ))}
    </select>
  );
}
