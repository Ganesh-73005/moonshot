import { useCallback, useEffect, useState } from "react";
import { api, type CollectedDocument, type DocumentGap, type EvidenceCollection } from "../api";
import { Callout, Card, Empty, ErrorBanner, Icon, TierBadge, formatDate, humanize, timeAgo } from "../ui";

type Tone = "good" | "warning" | "danger" | "neutral" | "info";

const DOC_STATUS: Record<CollectedDocument["status"], [string, Tone, string]> = {
  downloaded: ["Downloaded", "good", "download"],
  captured: ["Saved page", "good", "file"],
  gated: ["Behind access request", "warning", "lock"],
  listed: ["Listed", "neutral", "file"],
  duplicate: ["Already on file", "neutral", "check"],
  failed: ["Couldn't fetch", "danger", "x"],
  unsupported: ["Unsupported file", "neutral", "ban"],
};

const GAP_STATUS: Record<DocumentGap["status"], [string, Tone, string]> = {
  satisfied: ["On file", "good", "check"],
  stale: ["Out of date", "warning", "clock"],
  gated: ["Gated on trust centre", "warning", "lock"],
  missing: ["Missing", "danger", "x"],
};

function StatusTag({ spec }: { spec: [string, Tone, string] }) {
  const [label, tone, icon] = spec;
  return (
    <span className={`pill tone-${tone === "neutral" ? "neutral" : tone}`}>
      <Icon name={icon} size={12} />
      {label}
    </span>
  );
}

/** Required documents for the vendor's tier, plus the public trust-centre scan that tries to collect them. */
export function TrustCenterPanel({ vendorId, hasWebsite, refreshKey, onChange }: {
  vendorId: number;
  hasWebsite: boolean;
  refreshKey: string;
  onChange: () => void;
}) {
  const [runs, setRuns] = useState<EvidenceCollection[] | null>(null);
  const [gaps, setGaps] = useState<DocumentGap[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPages, setShowPages] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.collections(vendorId), api.documentGaps(vendorId)])
      .then(([r, g]) => {
        setRuns(r);
        setGaps(g);
      })
      .catch((e: Error) => setError(e.message));
  }, [vendorId]);

  useEffect(load, [load, refreshKey]);

  const latest = runs?.[0] ?? null;
  const running = latest?.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      load();
      onChange();
    }, 4000);
    return () => clearInterval(timer);
  }, [running, load, onChange]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const owed = gaps?.filter((g) => g.status !== "satisfied") ?? [];
  const satisfied = (gaps?.length ?? 0) - owed.length;
  const pct = gaps?.length ? Math.round((satisfied / gaps.length) * 100) : 0;

  return (
    <div className="grid cols-2">
      <Card
        title="Required documents"
        icon="checklist"
        subtitle={gaps?.length ? <span className="row" style={{ gap: 6 }}>What this vendor must provide at <TierBadge tier={gaps[0].tier} /> tier</span> : "What this vendor must provide for its tier"}
        flush
        footer={
          owed.length > 0 ? (
            <div className="row-between" style={{ flexWrap: "wrap" }}>
              <span>Drafts a document-only request; you review it under Questionnaire before it's sent.</span>
              <button className="btn-primary btn-sm" onClick={() => act(() => api.draftDocumentRequest(vendorId))} disabled={busy || running}>
                <Icon name="send" size={13} />
                Request {owed.length} document{owed.length > 1 ? "s" : ""}
              </button>
            </div>
          ) : undefined
        }
      >
        {!gaps ? (
          <div style={{ padding: "0 20px 16px" }}>
            <div className="skeleton" style={{ height: 120 }} />
          </div>
        ) : gaps.length === 0 ? (
          <Empty icon="checklist" title="No documents required">
            Nothing is required for this vendor's tier and data profile.
          </Empty>
        ) : (
          <>
            <div className="tiles" style={{ padding: "0 22px 16px" }}>
              {([
                ["satisfied", "On file", "tile-good"],
                ["stale", "Out of date", "tile-warn"],
                ["gated", "Gated", "tile-info"],
                ["missing", "Missing", "tile-bad"],
              ] as const).map(([k, label, cls]) => (
                <div key={k} className={`tile ${cls}`}>
                  <span className="n">{gaps.filter((g) => g.status === k).length}</span>
                  <span className="l">{label}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "0 22px 14px" }}>
              <div className="row-between small" style={{ marginBottom: 6 }}>
                <span className="strong">
                  {satisfied} of {gaps.length} on file
                </span>
                <span className="muted tabular">{pct}%</span>
              </div>
              <div className="progress">
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
            <ul className="list">
              {gaps.map((g) => (
                <li key={g.id} className="list-item" style={{ alignItems: "flex-start" }}>
                  <span className={`kpi-icon ${g.status === "satisfied" ? "good" : g.status === "missing" ? "critical" : "warning"}`} style={{ width: 28, height: 28 }}>
                    <Icon name={GAP_STATUS[g.status][2]} size={14} />
                  </span>
                  <div className="grow">
                    <div className="strong" style={{ fontSize: 13 }}>
                      {g.title}
                    </div>
                    {g.any_of.length > 1 && (
                      <div className="xsmall muted">
                        Either: {g.any_of.join("  or  ")}
                      </div>
                    )}
                    {g.status !== "satisfied" && g.why && <div className="xsmall muted">{g.why}</div>}
                    {g.note && <div className="xsmall muted">{g.note}</div>}
                    {g.gated_links.length > 0 && (
                      <div className="row-wrap xsmall" style={{ marginTop: 4, gap: 6 }}>
                        {g.gated_links.map((l) => (
                          <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 3 }}>
                            <Icon name="lock" size={11} />
                            {l.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <StatusTag spec={GAP_STATUS[g.status]} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card
        title="Trust centre"
        icon="globe"
        subtitle="Public evidence collected automatically, with no vendor effort"
        flush
        actions={
          hasWebsite && (
            <button className="btn-sm" onClick={() => act(() => api.collect(vendorId))} disabled={busy || running}>
              {running ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Icon name="scan" size={13} />}
              {running ? "Scanning…" : latest ? "Re-scan" : "Scan trust centre"}
            </button>
          )
        }
      >
        {error && (
          <div style={{ padding: "0 20px 12px" }}>
            <ErrorBanner error={error} />
          </div>
        )}
        {!runs ? (
          <div style={{ padding: "0 20px 16px" }}>
            <div className="skeleton" style={{ height: 120 }} />
          </div>
        ) : !latest ? (
          <Empty icon="globe" title={hasWebsite ? "Not scanned yet" : "No website on record"}>
            {hasWebsite
              ? "Scanning finds the vendor's trust centre, downloads public reports, and records anything gated behind an access request."
              : "There's no trust centre to scan without a vendor website."}
          </Empty>
        ) : running ? (
          <div style={{ padding: "0 20px 16px" }}>
            <Callout tone="ai" icon="scan" title="Reading the vendor's public trust centre…">
              <div className="row">
                <span className="spinner ai" />
                Downloading what's freely available. Gated documents are recorded, never opened.
              </div>
            </Callout>
          </div>
        ) : (
          <>
            <div style={{ padding: "0 20px 12px" }}>
              {latest.status === "done" ? (
                <div className="link-box" style={{ fontFamily: "var(--font)" }}>
                  <Icon name="shieldCheck" size={15} className="ok" />
                  <a href={latest.trust_center_url ?? "#"} target="_blank" rel="noreferrer">
                    {latest.trust_center_url}
                  </a>
                </div>
              ) : latest.status === "not_found" ? (
                <Callout tone="info" title="No public trust centre found" />
              ) : (
                <Callout tone="danger" title="Scan failed">
                  {latest.error}
                </Callout>
              )}
              <div className="xsmall muted row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                <Icon name="clock" size={12} />
                <span title={formatDate(latest.finished_at ?? latest.started_at)}>Scanned {timeAgo(latest.finished_at ?? latest.started_at)}</span>
                <span>· {latest.pages?.length ?? 0} pages read</span>
                {!!(latest.pages?.length || latest.refused?.length) && (
                  <button className="link-button xsmall" onClick={() => setShowPages(!showPages)}>
                    {showPages ? "Hide pages" : "Show pages"}
                  </button>
                )}
              </div>
              {showPages && (
                <ul className="xsmall muted mono" style={{ margin: "8px 0 0", paddingLeft: 16, wordBreak: "break-all" }}>
                  {latest.pages?.map((p) => <li key={p}>{p}</li>)}
                  {latest.refused?.map((r) => (
                    <li key={r.url}>
                      Not fetched: {r.url} ({r.reason})
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {!!latest.documents?.length && (
              <ul className="list">
                {latest.documents.map((d, i) => (
                  <li key={i} className="list-item">
                    <span className="file-icon" style={{ width: 30, height: 30 }}>
                      <Icon name={d.gated ? "lock" : "file"} size={14} />
                    </span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <a className="strong truncate" style={{ display: "block", fontSize: 13 }} href={d.file_url ?? d.page_url} target="_blank" rel="noreferrer">
                        {d.title}
                      </a>
                      <div className="xsmall muted truncate">
                        {humanize(d.doc_type)}
                        {d.error && ` · ${d.error}`}
                      </div>
                    </div>
                    <StatusTag spec={DOC_STATUS[d.status] ?? [d.status, "neutral", "file"]} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
