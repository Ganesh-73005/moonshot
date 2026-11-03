import { useCallback, useEffect, useState } from "react";
import { api, type MonitoringEvent, type VendorMonitoring } from "../api";
import { Callout, Card, Empty, ErrorBanner, Icon, StatusPill, TierBadge, displayName, formatDate, humanize, timeAgo } from "../ui";

export const MONITOR_SOURCE: Record<MonitoringEvent["source"], [string, string]> = {
  news: ["News", "newspaper"],
  kev: ["Exploited vulnerability", "bug"],
  trust_center: ["Trust centre", "globe"],
  documents: ["Documents", "file"],
  signals: ["Outside-in signals", "activity"],
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const CHECK_LABEL: Record<string, string> = {
  news: "News",
  kev: "CISA KEV",
  signals: "Signals",
  documents: "Document expiry",
  trust_center: "Trust centre",
};

function Details({ details }: { details: Record<string, unknown> }) {
  const added = (details.added as string[] | undefined) ?? [];
  const removed = (details.removed as string[] | undefined) ?? [];
  if (!added.length && !removed.length) return null;
  return (
    <div className="diff">
      {added.map((l, i) => (
        <div key={`a${i}`} className="diff-add">
          + {l}
        </div>
      ))}
      {removed.map((l, i) => (
        <div key={`r${i}`} className="diff-del">
          − {l}
        </div>
      ))}
    </div>
  );
}

function EventCard({ e, onTriage }: { e: MonitoringEvent; onTriage?: (status: "acknowledged" | "dismissed" | "escalated") => void }) {
  const [label, icon] = MONITOR_SOURCE[e.source] ?? [humanize(e.source), "activity"];
  return (
    <article className={`finding monitor-event ${e.status !== "new" ? "handled" : ""}`}>
      <div className="row" style={{ alignItems: "stretch", gap: 0 }}>
        <span className={`finding-stripe ${e.severity}`} />
        <div className="grow stack-sm" style={{ padding: "14px 16px" }}>
          <div className="row-between" style={{ alignItems: "flex-start" }}>
            <div className="grow">
              <div className="finding-title">
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 5, display: "inline-flex" }}>
                    {e.title}
                    <Icon name="external" size={12} />
                  </a>
                ) : (
                  e.title
                )}
              </div>
              <div className="finding-meta">
                <span className="chip">
                  <Icon name={icon} size={11} />
                  {label}
                </span>
                <span title={formatDate(e.detected_at)}>Detected {timeAgo(e.detected_at)}</span>
                {e.published_at && <span>· published {formatDate(e.published_at)}</span>}
              </div>
            </div>
            <StatusPill status={e.status} />
            <TierBadge tier={e.severity} />
          </div>
          <p style={{ color: "var(--ink-2)", fontSize: 13 }}>{e.reason}</p>
          {e.excerpt && <blockquote className="quote">{e.excerpt}</blockquote>}
          {e.details && <Details details={e.details} />}
          {e.handled_by && (
            <div className="xsmall muted">
              {humanize(e.status)} by {displayName(e.handled_by)}
              {e.handled_at && ` ${timeAgo(e.handled_at)}`}
              {e.note && ` — ${e.note}`}
            </div>
          )}
          {e.status === "new" && onTriage && (
            <div className="row-wrap">
              <button className="btn-sm" onClick={() => onTriage("acknowledged")}>
                <Icon name="check" size={13} />
                Acknowledge
              </button>
              <button className="btn-sm btn-ghost" onClick={() => onTriage("dismissed")}>
                Dismiss
              </button>
              <button className="btn-sm btn-danger" onClick={() => onTriage("escalated")}>
                <Icon name="alert" size={13} />
                Escalate to re-review
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function MonitoringPanel({ vendorId, refreshKey, onChange }: { vendorId: number; refreshKey: string; onChange: () => void }) {
  const [data, setData] = useState<VendorMonitoring | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHandled, setShowHandled] = useState(false);

  const load = useCallback(() => {
    api.vendorMonitoring(vendorId).then(setData).catch((e: Error) => setError(e.message));
  }, [vendorId]);
  useEffect(load, [load, refreshKey]);

  const running = data?.runs[0]?.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      load();
      onChange();
    }, 4000);
    return () => clearInterval(timer);
  }, [running, load, onChange]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      load();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!data) return error ? <ErrorBanner error={error} /> : <div className="skeleton" style={{ height: 180, borderRadius: 14 }} />;
  if (!data.enabled)
    return (
      <Card>
        <Empty icon="radar" title="Continuous monitoring is turned off">
          It is disabled on this server (TPRA_MONITORING=false).
        </Empty>
      </Card>
    );

  const last = data.runs.find((r) => r.status !== "running") ?? null;
  const open = data.events.filter((e) => e.status === "new").sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
  const handled = data.events.filter((e) => e.status !== "new");

  return (
    <div className="stack">
      <Card
        title="Continuous monitoring"
        icon="radar"
        subtitle={
          data.monitored
            ? `Re-checked every ${data.cadence_days} day${data.cadence_days === 1 ? "" : "s"} for this tier`
            : "Starts automatically once the vendor is approved — you can run a check now"
        }
        actions={
          <button className="btn-sm btn-primary" onClick={() => act(() => api.monitorNow(vendorId))} disabled={running}>
            {running ? <span className="spinner" style={{ width: 12, height: 12, borderTopColor: "#fff" }} /> : <Icon name="refresh" size={13} />}
            {running ? "Checking…" : "Check now"}
          </button>
        }
      >
        <div className="stack-sm">
          <ErrorBanner error={error} />
          <div className="q-stats">
            <div className="q-stat">
              <span className="label">Status</span>
              <span className="value">
                {data.monitored ? (
                  <span className="pill tone-good">
                    <span className="dot" />
                    Monitored
                  </span>
                ) : (
                  <span className="pill">Not yet monitored</span>
                )}
              </span>
            </div>
            <div className="q-stat">
              <span className="label">Open alerts</span>
              <span className="value">
                <span className={open.length ? "bad" : ""}>{open.length}</span>
              </span>
            </div>
            <div className="q-stat">
              <span className="label">Last check</span>
              <span className="value">{last ? timeAgo(last.finished_at ?? last.started_at) : "Never"}</span>
            </div>
            <div className="q-stat">
              <span className="label">Handled</span>
              <span className="value">{handled.length}</span>
            </div>
          </div>
          <div className="row-wrap" style={{ gap: 6 }}>
            {Object.entries(CHECK_LABEL).map(([k, labelText]) => {
              const c = last?.checks?.[k];
              return (
                <span key={k} className={`chip ${c ? (c.status === "ok" ? "" : "chip-bad") : ""}`} title={c?.error}>
                  <Icon name={c ? (c.status === "ok" ? "check" : "x") : "clock"} size={11} />
                  {labelText}
                  {c?.status === "ok" && c.found !== undefined && <span className="subtle">· {c.found}</span>}
                </span>
              );
            })}
          </div>
          <div className="xsmall muted">
            News and breach reports, CISA known-exploited vulnerabilities, trust-centre changes, SOC 2 expiry and outside-in signal drift. Critical
            events or an escalation flag the vendor for re-review.
          </div>
        </div>
      </Card>

      {running && (
        <Callout tone="ai" icon="radar" title="Checking now…">
          <div className="row">
            <span className="spinner ai" />
            News, vulnerabilities, the trust centre, documents and signals.
          </div>
        </Callout>
      )}

      {open.length === 0 && !running ? (
        <Card>
          <Empty icon="shieldCheck" title="No new alerts">
            Nothing new has been detected for this vendor.
          </Empty>
        </Card>
      ) : (
        <div className="stack-sm">
          {open.map((e) => (
            <EventCard key={e.id} e={e} onTriage={(status) => act(() => api.triageEvent(e.id, status))} />
          ))}
        </div>
      )}

      {handled.length > 0 && (
        <div className="stack-sm">
          <button className="link-button" style={{ alignSelf: "flex-start" }} onClick={() => setShowHandled(!showHandled)}>
            <Icon name="chevronRight" size={14} className={`chev-rot ${showHandled ? "open" : ""}`} />
            {showHandled ? "Hide" : "Show"} handled alerts ({handled.length})
          </button>
          {showHandled && handled.map((e) => <EventCard key={e.id} e={e} />)}
        </div>
      )}
    </div>
  );
}
