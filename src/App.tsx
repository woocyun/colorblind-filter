import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Controls from './Controls';
import SplitCanvas from './SplitCanvas';
import {
  computeCombinedMatrix,
  ConeScores,
  formatMatrix,
  Matrix3,
} from './colorMath';
import { isProbablyImage, loadImage, LoadedImage } from './imageLoad';
import { downloadBlob, exportComparison, exportFiltered } from './render';

const DEFAULT_SCORES: ConeScores = { red: 100, green: 100, blue: 100 };
const IDENTITY_MATRIX: Matrix3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 768px)').matches
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export default function App() {
  const isMobile = useIsMobile();
  const [scores, setScores] = useState<ConeScores>(DEFAULT_SCORES);
  const [matrix, setMatrix] = useState<Matrix3>(IDENTITY_MATRIX);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);

  // Recompute M_combined whenever scores change, debounced to one frame.
  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setMatrix(computeCombinedMatrix(scores));
      rafRef.current = null;
    });
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [scores]);

  // Release the decoded bitmap when it's replaced or cleared.
  useEffect(() => {
    return () => {
      image?.bitmap.close();
    };
  }, [image]);

  const handleFile = useCallback(async (file: File) => {
    if (!isProbablyImage(file)) {
      setError('That file does not look like a supported image.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const loaded = await loadImage(file);
      setImage((prev) => {
        prev?.bitmap.close();
        return loaded;
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const removeImage = () => {
    setImage((prev) => {
      prev?.bitmap.close();
      return null;
    });
    setError(null);
  };

  const doDownload = async (kind: 'filtered' | 'comparison') => {
    if (!image) return;
    setBusy(true);
    try {
      const blob =
        kind === 'filtered'
          ? await exportFiltered(image.bitmap, matrix)
          : await exportComparison(image.bitmap, matrix);
      downloadBlob(
        blob,
        kind === 'filtered' ? 'filtered.jpg' : 'comparison.jpg'
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const matrixText = useMemo(() => formatMatrix(matrix), [matrix]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Colorblindness Simulator</h1>
        <p className="tagline">
          Upload a photo and see it through cones with reduced sensitivity.
          Drag the divider to compare.
        </p>
      </header>

      <main className="layout">
        <section className="image-col">
          {image ? (
            <>
              <SplitCanvas
                bitmap={image.bitmap}
                matrix={matrix}
                isMobile={isMobile}
              />

              <div className="image-meta">
                <span>
                  {image.width} × {image.height} px
                </span>
              </div>

              <div className="image-actions">
                <button type="button" onClick={removeImage}>
                  Remove image
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Replace image
                </button>
              </div>

              <div className="download-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void doDownload('filtered')}
                >
                  Download filtered image
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void doDownload('comparison')}
                >
                  Download comparison
                </button>
              </div>
              <p className="fineprint">
                Comparison always splits at the exact center at full resolution.
                Both export as JPEG (quality 0.92).
              </p>
            </>
          ) : (
            <div
              className={`dropzone${dragOver ? ' drag-over' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  fileInputRef.current?.click();
              }}
            >
              <div className="dropzone-inner">
                <p className="dropzone-title">
                  {busy ? 'Loading…' : 'Drop an image here, or tap to choose'}
                </p>
                <p className="dropzone-sub">JPEG, PNG, WebP — HEIC if your browser supports it</p>
                <div className="dropzone-buttons">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    Choose image
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      cameraInputRef.current?.click();
                    }}
                  >
                    Take photo
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onInputChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={onInputChange}
          />
        </section>

        <aside className="controls-col">
          <Controls
            scores={scores}
            onChange={setScores}
            disabledHint={!image}
          />

          <details
            className="matrix-debug"
            open={showMatrix}
            onToggle={(e) => setShowMatrix((e.target as HTMLDetailsElement).open)}
          >
            <summary>Active M_combined coefficients</summary>
            <pre>{matrixText}</pre>
          </details>
        </aside>
      </main>

      <footer className="app-footer">
        <p>
          Runs entirely in your browser. No uploads, no tracking. The only
          network request is the EnChroma test link above.
        </p>
      </footer>
    </div>
  );
}
