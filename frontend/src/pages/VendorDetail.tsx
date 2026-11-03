import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  api,
  getUser,
  type Assessment,
  type AuditEvent,
  type Evidence,
  type EvidenceStatus,
  type Finding,
  type InherentAdjustment,
  type Tier,
  type VendorDetail as Vendor,
  type VendorMonitoring,
} from "../api";
import { useCrumb } from "../App";
import { formatCalendarDay } from "../contract";
import {
  AGENT_LABEL,
  AGENT_META,
  Avatar,
  Callout,
  Card,
  Empty,
  ErrorBanner,
  Gauge,
  Icon,
  LoadingPage,
  Meter,
  RatingPill,
  StatusPill,
  TIERS,
  TierBadge,
  TierShape,
  displayName,
  formatBytes,
  formatDate,
  formatDay,
  humanize,
  statusLabel,
  tierLabel,
  timeAgo,
  useConfirm,
} from "../ui";
import { ControlCoverage, ControlSummary } from "./ControlCoverage";
import { ActivityItem } from "./Dashboard";
import { DocumentViewer } from "./LazyDocumentViewer";
import { EvidenceStatusPanel } from "./EvidenceStatusPanel";
import { locationLabel } from "./locations";
import { MonitoringPanel } from "./MonitoringPanel";
import { QuestionnairePanel } from "./QuestionnairePanel";
import { TrustCenterPanel } from "./TrustCenterPanel";

const DOC_TYPES = [
  "soc2", "soc1", "iso27001", "iso27701", "iso42001", "pci_aoc", "pentest", "dpa", "privacy_policy", "security_policy",
  "subprocessor_list", "bcp_dr", "incident_response", "ai_governance", "model_card", "secure_sdlc", "sbom",
  "security_questionnaire", "personnel_security", "cyber_insurance", "sla", "vpat", "questionnaire", "other",
];
const IN_FLIGHT = new Set(["running", "processing"]);
const FINAL = new Set(["approved", "approved_with_accepted_risk", "rejected", "awaiting_evidence", "failed"]);
const SEVERITY_ORDER: Record<Tier, number> = { critical: 0, high: 1, medium: 2, low: 3 };

type TabId = "overview" | "findings" | "controls" | "evidence" | "questionnaire" | "monitoring" | "audit";

/* ---------- Header & workflow ---------- */

type StepState = "done" | "active" | "running" | "error" | "skipped" | "pending";

function Step({ state, n, title, sub }: { state: StepState; n: number; title: string; sub: ReactNode }) {
  const icon = state === "done" ? "check" : state === "error" ? "x" : null;
  return (
    <div className={`step ${state}`}>
      <div className="step-line">
        <span className="step-bar l" />
        <span className="step-dot">
          {state === "running" ? <span className="spinner ai" style={{ width: 12, height: 12 }} /> : icon ? <Icon name={icon} size={13} strokeWidth={2.6} /> : n}
        </span>
        <span className="step-bar r" />
      </div>
      <div>
        <div className="step-title">{title}</div>
        <div className="step-sub">{sub}</div>
      </div>
    </div>
  );
}

function Workflow({ vendor, a }: { vendor: Vendor; a: Assessment | null }) {
  const s = a?.status;
  const reading = vendor.evidence.filter((e) => e.processing_status === "pending" || e.processing_status === "processing").length;
  const reviewed = !!a?.reviewed_by;
  const decided = !!s && FINAL.has(s) && s !== "failed";
  const assess: StepState = !a ? "active" : IN_FLIGHT.has(s!) && !reviewed ? "running" : s === "failed" ? "error" : "done";
  const review: StepState = s === "awaiting_review" ? "active" : reviewed ? "done" : "pending";
  const signoff: StepState = s === "awaiting_signoff" ? "active" : a?.signed_off_by ? "done" : decided && reviewed ? "skipped" : "pending";
  const decision: StepState = decided ? "done" : "pending";
  return (
    <div className="stepper">
      <Step state="done" n={1} title="Intake" sub={`${displayName(vendor.created_by)} · ${formatDay(vendor.created_at)}`} />
      <Step
        state={reading ? "running" : vendor.evidence.length ? "done" : "pending"}
        n={2}
        title="Evidence"
        sub={reading ? `Reading ${reading} document${reading === 1 ? "" : "s"}…` : `${vendor.evidence.length} document${vendor.evidence.length === 1 ? "" : "s"} on file`}
      />
      <Step
        state={assess}
        n={3}
        title="AI assessment"
        sub={!a ? "Not started" : assess === "running" ? "Agents working…" : assess === "error" ? "Failed — re-run" : a.completed_at ? `Completed ${timeAgo(a.completed_at)}` : "Completed"}
      />
      <Step state={review} n={4} title="Analyst review" sub={reviewed ? `${displayName(a!.reviewed_by!)} · ${humanize(a!.review_decision ?? "")}` : review === "active" ? "Decision required" : "Human gate"} />
      <Step
        state={signoff}
        n={5}
        title="Approver sign-off"
        sub={a?.signed_off_by ? `${displayName(a.signed_off_by)} · ${humanize(a.signoff_decision ?? "")}` : signoff === "active" ? "Independent approver required" : signoff === "skipped" ? "Not required for this tier" : "High & Critical only"}
      />
      <Step state={decision} n={6} title="Decision" sub={decided ? statusLabel(s!) : "Pending"} />
    </div>
  );
}

/* ---------- Overview blocks ---------- */

function Profile({ vendor }: { vendor: Vendor }) {
  const rows: [string, ReactNode][] = [
    ["Category", humanize(vendor.category)],
    ["Data handled", humanize(vendor.data_sensitivity)],
    ["Criticality", humanize(vendor.business_criticality)],
    ["System access", humanize(vendor.access_level)],
    ["Who it affects", vendor.impact_facing ? humanize(vendor.impact_facing) : <span className="subtle">Not specified</span>],
    ["AI use declared", vendor.uses_ai_declared ? <span className="chip chip-ai"><Icon name="cpu" size={12} />Yes</span> : "No"],
    ["Business owner", displayName(vendor.business_owner)],
    ["Security contact", vendor.vendor_contact_email ?? <span className="subtle">Not provided</span>],
    ...(vendor.vendor_contact_name || vendor.vendor_contact_phone
      ? ([["Vendor contact", [vendor.vendor_contact_name, vendor.vendor_contact_phone].filter(Boolean).join(" · ")]] as [string, ReactNode][])
      : []),
    [
      "Trust portal",
      vendor.trust_portal_url ? (
        <a href={vendor.trust_portal_url} target="_blank" rel="noreferrer" className="truncate" style={{ display: "block", maxWidth: 260 }}>
          {vendor.trust_portal_url.replace(/^https?:\/\//, "")}
        </a>
      ) : (
        <span className="subtle">None found yet</span>
      ),
    ],
    [
      "Contract period",
      vendor.contract_start && vendor.contract_end ? (
        <span>
          {formatCalendarDay(vendor.contract_start)} → {formatCalendarDay(vendor.contract_end)}
          <span className="muted"> · {vendor.contract_term}</span>
        </span>
      ) : (
        <span className="subtle">Not provided</span>
      ),
    ],
    [
      "Inherent risk",
      <span className="row">
        <span className="tabular">{vendor.inherent_score.toFixed(1)}</span>
        <TierBadge tier={vendor.inherent_tier} />
      </span>,
    ],
  ];
  return (
    <Card title="Intake profile" icon="file" subtitle="As declared by the requestor">
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

const ADJUSTMENT_LABEL: Record<InherentAdjustment["attribute"], string> = {
  data_sensitivity: "Data handled",
  uses_ai: "AI use",
};

const adjustmentValue = (v: string | boolean) => (typeof v === "boolean" ? (v ? "Yes" : "No") : humanize(v));

function Adjustments({ adjustments }: { adjustments: InherentAdjustment[] }) {
  if (adjustments.length === 0) return null;
  return (
    <Callout tone="ai" title="Intake corrected by agents" icon="sparkles">
      <div className="small">Scoring uses the higher of the declared and inferred values.</div>
      <ul>
        {adjustments.map((adj) => (
          <li key={adj.attribute}>
            <span className="strong">{ADJUSTMENT_LABEL[adj.attribute]}:</span> declared <strong>{adjustmentValue(adj.declared)}</strong> →{" "}
            {adj.status === "applied" ? "scored as" : "inferred"} <strong>{adjustmentValue(adj.inferred)}</strong>{" "}
            <span className="muted small">
              ({AGENT_LABEL[adj.agent]}
              {adj.confidence && `, ${adj.confidence} confidence`})
            </span>{" "}
            {adj.status === "rejected_by_analyst" && <span className="pill">Rejected by analyst</span>}
            <div className="muted small">{adj.basis}</div>
          </li>
        ))}
      </ul>
    </Callout>
  );
}

function ScoreSummary({ a }: { a: Assessment }) {
  const b = a.score_breakdown;
  if (!b) return null;
  const adjusted = b.inherent_score !== b.declared_inherent_score;
  const residual = a.residual_score ?? 0;
  const reduction = b.inherent_score > 0 ? Math.round(((b.inherent_score - residual) / b.inherent_score) * 100) : 0;
  return (
    <Card
      title="Composite risk score"
      icon="target"
      subtitle="Deterministic and reproducible: inherent risk × weighted control gap"
      actions={a.final_tier ? <TierBadge tier={a.final_tier} size="lg" suffix=" final" /> : undefined}
    >
      <div className="row-between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
        <div className="gauges">
          {adjusted && (
            <>
              <Gauge value={b.declared_inherent_score} tier={null} label="Declared" muted />
              <div className="gauge-arrow">
                <Icon name="sparkles" size={14} />
                <Icon name="chevronRight" size={18} />
              </div>
            </>
          )}
          <Gauge value={b.inherent_score} tier={tierFor(b.inherent_score)} label={adjusted ? "Inherent (corrected)" : "Inherent"} />
          <div className="gauge-arrow">
            <span className={`reduction ${reduction <= 0 ? "none" : ""}`}>{reduction > 0 ? `−${reduction}%` : "0%"}</span>
            <Icon name="chevronRight" size={18} />
            <span className="xsmall">controls</span>
          </div>
          <Gauge value={residual} tier={b.numeric_tier} label="Residual" />
        </div>
        <dl className="kv" style={{ minWidth: 220, flex: "0 1 260px" }}>
          <div>
            <dt>Computed tier</dt>
            <dd>
              <TierBadge tier={a.computed_tier} />
            </dd>
          </div>
          {a.override_tier && (
            <div>
              <dt>Analyst override</dt>
              <dd>
                <TierBadge tier={a.override_tier} />
              </dd>
            </div>
          )}
          <div>
            <dt>Control gap</dt>
            <dd className="tabular">{(b.control_gap * 100).toFixed(0)}%</dd>
          </div>
          {b.tier_floors_applied.length > 0 && (
            <div>
              <dt>Tier floor</dt>
              <dd className="small">{b.tier_floors_applied.join("; ")}</dd>
            </div>
          )}
        </dl>
      </div>

      <div style={{ marginTop: 16 }}>
        <Adjustments adjustments={b.inherent_adjustments} />
      </div>

      <div className="table-wrap" style={{ margin: "16px -20px 0" }}>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th style={{ width: 150 }}>Weight</th>
              <th className="num">Open findings</th>
              <th style={{ width: 170 }}>Control gap</th>
              <th>No evidence for</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(b.agents).map(([name, s]) => (
              <tr key={name}>
                <td>
                  <div className="row">
                    <span className={`agent-icon ${name}`} style={{ width: 24, height: 24, borderRadius: 7 }}>
                      <Icon name={AGENT_META[name]?.icon ?? "sparkles"} size={13} />
                    </span>
                    <span className="strong nowrap">{AGENT_META[name]?.short ?? name}</span>
                  </div>
                </td>
                <td>
                  <Meter value={s.weight * 100} tier="accent" unit="%" />
                </td>
                <td className="num strong">{s.open_findings}</td>
                <td>
                  <Meter value={s.gap * 100} unit="%" tier={s.gap >= 0.6 ? "critical" : s.gap >= 0.4 ? "high" : s.gap >= 0.2 ? "medium" : "low"} />
                </td>
                <td>
                  <div className="row-wrap" style={{ gap: 4 }}>
                    {s.insufficient_evidence_domains.length ? (
                      s.insufficient_evidence_domains.map((d) => (
                        <span key={d} className="chip">
                          {humanize(d)}
                        </span>
                      ))
                    ) : (
                      <span className="subtle">—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="xsmall muted" style={{ marginTop: 12 }}>
        Residual = inherent × (0.5 + 0.5 × weighted control gap). Domains without evidence earn no risk reduction.
        {b.not_applicable_agents.length > 0 && ` Not applicable: ${b.not_applicable_agents.map((n) => AGENT_LABEL[n]).join(", ")}.`}
      </p>
    </Card>
  );
}

const tierFor = (s: number): Tier => (s >= 75 ? "critical" : s >= 50 ? "high" : s >= 25 ? "medium" : "low");

function AgentPanels({ a }: { a: Assessment }) {
  if (!a.agent_summaries) return null;
  return (
    <div className="grid cols-3">
      {Object.entries(a.agent_summaries).map(([name, s]) => {
        const domains = a.domain_assessments.filter((d) => d.agent === name);
        const findings = a.findings.filter((f) => f.agent === name).length;
        const meta = AGENT_META[name];
        return (
          <section key={name} className="card agent-card">
            <div className="agent-head">
              <span className={`agent-icon ${name}`}>
                <Icon name={meta?.icon ?? "sparkles"} size={18} />
              </span>
              <div className="grow">
                <h3>{AGENT_LABEL[name] ?? name}</h3>
                <div className="xsmall muted">{meta?.blurb}</div>
              </div>
              {!s.applicable && <span className="pill">Not applicable</span>}
            </div>
            <p className="agent-summary">{s.summary}</p>
            {domains.length > 0 && (
              <ul className="domain-list">
                {domains.map((d) => (
                  <li key={d.domain} title={d.summary}>
                    <span>{humanize(d.domain)}</span>
                    <RatingPill rating={d.rating} />
                  </li>
                ))}
              </ul>
            )}
            <div className="agent-foot">
              <span>
                <Icon name="sparkles" size={12} /> Claude agent
              </span>
              <span>
                {findings} finding{findings === 1 ? "" : "s"}
              </span>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function list(value: unknown): string {
  return Array.isArray(value) && value.length ? value.map((v) => humanize(String(v))).join(", ") : "—";
}

function Signal({ label, state, children }: { label: string; state: "good" | "bad" | "warn" | "na"; children: ReactNode }) {
  const icon = { good: "check", bad: "x", warn: "alert", na: "info" }[state];
  const color = { good: "var(--good-ink)", bad: "var(--critical-ink)", warn: "#b77800", na: "var(--ink-4)" }[state];
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)" }}>
      <span style={{ color, marginTop: 1 }}>
        <Icon name={icon} size={15} strokeWidth={2.2} />
      </span>
      <div className="grow">
        <div className="strong" style={{ fontSize: 13 }}>
          {label}
        </div>
        <div className="small muted">{children}</div>
      </div>
    </div>
  );
}

function AgentDetails({ a }: { a: Assessment }) {
  const privacy = a.agent_details?.privacy as Record<string, unknown> | undefined;
  const ai = a.agent_details?.ai_vendor as Record<string, unknown> | undefined;
  const classification = privacy?.data_classification as
    | { categories: string[]; sensitivity: string; confidence: string; basis: string }
    | undefined;
  const inconsistencies = (privacy?.intake_inconsistencies as string[] | undefined) ?? [];
  const signals = a.signals ?? {};
  const email = signals.email_auth as Record<string, unknown> | undefined;
  const tls = signals.tls as Record<string, unknown> | undefined;
  const sectxt = signals.security_txt as Record<string, unknown> | undefined;
  const cves = signals.cves as Record<string, unknown> | undefined;
  const relevant = (a.agent_details?.security?.relevant_cve_ids as string[] | undefined) ?? [];

  return (
    <div className="grid cols-3">
      <Card title="Data & privacy profile" icon="eye" subtitle="Inferred by the Privacy agent">
        <div className="stack-sm">
          {inconsistencies.length > 0 && (
            <Callout tone="warning" title="Intake inconsistencies">
              <ul>
                {inconsistencies.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </Callout>
          )}
          {classification ? (
            <dl className="kv">
              <div>
                <dt>Sensitivity</dt>
                <dd>
                  {humanize(classification.sensitivity)} <span className="muted small">({classification.confidence} confidence)</span>
                </dd>
              </div>
              <div>
                <dt>Data categories</dt>
                <dd>{list(classification.categories)}</dd>
              </div>
              <div>
                <dt>Basis</dt>
                <dd className="small" style={{ fontWeight: 400 }}>
                  {classification.basis}
                </dd>
              </div>
              <div>
                <dt>Locations</dt>
                <dd>{list(privacy?.data_locations)}</dd>
              </div>
              <div>
                <dt>Transfers</dt>
                <dd>{list(privacy?.transfer_mechanisms)}</dd>
              </div>
              <div>
                <dt>Sub-processors</dt>
                <dd>{list(privacy?.subprocessors)}</dd>
              </div>
              <div>
                <dt>Frameworks</dt>
                <dd>{list(privacy?.applicable_frameworks)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted small">No classification produced.</p>
          )}
        </div>
      </Card>
      <Card title="AI capability" icon="cpu" subtitle="Detected by the AI-Vendor agent">
        <div className="stack-sm">
          <div className="row">
            {ai?.ai_capability_detected ? (
              <span className="pill tone-ai">
                <Icon name="sparkles" size={12} />
                AI capability detected
              </span>
            ) : (
              <span className="pill">No AI capability detected</span>
            )}
          </div>
          <dl className="kv">
            <div>
              <dt>Basis</dt>
              <dd className="small" style={{ fontWeight: 400 }}>
                {String(ai?.ai_capability_basis ?? "—")}
              </dd>
            </div>
            <div>
              <dt>Model providers</dt>
              <dd>{list(ai?.third_party_model_providers)}</dd>
            </div>
          </dl>
        </div>
      </Card>
      <Card title="Outside-in signals" icon="globe" subtitle="Collected with no vendor involvement">
        <div style={{ marginTop: -9 }}>
          <Signal
            label="Email authentication"
            state={email?.status !== "ok" ? "na" : email.spf_present && email.dmarc_present ? (email.dmarc_policy === "none" ? "warn" : "good") : "bad"}
          >
            {email?.status === "ok"
              ? `SPF ${email.spf_present ? "present" : "missing"} · DMARC ${email.dmarc_present ? `p=${email.dmarc_policy}` : "missing"}`
              : `Unavailable: ${String(email?.reason ?? "not collected")}`}
          </Signal>
          <Signal label="TLS certificate" state={tls?.status !== "ok" ? "na" : tls.certificate_valid ? "good" : "bad"}>
            {tls?.status === "ok"
              ? tls.certificate_valid
                ? `${tls.protocol ?? ""} · expires in ${tls.days_until_expiry} days`
                : `Invalid: ${tls.verification_error}`
              : `Unavailable: ${String(tls?.reason ?? "not collected")}`}
          </Signal>
          <Signal label="security.txt" state={sectxt?.status !== "ok" ? "na" : sectxt.present ? "good" : "warn"}>
            {sectxt?.status === "ok" ? (sectxt.present ? "Published" : "Not published") : `Unavailable: ${String(sectxt?.reason ?? "not collected")}`}
          </Signal>
          <Signal label="Known CVEs (NVD)" state={cves?.status !== "ok" ? "na" : relevant.length ? "bad" : "good"}>
            {cves?.status === "ok"
              ? `${(cves.recent_high_severity as unknown[]).length} high-severity keyword matches for “${cves.keyword}”; judged relevant: ${relevant.join(", ") || "none"}`
              : `Unavailable: ${String(cves?.reason ?? "not collected")}`}
          </Signal>
        </div>
      </Card>
    </div>
  );
}

function AgentsRunning() {
  return (
    <section className="card ai">
      <div className="card-head">
        <div>
          <h2 className="card-title">
            <span className="spinner ai" />
            AI agents are assessing this vendor
          </h2>
          <div className="card-sub">Collecting outside-in signals, then running three agents in parallel. This page updates automatically.</div>
        </div>
      </div>
      <div className="card-body grid cols-2" style={{ gap: 10 }}>
        <div className="agent-run">
          <span className="agent-icon" style={{ background: "var(--surface-3)", color: "var(--ink-3)" }}>
            <Icon name="globe" size={15} />
          </span>
          <div className="grow stack-xs">
            <span className="strong">Outside-in signals</span>
            <span className="xsmall muted">SPF/DMARC · TLS · security.txt · NVD</span>
            <div className="scan-line" />
          </div>
        </div>
        {Object.entries(AGENT_META).map(([key, m]) => (
          <div className="agent-run" key={key}>
            <span className={`agent-icon ${key}`}>
              <Icon name={m.icon} size={15} />
            </span>
            <div className="grow stack-xs">
              <span className="strong">{AGENT_LABEL[key]}</span>
              <span className="xsmall muted">{m.blurb}</span>
              <div className="scan-line" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Human gates ---------- */

const DECISIONS: [string, string, string, string][] = [
  ["approve", "Approve", "Controls are adequate for this engagement", "check"],
  ["accept_risk", "Approve with risk acceptance", "Time-bound; open findings are accepted by the business owner", "clock"],
  ["request_evidence", "Request more evidence", "Drafts a targeted gap questionnaire for the vendor", "mail"],
  ["reject", "Reject vendor", "Do not proceed with this vendor", "ban"],
];

function ReviewPanel({ a, onDone }: { a: Assessment; onDone: () => void }) {
  const applied = (a.score_breakdown?.inherent_adjustments ?? []).filter((adj) => adj.status === "applied");
  const [decision, setDecision] = useState("approve");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsSignoff = a.computed_tier === "high" || a.computed_tier === "critical";
  const [dialog, ask] = useConfirm();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (decision === "reject" && !(await ask({ title: "Reject this vendor?", body: "The vendor will be recorded as rejected in the audit ledger and shouldn't be engaged. This can't be undone without a new assessment.", confirm: "Reject vendor", danger: true }))) return;
    if (decision === "accept_risk" && !(await ask({ title: "Accept the open risk?", body: `The open findings are accepted on behalf of ${form.get("accepted_by") || "the business owner"} for ${form.get("acceptance_days")} days, then the acceptance expires and the vendor needs re-review.`, confirm: "Accept risk" }))) return;
    const body: Record<string, unknown> = { decision, rationale: form.get("rationale") };
    const override = form.get("override_tier") as string;
    if (override) body.override_tier = override;
    if (decision === "accept_risk") {
      body.accepted_by = form.get("accepted_by");
      body.acceptance_days = Number(form.get("acceptance_days"));
    }
    body.rejected_adjustments = form.getAll("rejected_adjustments");
    setBusy(true);
    setError(null);
    try {
      await api.review(a.id, body);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="card accent" data-testid="review-panel">
      {dialog}
      <div className="card-head">
        <div>
          <div className="row" style={{ marginBottom: 4 }}>
            <span className="pill tone-accent">
              <span className="dot" />
              Human gate 1 of {needsSignoff ? 2 : 1}
            </span>
          </div>
          <h2 className="card-title">
            <Icon name="scale" size={16} />
            Analyst review — your decision is required
          </h2>
          <div className="card-sub">The agents have finished. Review the score and findings below, then record a decision with a rationale.</div>
        </div>
      </div>
      <form className="card-body form" onSubmit={submit}>
        <fieldset className="decisions" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Decision</legend>
          {DECISIONS.map(([value, label, desc, icon]) => (
            <label key={value} className="decision">
              <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} />
              <span className="decision-icon">
                <Icon name={icon} size={15} />
              </span>
              <span>
                <div className="decision-title">{label}</div>
                <div className="decision-desc">{desc}</div>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span className="field-label">
            Rationale<span className="req">*</span>
          </span>
          <textarea name="rationale" rows={3} required minLength={10} placeholder="Why this decision? This is recorded verbatim in the audit ledger." />
        </label>
        {decision === "accept_risk" && (
          <div className="grid cols-2" style={{ gap: 16 }}>
            <label className="field">
              <span className="field-label">
                Accepted by (business owner)<span className="req">*</span>
              </span>
              <input name="accepted_by" required />
            </label>
            <label className="field">
              <span className="field-label">
                Acceptance period (days)<span className="req">*</span>
              </span>
              <input name="acceptance_days" type="number" min={1} max={365} defaultValue={90} required />
              <span className="field-hint">Owners are notified 14 days before expiry; on expiry the findings reopen.</span>
            </label>
          </div>
        )}
        <div className="grid cols-2" style={{ gap: 16 }}>
          <label className="field">
            <span className="field-label">Tier</span>
            <select name="override_tier" defaultValue="">
              <option value="">Keep computed tier ({a.computed_tier && tierLabel(a.computed_tier)})</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  Override to {tierLabel(t)}
                </option>
              ))}
            </select>
          </label>
          {applied.length > 0 && (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label" style={{ marginBottom: 6 }}>
                Agent intake corrections
              </legend>
              {applied.map((adj) => (
                <label key={adj.attribute} className="check-row small">
                  <input type="checkbox" name="rejected_adjustments" value={adj.attribute} />
                  <span>
                    Reject {ADJUSTMENT_LABEL[adj.attribute]}: {adjustmentValue(adj.declared)} → {adjustmentValue(adj.inferred)}
                  </span>
                </label>
              ))}
              <span className="field-hint">Rejecting one re-scores on the declared value.</span>
            </fieldset>
          )}
        </div>
        <ErrorBanner error={error} />
        <div className="row-between" style={{ borderTop: "1px solid var(--border)", paddingTop: 16, flexWrap: "wrap" }}>
          <span className="small muted row">
            <Icon name="users" size={14} />
            {needsSignoff ? "High and Critical tiers go to an independent approver after this review." : "This tier needs no further sign-off."}
          </span>
          <button className="btn-primary btn-lg" type="submit" disabled={busy}>
            {busy ? <span className="spinner" style={{ borderTopColor: "#fff" }} /> : <Icon name="check" size={16} />}
            {busy ? "Submitting…" : `Submit decision as ${displayName(getUser())}`}
          </button>
        </div>
      </form>
    </section>
  );
}

function SignoffPanel({ a, onDone }: { a: Assessment; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isReviewer = a.reviewed_by === getUser();
  const [dialog, ask] = useConfirm();

  async function submit(decision: "approve" | "reject", rationale: string) {
    if (decision === "reject" && !(await ask({ title: "Reject at sign-off?", body: "The analyst's recommendation is overruled and the vendor is recorded as rejected in the audit ledger.", confirm: "Reject", danger: true }))) return;
    setBusy(true);
    setError(null);
    try {
      await api.signoff(a.id, { decision, rationale });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="card accent" data-testid="signoff-panel">
      {dialog}
      <div className="card-head">
        <div>
          <div className="row" style={{ marginBottom: 4 }}>
            <span className="pill tone-accent">
              <span className="dot" />
              Human gate 2 of 2
            </span>
          </div>
          <h2 className="card-title">
            <Icon name="users" size={16} />
            Independent sign-off required
          </h2>
          <div className="card-sub">Segregation of duties: a different person from the reviewing analyst must approve High and Critical vendors.</div>
        </div>
      </div>
      <div className="card-body stack-sm">
        <div className="callout">
          <Avatar name={displayName(a.reviewed_by ?? "")} round />
          <div className="grow">
            <div className="row-wrap">
              <span className="strong">{displayName(a.reviewed_by ?? "")}</span>
              <span className="muted">recommended</span>
              <span className="strong">{humanize(a.review_decision ?? "")}</span>
              <span className="muted">at</span>
              <TierBadge tier={a.final_tier} />
              {a.reviewed_at && <span className="xsmall subtle">{timeAgo(a.reviewed_at)}</span>}
            </div>
            <p style={{ marginTop: 6, fontStyle: "italic" }}>“{a.review_rationale}”</p>
          </div>
        </div>
        {isReviewer ? (
          <Callout tone="warning" title="You reviewed this assessment" icon="lock">
            A different approver must sign off. Switch to another user under “Acting as” in the sidebar to continue.
          </Callout>
        ) : (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
              submit(submitter.value as "approve" | "reject", new FormData(e.currentTarget).get("rationale") as string);
            }}
          >
            <label className="field">
              <span className="field-label">
                Rationale<span className="req">*</span>
              </span>
              <textarea name="rationale" rows={2} required minLength={10} placeholder="Recorded verbatim in the audit ledger." />
            </label>
            <ErrorBanner error={error} />
            <div className="form-actions">
              <button className="btn-danger" type="submit" value="reject" disabled={busy}>
                <Icon name="ban" size={15} />
                Reject
              </button>
              <button className="btn-primary btn-lg" type="submit" value="approve" disabled={busy}>
                <Icon name="check" size={16} />
                Sign off as {displayName(getUser())}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function DecisionRecord({ a }: { a: Assessment }) {
  if (!a.review_decision) return null;
  const items: [string, string, string, string, string | null][] = [
    [a.reviewed_by ?? "", "reviewed", a.review_decision, a.review_rationale ?? "", a.reviewed_at],
  ];
  if (a.signoff_decision) items.push([a.signed_off_by ?? "", "signed off", a.signoff_decision, a.signoff_rationale ?? "", a.signed_off_at]);
  return (
    <Card title="Decision record" icon="scale" subtitle="Named, timestamped human decisions">
      <ul className="timeline">
        {items.map(([who, verb, decision, why, at]) => (
          <li key={verb} className="tl-item">
            <Avatar name={displayName(who)} size="sm" round />
            <div className="tl-body">
              <div className="tl-text">
                <span className="actor">{displayName(who)}</span> {verb}: <strong>{humanize(decision)}</strong>
              </div>
              <div className="small muted" style={{ fontStyle: "italic", marginTop: 2 }}>
                “{why}”
              </div>
              {at && <div className="tl-meta">{formatDate(at)}</div>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RiskAcceptances({ vendor }: { vendor: Vendor }) {
  if (vendor.risk_acceptances.length === 0) return null;
  return (
    <Card title="Risk acceptances" icon="clock" subtitle="Time-bound; findings reopen on expiry" flush>
      <ul className="list">
        {vendor.risk_acceptances.map((ra) => (
          <li key={ra.id} className="list-item" style={{ alignItems: "flex-start" }}>
            <Avatar name={displayName(ra.accepted_by)} size="sm" round />
            <div className="grow stack-xs">
              <div className="row-between">
                <span className="strong">{displayName(ra.accepted_by)}</span>
                <StatusPill status={ra.status} />
              </div>
              <div className="small muted">{ra.justification}</div>
              <div className="xsmall muted row">
                <Icon name="calendar" size={12} />
                Expires {formatDay(ra.expires_at)} · {ra.days_remaining > 0 ? `${ra.days_remaining} days left` : "expired"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- Findings ---------- */

function VerifiedTag({ f }: { f: Finding }) {
  if (f.quote_verified === null) return null;
  return f.quote_verified ? (
    <span className="chip chip-good" title="The agent's quote was matched to the document text">
      <Icon name="check" size={11} strokeWidth={2.4} />
      Quote verified{locationLabel(f.page, f.locator) && ` · ${locationLabel(f.page, f.locator)}`}
    </span>
  ) : (
    <span className="chip chip-warn" title="The quote couldn't be matched to the document; confidence was lowered to low">
      <Icon name="alert" size={11} />
      Quote unverified
    </span>
  );
}

function FindingDetail({ f, evidence, onControl }: { f: Finding; evidence: Evidence | undefined; onControl: (id: string) => void }) {
  const [viewing, setViewing] = useState(false);
  return (
    <article className="card finding-detail" aria-labelledby={`finding-${f.id}-title`} data-testid="finding-detail">
      <header className="card-head">
        <div className="grow">
          <h2 className="card-title" id={`finding-${f.id}-title`}>
            <TierShape tier={f.severity} size={11} />
            {f.title}
          </h2>
          <div className="finding-meta">
            <span className="row" style={{ gap: 4 }}>
              <Icon name={AGENT_META[f.agent]?.icon ?? "sparkles"} size={12} />
              {AGENT_META[f.agent]?.short ?? f.agent}
            </span>
            <span aria-hidden>·</span>
            <span>{humanize(f.domain)}</span>
            <span aria-hidden>·</span>
            <span>{humanize(f.confidence)} confidence</span>
          </div>
        </div>
        <div className="card-head-actions">
          <StatusPill status={f.status} />
          <TierBadge tier={f.severity} />
        </div>
      </header>
      <div className="card-body stack-sm">
        <div>
          <div className="finding-block-label">
            <Icon name="sparkles" size={12} />
            Agent rationale
          </div>
          <p className="prose" style={{ color: "var(--ink-2)" }}>{f.rationale}</p>
        </div>
        <div>
          <div className="finding-block-label">
            <Icon name="file" size={12} />
            Evidence
            <VerifiedTag f={f} />
          </div>
          {f.evidence_quote ? (
            <blockquote className={`quote ${f.quote_verified === false ? "quote-warn" : ""}`}>
              “{f.evidence_quote}”
              <div className="quote-source" style={{ flexWrap: "wrap" }}>
                <Icon name={f.quote_verified === false ? "alert" : f.quote_verified ? "check" : "link"} size={12} />
                <span>
                  {evidence?.title || evidence?.filename || f.evidence_source}
                  {f.quote_verified && locationLabel(f.page, f.locator) && ` · ${locationLabel(f.page, f.locator)}`}
                  {f.section_path && ` · ${f.section_path}`}
                </span>
                {f.quote_verified && evidence && (
                  <button className="btn-sm" style={{ marginLeft: "auto" }} onClick={() => setViewing(true)} data-testid="show-in-document-button">
                    <Icon name="eye" size={13} />
                    Show in document
                  </button>
                )}
              </div>
            </blockquote>
          ) : (
            <div className="small muted row">
              <Icon name="link" size={12} />
              {f.evidence_source}
            </div>
          )}
          {f.quote_verified === false && (
            <div className="field-error" style={{ marginTop: 8 }}>
              <Icon name="alert" size={14} />
              Unverified: quote not found in the document, so confidence was lowered to low. Check the source before relying on it.
            </div>
          )}
        </div>
        <div>
          <div className="finding-block-label">
            <Icon name="check" size={12} />
            Recommendation
          </div>
          <div className="recommendation">{f.recommendation}</div>
        </div>
        {!!f.control_ids?.length && (
          <div>
            <div className="finding-block-label">
              <Icon name="checklist" size={12} />
              Linked controls
            </div>
            <div className="row-wrap" style={{ gap: 4 }}>
              {f.control_ids.map((id) => (
                <button key={id} className="chip chip-link mono" onClick={() => onControl(id)} data-testid={`control-chip-${id}`}>
                  {id}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {viewing && evidence && (
        <DocumentViewer
          target={{ evidence, page: f.page, locator: f.locator, segmentId: f.segment_id, quote: f.evidence_quote }}
          onClose={() => setViewing(false)}
        />
      )}
    </article>
  );
}

function Findings({ a, evidence, onControl, initial }: { a: Assessment; evidence: Evidence[]; onControl: (id: string) => void; initial?: number | null }) {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const [severity, setSeverity] = useState<Tier | "all">("all");
  const [agent, setAgent] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number | null>(initial ?? null);
  const detailRef = useRef<HTMLDivElement>(null);
  const sorted = [...a.findings].sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
  const needle = q.trim().toLowerCase();
  const shown = sorted.filter(
    (f) => (severity === "all" || f.severity === severity) && (agent === "all" || f.agent === agent) && (!needle || f.title.toLowerCase().includes(needle) || (f.control_ids ?? []).some((c) => c.toLowerCase().includes(needle))),
  );
  const count = (t: Tier) => a.findings.filter((f) => f.severity === t).length;
  const agents = [...new Set(a.findings.map((f) => f.agent))];
  const current = shown.find((f) => f.id === selected) ?? shown[0];

  if (a.findings.length === 0)
    return (
      <Card>
        <Empty icon="shieldCheck" title="No findings raised">
          The agents found nothing to flag in the evidence and signals they reviewed.
        </Empty>
      </Card>
    );

  return (
    <div className="md-grid" data-testid="findings-workspace">
      <section className="card md-list" aria-label="Findings list">
        <header className="card-head">
          <div>
            <h2 className="card-title">Findings ({a.findings.length})</h2>
            <div className="card-sub">Most severe first, from all agents</div>
          </div>
        </header>
        <div className="card-body stack-sm" style={{ paddingBottom: 12 }}>
          <div className="sev-summary" role="group" aria-label="Filter by severity">
            <button className={`sev-chip ${severity === "all" ? "active" : ""}`} onClick={() => setSeverity("all")} aria-pressed={severity === "all"} data-testid="severity-chip-all">
              All <span className="count">{a.findings.length}</span>
            </button>
            {TIERS.map((t) => (
              <button key={t} className={`sev-chip ${severity === t ? "active" : ""}`} onClick={() => setSeverity(severity === t ? "all" : t)} aria-pressed={severity === t} disabled={count(t) === 0} data-testid={`severity-chip-${t}`}>
                <TierShape tier={t} />
                {tierLabel(t)} <span className="count">{count(t)}</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <div className="search grow" style={{ width: "auto" }}>
              <Icon name="search" size={15} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings or controls" aria-label="Search findings" data-testid="findings-search" />
            </div>
            <select value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Filter by agent" data-testid="findings-agent-select">
              <option value="all">All agents</option>
              {agents.map((n) => (
                <option key={n} value={n}>
                  {AGENT_LABEL[n] ?? n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ul className="list md-items">
          {shown.map((f) => (
            <li key={f.id}>
              <button
                className={`md-item ${current?.id === f.id ? "selected" : ""}`}
                aria-current={current?.id === f.id ? "true" : undefined}
                onClick={() => {
                  setSelected(f.id);
                  if (window.innerWidth < 1100) setTimeout(() => detailRef.current?.scrollIntoView({ block: "start" }), 0);
                }}
                data-testid={`finding-item-${f.id}`}
              >
                <TierShape tier={f.severity} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="md-title">{f.title}</span>
                  <span className="md-meta">
                    {AGENT_META[f.agent]?.short ?? f.agent}
                    {f.control_ids?.[0] && ` · ${f.control_ids[0]}`}
                    {f.quote_verified === false && " · unverified"}
                  </span>
                </span>
                <TierBadge tier={f.severity} />
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li>
              <Empty icon="search" title="No findings match these filters" />
            </li>
          )}
        </ul>
      </section>
      <div ref={detailRef} style={{ scrollMarginTop: 80 }}>
        {current ? <FindingDetail key={current.id} f={current} evidence={current.evidence_id != null ? byId.get(current.evidence_id) : undefined} onControl={onControl} /> : null}
      </div>
    </div>
  );
}

function TopFindings({ a, onOpen }: { a: Assessment; onOpen: (id?: number) => void }) {
  const top = [...a.findings].sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]).slice(0, 5);
  if (top.length === 0) return null;
  return (
    <Card
      title="Top findings"
      icon="alert"
      subtitle={`${a.findings.length} total, most severe first`}
      flush
      actions={
        <button className="btn-sm btn-ghost" onClick={() => onOpen()} data-testid="view-all-findings">
          View all
          <Icon name="chevronRight" size={14} />
        </button>
      }
    >
      <ul className="list">
        {top.map((f) => (
          <li key={f.id}>
            <button className="list-item finding-head" onClick={() => onOpen(f.id)} style={{ padding: "12px 24px" }} data-testid={`top-finding-${f.id}`}>
              <TierShape tier={f.severity} />
              <div className="grow">
                <div className="strong">{f.title}</div>
                <div className="xsmall muted row-wrap" style={{ gap: 6, marginTop: 2 }}>
                  <span>
                    {AGENT_META[f.agent]?.short} · {f.control_ids?.[0] ?? humanize(f.domain)}
                  </span>
                  <VerifiedTag f={f} />
                </div>
              </div>
              <TierBadge tier={f.severity} />
              <Icon name="chevronRight" size={15} className="chev" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- Evidence ---------- */

const SOURCE_META: Record<Evidence["source"], [string, string]> = {
  analyst: ["Uploaded by analyst", "upload"],
  vendor_portal: ["From vendor portal", "send"],
  trust_center: ["From trust centre", "globe"],
};

const KIND_LABEL: Record<string, string> = {
  soc2_type2: "SOC 2 Type II",
  soc2_type1: "SOC 2 Type I",
  soc1: "SOC 1",
  iso27001_certificate: "ISO 27001 certificate",
  pentest: "Pen test report",
  dpa: "DPA",
  privacy_policy: "Privacy policy",
};

// The rule-based profile only judges report-type documents; on a policy page its guess is noise.
const PROFILED_TYPES = new Set(["soc2", "iso27001", "pentest", "other"]);

function ProcessingPill({ e }: { e: Evidence }) {
  if (e.processing_status === "ready")
    return (
      <span className="pill tone-good" title={`${e.segment_count} located passages`}>
        <Icon name="check" size={11} strokeWidth={2.4} />
        Read · {e.segment_count} passages
      </span>
    );
  if (e.processing_status === "failed")
    return (
      <span className="pill tone-danger">
        <Icon name="x" size={11} />
        Couldn't read
      </span>
    );
  return (
    <span className="pill tone-info">
      <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
      {e.processing_status === "processing" ? "Reading…" : "Queued"}
    </span>
  );
}

function EvidenceItem({ e, onReprocess }: { e: Evidence; onReprocess: () => void }) {
  const [viewing, setViewing] = useState(false);
  const p = PROFILED_TYPES.has(e.doc_type) ? e.profile : null;
  const ext = e.filename.split(".").pop()?.toLowerCase() ?? "";
  const [sourceLabel, sourceIcon] = SOURCE_META[e.source] ?? ["Uploaded", "upload"];
  const canOpen = e.processing_status === "ready" && e.media_type === "application/pdf";
  return (
    <li className="list-item" style={{ alignItems: "flex-start" }}>
      <span className="file-icon">
        <Icon name="file" size={17} />
        <span className={`ext ${ext === "pdf" ? "" : "txt"}`}>{ext.toUpperCase().slice(0, 4)}</span>
      </span>
      <div className="grow stack-xs" style={{ minWidth: 0 }}>
        <div className="row-wrap" style={{ gap: 8 }}>
          <span className="strong truncate">{e.title || e.filename}</span>
          <span className="chip">{humanize(e.doc_type)}</span>
          <ProcessingPill e={e} />
        </div>
        <div className="xsmall muted row-wrap" style={{ gap: 6 }}>
          <span className="row" style={{ gap: 4 }}>
            <Icon name={sourceIcon} size={11} />
            {sourceLabel}
            {e.source_url && (
              <a href={e.source_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 2 }}>
                source <Icon name="external" size={10} />
              </a>
            )}
          </span>
          <span>· {formatBytes(e.size_bytes)}</span>
          {e.page_count != null && <span>· {e.page_count} pages</span>}
          {!!e.ocr_pages?.length && (
            <span>
              · {e.ocr_pages.length} scanned page{e.ocr_pages.length > 1 ? "s" : ""} read by OCR
            </span>
          )}
          <span>
            · {displayName(e.uploaded_by)} {timeAgo(e.uploaded_at)}
          </span>
        </div>
        {p && (p.kind || p.audit_period) && (
          <div className="row-wrap small" style={{ gap: 6, marginTop: 2 }}>
            {p.kind && <span className="chip chip-accent">{KIND_LABEL[p.kind] ?? humanize(p.kind)}</span>}
            {p.audit_period && (
              <span className="chip">
                <Icon name="calendar" size={11} />
                {p.audit_period.start} → {p.audit_period.end}
              </span>
            )}
            {p.period_end_age_days != null && p.period_end_age_days > 365 && (
              <span className="chip chip-warn">
                <Icon name="clock" size={11} />
                Period ended over 12 months ago
              </span>
            )}
            {(p.tests_with_exceptions > 0 || p.tests_without_exceptions > 0) && (
              <span className={`chip ${p.tests_with_exceptions ? "chip-bad" : "chip-good"}`}>
                <Icon name={p.tests_with_exceptions ? "alert" : "check"} size={11} />
                {p.tests_with_exceptions} test{p.tests_with_exceptions === 1 ? "" : "s"} with exceptions
                {p.exception_pages.length > 0 && ` (p. ${p.exception_pages.join(", ")})`}
              </span>
            )}
          </div>
        )}
        {e.processing_status === "failed" && (
          <div className="xsmall" style={{ color: "var(--critical-ink)" }}>
            {e.processing_error}{" "}
            <button className="link-button xsmall" onClick={onReprocess}>
              Try again
            </button>
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 6, flex: "none" }}>
        <span className="hash" title={`sha256 ${e.sha256}`}>
          {e.sha256.slice(0, 10)}…
        </span>
        {canOpen && (
          <button className="btn-sm" onClick={() => setViewing(true)}>
            <Icon name="eye" size={13} />
            Open
          </button>
        )}
      </div>
      {viewing && <DocumentViewer target={{ evidence: e, page: 1, locator: null, segmentId: null }} onClose={() => setViewing(false)} />}
    </li>
  );
}

function EvidencePanel({ vendor, onChange }: { vendor: Vendor; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const file = form.get("file") as File;
    if (!file?.name) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadEvidence(vendor.id, file, form.get("doc_type") as string);
      formEl.reset();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reprocess(id: number) {
    setError(null);
    try {
      await api.reprocessEvidence(id);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="stack">
      <Card title="Upload evidence" icon="upload" subtitle="Stored by content hash, then read into located passages so every citation can be checked">
        <form className="dropzone" onSubmit={upload}>
          <span className="dropzone-icon">
            <Icon name="upload" size={18} />
          </span>
          <div className="grow" style={{ minWidth: 220 }}>
            <input type="file" name="file" accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json" required aria-label="Evidence file" style={{ border: 0, background: "none", padding: 0 }} />
            <div className="xsmall muted" style={{ marginTop: 4 }}>
              PDF, Word, Excel or text, up to 50 MB · scanned pages are read by OCR
            </div>
          </div>
          <select name="doc_type" defaultValue="soc2" aria-label="Document type">
            {DOC_TYPES.map((d) => (
              <option key={d} value={d}>
                {humanize(d)}
              </option>
            ))}
          </select>
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? <span className="spinner" style={{ borderTopColor: "#fff" }} /> : <Icon name="upload" size={15} />}
            {busy ? "Uploading…" : "Upload"}
          </button>
        </form>
        <div style={{ marginTop: 12 }}>
          <ErrorBanner error={error} />
        </div>
      </Card>

      <Card title={`Documents on file (${vendor.evidence.length})`} icon="file" flush>
        {vendor.evidence.length === 0 ? (
          <Empty icon="file" title="No documents yet">
            Agents still run on outside-in signals, but domains without evidence are scored as insufficient evidence and earn no risk reduction.
          </Empty>
        ) : (
          <ul className="list">
            {vendor.evidence.map((e) => (
              <EvidenceItem key={e.id} e={e} onReprocess={() => reprocess(e.id)} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------- Audit ---------- */

function AuditTrail({ vendorId, assessmentId, refreshKey }: { vendorId: number; assessmentId: number | null; refreshKey: string }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [chain, setChain] = useState<{ valid: boolean; events_checked: number } | null>(null);
  useEffect(() => {
    Promise.all([api.audit("vendor", vendorId), assessmentId ? api.audit("assessment", assessmentId) : Promise.resolve([])]).then(([v, a]) =>
      setEvents([...v, ...a].sort((x, y) => y.id - x.id)),
    );
    api.verifyAudit().then(setChain);
  }, [vendorId, assessmentId, refreshKey]);
  return (
    <Card
      title="Audit trail"
      icon="hash"
      subtitle="Tamper-evident: each event's hash covers the previous one, so any edit breaks verification"
      actions={
        chain && (
          <span className={`pill ${chain.valid ? "tone-good" : "tone-danger"}`}>
            <Icon name={chain.valid ? "shieldCheck" : "alert"} size={12} />
            {chain.valid ? "Chain verified" : "Chain broken"}
          </span>
        )
      }
    >
      {!events ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : events.length === 0 ? (
        <Empty icon="hash" title="No events yet" />
      ) : (
        <ul className="timeline">
          {events.map((e) => (
            <ActivityItem key={e.id} e={e} showEntity={false} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Page ---------- */

/* ---------- Primary action (one per state) ---------- */

type Primary = {
  label: string;
  icon: string;
  style: "ai" | "primary" | "secondary";
  run?: () => void;
  disabled?: boolean;
  reason?: string;
  waitingOn: string;
};

function tabKeyHandler(tabs: TabId[], tab: TabId, setTab: (t: TabId) => void) {
  return (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = tabs.indexOf(tab);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    setTab(tabs[next]);
    setTimeout(() => document.getElementById(`tab-${tabs[next!]}`)?.focus(), 0);
  };
}

function PrimaryButton({ p, starting, testId }: { p: Primary; starting: boolean; testId: string }) {
  const cls = p.style === "ai" ? "btn-ai" : p.style === "primary" ? "btn-primary" : "";
  return (
    <button className={`${cls} btn-lg`} onClick={p.run} aria-disabled={p.disabled || undefined} disabled={starting} data-testid={testId}
      onClickCapture={(e) => p.disabled && e.preventDefault()} style={p.disabled ? { opacity: 0.6, cursor: "not-allowed" } : undefined}>
      {starting ? <span className="spinner" style={{ borderTopColor: "#fff" }} /> : <Icon name={p.icon} size={16} />}
      {starting ? "Starting…" : p.label}
    </button>
  );
}

function NextStep({ p, secondary, starting }: { p: Primary | null; secondary: ReactNode; starting: boolean }) {
  return (
    <Card title="Next step" icon="target" className="next-step">
      <div className="who" data-testid="next-step-waiting-on">
        <span className="avatar round" style={{ ["--h" as string]: 215 }}>
          <Icon name="user" size={15} />
        </span>
        <div>
          <div className="xsmall muted">Waiting on</div>
          <div className="strong">{p?.waitingOn ?? "Nothing — no action needed"}</div>
        </div>
      </div>
      <div className="actions">
        {p && p.run && <PrimaryButton p={p} starting={starting} testId="next-step-primary" />}
        {p?.reason && <div className="small muted">{p.reason}</div>}
        {secondary}
      </div>
    </Card>
  );
}

function EvidenceProgress({ evidence, onOpen }: { evidence: EvidenceStatus; onOpen: () => void }) {
  const c = evidence.counts;
  const pct = c.required ? Math.round(((c.received + c.waived) / c.required) * 100) : 100;
  return (
    <Card
      title="Evidence progress"
      icon="file"
      actions={
        <button className="btn-sm btn-ghost" onClick={onOpen} data-testid="rail-open-evidence">
          Open
          <Icon name="chevronRight" size={14} />
        </button>
      }
    >
      <div className="stack-sm">
        <div className="row-between">
          <span className={`pill ${evidence.ready ? "tone-good" : "tone-warning"}`}>
            <span className="dot" />
            {evidence.ready ? "Ready to assess" : "Gathering evidence"}
          </span>
          <span className="small muted">{pct}% of required</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Required evidence on file">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="tiles" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div className="tile tile-good"><span className="n">{c.received}</span><span className="l">On file</span></div>
          <div className="tile tile-warn"><span className="n">{c.remaining}</span><span className="l">Still owed</span></div>
          <div className="tile tile-info"><span className="n">{c.waived}</span><span className="l">Explained</span></div>
          <div className="tile"><span className="n">{c.processing}</span><span className="l">Being read</span></div>
        </div>
      </div>
    </Card>
  );
}

export function VendorDetail({ id }: { id: number }) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [docsVersion, setDocsVersion] = useState(0);
  const [focusControl, setFocusControl] = useState<string | null>(null);
  const [focusFinding, setFocusFinding] = useState<number | null>(null);
  const [monitoring, setMonitoring] = useState<VendorMonitoring | null>(null);
  const [evidence, setEvidence] = useState<EvidenceStatus | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const [, tick] = useState(0);
  const clearFocus = useCallback(() => setFocusControl(null), []);

  const load = useCallback(() => {
    api.vendor(id).then((v) => {
      setVendor(v);
      setUpdatedAt(Date.now());
    }).catch((e: Error) => setError(e.message));
    api.vendorMonitoring(id).then(setMonitoring).catch(() => setMonitoring(null));
    api.evidenceStatus(id).then(setEvidence).catch(() => setEvidence(null));
  }, [id]);
  const onDocumentsChange = useCallback(() => {
    load();
    setDocsVersion((v) => v + 1);
  }, [load]);

  useEffect(load, [load]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  useCrumb(vendor?.name);

  const a = vendor?.latest_assessment ?? null;
  const readingDocs = vendor?.evidence.some((e) => e.processing_status === "pending" || e.processing_status === "processing");
  const gathering = evidence !== null && !evidence.ready;
  const polling = !!(readingDocs || (a && IN_FLIGHT.has(a.status)) || evidence?.steps.some((s) => s.state === "active") || evidence?.trust_portal.status === "awaiting_captcha");
  useEffect(() => {
    // Quickly while something is running; slowly while we wait on the vendor or the trust portal's timer.
    if (!polling && !gathering) return;
    const timer = setInterval(load, polling ? 3000 : 15000);
    return () => clearInterval(timer);
  }, [polling, gathering, load]);

  const showControl = useCallback((controlId: string) => {
    setFocusControl(controlId);
    setTab("controls");
  }, []);

  async function start(overrideReason?: string) {
    setStarting(true);
    setError(null);
    try {
      await api.startAssessment(id, overrideReason);
      setTab("overview");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  const goGate = () => {
    setTab("overview");
    setTimeout(() => {
      const el = document.getElementById("human-gate");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      el?.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
    }, 50);
  };

  if (!vendor) return error ? <ErrorBanner error={error} /> : <LoadingPage />;

  const user = getUser();
  const canStart = !a || FINAL.has(a.status);
  const waitingOnEvidence = !!evidence && !evidence.ready;
  const scored = !!(a && a.score_breakdown);
  const elevated = a?.findings.filter((f) => f.severity === "critical" || f.severity === "high").length ?? 0;
  const awaitingYou = a?.status === "awaiting_review" || a?.status === "awaiting_signoff";
  const openAlerts = monitoring?.events.filter((e) => e.status === "new") ?? [];
  const notMet = a ? Object.values(a.control_summary ?? {}).reduce((n, c) => n + (c.not_met ?? 0), 0) : 0;
  const hasControls = !!a && Object.keys(a.control_summary ?? {}).length > 0;
  const isApprover = user === "sam.approver";

  const rerun: Primary = { label: "Re-run assessment", icon: "refresh", style: "secondary", run: () => start(), disabled: waitingOnEvidence, reason: waitingOnEvidence ? `Waiting for the evidence: ${evidence!.blockers.join(" ")}` : undefined, waitingOn: "Analyst (optional re-run)" };
  let primary: Primary | null;
  if (!a) {
    primary = waitingOnEvidence
      ? { label: "Gathering evidence…", icon: "clock", style: "ai", run: () => {}, disabled: true, reason: `Waiting for: ${evidence!.blockers.join(" ") || "evidence collection"}`, waitingOn: "Evidence collection / the vendor" }
      : { label: "Run AI assessment", icon: "sparkles", style: "ai", run: () => start(), waitingOn: "Analyst — start the AI assessment" };
  } else if (IN_FLIGHT.has(a.status)) {
    primary = { label: "Assessment running", icon: "sparkles", style: "ai", waitingOn: "AI agents (Security, Privacy, AI-Vendor)" };
  } else if (a.status === "awaiting_review") {
    primary = isApprover
      ? { label: "Awaiting analyst review", icon: "clock", style: "primary", run: goGate, disabled: true, reason: "Read-only for approvers until an analyst reviews it.", waitingOn: "Analyst review" }
      : { label: "Continue analyst review", icon: "checklist", style: "primary", run: goGate, waitingOn: "Analyst review" };
  } else if (a.status === "awaiting_signoff") {
    primary =
      a.reviewed_by === user
        ? { label: "Review and sign off", icon: "users", style: "primary", run: () => {}, disabled: true, reason: "A different person must sign off (segregation of duties).", waitingOn: "Independent approver" }
        : isApprover
          ? { label: "Review and sign off", icon: "users", style: "primary", run: goGate, waitingOn: "Approver sign-off" }
          : { label: "Awaiting sign-off", icon: "clock", style: "primary", run: goGate, disabled: true, reason: "Sam (risk approver) signs off High and Critical vendors.", waitingOn: "Approver sign-off" };
  } else if (a.status === "awaiting_evidence") {
    primary = { label: "Open questionnaire", icon: "mail", style: "primary", run: () => setTab("questionnaire"), waitingOn: "The vendor's answers" };
  } else if (vendor.status === "re_review_required" && monitoring?.enabled) {
    primary = { label: "Review alerts", icon: "radar", style: "primary", run: () => setTab("monitoring"), waitingOn: "Analyst — triage monitoring alerts" };
  } else if (a.status === "failed") {
    primary = { ...rerun, style: "primary", waitingOn: "Analyst — fix the cause and re-run" };
  } else {
    primary = { ...rerun, waitingOn: "Nobody — decision recorded" };
  }
  const showRerunSecondary = canStart && primary.label !== "Re-run assessment" && !!a;

  const tabs: [TabId, string, ReactNode?][] = [
    ["overview", "Overview", awaitingYou ? <span className="tab-count alert">Action</span> : undefined],
    ["findings", "Findings", a ? <span className={`tab-count ${elevated ? "alert" : ""}`}>{a.findings.length}</span> : undefined],
    ...(hasControls ? [["controls", "Controls", notMet ? <span className="tab-count alert">{notMet} not met</span> : undefined] as [TabId, string, ReactNode?]] : []),
    ["evidence", "Evidence", <span className="tab-count">{vendor.evidence.length}</span>],
    ["questionnaire", "Questionnaire"],
    ...(monitoring?.enabled ? [["monitoring", "Monitoring", openAlerts.length ? <span className="tab-count alert">{openAlerts.length} new</span> : undefined] as [TabId, string, ReactNode?]] : []),
    ["audit", "Audit trail"],
  ];
  const onTabKey = tabKeyHandler(tabs.map(([t]) => t), tab, setTab);
  const secs = Math.round((Date.now() - updatedAt) / 1000);

  const secondary = (
    <>
      {showRerunSecondary && (
        <button className="btn" onClick={() => start()} disabled={starting || waitingOnEvidence} data-testid="rerun-secondary-button">
          <Icon name="refresh" size={15} />
          Re-run assessment
        </button>
      )}
      <button className="btn" onClick={() => setTab("evidence")} data-testid="open-evidence-secondary">
        <Icon name="file" size={15} />
        Evidence &amp; trust centre
      </button>
    </>
  );

  return (
    <div className="stack">
      <div className="vhead" data-testid="vendor-header">
        <div className="vhead-id">
          <Avatar name={vendor.name} size="lg" />
          <div className="grow">
            <div className="vhead-title">
              <h1>{vendor.name}</h1>
              <StatusPill status={vendor.status} />
              {vendor.uses_ai_declared && (
                <span className="chip chip-ai">
                  <Icon name="cpu" size={12} />
                  AI in scope
                </span>
              )}
              {vendor.impact_facing && <span className="chip">{humanize(vendor.impact_facing)}</span>}
            </div>
            <div className="vhead-meta">
              <span>
                <Icon name="globe" size={14} />
                {vendor.website ? (
                  <a href={vendor.website} target="_blank" rel="noreferrer">
                    {vendor.domain}
                  </a>
                ) : (
                  "No website on record"
                )}
              </span>
              <span>
                <Icon name="building" size={14} />
                {humanize(vendor.category)}
              </span>
              <span>
                <Icon name="user" size={14} />
                Owner: {displayName(vendor.business_owner)}
              </span>
              {vendor.contract_term && (
                <span title={`${formatCalendarDay(vendor.contract_start!)} to ${formatCalendarDay(vendor.contract_end!)}`}>
                  <Icon name="calendar" size={14} />
                  Contract: {vendor.contract_term}
                </span>
              )}
            </div>
            {vendor.description && (
              <details className="vhead-desc">
                <summary className="truncate" style={{ cursor: "pointer", listStyle: "none" }}>{vendor.description}</summary>
                <p className="prose">{vendor.description}</p>
              </details>
            )}
          </div>
        </div>
        <div className="vhead-side">
          <div className="stat-groups">
            <div className="stat-strip" role="group" aria-label="Risk">
              <div className="stat">
                <span className="stat-label">Inherent risk</span>
                <TierBadge tier={vendor.inherent_tier} />
              </div>
              <div className="stat">
                <span className="stat-label">Residual score</span>
                <span className="stat-value" data-testid="stat-residual-score">
                  {a?.residual_score != null ? Math.round(a.residual_score * 10) / 10 : "—"}
                  {a?.residual_score != null && <small>/ 100</small>}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Current tier</span>
                <TierBadge tier={vendor.current_tier} />
              </div>
            </div>
            <div className="stat-strip" role="group" aria-label="Counts">
              <div className="stat">
                <span className="stat-label">Evidence</span>
                <span className="stat-value">{vendor.evidence.length}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Findings</span>
                <span className="stat-value">{a?.findings.length ?? "—"}</span>
              </div>
            </div>
          </div>
          <div className="primary-slot sticky-mobile" data-testid="primary-action-slot">
            {primary.run ? (
              <PrimaryButton p={primary} starting={starting} testId="primary-action-button" />
            ) : (
              <span className="pill tone-info" role="status">
                <span className="spinner" style={{ width: 12, height: 12 }} />
                {primary.label}
              </span>
            )}
          </div>
          {primary.reason && <div className="primary-reason" data-testid="primary-action-reason">{primary.reason}</div>}
        </div>
      </div>

      <ErrorBanner error={error} />

      <div className="tabs" role="tablist" aria-label="Vendor sections" onKeyDown={onTabKey}>
        {tabs.map(([tid, label, extra]) => (
          <button
            key={tid}
            id={`tab-${tid}`}
            role="tab"
            aria-selected={tab === tid}
            aria-controls={`panel-${tid}`}
            tabIndex={tab === tid ? 0 : -1}
            className={`tab ${tab === tid ? "active" : ""}`}
            onClick={() => setTab(tid)}
            data-testid={`vendor-tab-${tid}`}
          >
            {label}
            {extra}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="fade-in" key={tab}>
        {tab === "overview" && (
          <div className="grid-8-4">
            <div className="stack">
              <Card title="Assessment progress" subtitle="One vendor, end to end" actions={(polling || gathering) && <span className="xsmall muted" aria-live="off">Updated {secs < 5 ? "just now" : `${secs}s ago`}</span>}>
                <Workflow vendor={vendor} a={a} />
              </Card>
              {vendor.status === "re_review_required" ? (
                <Callout tone="danger" icon="alert" title="Flagged for re-review">
                  <div className="row-between" style={{ flexWrap: "wrap" }}>
                    <span>Continuous monitoring raised a critical event or an analyst escalated one. Re-run the assessment once it's investigated.</span>
                    {monitoring?.enabled && (
                      <button className="btn-sm" onClick={() => setTab("monitoring")}>
                        View alerts
                        <Icon name="chevronRight" size={14} />
                      </button>
                    )}
                  </div>
                </Callout>
              ) : a?.status === "failed" ? (
                <Callout tone="danger" title="Assessment failed">
                  <div className="mono" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto", marginTop: 4 }}>
                    {a.error}
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>
                    The failure is recorded in the audit trail. Fix the cause and re-run.
                  </div>
                </Callout>
              ) : openAlerts.length > 0 ? (
                <Callout tone="warning" icon="radar" title={`${openAlerts.length} new monitoring alert${openAlerts.length === 1 ? "" : "s"}`}>
                  <div className="row-between" style={{ flexWrap: "wrap" }}>
                    <span className="truncate" style={{ maxWidth: 640 }}>
                      {openAlerts[0].title}
                    </span>
                    <button className="btn-sm" onClick={() => setTab("monitoring")}>
                      Triage
                      <Icon name="chevronRight" size={14} />
                    </button>
                  </div>
                </Callout>
              ) : a?.status === "awaiting_evidence" ? (
                <Callout tone="info" icon="mail" title="More evidence requested from the vendor">
                  <div className="row-between" style={{ flexWrap: "wrap" }}>
                    <span>A gap questionnaire targeting the open findings is being prepared. Review it and send it to the vendor.</span>
                    <button className="btn-sm btn-primary" onClick={() => setTab("questionnaire")}>
                      Open questionnaire
                      <Icon name="chevronRight" size={14} />
                    </button>
                  </div>
                </Callout>
              ) : null}
              {a && IN_FLIGHT.has(a.status) && !a.reviewed_by && <AgentsRunning />}
              <div id="human-gate" style={{ scrollMarginTop: 80 }}>
                {a?.status === "awaiting_review" && scored && <ReviewPanel a={a} onDone={load} />}
                {a?.status === "awaiting_signoff" && scored && <SignoffPanel a={a} onDone={load} />}
              </div>

              {canStart && evidence && (!a || !evidence.ready) && (
                <EvidenceStatusPanel vendorId={vendor.id} status={evidence} onChange={onDocumentsChange} onStartAnyway={(reason) => start(reason)} starting={starting} />
              )}

              {!a && (
                <Card>
                  <Empty icon="sparkles" title="No assessment yet">
                    The vendor's public trust centre and portal are read automatically, and what's behind an access request is requested for you.
                    The AI assessment starts when the evidence is in; every control is checked against it, and every citation is verified against the source.
                  </Empty>
                </Card>
              )}

              {scored && (
                <>
                  <ScoreSummary a={a!} />
                  {hasControls && <ControlSummary a={a!} onOpen={() => setTab("controls")} />}
                  <TopFindings
                    a={a!}
                    onOpen={(fid) => {
                      setFocusFinding(fid ?? null);
                      setTab("findings");
                    }}
                  />
                  <details className="card agent-disclosure" open>
                    <summary className="card-head" style={{ cursor: "pointer", paddingBottom: 16 }}>
                      <h2 className="card-title">
                        <Icon name="sparkles" size={16} />
                        Agent assessments
                      </h2>
                    </summary>
                    <div className="card-body stack">
                      <AgentPanels a={a!} />
                      <AgentDetails a={a!} />
                    </div>
                  </details>
                </>
              )}
            </div>

            <aside className="rail" aria-label="Vendor summary">
              <NextStep p={primary} secondary={secondary} starting={starting} />
              {evidence && <EvidenceProgress evidence={evidence} onOpen={() => setTab("evidence")} />}
              <Profile vendor={vendor} />
              {scored && <DecisionRecord a={a!} />}
              <RiskAcceptances vendor={vendor} />
            </aside>
          </div>
        )}

        {tab === "findings" &&
          (scored ? (
            <Findings a={a!} evidence={vendor.evidence} onControl={showControl} initial={focusFinding} />
          ) : (
            <Card>
              <Empty icon="alert" title="No findings yet">
                Findings appear once an AI assessment completes.
              </Empty>
            </Card>
          ))}

        {tab === "controls" && hasControls && <ControlCoverage a={a!} evidence={vendor.evidence} focus={focusControl} onFocused={clearFocus} />}

        {tab === "evidence" && (
          <div className="stack">
            {evidence && <EvidenceStatusPanel vendorId={vendor.id} status={evidence} onChange={onDocumentsChange} onStartAnyway={(reason) => start(reason)} starting={starting} />}
            <TrustCenterPanel vendorId={vendor.id} hasWebsite={!!vendor.domain} refreshKey={`${vendor.evidence.length}-${a?.status}`} onChange={onDocumentsChange} />
            <EvidencePanel vendor={vendor} onChange={onDocumentsChange} />
          </div>
        )}

        {tab === "questionnaire" && (
          <QuestionnairePanel
            vendorId={vendor.id}
            vendorContact={vendor.vendor_contact_email}
            refreshKey={`${vendor.status}-${a?.id}-${a?.status}-${docsVersion}`}
            hasAssessment={!!a?.score_breakdown}
          />
        )}

        {tab === "monitoring" && <MonitoringPanel vendorId={vendor.id} refreshKey={`${vendor.status}-${a?.status}`} onChange={load} />}

        {tab === "audit" && <AuditTrail vendorId={vendor.id} assessmentId={a?.id ?? null} refreshKey={`${vendor.status}-${a?.status}`} />}
      </div>
    </div>
  );
}
