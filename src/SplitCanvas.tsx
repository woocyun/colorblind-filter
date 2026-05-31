import { useEffect, useRef, useState } from 'react';
import { Matrix3 } from './colorMath';
import { PreviewRenderer, previewScale } from './render';

interface Props {
  bitmap: ImageBitmap;
  matrix: Matrix3;
  isMobile: boolean;
}

export default function SplitCanvas({ bitmap, matrix, isMobile }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PreviewRenderer | null>(null);
  const [split, setSplit] = useState(0.5);
  const splitRef = useRef(split);
  splitRef.current = split;
  const draggingRef = useRef(false);

  // (Re)build the renderer when the image or mobile cap changes.
  useEffect(() => {
    const scale = previewScale(bitmap.width, bitmap.height, isMobile);
    const renderer = new PreviewRenderer(bitmap, scale);
    rendererRef.current = renderer;

    const canvas = renderer.canvas;
    canvas.style.display = 'block';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    canvas.style.width = '100%';
    canvas.style.touchAction = 'none';

    const host = canvasHostRef.current!;
    host.replaceChildren(canvas);

    renderer.setMatrix(matrix);
    renderer.compose(splitRef.current);

    return () => {
      rendererRef.current = null;
      canvas.remove();
    };
    // matrix/split intentionally excluded: handled by the effects below so we
    // don't rebuild the (expensive) renderer on every tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap, isMobile]);

  // Re-run the filter only when the matrix changes.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setMatrix(matrix);
    renderer.compose(splitRef.current);
  }, [matrix]);

  // Cheap recomposite when the slider moves.
  useEffect(() => {
    rendererRef.current?.compose(split);
  }, [split]);

  function fractionFromClientX(clientX: number): number {
    const host = canvasHostRef.current;
    if (!host) return splitRef.current;
    const rect = host.getBoundingClientRect();
    if (rect.width === 0) return splitRef.current;
    const f = (clientX - rect.left) / rect.width;
    return f < 0 ? 0 : f > 1 ? 1 : f;
  }

  function onPointerDown(e: React.PointerEvent) {
    draggingRef.current = true;
    // Capture on the wrapper so the drag keeps tracking even if the finger
    // slides off the thin divider/handle (the goal behind capturing the handle).
    e.currentTarget.setPointerCapture(e.pointerId);
    setSplit(fractionFromClientX(e.clientX));
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    setSplit(fractionFromClientX(e.clientX));
  }

  function endDrag(e: React.PointerEvent) {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <div
      ref={wrapRef}
      className="split-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div ref={canvasHostRef} className="canvas-host" />
      <div
        className="split-handle-hit"
        style={{ left: `${split * 100}%` }}
        aria-hidden="true"
      >
        <div className="split-handle-pill" />
      </div>
    </div>
  );
}
