import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api, type Evidence, type Locator, type Segment } from "../api";
import { ErrorBanner, Icon } from "../ui";
import { locationLabel } from "./locations";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ViewerTarget {
  evidence: Evidence;
  page: number | null;
  locator: Locator | null;
  segmentId: number | null;
  quote?: string;
}

type Box = [number, number, number, number];

// Loaded documents are kept for the session: reopening another citation in the same report is instant.
const pdfCache = new Map<number, Promise<PDFDocumentProxy>>();

function loadPdf(evidenceId: number): Promise<PDFDocumentProxy> {
  let doc = pdfCache.get(evidenceId);
  if (!doc) {
    doc = api.evidenceFile(evidenceId).then((bytes) => pdfjs.getDocument({ data: bytes }).promise);
    doc.catch(() => pdfCache.delete(evidenceId));
    pdfCache.set(evidenceId, doc);
  }
  return doc;
}


function PdfPage({ evidenceId, page, boxes, onPages }: {
  evidenceId: number;
  page: number;
  boxes: Box[];
  onPages: (n: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [highlights, setHighlights] = useState<Box[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let task: RenderTask | null = null;
    let cancelled = false;
    setError(null);
    (async () => {
      const doc = await loadPdf(evidenceId);
      if (cancelled) return;
      onPages(doc.numPages);
      const p = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
      const width = wrapRef.current?.clientWidth || 800;
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: width / base.width });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = viewport.width * ratio;
      canvas.height = viewport.height * ratio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      // Highlights depend only on the page geometry, so draw them now rather than after the (possibly slow or
      // throttled) paint. Backend boxes are PyMuPDF coordinates (origin top-left); pdf.js user space has its origin
      // bottom-left.
      const top = p.view[3];
      setHighlights(
        boxes.map(([x0, y0, x1, y1]) => {
          const [a, b, c, d] = viewport.convertToViewportRectangle([x0, top - y1, x1, top - y0]);
          return [Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b)] as Box;
        }),
      );
      task = p.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await task.promise;
    })().catch((e: Error) => {
      if (!cancelled && e.name !== "RenderingCancelledException") setError(e.message);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [evidenceId, page, boxes, onPages]);

  useEffect(() => {
    // Bring the first highlight into view once it's drawn.
    wrapRef.current?.querySelector(".hl")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlights]);

  return (
    <div className="viewer-page" ref={wrapRef}>
      <ErrorBanner error={error} />
      <canvas ref={canvasRef} />
      {highlights.map(([x, y, w, h], i) => (
        <div key={i} className="hl" style={{ left: x - 2, top: y - 2, width: w + 4, height: h + 4 }} />
      ))}
    </div>
  );
}

function SegmentContext({ evidenceId, segmentId }: { evidenceId: number; segmentId: number }) {
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.evidenceSegments(evidenceId, { around: segmentId }).then(setSegments).catch((e: Error) => setError(e.message));
  }, [evidenceId, segmentId]);
  useEffect(() => {
    document.querySelector(".segment-context .target")?.scrollIntoView({ block: "center" });
  }, [segments]);
  if (error) return <ErrorBanner error={error} />;
  if (!segments) return <div className="skeleton" style={{ height: 200 }} />;
  return (
    <ol className="segment-context">
      {segments.map((s) => (
        <li key={s.id} className={`${s.id === segmentId ? "target" : ""} kind-${s.kind}`}>
          <div className="muted small">
            {locationLabel(s.page, s.locator)} {s.section_path && `· ${s.section_path}`}
          </div>
          {s.text}
        </li>
      ))}
    </ol>
  );
}

export default function DocumentViewer({ target, onClose }: { target: ViewerTarget; onClose: () => void }) {
  const { evidence, locator } = target;
  const isPdf = evidence.media_type === "application/pdf";
  const [page, setPage] = useState(target.page ?? 1);
  const [pages, setPages] = useState<number | null>(evidence.page_count);
  const [boxes] = useState<Box[]>(() => (locator?.rects?.length ? locator.rects : locator?.bbox ? [locator.bbox] : []));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onTargetPage = page === target.page;

  // Portal to <body>: the viewer is opened from table rows and list items, where a <div> is invalid markup.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal viewer" role="dialog" aria-label={`Viewing ${evidence.filename}`} onClick={(e) => e.stopPropagation()}>
        <header className="viewer-head">
          <span className="file-icon">
            <Icon name="file" size={17} />
          </span>
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 className="truncate">{evidence.title || evidence.filename}</h2>
            <div className="muted small row" style={{ gap: 6 }}>
              {locationLabel(target.page, locator) && <span className="chip">{locationLabel(target.page, locator)}</span>}
              {locator?.ocr && <span>Text read by OCR — the highlight shows the region</span>}
              {!locator?.ocr && evidence.title && evidence.title !== evidence.filename && <span className="truncate">{evidence.filename}</span>}
            </div>
          </div>
          <div className="viewer-nav">
            {isPdf && (
              <>
                {!onTargetPage && target.page && (
                  <button className="btn-sm" onClick={() => setPage(target.page!)}>
                    <Icon name="target" size={13} />
                    Back to citation
                  </button>
                )}
                <button className="btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page">
                  <Icon name="chevronLeft" size={14} />
                </button>
                <span className="small tabular nowrap">
                  Page {page}
                  {pages ? ` / ${pages}` : ""}
                </span>
                <button
                  className="btn-sm"
                  onClick={() => setPage((p) => (pages ? Math.min(pages, p + 1) : p + 1))}
                  disabled={!!pages && page >= pages}
                  aria-label="Next page"
                >
                  <Icon name="chevronRight" size={14} />
                </button>
              </>
            )}
            <button className="btn-sm btn-ghost" onClick={onClose} aria-label="Close">
              <Icon name="x" size={15} />
            </button>
          </div>
        </header>
        {target.quote && (
          <blockquote className="quote" style={{ margin: "0 18px 12px" }}>
            “{target.quote}”
            <div className="quote-source">
              <Icon name="check" size={12} />
              Verified against the document — highlighted below
            </div>
          </blockquote>
        )}
        <div className="viewer-body">
          {isPdf ? (
            <PdfPage evidenceId={evidence.id} page={page} boxes={onTargetPage ? boxes : NO_BOXES} onPages={setPages} />
          ) : target.segmentId ? (
            <SegmentContext evidenceId={evidence.id} segmentId={target.segmentId} />
          ) : (
            <p className="muted" style={{ padding: 20 }}>No location recorded for this citation.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const NO_BOXES: Box[] = [];
