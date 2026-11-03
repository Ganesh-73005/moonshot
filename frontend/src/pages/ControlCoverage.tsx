import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { api, type Assessment, type ControlResult, type ControlStatus, type Evidence, type Finding } from "../api";
import { AGENT_LABEL, AGENT_META, Card, Empty, ErrorBanner, Icon, TierBadge, humanize } from "../ui";
import { DocumentViewer, type ViewerTarget } from "./LazyDocumentViewer";
import { locationLabel } from "./locations";

const STATUS_LABEL: Record<ControlStatus, string> = {
  met: "Met",
  partially_met: "Partially met",
  not_met: "Not met",
  not_evidenced: "Not evidenced",
  not_applicable: "N/A",
};
const STATUSES: ControlStatus[] = ["not_met", "partially_met", "not_evidenced", "met", "not_applicable"];
// Icon per status so the state never rides on color alone.
export const STATUS_ICON: Record<ControlStatus, string> = {
  met: "check",
  partially_met: "alert",
  not_met: "x",
  not_evidenced: "info",
  not_applicable: "ban",
};
export const CONTROL_STATUS_LABEL = STATUS_LABEL;

export function ControlStatusPill({ status }: { status: ControlStatus }) {
  return (
    <span className={`pill control-pill control-${status}`}>
      <Icon name={STATUS_ICON[status]} size={11} strokeWidth={2.4} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Per-agent control results as stacked bars, from the assessment's control_summary. */
export function ControlSummary({ a, onOpen }: { a: Assessment; onOpen: () => void }) {
  const agents = Object.entries(a.control_summary);
  if (agents.length === 0) return null;
  const order: ControlStatus[] = ["met", "partially_met", "not_met", "not_evidenced", "not_applicable"];
  const total = (counts: Partial<Record<ControlStatus, number>>) => order.reduce((n, s) => n + (counts[s] ?? 0), 0);
  const all = order.map((s) => [s, agents.reduce((n, [, c]) => n + (c[s] ?? 0), 0)] as const);
  const grand = all.reduce((n, [, v]) => n + v, 0);
  return (
    <Card
      title="Control coverage"
      icon="checklist"
      subtitle={`${grand} checklist controls assessed against the evidence, with verified citations`}
      actions={
        <button className="btn-sm btn-ghost" onClick={onOpen}>
          Open matrix
          <Icon name="chevronRight" size={14} />
        </button>
      }
    >
      <div className="stack-sm">
        {agents.map(([agent, counts]) => {
          const n = total(counts);
          return (
            <div key={agent} className="cov-row">
              <span className="row" style={{ gap: 8 }}>
                <span className={`agent-icon ${agent}`} style={{ width: 22, height: 22, borderRadius: 6 }}>
                  <Icon name={AGENT_META[agent]?.icon ?? "sparkles"} size={12} />
                </span>
                <span className="strong small">{AGENT_META[agent]?.short ?? agent}</span>
              </span>
              <div className="dist-bar" style={{ height: 10 }} role="img" aria-label={order.map((s) => `${STATUS_LABEL[s]} ${counts[s] ?? 0}`).join(", ")}>
                {order
                  .filter((s) => (counts[s] ?? 0) > 0)
                  .map((s) => (
                    <div key={s} className={`dist-seg cov-${s}`} style={{ flex: counts[s] }}>
                      <span className="tooltip">
                        {STATUS_LABEL[s]} · {counts[s]} of {n}
                      </span>
                    </div>
                  ))}
              </div>
              <span className="xsmall muted tabular" style={{ textAlign: "right" }}>
                {n}
              </span>
            </div>
          );
        })}
        <div className="row-wrap" style={{ gap: 12, marginTop: 4 }}>
          {all.map(([s, v]) => (
            <span key={s} className="row xsmall" style={{ gap: 5 }}>
              <span className={`cov-swatch cov-${s}`} />
              {STATUS_LABEL[s]} <span className="strong">{v}</span>
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, i) => [s, i])) as Record<ControlStatus, number>;
const SOURCE_LABEL: Record<string, string> = {
  tekion_questionnaire: "Tekion questionnaire",
  soc2_tsc: "SOC 2",
  iso27001: "ISO 27001",
  ai_risk: "AI risk",
  agent_domain: "Agent domain",
};
const SOURCES = Object.keys(SOURCE_LABEL);

interface Filters {
  agent: string;
  source: string;
  status: string;
  q: string;
}
const ALL: Filters = { agent: "", source: "", status: "", q: "" };

function matches(c: ControlResult, f: Filters): boolean {
  if (f.agent && c.agent !== f.agent) return false;
  if (f.source && c.source !== f.source) return false;
  if (f.status && c.status !== f.status) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    return [c.control_id, c.section, c.requirement, c.rationale].some((t) => t.toLowerCase().includes(q));
  }
  return true;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportCsv(rows: ControlResult[], evidence: Map<number, Evidence>, vendorId: number, assessmentId: number) {
  const header = ["control_id", "source", "agent", "domain", "section", "requirement", "status", "severity_if_unmet",
    "rationale", "evidence"];
  const lines = rows.map((c) => [
    c.control_id, SOURCE_LABEL[c.source] ?? c.source, c.agent, c.domain, c.section, c.requirement, c.status,
    c.severity_if_unmet, c.rationale,
    c.citations.map((cite) => {
      const doc = cite.attestation ?? (cite.evidence_id != null ? evidence.get(cite.evidence_id)?.filename : "") ?? "";
      const where = locationLabel(cite.page, cite.locator ?? null);
      const flag = cite.verified === false ? " [quote not found]" : "";
      return `${doc}${where ? ` ${where}` : ""}: "${cite.quote}"${flag}`;
    }).join(" | "),
  ].map((v) => csvCell(String(v ?? ""))).join(","));
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vendor-${vendorId}-assessment-${assessmentId}-controls.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Citations({ c, evidence, onShow }: {
  c: ControlResult;
  evidence: Map<number, Evidence>;
  onShow: (t: ViewerTarget) => void;
}) {
  if (!c.citations.length) return <span className="subtle small">—</span>;
  return (
    <span className="row-wrap" style={{ gap: 4 }}>
      {c.citations.map((cite, i) => {
        const ev = cite.evidence_id != null ? evidence.get(cite.evidence_id) : undefined;
        if (cite.attestation)
          return (
            <span key={i} className="chip" title={cite.quote}>
              <Icon name="message" size={11} />
              Self-attested
            </span>
          );
        if (!cite.verified)
          return (
            <span key={i} className="chip chip-warn" title={cite.quote}>
              <Icon name="alert" size={11} />
              Quote not found
            </span>
          );
        return (
          <button
            key={i}
            className="chip chip-link"
            title={`${ev?.filename ?? ""}: “${cite.quote}”`}
            onClick={(e) => {
              e.stopPropagation();
              if (ev) onShow({ evidence: ev, page: cite.page, locator: cite.locator ?? null, segmentId: cite.segment_id, quote: cite.quote });
            }}
          >
            <Icon name="check" size={11} strokeWidth={2.4} />
            {locationLabel(cite.page, cite.locator ?? null) || "Open"}
          </button>
        );
      })}
    </span>
  );
}

export function ControlCoverage({ a, evidence, focus, onFocused }: {
  a: Assessment;
  evidence: Evidence[];
  /** A control id to jump to (from a finding's checklist link). */
  focus: string | null;
  onFocused: () => void;
}) {
  const [controls, setControls] = useState<ControlResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ ...ALL, status: "not_met" });
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [viewing, setViewing] = useState<ViewerTarget | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    api.assessmentControls(a.id).then(setControls).catch((e: Error) => setError(e.message));
  }, [a.id]);

  // Start on the most useful view: failures if there are any, otherwise partial results.
  useEffect(() => {
    if (!controls) return;
    const has = (s: ControlStatus) => controls.some((c) => c.status === s);
    setFilters((f) => (f.status === "not_met" && !has("not_met") ? { ...f, status: has("partially_met") ? "partially_met" : "" } : f));
  }, [controls]);

  useEffect(() => {
    if (!focus || !controls) return;
    const target = controls.find((c) => c.control_id === focus);
    if (!target) return;
    setFilters({ ...ALL, q: focus });
    setOpen(new Set([target.id]));
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    onFocused();
  }, [focus, controls, onFocused]);

  const byEvidence = useMemo(() => new Map(evidence.map((e) => [e.id, e])), [evidence]);
  const findingsByControl = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const f of a.findings) for (const id of f.control_ids ?? []) map.set(id, [...(map.get(id) ?? []), f]);
    return map;
  }, [a.findings]);

  if (Object.keys(a.control_summary).length === 0)
    return (
      <Card>
        <Empty icon="checklist" title="No checklist results for this assessment">
          Control coverage appears for assessments run with the control checklist enabled.
        </Empty>
      </Card>
    );

  const visible = (controls ?? [])
    .filter((c) => matches(c, filters))
    .sort((x, y) => x.domain.localeCompare(y.domain) || STATUS_ORDER[x.status] - STATUS_ORDER[y.status]);
  const domains = [...new Set(visible.map((c) => `${c.agent}:${c.domain}`))];
  const counts = (source: string, status: ControlStatus) =>
    (controls ?? []).filter((c) => c.source === source && c.status === status && (!filters.agent || c.agent === filters.agent)).length;
  const sources = SOURCES.filter((s) => (controls ?? []).some((c) => c.source === s));
  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <section ref={cardRef} className="stack">
      <Card
        title="Control coverage"
        icon="checklist"
        subtitle="Every control from the enabled checklists, assessed against the evidence. Click a count to filter; open a row for the rationale and the exact passages relied on."
        flush
        actions={
          controls && (
            <button className="btn-sm" onClick={() => exportCsv(visible, byEvidence, a.vendor_id, a.id)} disabled={!visible.length}>
              <Icon name="download" size={13} />
              Export CSV ({visible.length})
            </button>
          )
        }
      >
        {error && (
          <div style={{ padding: "0 20px 12px" }}>
            <ErrorBanner error={error} />
          </div>
        )}
        {!controls && !error && (
          <div style={{ padding: "0 20px 16px" }}>
            <div className="skeleton" style={{ height: 160 }} />
          </div>
        )}
        {controls && (
          <div className="table-wrap">
            <table className="heatmap">
              <thead>
                <tr>
                  <th>Checklist</th>
                  {STATUSES.map((s) => (
                    <th key={s} className="num">
                      <span className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                        <Icon name={STATUS_ICON[s]} size={11} strokeWidth={2.4} />
                        {STATUS_LABEL[s]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source}>
                    <td className="strong">{SOURCE_LABEL[source]}</td>
                    {STATUSES.map((s) => {
                      const n = counts(source, s);
                      const active = filters.source === source && filters.status === s;
                      return (
                        <td key={s} className={`num heat-cell ${n ? `heat-${s}` : "heat-none"}${active ? " active" : ""}`}>
                          {n ? (
                            <button
                              className="heat-btn"
                              aria-pressed={active}
                              onClick={() => set(active ? { source: "", status: "" } : { source, status: s, q: "" })}
                              title={`${SOURCE_LABEL[source]} · ${STATUS_LABEL[s]}: ${n}`}
                            >
                              {n}
                            </button>
                          ) : (
                            <span className="heat-empty">–</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {controls && (
        <Card flush>
          <div className="filters">
            <div className="search" style={{ flex: 1, minWidth: 220, width: "auto" }}>
              <Icon name="search" size={15} />
              <input
                type="search"
                placeholder="Search id, section, requirement"
                value={filters.q}
                onChange={(e) => set({ q: e.target.value })}
                aria-label="Search controls"
              />
            </div>
            <select value={filters.agent} onChange={(e) => set({ agent: e.target.value })} aria-label="Agent">
              <option value="">All agents</option>
              {Object.entries(AGENT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select value={filters.source} onChange={(e) => set({ source: e.target.value })} aria-label="Checklist">
              <option value="">All checklists</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
            <select value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <span className="muted small nowrap">
              {visible.length} of {controls.length}
            </span>
            {(filters.agent || filters.source || filters.status || filters.q) && (
              <button className="btn-sm btn-ghost" onClick={() => setFilters(ALL)}>
                <Icon name="x" size={13} />
                Clear
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <Empty icon="search" title="No controls match these filters" />
          ) : (
            <div className="table-wrap">
              <table className="matrix">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>Control</th>
                    <th>Requirement</th>
                    <th style={{ width: 150 }}>Status</th>
                    <th style={{ width: 200 }}>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {domains.map((key) => {
                    const [agent, domain] = key.split(":");
                    const rows = visible.filter((c) => c.agent === agent && c.domain === domain);
                    return (
                      <Fragment key={key}>
                        <tr className="group-row">
                          <td colSpan={4}>
                            <span className="row" style={{ gap: 8 }}>
                              <Icon name={AGENT_META[agent]?.icon ?? "sparkles"} size={13} />
                              {humanize(domain)}
                              <span className="muted" style={{ fontWeight: 500 }}>
                                · {AGENT_META[agent]?.short ?? agent} · {rows.length}
                              </span>
                            </span>
                          </td>
                        </tr>
                        {rows.map((c) => {
                          const linked = findingsByControl.get(c.control_id) ?? [];
                          const isOpen = open.has(c.id);
                          return (
                            <Fragment key={c.id}>
                              <tr className="clickable" onClick={() => toggle(c.id)} aria-expanded={isOpen}>
                                <td>
                                  <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
                                    <Icon name="chevronRight" size={14} className={`chev-rot ${isOpen ? "open" : ""}`} />
                                    <div>
                                      <div className="mono strong" style={{ color: "var(--ink)" }}>
                                        {c.control_id}
                                      </div>
                                      <div className="xsmall muted">{SOURCE_LABEL[c.source] ?? c.source}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="small" style={{ color: "var(--ink-2)" }}>
                                  {c.requirement.length > 160 && !isOpen ? `${c.requirement.slice(0, 160)}…` : c.requirement}
                                </td>
                                <td>
                                  <div className="stack-xs" style={{ alignItems: "flex-start" }}>
                                    <ControlStatusPill status={c.status} />
                                    {c.status !== "met" && c.status !== "not_applicable" && (
                                      <span className="xsmall muted row nowrap" style={{ gap: 4 }}>
                                        If unmet: <TierBadge tier={c.severity_if_unmet} />
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <Citations c={c} evidence={byEvidence} onShow={setViewing} />
                                  {linked.length > 0 && (
                                    <div className="xsmall muted" style={{ marginTop: 4 }}>
                                      {linked.length} finding{linked.length > 1 ? "s" : ""}
                                    </div>
                                  )}
                                </td>
                              </tr>
                              {isOpen && (
                                <tr className="detail-row">
                                  <td colSpan={4}>
                                    <div className="stack-sm fade-in">
                                      <div className="xsmall muted">{c.section}</div>
                                      <div>
                                        <div className="finding-block-label">
                                          <Icon name="sparkles" size={12} />
                                          Agent rationale
                                        </div>
                                        <p style={{ color: "var(--ink-2)" }}>{c.rationale}</p>
                                      </div>
                                      {c.citations.map((cite, i) => {
                                        const ev = cite.evidence_id != null ? byEvidence.get(cite.evidence_id) : undefined;
                                        return (
                                          <blockquote key={i} className={`quote ${cite.verified === false && !cite.attestation ? "quote-warn" : ""}`}>
                                            “{cite.quote}”
                                            <div className="quote-source">
                                              {cite.attestation ? (
                                                <>
                                                  <Icon name="message" size={12} />
                                                  Vendor's self-attestation ({cite.attestation})
                                                </>
                                              ) : cite.verified ? (
                                                <>
                                                  <Icon name="check" size={12} />
                                                  {ev?.filename ?? ""} · {locationLabel(cite.page, cite.locator ?? null)}
                                                  {cite.section_path ? ` · ${cite.section_path}` : ""}
                                                  {ev && (
                                                    <button
                                                      className="link-button xsmall"
                                                      onClick={() =>
                                                        setViewing({ evidence: ev, page: cite.page, locator: cite.locator ?? null, segmentId: cite.segment_id, quote: cite.quote })
                                                      }
                                                    >
                                                      Show in document
                                                    </button>
                                                  )}
                                                </>
                                              ) : (
                                                <>
                                                  <Icon name="alert" size={12} />
                                                  This quote wasn't found in the document.
                                                </>
                                              )}
                                            </div>
                                          </blockquote>
                                        );
                                      })}
                                      {linked.length > 0 && (
                                        <div className="small">
                                          <span className="strong">Findings resting on this control:</span> {linked.map((f) => f.title).join("; ")}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {viewing && <DocumentViewer target={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
