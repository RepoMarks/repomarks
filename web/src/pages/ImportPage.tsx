import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp, useMenu } from '../App';
import { useCollections } from '../hooks';
import CollectionSelect from '../components/CollectionSelect';
import type { ImportSummary } from '../types';

export default function ImportPage() {
  const openMenu = useMenu();
  const { refreshKey, notifyChange } = useApp();
  const collections = useCollections(refreshKey);
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<{ name: string; text: string; kind: 'html' | 'json' } | null>(null);
  const [defaultCollectionId, setDefaultCollectionId] = useState('');
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readFile = async (selected: File) => {
    setError(null);
    setResult(null);
    try {
      const text = await selected.text();
      const kind: 'html' | 'json' = /\.json$/i.test(selected.name) ? 'json' : 'html';
      setFile({ name: selected.name, text, kind });
    } catch (err) {
      setError(`读取文件失败：${(err as Error).message}`);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) void readFile(dropped);
  };

  const startImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const summary = await api.importData({
        [file.kind]: file.text,
        defaultCollectionId: defaultCollectionId || null,
      });
      setResult(summary);
      setFile(null);
      notifyChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <button className="icon-btn menu-btn" onClick={openMenu}>
          ☰
        </button>
        <h2 style={{ margin: 0, fontSize: 16 }}>导入书签</h2>
      </div>

      <div className="content">
        <div className="page-narrow">
          <div className="panel">
            <p style={{ marginTop: 0, color: 'var(--muted)' }}>
              支持浏览器导出的书签 HTML 文件（Chrome / Edge / Firefox），以及 JSON
              格式（如 Linkwarden 导出）。书签目录会转换为收藏夹，重复链接会自动跳过。
            </p>

            <div
              className={`dropzone ${dragging ? 'dragging' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              {file ? (
                <div>
                  <strong>{file.name}</strong>
                  <div className="field-hint">{(file.text.length / 1024).toFixed(1)} KB，点击更换文件</div>
                </div>
              ) : (
                <div>点击选择文件，或拖拽到这里</div>
              )}
              <input
                ref={fileInput}
                type="file"
                accept=".html,.htm,.json"
                hidden
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) void readFile(selected);
                  event.target.value = '';
                }}
              />
            </div>

            <div className="field" style={{ marginTop: 14, maxWidth: 320 }}>
              <label>默认收藏夹（用于无目录的书签）</label>
              <CollectionSelect
                value={defaultCollectionId}
                onChange={setDefaultCollectionId}
                collections={collections}
              />
            </div>

            {error && <div className="field-error" style={{ marginTop: 10 }}>{error}</div>}
            {result && (
              <div className="result-box" style={{ marginTop: 10 }}>
                导入完成：新增 {result.linksAdded} 条链接，跳过 {result.linksSkipped} 条重复，
                新建 {result.collectionsCreated} 个收藏夹。
              </div>
            )}

            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button className="btn primary" disabled={!file || importing} onClick={() => void startImport()}>
                {importing && <span className="spinner" />}
                开始导入
              </button>
              <Link className="btn ghost" to="/settings">
                导出数据
              </Link>
            </div>
          </div>

          <div className="panel">
            <h3>JSON 格式说明</h3>
            <pre
              style={{
                margin: 0,
                fontSize: 12.5,
                color: 'var(--muted)',
                overflowX: 'auto',
                background: 'var(--panel-2)',
                padding: 12,
                borderRadius: 8,
              }}
            >{`[
  { "url": "https://example.com", "title": "示例", "tags": ["demo"], "folder": "技术/前端" }
]`}</pre>
          </div>
        </div>
      </div>
    </>
  );
}
