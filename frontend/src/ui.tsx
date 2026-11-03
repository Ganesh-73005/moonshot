import type { ReactNode } from "react";
import type { Tier } from "./api";

/* ---------- Icons (24px grid, stroke) ---------- */

const ICONS: Record<string, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  home: <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />,
  building: <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />,
  shieldCheck: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3zM9 12l2 2 4-4" />,
  sparkles: (
    <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  file: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 13h6M9 17h4" />,
  upload: <path d="M12 15V4M7 9l5-5 5 5M5 20h14" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  alert: <path d="M12 4l9 16H3L12 4zM12 10v4M12 17h.01" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronsUpDown: <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  link: (
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.8 3.5 6" />
    </>
  ),
  cog: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  inbox: <path d="M3 13l3-8h12l3 8M3 13v6h18v-6M3 13h5l1 3h6l1-3h5" />,
  layers: <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" />,
  play: <path d="M7 4.5l12 7.5-12 7.5V4.5z" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />,
  hash: <path d="M5 9h14M5 15h14M10 3L8 21M16 3l-2 18" />,
  send: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" />,
  scale: <path d="M12 3v18M7 21h10M4 7h16M7 7l-3 7a3 3 0 0 0 6 0L7 7zM17 7l-3 7a3 3 0 0 0 6 0l-3-7z" />,
  chart: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
  message: <path d="M4 5h16v11H9l-5 4V5z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  fingerprint: (
    <path d="M12 11v3a8 8 0 0 1-1.5 4.7M8.5 7.5A5 5 0 0 1 17 11v2M7 11a5 5 0 0 1 .6-2.4M17 16.5a14 14 0 0 1-.8 3M4 15a14 14 0 0 0 .5-4 7.5 7.5 0 0 1 12-6M20 11v1" />
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  handshake: <path d="M3 11l4-4 4 2 3-2 7 5-4 4M7 7l-4 8 3 3M11 13l2 2M9 15l2 2M14 12l3 3" />,
  radar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 12l6-6M12 3v2" />
    </>
  ),
  checklist: <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  newspaper: <path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5zM17 9h3v10a2 2 0 0 1-2 2M7 9h7M7 13h7M7 17h4" />,
  bug: <path d="M8 9a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0V9zM12 9v9M3 12h5M16 12h5M4 7l4 2M20 7l-4 2M4 18l4-2M20 18l-4-2M9 5L8 3M15 5l1-2" />,
  scan: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />,
  database: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, className = "", strokeWidth = 1.8 }: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  );
}

export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2.5l8 3v6.2c0 4.7-3.4 8.6-8 9.8-4.6-1.2-8-5.1-8-9.8V5.5l8-3z" fill="rgba(255,255,255,0.18)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 7.5l1.2 3.1 3.1 1.2-3.1 1.2L12 16.1l-1.2-3.1-3.1-1.2 3.1-1.2L12 7.5z" fill="#fff" />
    </svg>
  );
}

/* ---------- Tier / severity ---------- */

export const TIERS: Tier[] = ["critical", "high", "medium", "low"];
export const TIER_COLOR: Record<Tier, string> = { low: "var(--good)", medium: "var(--warning)", high: "var(--serious)", critical: "var(--critical)" };

/** Distinct shape per tier so tier never rides on color alone. */
export function TierShape({ tier, size = 10 }: { tier: Tier; size?: number }) {
  const fill = TIER_COLOR[tier];
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      {tier === "low" && <circle cx="5" cy="5" r="4.2" fill={fill} />}
      {tier === "medium" && <path d="M5 0.6L9.6 9H0.4z" fill={fill} />}
      {tier === "high" && <path d="M5 0.3L9.7 5 5 9.7 0.3 5z" fill={fill} />}
      {tier === "critical" && <rect x="0.8" y="0.8" width="8.4" height="8.4" rx="1.5" fill={fill} />}
    </svg>
  );
}

export const tierLabel = (t: Tier) => t[0].toUpperCase() + t.slice(1);

export function TierBadge({ tier, size, suffix }: { tier: Tier | null; size?: "lg"; suffix?: string }) {
  if (!tier) return <span className="tier tier-none">—</span>;
  return (
    <span className={`tier tier-${tier} ${size === "lg" ? "tier-lg" : ""}`}>
      <TierShape tier={tier} size={size === "lg" ? 11 : 9} />
      {tierLabel(tier)}
      {suffix && <span className="muted" style={{ fontWeight: 500 }}>{suffix}</span>}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Tier }) {
  return <TierBadge tier={severity} />;
}

/* ---------- Ratings & status ---------- */

const RATING_LABEL: Record<string, string> = {
  strong: "Strong",
  adequate: "Adequate",
  weak: "Weak",
  insufficient_evidence: "No evidence",
};

export function RatingPill({ rating }: { rating: string }) {
  return (
    <span className={`rating rating-${rating}`} title={rating === "insufficient_evidence" ? "Insufficient evidence — no risk reduction is credited" : undefined}>
      <span className="rating-bar" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {RATING_LABEL[rating] ?? humanize(rating)}
    </span>
  );
}

type Tone = "neutral" | "accent" | "info" | "good" | "warning" | "danger" | "ai";

const STATUS_TONE: Record<string, Tone> = {
  approved: "good",
  submitted: "good",
  active: "good",
  approved_with_accepted_risk: "warning",
  awaiting_evidence: "warning",
  accepted: "warning",
  awaiting_review: "accent",
  awaiting_signoff: "accent",
  running: "info",
  processing: "info",
  in_assessment: "info",
  drafting: "info",
  sent: "info",
  in_progress: "info",
  rejected: "danger",
  failed: "danger",
  assessment_failed: "danger",
  overdue: "danger",
  expired: "danger",
  acceptance_expired: "danger",
  open: "neutral",
  re_review_required: "danger",
  escalated: "danger",
  new: "accent",
  acknowledged: "neutral",
  dismissed: "neutral",
  ready: "good",
  pending: "info",
};

const STATUS_LABEL: Record<string, string> = {
  approved_with_accepted_risk: "Approved · risk accepted",
  awaiting_signoff: "Awaiting sign-off",
  awaiting_review: "Awaiting review",
  in_assessment: "In assessment",
  assessment_failed: "Assessment failed",
  acceptance_expired: "Acceptance expired",
  re_review_required: "Re-review required",
  ready: "Read",
  intake: "Intake",
};

export const statusLabel = (s: string) => STATUS_LABEL[s] ?? humanize(s);

export function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="subtle">—</span>;
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <span className={`pill tone-${tone}`}>
      <span className="dot" aria-hidden />
      {statusLabel(status)}
    </span>
  );
}

/* ---------- Layout primitives ---------- */

export function Card({ title, subtitle, icon, actions, children, className = "", flush, footer }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  flush?: boolean;
  footer?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div className="grow">
            {title && (
              <h2 className="card-title">
                {icon && <Icon name={icon} size={16} />}
                {title}
              </h2>
            )}
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {actions && <div className="card-head-actions">{actions}</div>}
        </header>
      )}
      {children !== undefined && <div className={flush ? "card-flush" : "card-body"}>{children}</div>}
      {footer && <div className="card-foot">{footer}</div>}
    </section>
  );
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function ErrorBanner({ error }: { error: string | null }) {
  return error ? (
    <div className="error-banner" role="alert">
      <Icon name="alert" size={16} />
      <span>{error}</span>
    </div>
  ) : null;
}

export function Callout({ tone = "info", icon, title, children }: { tone?: "info" | "warning" | "danger" | "success" | "ai"; icon?: string; title?: ReactNode; children?: ReactNode }) {
  const fallback = { info: "info", warning: "alert", danger: "alert", success: "check", ai: "sparkles" }[tone];
  return (
    <div className={`callout ${tone}`}>
      <Icon name={icon ?? fallback} size={16} />
      <div className="grow">
        {title && <div className="callout-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon = "inbox", title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={20} />
      </div>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-text">{children}</div>}
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 34, width: 320 }} />
      <div className="grid cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 118, borderRadius: 14 }} />
        ))}
      </div>
      <div className="grid split-wide">
        <div className="skeleton" style={{ height: 280, borderRadius: 14 }} />
        <div className="skeleton" style={{ height: 280, borderRadius: 14 }} />
      </div>
    </div>
  );
}

/* ---------- People ---------- */

function hue(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function initials(name: string) {
  const parts = name.replace(/[._@-]+/g, " ").replace(/\(.*?\)/g, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({ name, size, round, kind }: { name: string; size?: "sm" | "lg"; round?: boolean; kind?: "user" | "agent" | "system" }) {
  if (kind === "agent")
    return (
      <span className={`avatar agent ${size ?? ""} ${round ? "round" : ""}`} title={name}>
        <Icon name="sparkles" size={size === "sm" ? 12 : 15} />
      </span>
    );
  if (kind === "system")
    return (
      <span className={`avatar system ${size ?? ""} ${round ? "round" : ""}`} title={name}>
        <Icon name="cog" size={size === "sm" ? 12 : 15} />
      </span>
    );
  return (
    <span className={`avatar ${size ?? ""} ${round ? "round" : ""}`} style={{ ["--h" as string]: hue(name) }} title={name}>
      {initials(name)}
    </span>
  );
}

export const PEOPLE: Record<string, { name: string; role: string }> = {
  "priya.analyst": { name: "Priya", role: "GRC analyst" },
  "sam.approver": { name: "Sam", role: "Risk approver" },
  "jordan.requestor": { name: "Jordan", role: "Business owner" },
};

export const displayName = (id: string) => PEOPLE[id]?.name ?? id;

/* ---------- Data viz ---------- */

export function Meter({ value, max = 100, tier, showValue = true, unit = "" }: { value: number; max?: number; tier?: Tier | "accent"; showValue?: boolean; unit?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="meter-track">
        <div className={`meter-fill ${tier ?? ""}`} style={{ width: `${pct}%` }} />
      </div>
      {showValue && <span className="meter-value">{value.toFixed(0)}{unit}</span>}
    </div>
  );
}

/** Donut ring, 0–100. Blue arc over a pale track; the tier badge underneath carries the risk level. */
export function Gauge({ value, tier, label, muted, size = 132 }: { value: number; tier: Tier | null; label: string; muted?: boolean; size?: number }) {
  const stroke = Math.round(size * 0.1);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, value / 100));
  return (
    <div className="gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${value.toFixed(1)} of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={muted ? "var(--ink-4)" : "var(--accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" className="gauge-value" style={{ fontSize: size * 0.27 }}>
          {Math.round(value * 10) / 10}
        </text>
        <text x={size / 2} y={size / 2 + size * 0.17} textAnchor="middle" className="gauge-scale">
          / 100
        </text>
      </svg>
      <div className="gauge-label">{label}</div>
      {tier && <TierBadge tier={tier} />}
    </div>
  );
}

/* ---------- Formatting ---------- */

const LABELS: Record<string, string> = {
  soc2: "SOC 2",
  soc1: "SOC 1",
  iso27001: "ISO 27001",
  iso27701: "ISO 27701",
  iso42001: "ISO 42001",
  pci_aoc: "PCI DSS AOC",
  privacy_policy: "Privacy policy",
  security_policy: "Security policy",
  incident_response: "Incident response plan",
  model_card: "Model card",
  secure_sdlc: "Secure SDLC policy",
  sbom: "SBOM",
  security_questionnaire: "Security questionnaire (CAIQ / SIG)",
  personnel_security: "Personnel security",
  cyber_insurance: "Cyber insurance",
  sla: "SLA",
  vpat: "Accessibility report (VPAT)",
  internal: "Internal",
  customer_facing: "Customer-facing",
  product_embedded: "Product-embedded",
  partner_facing: "Partner-facing",
  pentest: "Pen test",
  dpa: "DPA",
  ai_governance: "AI governance",
  bcp_dr: "BC/DR",
  subprocessor_list: "Sub-processor list",
  documents: "Document request",
  saas_business_app: "SaaS business app",
  hr_payroll: "HR & payroll",
  finance_payments: "Finance & payments",
  ai_ml_platform: "AI/ML platform",
  posture_maturity: "Posture & maturity",
  access_identity: "Access & identity",
  incident_response_bcdr: "Incident response & BCP/DR",
  retention_deletion: "Retention & deletion",
  transparency_explainability: "Transparency & explainability",
  ai_security: "AI security",
  contact_pii: "Contact PII",
  sensitive_pii: "Sensitive PII",
  government_id: "Government ID",
  GDPR: "GDPR",
  UK_GDPR: "UK GDPR",
  DPDP_2023: "DPDP 2023",
  CCPA_CPRA: "CCPA/CPRA",
  HIPAA: "HIPAA",
  PCI_DSS: "PCI DSS",
  ISO_27701: "ISO 27701",
};

export const humanize = (s: string) => LABELS[s] ?? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1_048_576).toFixed(1)} MB`);

export const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const formatDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const future = s < 0;
  const a = Math.abs(s);
  const [n, unit] =
    a < 60 ? [0, "now"] : a < 3600 ? [Math.round(a / 60), "m"] : a < 86400 ? [Math.round(a / 3600), "h"] : [Math.round(a / 86400), "d"];
  if (unit === "now") return "just now";
  return future ? `in ${n}${unit}` : `${n}${unit} ago`;
}

export const describeAction = (action: string) => action.replace(/[._]/g, " ");

export const AGENT_LABEL: Record<string, string> = {
  security: "Security Risk Agent",
  privacy: "Privacy Risk Agent",
  ai_vendor: "AI-Vendor Risk Agent",
};

export const AGENT_META: Record<string, { short: string; icon: string; blurb: string }> = {
  security: { short: "Security", icon: "shield", blurb: "Controls, posture, vulnerabilities, access, incident response" },
  privacy: { short: "Privacy", icon: "eye", blurb: "Data classification, residency, transfers, sub-processors" },
  ai_vendor: { short: "AI-Vendor", icon: "cpu", blurb: "Model providers, AI security, transparency, governance" },
};
