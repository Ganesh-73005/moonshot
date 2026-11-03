export type Tier = "low" | "medium" | "high" | "critical";

export interface DocumentProfile {
  kind: string | null;
  title: string | null;
  audit_period: { start: string; end: string; page: number | null } | null;
  tests_with_exceptions: number;
  tests_without_exceptions: number;
  exception_pages: number[];
  period_end_age_days?: number;
}

export interface Evidence {
  id: number;
  filename: string;
  title: string;
  doc_type: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  uploaded_by: string;
  uploaded_at: string;
  source: "analyst" | "vendor_portal" | "trust_center";
  source_url: string | null;
  processing_status: "pending" | "processing" | "ready" | "failed";
  processing_error: string | null;
  page_count: number | null;
  ocr_pages: number[] | null;
  segment_count: number;
  profile: DocumentProfile | null;
}

/** Where a segment or finding sits in its source file (see backend documents/extract.py). */
export interface Locator {
  page?: number;
  bbox?: [number, number, number, number];
  rects?: [number, number, number, number][];
  ocr?: boolean;
  paragraphs?: [number, number];
  table?: number;
  row?: number;
  sheet?: string;
  range?: string;
  lines?: [number, number];
}

export interface Segment {
  id: number;
  evidence_id: number;
  seq: number;
  kind: "text" | "table_row" | "heading";
  page: number | null;
  section_path: string;
  text: string;
  locator: Locator;
}

export interface Finding {
  id: number;
  agent: string;
  domain: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  rationale: string;
  evidence_source: string;
  evidence_quote: string;
  recommendation: string;
  status: string;
  evidence_id: number | null;
  segment_id: number | null;
  page: number | null;
  section_path: string | null;
  locator: Locator | null;
  /** null: not document-based; false: the quote wasn't found in the document. */
  quote_verified: boolean | null;
  control_ids: string[] | null;
}

export interface CollectedDocument {
  title: string;
  doc_type: string;
  page_url: string;
  file_url: string | null;
  gated: boolean;
  status: "downloaded" | "captured" | "gated" | "listed" | "duplicate" | "failed" | "unsupported";
  evidence_id: number | null;
  error: string | null;
}

export interface EvidenceCollection {
  id: number;
  vendor_id: number;
  status: "running" | "done" | "not_found" | "failed";
  started_by: string;
  started_at: string;
  finished_at: string | null;
  trust_center_url: string | null;
  pages: string[] | null;
  documents: CollectedDocument[] | null;
  refused: { url: string; reason: string }[] | null;
  error: string | null;
}

export interface DocumentGap {
  id: string;
  title: string;
  status: "satisfied" | "stale" | "gated" | "missing";
  note: string | null;
  doc_type: string;
  request: string;
  evidence_ids: number[];
  gated_links: { title: string; url: string }[];
  tier: Tier;
  /** Labels of the documents that each satisfy it ("SOC 2 Type II report", "ISO/IEC 27001 certificate"). */
  any_of: string[];
  why: string;
}

export interface RequiredDocument {
  id: string;
  title: string;
  accepts: string[];
  any_of: string[];
  tiers: Tier[];
  categories: string[] | null;
  facing: string[] | null;
  requires: string[];
  why: string;
  max_age_days: number | null;
}

export type ImpactFacing = "internal" | "customer_facing" | "product_embedded" | "partner_facing";

export type ControlStatus = "met" | "partially_met" | "not_met" | "not_evidenced" | "not_applicable";

export interface ControlCitation {
  segment_id: number | null;
  evidence_id: number | null;
  page: number | null;
  quote: string;
  verified: boolean | null;
  section_path?: string;
  locator?: Locator;
  attestation?: string;
}

export interface ControlResult {
  id: number;
  control_id: string;
  source: string;
  agent: string;
  domain: string;
  section: string;
  requirement: string;
  status: ControlStatus;
  rationale: string;
  severity_if_unmet: "critical" | "high" | "medium" | "low";
  citations: ControlCitation[];
}

export interface DomainAssessment {
  agent: string;
  domain: string;
  rating: "strong" | "adequate" | "weak" | "insufficient_evidence";
  confidence: string;
  summary: string;
}

export interface AgentBreakdown {
  gap: number;
  finding_points: number;
  open_findings: number;
  insufficient_evidence_domains: string[];
  weight: number;
}

export interface InherentAdjustment {
  attribute: "data_sensitivity" | "uses_ai";
  declared: string | boolean;
  inferred: string | boolean;
  confidence: string | null;
  agent: string;
  basis: string;
  status: "applied" | "rejected_by_analyst";
}

export interface Assessment {
  id: number;
  vendor_id: number;
  status: string;
  started_by: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  signals: Record<string, Record<string, unknown>> | null;
  agent_summaries: Record<string, { applicable: boolean; summary: string }> | null;
  agent_details: Record<string, Record<string, unknown>> | null;
  inherent_score: number | null;
  residual_score: number | null;
  computed_tier: Tier | null;
  score_breakdown: {
    declared_inherent_score: number;
    inherent_adjustments: InherentAdjustment[];
    inherent_score: number;
    control_gap: number;
    numeric_tier: Tier;
    tier_floors_applied: string[];
    agents: Record<string, AgentBreakdown>;
    not_applicable_agents: string[];
  } | null;
  override_tier: Tier | null;
  override_rationale: string | null;
  final_tier: Tier | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_decision: string | null;
  review_rationale: string | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
  signoff_decision: string | null;
  signoff_rationale: string | null;
  findings: Finding[];
  domain_assessments: DomainAssessment[];
  /** Control statuses counted per agent. */
  control_summary: Record<string, Partial<Record<ControlStatus, number>>>;
}

export interface RiskAcceptance {
  id: number;
  vendor_id: number;
  assessment_id: number;
  accepted_by: string;
  recorded_by: string;
  justification: string;
  accepted_at: string;
  expires_at: string;
  status: string;
  days_remaining: number;
}

export interface VendorSummary {
  id: number;
  name: string;
  domain: string | null;
  category: string;
  business_owner: string;
  status: string;
  inherent_score: number;
  inherent_tier: Tier;
  current_tier: Tier;
  latest_assessment_id: number | null;
  latest_assessment_status: string | null;
  created_at: string;
}

export interface VendorDetail extends VendorSummary {
  website: string | null;
  description: string;
  data_sensitivity: string;
  business_criticality: string;
  access_level: string;
  uses_ai_declared: boolean;
  /** Who the vendor affects; null for vendors registered before we asked. Decides which extra documents are required. */
  impact_facing: ImpactFacing | null;
  vendor_contact_email: string | null;
  vendor_contact_name: string | null;
  vendor_contact_phone: string | null;
  trust_portal_url: string | null;
  trust_portal_source: "provided" | "discovered" | null;
  contract_start: string | null;
  contract_end: string | null;
  /** The contract period in words, worked out by the server: "2 years 3 months". */
  contract_term: string | null;
  contract_months: number | null;
  created_by: string;
  evidence: Evidence[];
  latest_assessment: Assessment | null;
  risk_acceptances: RiskAcceptance[];
}

export interface AuditEvent {
  id: number;
  occurred_at: string;
  actor: string;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: number;
  payload: Record<string, unknown>;
  hash: string;
}

export interface PendingItem {
  assessment_id: number;
  vendor_id: number;
  vendor_name: string;
  tier: Tier | null;
  since: string;
}

export type AnswerType = "yes_no" | "text" | "document";

export interface QuestionnaireItem {
  id: number;
  position: number;
  source: "library" | "gap" | "analyst" | "documents" | "control";
  library_key: string | null;
  domain: string;
  text: string;
  help_text: string;
  answer_type: AnswerType;
  doc_type: string | null;
  finding_id: number | null;
  purpose: string;
  included: boolean;
  answer_choice: string | null;
  answer_text: string | null;
  evidence: Evidence | null;
  answered_at: string | null;
  /** Set when we already hold this document (trust portal, analyst upload), so the vendor needn't send it. */
  received_from: string | null;
  /** How an edit not yet synced to the vendor differs from what they see; null when in step. */
  pending: "added" | "removed" | "changed" | null;
}

export interface PendingChanges {
  added: number;
  removed: number;
  changed: number;
  total: number;
}

export interface Questionnaire {
  id: number;
  vendor_id: number;
  assessment_id: number | null;
  kind: "onboarding" | "gap" | "documents";
  status: string;
  scoped_tier: Tier;
  created_by: string;
  created_at: string;
  error: string | null;
  sent_by: string | null;
  sent_at: string | null;
  sent_to: string | null;
  due_at: string | null;
  reminders_sent: number;
  last_reminder_at: string | null;
  escalated_at: string | null;
  submitted_at: string | null;
  revision: number;
  synced_at: string | null;
  /** Edits made since the vendor last saw the questionnaire; they reach the vendor when the owner syncs. */
  pending_changes: PendingChanges;
  overdue: boolean;
  answered: number;
  total: number;
  items: QuestionnaireItem[];
}

export interface QuestionnaireSummary {
  questionnaire_id: number;
  vendor_id: number;
  vendor_name: string;
  status: string;
  sent_at: string | null;
  due_at: string | null;
  overdue: boolean;
  reminders_sent: number;
  answered: number;
  total: number;
}

export interface OutboundMessage {
  id: number;
  questionnaire_id: number | null;
  risk_acceptance_id: number | null;
  kind: string;
  recipient: string;
  internal: boolean;
  subject: string;
  body: string;
  created_at: string;
  channel: string | null;
  delivered_at: string | null;
  error: string | null;
}

export interface PortalItem {
  id: number;
  number: number;
  text: string;
  help_text: string;
  answer_type: AnswerType;
  answer_choice: string | null;
  answer_text: string | null;
  uploaded_filename: string | null;
  received_from: string | null;
}

export interface PortalView {
  org_name: string;
  vendor_name: string;
  /** idle: nothing has been sent to the vendor, or what was sent is closed. */
  state: "open" | "submitted" | "closed" | "idle";
  due_at: string | null;
  submitted_at: string | null;
  /** Changes when the owner syncs an update, so an open page knows to refresh. */
  revision: number;
  items: PortalItem[];
}

export type TrustPortalStatus = "no_portal" | "not_requested" | "submitting" | "awaiting_captcha" | "submitted" | "access_granted" | "needs_manual" | "failed";

export interface TrustPortal {
  url: string | null;
  source: "provided" | "discovered" | null;
  request_id: number | null;
  status: TrustPortalStatus;
  detail: string | null;
  submitted_at: string | null;
  granted_at: string | null;
  last_checked_at: string | null;
  next_check_at: string | null;
  check_count: number;
  requested_documents: string[];
  still_gated: string[];
  /** What was typed where, so a person can see exactly what went to the portal. */
  submission: { label: string; field: string; value: string }[] | null;
  access_required: boolean;
  /** Whether requests can be raised (who we are on the form is configured). */
  enabled: boolean;
  /** The portal's security code is waiting for a person to read and type it. */
  captcha_pending: boolean;
  /** Which try the pending code is; the picture changes when it does. */
  captcha_attempt: number;
}

export interface EvidenceStep {
  id: string;
  title: string;
  state: "done" | "active" | "waiting" | "todo" | "attention";
  detail: string;
}

export interface EvidenceStatus {
  /** Whether the AI assessment may start. */
  ready: boolean;
  first_assessment: boolean;
  blockers: string[];
  steps: EvidenceStep[];
  documents: { id: string; title: string; status: "satisfied" | "stale" | "gated" | "missing" | "waived"; note: string | null; evidence_ids: number[]; tier: string; any_of: string[]; why: string }[];
  received: { evidence_id: number; title: string; doc_type: string; source: string; processing_status: string; uploaded_at: string }[];
  counts: { required: number; received: number; remaining: number; waived: number; processing: number; files: number };
  trust_portal: TrustPortal;
  document_request: { id: number; status: string; answered: number; total: number } | null;
}

export interface PortalLink {
  link: string;
  created: boolean;
  questionnaire_id: number | null;
}

export interface Dashboard {
  vendor_count: number;
  by_tier: Record<Tier, number>;
  by_status: Record<string, number>;
  awaiting_review: PendingItem[];
  awaiting_signoff: PendingItem[];
  needs_rereview: PendingItem[];
  open_questionnaires: QuestionnaireSummary[];
  expiring_acceptances: RiskAcceptance[];
  recent_activity: AuditEvent[];
  monitoring_alerts: MonitoringAlert[];
}

export interface MonitoringEvent {
  id: number;
  vendor_id: number;
  source: "news" | "kev" | "trust_center" | "documents" | "signals";
  kind: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  reason: string;
  url: string | null;
  published_at: string | null;
  excerpt: string | null;
  details: Record<string, unknown> | null;
  detected_at: string;
  status: "new" | "acknowledged" | "dismissed" | "escalated";
  handled_by: string | null;
  handled_at: string | null;
  note: string | null;
}

export interface MonitoringAlert extends MonitoringEvent {
  vendor_name: string;
}

export interface MonitoringRun {
  id: number;
  started_by: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "done" | "failed";
  checks: Record<string, { status: "ok" | "failed"; found?: number; error?: string }> | null;
  error: string | null;
}

export interface VendorMonitoring {
  enabled: boolean;
  monitored: boolean;
  cadence_days: number | null;
  runs: MonitoringRun[];
  events: MonitoringEvent[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const USER_KEY = "tpra.user";
export const getUser = () => localStorage.getItem(USER_KEY) ?? "priya.analyst";
export const setUser = (user: string) => localStorage.setItem(USER_KEY, user);

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg ?? JSON.stringify(d)).join("; ");
  if (detail && typeof detail === "object" && "message" in detail) return String(detail.message);
  return JSON.stringify(detail);
}

async function request<T>(path: string, init: RequestInit = {}, asUser = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (asUser) headers.set("X-User", getUser());
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const resp = await fetch(path, { ...init, headers });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new ApiError(resp.status, detailMessage(body.detail));
  }
  return resp.json() as Promise<T>;
}

async function requestBytes(path: string): Promise<ArrayBuffer> {
  const resp = await fetch(path, { headers: { "X-User": getUser() } });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new ApiError(resp.status, detailMessage(body.detail));
  }
  return resp.arrayBuffer();
}

export const api = {
  dashboard: () => request<Dashboard>("/api/dashboard"),
  vendors: () => request<VendorSummary[]>("/api/vendors"),
  vendor: (id: number) => request<VendorDetail>(`/api/vendors/${id}`),
  createVendor: (body: Record<string, unknown>) =>
    request<VendorDetail>("/api/vendors", { method: "POST", body: JSON.stringify(body) }),
  uploadEvidence: (vendorId: number, file: File, docType: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    return request<Evidence>(`/api/vendors/${vendorId}/evidence`, { method: "POST", body: form });
  },
  evidence: (id: number) => request<Evidence>(`/api/evidence/${id}`),
  evidenceFile: (id: number) => requestBytes(`/api/evidence/${id}/file`),
  evidenceSegments: (id: number, params: { page?: number; around?: number; q?: string }) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
    );
    return request<Segment[]>(`/api/evidence/${id}/segments?${qs}`);
  },
  reprocessEvidence: (id: number) => request<Evidence>(`/api/evidence/${id}/reprocess`, { method: "POST" }),
  assessmentControls: (assessmentId: number) => request<ControlResult[]>(`/api/assessments/${assessmentId}/controls`),
  collections: (vendorId: number) => request<EvidenceCollection[]>(`/api/vendors/${vendorId}/collections`),
  collect: (vendorId: number) => request<EvidenceCollection>(`/api/vendors/${vendorId}/collect`, { method: "POST" }),
  vendorMonitoring: (vendorId: number) => request<VendorMonitoring>(`/api/vendors/${vendorId}/monitoring`),
  monitorNow: (vendorId: number) => request<VendorMonitoring>(`/api/vendors/${vendorId}/monitor`, { method: "POST" }),
  triageEvent: (eventId: number, status: "acknowledged" | "dismissed" | "escalated", note?: string) =>
    request<MonitoringEvent>(`/api/monitoring/events/${eventId}`, { method: "POST", body: JSON.stringify({ status, note }) }),
  requiredDocuments: () => request<RequiredDocument[]>("/api/required-documents"),
  documentGaps: (vendorId: number) => request<DocumentGap[]>(`/api/vendors/${vendorId}/document-gaps`),
  draftDocumentRequest: (vendorId: number) =>
    request<Questionnaire>(`/api/vendors/${vendorId}/document-requests`, { method: "POST" }),
  /** Refused (409) until the evidence is in, unless a reason for starting early is given. */
  startAssessment: (vendorId: number, overrideReason?: string) =>
    request<Assessment>(`/api/vendors/${vendorId}/assessments`, {
      method: "POST",
      body: overrideReason ? JSON.stringify({ override_reason: overrideReason }) : undefined,
    }),
  evidenceStatus: (vendorId: number) => request<EvidenceStatus>(`/api/vendors/${vendorId}/evidence-status`),
  trustPortal: (vendorId: number) => request<TrustPortal>(`/api/vendors/${vendorId}/trust-portal`),
  setTrustPortal: (vendorId: number, url: string | null) =>
    request<TrustPortal>(`/api/vendors/${vendorId}/trust-portal`, { method: "PUT", body: JSON.stringify({ url }) }),
  /** manual: a person already submitted the form on the portal; start the same checks. */
  requestPortalAccess: (vendorId: number, opts: { manual?: boolean; force?: boolean } = {}) =>
    request<TrustPortal>(
      `/api/vendors/${vendorId}/trust-portal/request?manual=${!!opts.manual}&force=${!!opts.force}`,
      { method: "POST" },
    ),
  checkPortalNow: (vendorId: number) =>
    request<TrustPortal>(`/api/vendors/${vendorId}/trust-portal/check`, { method: "POST" }),
  /** The portal's security code as a PNG, for a person to read. Only while a request is waiting for it. */
  portalCaptchaImage: (vendorId: number) => requestBytes(`/api/vendors/${vendorId}/trust-portal/captcha`),
  answerPortalCaptcha: (vendorId: number, code: string) =>
    request<TrustPortal>(`/api/vendors/${vendorId}/trust-portal/captcha`, { method: "POST", body: JSON.stringify({ code }) }),
  /** Stop waiting for a code: the request ends as "needs a person" with the details to enter by hand. */
  skipPortalCaptcha: (vendorId: number) =>
    request<TrustPortal>(`/api/vendors/${vendorId}/trust-portal/captcha`, { method: "DELETE" }),
  portalLink: (vendorId: number) => request<PortalLink>(`/api/vendors/${vendorId}/portal-link`),
  rotatePortalLink: (vendorId: number) =>
    request<PortalLink>(`/api/vendors/${vendorId}/portal-link/rotate`, { method: "POST" }),
  review: (assessmentId: number, body: Record<string, unknown>) =>
    request<Assessment>(`/api/assessments/${assessmentId}/review`, { method: "POST", body: JSON.stringify(body) }),
  signoff: (assessmentId: number, body: Record<string, unknown>) =>
    request<Assessment>(`/api/assessments/${assessmentId}/signoff`, { method: "POST", body: JSON.stringify(body) }),
  audit: (entityType: string, entityId: number) =>
    request<AuditEvent[]>(`/api/audit?entity_type=${entityType}&entity_id=${entityId}`),
  verifyAudit: () => request<{ valid: boolean; events_checked: number }>("/api/audit/verify"),
  questionnaires: (vendorId: number) => request<Questionnaire[]>(`/api/vendors/${vendorId}/questionnaires`),
  /** A gap questionnaire from the latest assessment; onboarding=true drafts the generic one before any assessment. */
  draftQuestionnaire: (vendorId: number, onboarding = false) =>
    request<Questionnaire>(`/api/vendors/${vendorId}/questionnaires${onboarding ? "?onboarding=true" : ""}`, {
      method: "POST",
    }),
  toggleItem: (qid: number, itemId: number, included: boolean) =>
    request<Questionnaire>(`/api/questionnaires/${qid}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ included }),
    }),
  editItem: (qid: number, itemId: number, body: { text?: string; help_text?: string }) =>
    request<Questionnaire>(`/api/questionnaires/${qid}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(body) }),
  /** Publish the owner's edits to a sent questionnaire; the vendor's page updates on the same link. */
  syncQuestionnaire: (qid: number) =>
    request<{ questionnaire: Questionnaire; changes: PendingChanges }>(`/api/questionnaires/${qid}/sync`, { method: "POST" }),
  addItem: (qid: number, body: { text: string; answer_type: AnswerType }) =>
    request<Questionnaire>(`/api/questionnaires/${qid}/items`, { method: "POST", body: JSON.stringify(body) }),
  sendQuestionnaire: (qid: number, recipient: string | null) =>
    request<{ questionnaire: Questionnaire; portal_link: string }>(`/api/questionnaires/${qid}/send`, {
      method: "POST",
      body: JSON.stringify(recipient ? { recipient } : {}),
    }),
  cancelQuestionnaire: (qid: number) =>
    request<Questionnaire>(`/api/questionnaires/${qid}/cancel`, { method: "POST" }),
  messages: (vendorId: number) => request<OutboundMessage[]>(`/api/vendors/${vendorId}/messages`),
};

// Vendor portal: authorized by the link token alone, never by the console user.
export const portal = {
  read: (token: string) => request<PortalView>(`/api/portal/${token}`, {}, false),
  answer: (token: string, itemId: number, body: { answer_choice?: string | null; answer_text?: string | null }) =>
    request<PortalView>(`/api/portal/${token}/items/${itemId}`, { method: "PUT", body: JSON.stringify(body) }, false),
  upload: (token: string, itemId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<PortalView>(`/api/portal/${token}/items/${itemId}/document`, { method: "POST", body: form }, false);
  },
  submit: (token: string) => request<PortalView>(`/api/portal/${token}/submit`, { method: "POST" }, false),
};
