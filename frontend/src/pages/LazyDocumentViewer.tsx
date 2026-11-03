import { Suspense, lazy } from "react";
import { createPortal } from "react-dom";
import type { ViewerTarget } from "./DocumentViewer";

// pdf.js is most of the bundle; load it only when someone opens a document.
const Viewer = lazy(() => import("./DocumentViewer"));

export type { ViewerTarget };

function Loading() {
  // Portalled like the viewer itself: it is opened from table rows, where a <div> is invalid markup.
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal viewer-loading">
        <span className="spinner" aria-hidden /> Opening document…
      </div>
    </div>,
    document.body,
  );
}

export function DocumentViewer(props: { target: ViewerTarget; onClose: () => void }) {
  return (
    <Suspense fallback={<Loading />}>
      <Viewer {...props} />
    </Suspense>
  );
}
