import { useEffect, useState } from "react";
import { api, type RequiredDocument } from "../api";
import { AGENT_LABEL, AGENT_META, Card, ErrorBanner, Icon, Meter, PageHeader, TierShape, humanize, tierLabel } from "../ui";

const CONDITION_LABEL: Record<string, string> = {
  sensitive_data: "handles confidential or restricted data",
  restricted_data: "handles restricted data",
  ai: "uses AI",
  privileged_access: "has write or admin access",
  high_criticality: "high or critical business criticality",
};

/** The requirement matrix, as the server reads it: what we ask of a vendor and what brings each document in. */
function RequiredDocuments() {
  const [rows, setRows] = useState<RequiredDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.requiredDocuments().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Card
      title="What we ask each vendor for"
      icon="checklist"
      subtitle="Documents are requested by risk tier, then added for the kind of vendor, who it affects, and what it handles. Any one of the listed documents satisfies a line."
      flush
    >
      <ErrorBanner error={error} />
      {!rows && !error && <div className="skeleton" style={{ height: 160, margin: "0 20px 16px" }} />}
      {rows && (
        <div className="table-wrap">
          <table className="matrix">
            <caption className="sr-only">Required documents, what satisfies each and when it applies</caption>
            <colgroup>
              <col style={{ width: "32%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "26%" }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Any one of</th>
                <th scope="col">Tiers</th>
                <th scope="col">Applies to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ verticalAlign: "top" }}>
                  <th scope="row" className="row-head">
                    {r.title}
                    {r.why && <div className="xsmall muted" style={{ fontWeight: 400, marginTop: 2 }}>{r.why}</div>}
                  </th>
                  <td>
                    <div className="stack-xs" style={{ alignItems: "flex-start" }}>
                      {r.any_of.map((label, i) => (
                        <div key={label} className="stack-xs" style={{ alignItems: "flex-start", gap: 2 }}>
                          {i > 0 && <span className="xsmall muted">or</span>}
                          <span className="chip">{label}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="small">{r.tiers.map(humanize).join(", ")}</td>
                  <td className="small">
                    {!r.categories && !r.facing ? <span className="muted">Every vendor</span> : (
                      <>
                        {r.categories && <div>Category: {r.categories.map(humanize).join(", ")}</div>}
                        {r.facing && <div>{r.categories ? "or affects" : "Affects"}: {r.facing.map(humanize).join(", ")}</div>}
                      </>
                    )}
                    {r.requires.length > 0 && <div className="xsmall muted">and {r.requires.map((c) => CONDITION_LABEL[c] ?? c).join(", ")}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const PIPELINE: { title: string; text: string; icon: string; kind?: "agentic" | "human" }[] = [
  { title: "Intake", text: "Requestor describes the vendor. Duplicates are caught by name and domain; the inherent tier is scored instantly.", icon: "plus" },
  { title: "Trust-centre collection", text: "The vendor's public trust centre is found and read. Public reports are downloaded; gated ones are noted, never opened.", icon: "globe" },
  { title: "Documents first", text: "Required documents still owed for the tier become a document request. The vendor uploads them in a no-login portal.", icon: "file" },
  { title: "Evidence ingestion", text: "PDF, Word and Excel are read into located passages — page, section and position — with OCR for scanned pages.", icon: "scan" },
  { title: "Control assessment", text: "Three agents assess every checklist control and write findings. Every quote is matched back to the document.", icon: "sparkles", kind: "agentic" },
  { title: "Deterministic score", text: "Inherent risk × weighted control gap gives the residual score and tier. Same inputs, same answer.", icon: "target" },
  { title: "Human decisions", text: "An analyst decides; High and Critical vendors also need sign-off from a different, independent approver.", icon: "users", kind: "human" },
  { title: "Continuous monitoring", text: "Approved vendors are re-checked on their tier's cadence: news, exploited CVEs, trust-centre changes, SOC 2 expiry.", icon: "radar", kind: "agentic" },
];

const CONTROLS: [string, string, string][] = [
  ["link", "Exact, verified citations", "Every quote an agent relies on is matched back to the document — page, section and highlight. Unmatched quotes are flagged and their confidence drops."],
  ["checklist", "Control checklist coverage", "The Tekion TPRA questionnaire, SOC 2 TSC, ISO 27001 and an AI-risk framework, each control rated met, partially met, not met or not evidenced."],
  ["hash", "Tamper-evident audit ledger", "Every user, agent and system action — including every page the collector fetched or refused — is SHA-256 hash-chained."],
  ["users", "Segregation of duties", "High and Critical tiers need sign-off from someone other than the reviewing analyst. The system enforces it."],
  ["ban", "No credit without evidence", "Undisclosed controls are rated not evidenced and earn no risk reduction. A vendor with no documents keeps its full inherent score."],
  ["mail", "Documents first, questions second", "The vendor is only asked the checklist questions their documents left unanswered, in the questionnaire's own wording."],
  ["lock", "Safe collection", "Pages are fetched only from the vendor's domain or a known trust platform; private addresses are refused and robots.txt is honoured."],
  ["clock", "Time-bound risk acceptance", "Accepted risk has an owner and an expiry. On expiry the findings reopen and the vendor is flagged for re-review."],
  ["radar", "Continuous monitoring", "Critical events, or an analyst's escalation, flag the vendor for re-review. Every alert and every triage action is audited."],
  ["fingerprint", "Agents can correct intake", "If the evidence shows more sensitive data or undeclared AI use, scoring uses the higher value, and the analyst can reject the correction."],
];

const INHERENT: [string, number][] = [
  ["Data sensitivity", 40],
  ["Business criticality", 30],
  ["Access to our systems", 20],
  ["AI use", 10],
];

const ROADMAP: [string, string][] = [
  ["Monitoring follow-ups", "Mid-cycle tier escalation from monitoring events, scheduled reassessment by tier, ISO and pen-test expiry tracking."],
  ["Remediation tracking", "Finding owners, due dates and Jira sync; multi-step approval chains."],
  ["Connectors", "Okta for shadow-IT discovery, ZipHQ procurement intake, ServiceNow."],
  ["Reporting", "Scheduled digests, exportable evidence packs, bias monitoring over scoring outputs."],
];

export function Platform() {
  return (
    <div className="stack">
      <PageHeader
        eyebrow={
          <>
            <Icon name="layers" size={13} />
            Governance
          </>
        }
        title="How assessments work"
        sub="AI agents collect and read the evidence, check every control and cite exactly where they found it; people make every decision. Scoring is deterministic and every step is written to a tamper-evident ledger."
      />

      <Card title="Assessment pipeline" icon="activity" subtitle="From request to decision, one vendor end to end">
        <div className="pipeline">
          {PIPELINE.map((s, i) => (
            <div key={s.title} className={`pipe-step ${s.kind ?? ""}`}>
              <div className="row-between">
                <span className="pipe-num">STEP {i + 1}</span>
                <span className={`kpi-icon ${s.kind === "agentic" ? "ai" : ""}`} style={{ width: 30, height: 30 }}>
                  <Icon name={s.icon} size={15} />
                </span>
              </div>
              <div className="pipe-title">{s.title}</div>
              <div className="pipe-text">{s.text}</div>
              {s.kind && (
                <span className={`pill ${s.kind === "agentic" ? "tone-ai" : "tone-accent"}`} style={{ alignSelf: "flex-start", marginTop: "auto" }}>
                  {s.kind === "agentic" ? "AI" : "Human gate"}
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid cols-3">
        {Object.entries(AGENT_META).map(([key, m]) => (
          <section key={key} className="card agent-card">
            <div className="agent-head">
              <span className={`agent-icon ${key}`}>
                <Icon name={m.icon} size={18} />
              </span>
              <div className="grow">
                <h3>{AGENT_LABEL[key]}</h3>
                <div className="xsmall muted">{m.blurb}</div>
              </div>
            </div>
            <div className="agent-summary">
              {key === "security" && "Assesses SOC 2, ISO 27001 and Tekion security controls — posture, vulnerability management, access, network hygiene, incident response — and judges which NVD CVEs actually apply."}
              {key === "privacy" && "Classifies the data involved, maps locations, transfer mechanisms and sub-processors, and flags where intake under-declared sensitivity."}
              {key === "ai_vendor" && "Detects AI capability even when it wasn't declared, identifies third-party model providers, and reviews AI security and transparency."}
            </div>
            <div className="agent-foot">
              <span>Score weight</span>
              <span className="strong">{{ security: 50, privacy: 35, ai_vendor: 15 }[key]}%</span>
            </div>
          </section>
        ))}
      </div>

      <RequiredDocuments />

      <div className="grid split-wide">
        <Card title="Built-in controls" icon="shieldCheck" subtitle="What makes the output defensible to auditors and regulators" flush>
          <div className="grid cols-2" style={{ gap: 0 }}>
            {CONTROLS.map(([icon, title, text]) => (
              <div key={title} className="control" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="control-icon">
                  <Icon name={icon} size={17} />
                </span>
                <div>
                  <div className="strong">{title}</div>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    {text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="stack">
          <Card title="Scoring model" icon="target" subtitle="Transparent weights, configured in code and reviewable">
            <div className="section-title" style={{ marginBottom: 10 }}>
              Inherent risk weights
            </div>
            <div className="stack-sm">
              {INHERENT.map(([label, w]) => (
                <div key={label} className="row-between">
                  <span className="small" style={{ width: 160 }}>
                    {label}
                  </span>
                  <div className="grow">
                    <Meter value={w} max={40} tier="accent" showValue={false} />
                  </div>
                  <span className="small strong tabular" style={{ width: 36, textAlign: "right" }}>
                    {w}%
                  </span>
                </div>
              ))}
            </div>
            <div className="section-title" style={{ margin: "20px 0 10px" }}>
              Tier thresholds (0–100)
            </div>
            <div className="dist-bar" style={{ height: 10 }}>
              {(["low", "medium", "high", "critical"] as const).map((t) => (
                <div key={t} className={`dist-seg ${t}`} style={{ flex: 1 }} />
              ))}
            </div>
            <div className="row-between xsmall muted" style={{ marginTop: 8 }}>
              {(["low", "medium", "high", "critical"] as const).map((t, i) => (
                <span key={t} className="row" style={{ gap: 4 }}>
                  <TierShape tier={t} />
                  {tierLabel(t)} {["< 25", "25–50", "50–75", "≥ 75"][i]}
                </span>
              ))}
            </div>
            <p className="xsmall muted" style={{ marginTop: 14 }}>
              Residual = inherent × (0.5 + 0.5 × weighted control gap). Strong controls can at most halve inherent risk, never erase it. An open
              critical finding forces at least High.
            </p>
          </Card>

          <Card title="On the roadmap" icon="chart" flush>
            <ul className="list">
              {ROADMAP.map(([title, text]) => (
                <li key={title} className="list-item" style={{ alignItems: "flex-start" }}>
                  <span className="kpi-icon" style={{ width: 26, height: 26 }}>
                    <Icon name="chevronRight" size={14} />
                  </span>
                  <div>
                    <div className="strong small">{title}</div>
                    <div className="xsmall muted">{text}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
