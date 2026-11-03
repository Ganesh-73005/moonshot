import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api, getUser, type Tier } from "../api";
import { contractTerm, termLabel, totalMonths } from "../contract";
import { ErrorBanner, Gauge, Icon, PageHeader, displayName, humanize } from "../ui";

type Errors = Record<string, string>;

const LABELS: Record<string, string> = {
  name: "Vendor name",
  category: "Category",
  data_sensitivity: "Data it will handle",
  business_criticality: "Business criticality",
  access_level: "Access to our systems",
  impact_facing: "Who it affects",
  business_owner: "Business owner",
  vendor_contact_email: "Vendor security contact",
  contract: "Contract period",
};

function validateField(name: string, value: string): string | null {
  const v = value.trim();
  if (name === "category" && !v) return "Choose a category.";
  if (["name", "business_owner"].includes(name) && !v) return `Enter the ${LABELS[name].toLowerCase()}.`;
  if (["data_sensitivity", "business_criticality", "access_level", "impact_facing"].includes(name) && !v) return `Choose one option for ${LABELS[name].toLowerCase()}.`;
  if (name === "vendor_contact_email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter an email address like security@vendor.com.";
  return null;
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <span className="field-error" id={id}>
      <Icon name="alert" size={14} />
      {msg}
    </span>
  ) : null;
}

const CATEGORIES = [
  "saas_business_app", "cloud_infrastructure", "security_tooling", "hr_payroll", "finance_payments",
  "marketing_analytics", "customer_support", "developer_tooling", "ai_ml_platform", "professional_services", "other",
];

type Option = [value: string, title: string, desc: string];

const SENSITIVITY: Option[] = [
  ["public", "Public", "Already published or non-sensitive"],
  ["internal", "Internal", "Non-public business information"],
  ["confidential", "Confidential", "Customer or employee personal data"],
  ["restricted", "Restricted", "Financial, health, government ID, credentials"],
];
const CRITICALITY: Option[] = [
  ["low", "Low", "Easy to replace, no outage impact"],
  ["medium", "Medium", "Workarounds exist for a short outage"],
  ["high", "High", "Outage disrupts a core business process"],
  ["critical", "Critical", "Outage stops revenue or operations"],
];
const ACCESS: Option[] = [
  ["none", "None", "No connection to our systems"],
  ["read", "Read", "Reads data from our systems"],
  ["write", "Write", "Creates or changes our data"],
  ["admin", "Admin", "Privileged or production access"],
];

const FACING: Option[] = [
  ["internal", "Internal", "Only our own staff use it"],
  ["customer_facing", "Customer-facing", "Our customers, or their consumers, use it or are affected by it"],
  ["product_embedded", "Product-embedded", "Runs inside, or ships with, one of our products"],
  ["partner_facing", "Partner-facing", "Partners, OEMs or suppliers use it"],
];

// Preview only: mirrors ScoringConfig in backend/tpra/scoring.py. The server computes the official score on submit.
const WEIGHTS = { data_sensitivity: 0.4, business_criticality: 0.3, access_level: 0.2, uses_ai: 0.1 };
const POINTS: Record<string, Record<string, number>> = {
  data_sensitivity: { public: 0, internal: 30, confidential: 70, restricted: 100 },
  business_criticality: { low: 20, medium: 50, high: 80, critical: 100 },
  access_level: { none: 0, read: 40, write: 70, admin: 100 },
};
const previewTier = (s: number): Tier => (s >= 75 ? "critical" : s >= 50 ? "high" : s >= 25 ? "medium" : "low");

function Options({ name, label, options, value, onChange, meter = true, hint, error }: { name: string; label: string; options: Option[]; value: string; onChange: (v: string) => void; meter?: boolean; hint?: string; error?: string }) {
  return (
    <fieldset className="field" id={`field-${name}`} tabIndex={-1} style={{ border: 0, padding: 0, margin: 0 }} aria-invalid={error ? true : undefined} aria-describedby={error ? `${name}-error` : undefined} data-testid={`field-${name}`}>
      <legend className="field-label" style={{ marginBottom: 6 }}>
        {label}
        <span className="req">*</span>
      </legend>
      <div className="options cols-4">
        {options.map(([v, title, desc], i) => (
          <label key={v} className="option">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} data-testid={`${name}-${v}`} />
            <span className="option-title">
              {title}
              {meter && (
                <span className="option-level" aria-hidden>
                  {options.map((_, j) => (
                    <i key={j} className={j <= i ? "on" : ""} />
                  ))}
                  <span className="sr-only">level {i + 1} of {options.length}</span>
                </span>
              )}
            </span>
            <span className="option-desc">{desc}</span>
          </label>
        ))}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
      <FieldError id={`${name}-error`} msg={error} />
    </fieldset>
  );
}

function Section({ n, title, sub, children }: { n: number; title: string; sub: string; children: ReactNode }) {
  return (
    <div className="form-section">
      <div className="form-section-head">
        <span className="form-section-num">{n}</span>
        <div>
          <h3>{title}</h3>
          <div className="small muted">{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

const NEXT_STEPS: [string, string, string][] = [
  ["fingerprint", "Instant inherent tier", "Scored on submit from the risk profile; duplicates are caught by name and domain."],
  ["globe", "Public documents collected", "Public reports are downloaded from the vendor's trust centre or the trust portal you give; gated ones are noted."],
  ["lock", "Access requested for the rest", "The portal's request form is filled in for you and re-checked every 10 minutes until the documents open."],
  ["file", "Documents first", "Required documents still owed for the tier become a document request — not a questionnaire."],
  ["sparkles", "Assessment starts when the evidence is in", "Security, Privacy and AI-Vendor agents then assess every checklist control, and every quote is verified."],
  ["users", "People make the call", "An analyst reviews; High and Critical vendors also need an independent approver."],
];

export function NewVendor() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [summary, setSummary] = useState<Errors | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const blur = (e: { target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) => {
    const msg = validateField(e.target.name, e.target.value);
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next[e.target.name] = msg;
      else delete next[e.target.name];
      return next;
    });
  };
  const err = (name: string) => (errors[name] ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` } : {});
  const setPick = (key: keyof typeof profile, v: string) => {
    setProfile({ ...profile, [key]: v });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };
  const [profile, setProfile] = useState({ data_sensitivity: "", business_criticality: "", access_level: "", uses_ai: false, impact_facing: "" });
  const [contract, setContract] = useState({ start: "", end: "" });
  const term = contractTerm(contract.start, contract.end);
  const contractError = contract.end && !contract.start ? "Add a start date." : contract.start && contract.end && !term ? "The contract can't end before it starts." : null;

  const complete = profile.data_sensitivity && profile.business_criticality && profile.access_level;
  const score = complete
    ? Math.round(
        (WEIGHTS.data_sensitivity * POINTS.data_sensitivity[profile.data_sensitivity] +
          WEIGHTS.business_criticality * POINTS.business_criticality[profile.business_criticality] +
          WEIGHTS.access_level * POINTS.access_level[profile.access_level] +
          WEIGHTS.uses_ai * (profile.uses_ai ? 100 : 0)) *
          10,
      ) / 10
    : 0;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const found: Errors = {};
    for (const k of ["name", "category", "data_sensitivity", "business_criticality", "access_level", "impact_facing", "business_owner", "vendor_contact_email"]) {
      const msg = validateField(k, ((form.get(k) as string) ?? "").toString());
      if (msg) found[k] = msg;
    }
    if (contractError) found.contract = contractError;
    setErrors(found);
    if (Object.keys(found).length) {
      setSummary(found);
      setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    setSummary(null);
    const text = (k: string) => ((form.get(k) as string) || "").trim() || null;
    setSubmitting(true);
    setError(null);
    try {
      const vendor = await api.createVendor({
        name: text("name"),
        website: text("website"),
        description: text("description") ?? "",
        category: form.get("category"),
        data_sensitivity: form.get("data_sensitivity"),
        business_criticality: form.get("business_criticality"),
        access_level: form.get("access_level"),
        uses_ai_declared: form.get("uses_ai_declared") === "on",
        impact_facing: form.get("impact_facing"),
        business_owner: text("business_owner"),
        vendor_contact_email: text("vendor_contact_email"),
        vendor_contact_name: text("vendor_contact_name"),
        vendor_contact_phone: text("vendor_contact_phone"),
        trust_portal_url: text("trust_portal_url"),
        contract_start: contract.start || null,
        contract_end: contract.end || null,
      });
      window.location.hash = `#/vendors/${vendor.id}`;
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? `Duplicate vendor: ${err.message}` : (err as Error).message);
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow={
          <>
            <Icon name="plus" size={13} />
            Intake
          </>
        }
        title="New vendor request"
        sub="Tell us who the vendor is and how we'll use them. The inherent risk tier is computed the moment you submit; AI agents enrich everything else during assessment."
      />
      <ol className="steps-cue" aria-label="Request progress" data-testid="intake-steps">
        <li aria-current="step">
          <span className="n">1</span>Intake
        </li>
        <li aria-hidden className="bar" />
        <li>
          <span className="n">2</span>Collect evidence
        </li>
        <li aria-hidden className="bar" />
        <li>
          <span className="n">3</span>Review &amp; proceed
        </li>
      </ol>

      {summary && (
        <div className="error-summary" role="alert" tabIndex={-1} ref={summaryRef} data-testid="error-summary">
          <h2>
            <Icon name="alert" size={16} />
            Fix {Object.keys(summary).length} problem{Object.keys(summary).length === 1 ? "" : "s"} before submitting
          </h2>
          <ul>
            {Object.entries(summary).map(([k, msg]) => (
              <li key={k}>
                <a
                  href={`#field-${k}`}
                  onClick={(ev) => {
                    ev.preventDefault();
                    const el = document.getElementById(`field-${k}`);
                    el?.scrollIntoView({ block: "center" });
                    (el?.querySelector("input") ?? el)?.focus();
                  }}
                >
                  {LABELS[k]}: {msg}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ErrorBanner error={error} />

      <div className="grid split">
        <form className="card" onSubmit={submit} noValidate data-testid="new-vendor-form">
          <Section n={1} title="Vendor" sub="Who they are and what we'll use them for">
            <div className="grid cols-2" style={{ gap: 16 }}>
              <label className="field">
                <span className="field-label">
                  Vendor name<span className="req">*</span>
                </span>
                <input id="field-name" name="name" required aria-required maxLength={255} autoComplete="organization" placeholder="e.g. Northwind Payroll" onBlur={blur} {...err("name")} data-testid="input-name" />
                <FieldError id="name-error" msg={errors.name} />
              </label>
              <label className="field">
                <span className="field-label">Website</span>
                <input name="website" inputMode="url" autoComplete="url" placeholder="https://vendor.com" data-testid="input-website" />
                <span className="field-hint">Enables outside-in checks: TLS, SPF/DMARC, security.txt, CVEs.</span>
              </label>
            </div>
            <label className="field">
              <span className="field-label">Trust portal link</span>
              <input name="trust_portal_url" inputMode="url" placeholder="https://trust.vendor.com" data-testid="input-trust-portal" />
              <span className="field-hint">
                Optional. Public documents are collected from it, and access to the gated ones is requested for you. Leave it empty and we look for one on
                the vendor's website.
              </span>
            </label>
            <label className="field">
              <span className="field-label">
                Category<span className="req">*</span>
              </span>
              <select id="field-category" name="category" required aria-required defaultValue="" onBlur={blur} onChange={blur} {...err("category")} data-testid="input-category">
                <option value="" disabled>
                  Select a category…
                </option>
                {CATEGORIES.map((o) => (
                  <option key={o} value={o}>
                    {humanize(o)}
                  </option>
                ))}
              </select>
              <FieldError id="category-error" msg={errors.category} />
            </label>
            <label className="field">
              <span className="field-label">What will we use this vendor for?</span>
              <textarea name="description" rows={3} maxLength={4000} placeholder="Business purpose, teams involved, data flows…" data-testid="input-description" />
            </label>
          </Section>

          <Section n={2} title="Risk profile" sub="Drives the inherent risk score and which documents we ask for — agents will flag it if the evidence says otherwise">
            <Options name="data_sensitivity" label="Data it will handle" options={SENSITIVITY} value={profile.data_sensitivity} onChange={(v) => setPick("data_sensitivity", v)} error={errors.data_sensitivity} />
            <Options name="business_criticality" label="Business criticality" options={CRITICALITY} value={profile.business_criticality} onChange={(v) => setPick("business_criticality", v)} error={errors.business_criticality} />
            <Options name="access_level" label="Access to our systems" options={ACCESS} value={profile.access_level} onChange={(v) => setPick("access_level", v)} error={errors.access_level} />
            <Options
              name="impact_facing"
              label="Who it affects"
              options={FACING}
              value={profile.impact_facing}
              onChange={(v) => setPick("impact_facing", v)}
              error={errors.impact_facing}
              meter={false}
              hint="Doesn't change the risk score. It decides which extra documents we ask the vendor for (for example an accessibility report for customer-facing tools)."
            />
            <label className="switch" style={{ position: "relative" }}>
              <input type="checkbox" role="switch" data-testid="input-uses-ai" name="uses_ai_declared" checked={profile.uses_ai} onChange={(e) => setProfile({ ...profile, uses_ai: e.target.checked })} />
              <span className="switch-track" aria-hidden />
              <span className="grow">
                <span className="strong">We plan to use AI features of this product</span>
                <div className="small muted">Brings the AI-Vendor agent's model-provider and AI-security review into scope.</div>
              </span>
              <Icon name="cpu" size={18} className="muted" />
            </label>
          </Section>

          <Section n={3} title="Ownership" sub="Who is accountable internally, and who we contact at the vendor">
            <div className="grid cols-2" style={{ gap: 16 }}>
              <label className="field">
                <span className="field-label">
                  Business owner<span className="req">*</span>
                </span>
                <input id="field-business_owner" name="business_owner" required aria-required defaultValue={getUser()} onBlur={blur} {...err("business_owner")} data-testid="input-business-owner" />
                <FieldError id="business_owner-error" msg={errors.business_owner} />
                <span className="field-hint">Receives escalations and owns any risk acceptance.</span>
              </label>
              <label className="field">
                <span className="field-label">Vendor security contact</span>
                <input id="field-vendor_contact_email" name="vendor_contact_email" type="email" autoComplete="email" placeholder="security@vendor.com" onBlur={blur} {...err("vendor_contact_email")} data-testid="input-contact-email" />
                <FieldError id="vendor_contact_email-error" msg={errors.vendor_contact_email} />
                <span className="field-hint">Where questionnaires are sent, and who we name on a trust portal's request form.</span>
              </label>
              <label className="field">
                <span className="field-label">Vendor contact name</span>
                <input name="vendor_contact_name" maxLength={255} autoComplete="name" placeholder="e.g. Sam Lee" data-testid="input-contact-name" />
              </label>
              <label className="field">
                <span className="field-label">Vendor contact phone</span>
                <input name="vendor_contact_phone" type="tel" autoComplete="tel" maxLength={64} placeholder="+1 555 0100" data-testid="input-contact-phone" />
              </label>
            </div>
          </Section>

          <Section n={4} title="Contract period" sub="Optional. Pick the dates; the length is worked out for you">
            <div className="grid cols-2" style={{ gap: 16 }}>
              <label className="field">
                <span className="field-label">Start date</span>
                <input id="field-contract" type="date" data-testid="input-contract-start" value={contract.start} max={contract.end || undefined} onChange={(e) => setContract({ ...contract, start: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">End date</span>
                <input type="date" data-testid="input-contract-end" aria-invalid={contractError ? true : undefined} value={contract.end} min={contract.start || undefined} onChange={(e) => setContract({ ...contract, end: e.target.value })} />
              </label>
            </div>
            <div className="term-line" aria-live="polite" data-testid="contract-term">
              <Icon name="calendar" size={15} />
              {term ? (
                <>
                  <strong>{termLabel(term)}</strong>
                  <span className="muted">
                    {totalMonths(term)} month{totalMonths(term) === 1 ? "" : "s"}
                    {term.days > 0 && totalMonths(term) > 0 ? ` and ${term.days} day${term.days === 1 ? "" : "s"}` : ""}
                  </span>
                </>
              ) : contractError ? (
                <span className="bad">{contractError}</span>
              ) : (
                <span className="muted">Choose a start and end date to see the term.</span>
              )}
            </div>
          </Section>

          <div className="form-footer">
            <span className="small muted">
              Submitting as <strong>{displayName(getUser())}</strong> · recorded in the audit ledger
            </span>
            <div className="form-actions">
              <a className="btn btn-ghost" href="#/" data-testid="cancel-button">
                Cancel
              </a>
              <button className="btn-primary" type="submit" disabled={submitting} aria-busy={submitting} data-testid="submit-request-button">
                {submitting ? <span className="spinner" style={{ borderTopColor: "#fff" }} /> : <Icon name="send" size={15} />}
                {submitting ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </div>
        </form>

        <aside className="stack" style={{ position: "sticky", top: 84 }}>
          <section className="card" data-testid="inherent-preview">
            <div className="card-head">
              <div>
                <h2 className="card-title">
                  <Icon name="target" size={16} />
                  Inherent risk preview
                </h2>
                <div className="card-sub">Updates as you fill in the risk profile</div>
              </div>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <Gauge value={score} tier={complete ? previewTier(score) : null} label="Inherent score" muted={!complete} />
              <p className="xsmall muted" style={{ textAlign: "center", marginTop: 6 }}>
                {complete
                  ? "Before any controls are assessed. Strong, evidenced controls can at most halve this."
                  : "Choose data, criticality and access to see the score."}
              </p>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">
                <Icon name="layers" size={16} />
                What happens next
              </h2>
            </div>
            <div className="card-body">
              <ul className="timeline">
                {NEXT_STEPS.map(([icon, title, text]) => (
                  <li key={title} className="tl-item">
                    <span className={`avatar sm round ${icon === "sparkles" ? "agent" : "system"}`}>
                      <Icon name={icon} size={12} />
                    </span>
                    <div className="tl-body">
                      <div className="strong" style={{ fontSize: 13 }}>
                        {title}
                      </div>
                      <div className="small muted">{text}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
