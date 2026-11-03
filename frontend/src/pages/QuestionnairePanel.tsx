import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type AnswerType, type OutboundMessage, type PortalLink as PortalLinkInfo, type Questionnaire, type QuestionnaireItem } from "../api";
import { Callout, Card, ErrorBanner, Icon, StatusPill, TierBadge, formatDate, formatDay, humanize, timeAgo } from "../ui";

const SOURCE_LABEL: Record<QuestionnaireItem["source"], string> = {
  library: "Standard",
  gap: "Targeted",
  analyst: "Analyst",
  documents: "Required document",
  control: "Tekion checklist",
};
const SOURCE_ICON: Partial<Record<QuestionnaireItem["source"], string>> = { gap: "sparkles", documents: "file", control: "checklist" };
const OPEN = new Set(["drafting", "draft", "sent", "in_progress"]);
const ANSWER_LABEL: Record<AnswerType, string> = { yes_no: "Yes / No", text: "Text", document: "Document" };

function SourceChip({ source }: { source: QuestionnaireItem["source"] }) {
  return (
    <span className={`chip ${source === "gap" ? "chip-ai" : source === "control" ? "chip-accent" : ""}`}>
      {SOURCE_ICON[source] && <Icon name={SOURCE_ICON[source]!} size={11} />}
      {SOURCE_LABEL[source]}
    </span>
  );
}

function Answer({ item }: { item: QuestionnaireItem }) {
  if (item.answer_type === "yes_no" && item.answer_choice) {
    const tone = item.answer_choice === "yes" ? "tone-good" : item.answer_choice === "no" ? "tone-danger" : "";
    return (
      <div className="stack-xs">
        <span className={`pill ${tone}`} style={{ alignSelf: "flex-start" }}>
          {item.answer_choice.toUpperCase()}
        </span>
        {item.answer_text && <span className="small muted">{item.answer_text}</span>}
      </div>
    );
  }
  if (item.answer_type === "document") {
    if (item.evidence)
      return (
        <div className="stack-xs">
          <span className="row small strong">
            <Icon name="file" size={13} />
            {item.evidence.filename}
          </span>
          {item.received_from && (
            <span className="received-tag">
              <Icon name="check" size={12} />
              Already on file{item.received_from === "trust_center" ? " (from the trust centre / portal)" : ""}
            </span>
          )}
          {item.answer_text && <span className="small muted">{item.answer_text}</span>}
        </div>
      );
    if (item.answer_text)
      return (
        <span className="small">
          <span className="pill tone-warning">Not provided</span> {item.answer_text}
        </span>
      );
  }
  if (item.answer_text) return <span className="small">{item.answer_text}</span>;
  return <span className="subtle small">Not answered</span>;
}

/** A question's wording, with a pencil to reword it. Rewording a sent question stays staged until the owner syncs. */
function EditableText({ text, disabled, onSave }: { text: string; disabled: boolean; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  if (!editing) {
    return (
      <div className="row" style={{ alignItems: "flex-start", gap: 6 }}>
        <div className="grow" style={{ fontWeight: 520 }}>{text}</div>
        <button className="link-button xsmall nowrap" type="button" disabled={disabled} onClick={() => { setValue(text); setEditing(true); }}>
          Reword
        </button>
      </div>
    );
  }
  return (
    <form
      className="stack-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() !== text) onSave(value.trim());
        setEditing(false);
      }}
    >
      <textarea rows={2} value={value} minLength={10} maxLength={2000} required onChange={(e) => setValue(e.target.value)} aria-label="Question wording" />
      <div className="row">
        <button className="btn-sm btn-primary" type="submit" disabled={value.trim().length < 10}>
          Save
        </button>
        <button className="btn-sm btn-ghost" type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const PENDING_LABEL = { added: "New: not shown to the vendor yet", removed: "Removed: still shown to the vendor", changed: "Reworded: the vendor still sees the old wording" } as const;

/** A sent questionnaire the owner can keep working on: edits are staged, and "Update vendor view" publishes them. */
function LiveEditor({ q, onChange }: { q: Questionnaire; onChange: (q: Questionnaire) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const pending = q.pending_changes;

  async function run(action: () => Promise<Questionnaire>) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      onChange(await action());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.syncQuestionnaire(q.id);
      onChange(result.questionnaire);
      setNote(`The vendor's questionnaire is up to date (${result.changes.total} change${result.changes.total === 1 ? "" : "s"}). Their page refreshes by itself, and they were emailed the same link.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addQuestion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    run(() => api.addItem(q.id, { text: form.get("text") as string, answer_type: form.get("answer_type") as AnswerType })).then(() => formEl.reset());
  }

  const rows = q.items.filter((i) => i.included || i.pending === "removed");
  const parts = [pending.added && `${pending.added} new`, pending.changed && `${pending.changed} reworded`, pending.removed && `${pending.removed} removed`].filter(Boolean).join(", ");
  let number = 0;

  return (
    <>
      <div style={{ padding: "0 20px 14px" }} className="stack-sm">
        {pending.total > 0 ? (
          <div className="pending-banner" role="status">
            <span>
              <strong>{pending.total} change{pending.total === 1 ? "" : "s"} the vendor can't see yet</strong> <span className="muted">({parts})</span>
            </span>
            <button className="btn-primary btn-sm" onClick={sync} disabled={busy}>
              {busy ? <span className="spinner" style={{ borderTopColor: "#fff", width: 12, height: 12 }} /> : <Icon name="refresh" size={13} />}
              Update vendor view
            </button>
          </div>
        ) : (
          <div className="xsmall muted row">
            <Icon name="check" size={12} />
            The vendor sees this questionnaire exactly as it is here{q.synced_at ? ` (last updated ${timeAgo(q.synced_at)})` : ""}. Edit it below, then press Update vendor view.
          </div>
        )}
        {note && <Callout tone="success" title="Vendor view updated">{note}</Callout>}
        <ErrorBanner error={error} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 56 }}>Ask</th>
              <th style={{ width: 44 }}>#</th>
              <th>Question</th>
              <th style={{ width: "34%" }}>Vendor answer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const seen = item.pending !== "added";
              if (seen) number += 1;
              return (
                <tr key={item.id} className={item.included ? "" : "excluded"} style={{ verticalAlign: "top" }}>
                  <td style={{ verticalAlign: "top" }}>
                    <input type="checkbox" aria-label={`Ask question ${item.position}`} checked={item.included} disabled={busy} onChange={(e) => run(() => api.toggleItem(q.id, item.id, e.target.checked))} />
                  </td>
                  <td className="num muted" style={{ verticalAlign: "top" }}>{seen ? number : "new"}</td>
                  <td style={{ verticalAlign: "top" }}>
                    <EditableText text={item.text} disabled={busy} onSave={(text) => run(() => api.editItem(q.id, item.id, { text }))} />
                    <div className="row" style={{ marginTop: 4, gap: 6, flexWrap: "wrap" }}>
                      <SourceChip source={item.source} />
                      <span className="xsmall muted">{humanize(item.domain)}</span>
                      {item.pending && <span className="chip chip-warn">{PENDING_LABEL[item.pending]}</span>}
                    </div>
                  </td>
                  <td style={{ verticalAlign: "top" }}>
                    <Answer item={item} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form className="inline-form" onSubmit={addQuestion} style={{ padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
        <input name="text" required minLength={10} placeholder="Add a question for the vendor…" className="grow" style={{ minWidth: 260 }} />
        <select name="answer_type" defaultValue="text" aria-label="Answer type">
          <option value="text">Text</option>
          <option value="yes_no">Yes / No</option>
          <option value="document">Document</option>
        </select>
        <button type="submit" disabled={busy}>
          <Icon name="plus" size={15} />
          Add question
        </button>
      </form>
    </>
  );
}

function DraftEditor({ q, onChange }: { q: Questionnaire; onChange: (q: Questionnaire) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<Questionnaire>) {
    setBusy(true);
    setError(null);
    try {
      onChange(await action());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addQuestion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    run(() => api.addItem(q.id, { text: form.get("text") as string, answer_type: form.get("answer_type") as AnswerType })).then(() =>
      formEl.reset(),
    );
  }

  return (
    <>
      <div style={{ padding: "0 20px 14px" }}>
        <Callout tone="ai" title="Review before sending">
          {q.kind === "documents" ? (
            <>
              Untick documents you don't need. Each one is a <strong>required document</strong> the trust-centre scan couldn't collect; the vendor
              can upload it or explain why it can't be shared. The reason shown is internal and never sent to the vendor.
            </>
          ) : (
            <>
              Untick questions you don't need. <strong>Tekion checklist</strong> questions are the ones the documents on file left unanswered;{" "}
              <strong>targeted</strong> questions were written by the Questionnaire agent from open findings. The reason shown is internal and
              never sent to the vendor.
            </>
          )}
        </Callout>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Send</th>
              <th>Question</th>
              <th>Answer type</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((item) => (
              <tr key={item.id} className={item.included ? "" : "excluded"}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Include question ${item.position}`}
                    checked={item.included}
                    disabled={busy}
                    onChange={(e) => run(() => api.toggleItem(q.id, item.id, e.target.checked))}
                  />
                </td>
                <td>
                  <EditableText text={item.text} disabled={busy} onSave={(text) => run(() => api.editItem(q.id, item.id, { text }))} />
                  <div className="xsmall muted" style={{ marginTop: 2 }}>
                    {humanize(item.domain)}
                    {item.purpose && (
                      <>
                        {" · "}
                        <span style={{ color: "var(--ai)" }}>{item.purpose}</span>
                      </>
                    )}
                  </div>
                </td>
                <td className="small muted nowrap">{ANSWER_LABEL[item.answer_type]}</td>
                <td>
                  <SourceChip source={item.source} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="inline-form" onSubmit={addQuestion} style={{ padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
        <input name="text" required minLength={10} placeholder="Add your own question…" className="grow" style={{ minWidth: 260 }} />
        <select name="answer_type" defaultValue="text" aria-label="Answer type">
          <option value="text">Text</option>
          <option value="yes_no">Yes / No</option>
          <option value="document">Document</option>
        </select>
        <button type="submit" disabled={busy}>
          <Icon name="plus" size={15} />
          Add question
        </button>
      </form>
      {error && (
        <div style={{ padding: "0 20px 14px" }}>
          <ErrorBanner error={error} />
        </div>
      )}
    </>
  );
}

function SendForm({ q, defaultRecipient, onSent }: { q: Questionnaire; defaultRecipient: string | null; onSent: (q: Questionnaire, link: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const included = q.items.filter((i) => i.included).length;

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const recipient = (new FormData(e.currentTarget).get("recipient") as string).trim();
    setBusy(true);
    setError(null);
    try {
      const result = await api.sendQuestionnaire(q.id, recipient || null);
      onSent(result.questionnaire, result.portal_link);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} style={{ padding: "16px 20px", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }} className="stack-sm">
      <div className="inline-form">
        <label className="row grow" style={{ minWidth: 280 }}>
          <Icon name="mail" size={15} className="muted" />
          <span className="small strong nowrap">Send to</span>
          <input name="recipient" type="email" defaultValue={defaultRecipient ?? ""} placeholder="security@vendor.com" className="grow" />
        </label>
        <button className="btn-primary" type="submit" disabled={busy || included === 0}>
          {busy ? <span className="spinner" style={{ borderTopColor: "#fff" }} /> : <Icon name="send" size={15} />}
          {busy ? "Sending…" : `Send ${included} question${included === 1 ? "" : "s"}`}
        </button>
      </div>
      <div className="xsmall muted">The vendor uses their one link (above), with no login. Reminders go out every 3 days, and the owner is alerted if it becomes overdue.</div>
      <ErrorBanner error={error} />
    </form>
  );
}

/** The vendor's one link. Created the first time it's needed, then the same for every questionnaire. */
function VendorLinkBox({ vendorId, refreshKey }: { vendorId: number; refreshKey: string }) {
  const [info, setInfo] = useState<PortalLinkInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.portalLink(vendorId).then(setInfo).catch((e: Error) => setError(e.message));
  }, [vendorId, refreshKey]);

  async function rotate() {
    if (!window.confirm("Replace the vendor's link? The old one stops working immediately, so anything you've already sent them will need the new link.")) return;
    setBusy(true);
    try {
      setInfo(await api.rotatePortalLink(vendorId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!info) return error ? <ErrorBanner error={error} /> : null;
  return (
    <div className="vlink">
      <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="row strong small">
          <Icon name="link" size={14} />
          Vendor link
        </span>
        <span className="xsmall muted">One link for this vendor, the same for every questionnaire you send. {info.questionnaire_id ? "It opens the current questionnaire." : "Nothing is open on it yet."}</span>
      </div>
      <div className="link-box">
        <a href={info.link} target="_blank" rel="noreferrer">
          {info.link}
        </a>
        <button
          className="btn-sm"
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(info.link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            })
          }
        >
          <Icon name={copied ? "check" : "copy"} size={13} />
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="link-button xsmall nowrap" type="button" onClick={rotate} disabled={busy} title="Only if the link has leaked">
          Replace link
        </button>
      </div>
      <ErrorBanner error={error} />
    </div>
  );
}

function Outbox({ messages }: { messages: OutboundMessage[] }) {
  if (messages.length === 0) return null;
  return (
    <details className="outbox">
      <summary>
        <Icon name="chevronRight" size={14} className="chev-rot" />
        <Icon name="inbox" size={15} />
        Notifications sent ({messages.length})
      </summary>
      <ul className="list">
        {messages.map((m) => (
          <li key={m.id} className="list-item" style={{ alignItems: "flex-start" }}>
            <span className={`kpi-icon ${m.error ? "critical" : ""}`} style={{ width: 28, height: 28 }}>
              <Icon name={m.internal ? "bell" : "mail"} size={14} />
            </span>
            <div className="grow">
              <div className="row-wrap">
                <span className="strong">{humanize(m.kind)}</span>
                <span className="muted small">→ {m.recipient}</span>
                {m.internal && <span className="chip">Internal</span>}
              </div>
              <div className="small" style={{ color: "var(--ink-2)" }}>
                {m.subject}
              </div>
              <div className="xsmall muted">
                {formatDate(m.created_at)} · {m.error ? <span className="bad">failed: {m.error}</span> : `delivered via ${m.channel}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function QuestionnairePanel({ vendorId, vendorContact, refreshKey, hasAssessment }: {
  vendorId: number;
  vendorContact: string | null;
  refreshKey: string;
  /** A scored assessment exists, so a gap questionnaire can be drafted from its unevidenced controls. */
  hasAssessment: boolean;
}) {
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [messages, setMessages] = useState<OutboundMessage[]>([]);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.questionnaires(vendorId), api.messages(vendorId)])
      .then(([q, m]) => {
        setQuestionnaires(q);
        setMessages(m);
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));
  }, [vendorId]);

  useEffect(load, [load, refreshKey]);

  const current = questionnaires[0];
  useEffect(() => {
    if (current?.status !== "drafting") return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [current?.status, load]);

  function replace(q: Questionnaire) {
    setQuestionnaires((prev) => prev.map((p) => (p.id === q.id ? q : p)));
  }

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canDraft = !current || !OPEN.has(current.status);
  const pct = current && current.total ? Math.round((current.answered / current.total) * 100) : 0;

  return (
    <Card
      title="Vendor questionnaire"
      icon="mail"
      subtitle="Documents first, questions second: the vendor is only asked what their documents can't answer"
      flush
      actions={
        <>
          {current && OPEN.has(current.status) && current.status !== "drafting" && (
            <button className="btn-sm btn-ghost" onClick={() => act(() => api.cancelQuestionnaire(current.id))} disabled={busy}>
              Cancel questionnaire
            </button>
          )}
          {canDraft && hasAssessment && (
            <button className="btn-primary btn-sm" onClick={() => act(() => api.draftQuestionnaire(vendorId))} disabled={busy}>
              <Icon name="sparkles" size={14} />
              Draft gap questionnaire
            </button>
          )}
        </>
      }
    >
      {error && (
        <div style={{ padding: "0 20px 12px" }}>
          <ErrorBanner error={error} />
        </div>
      )}
      {!loaded && !error && (
        <div style={{ padding: "0 20px 16px" }}>
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      )}
      {loaded && (
        <div style={{ padding: "0 20px 14px" }}>
          <VendorLinkBox vendorId={vendorId} refreshKey={`${current?.id}-${current?.status}`} />
        </div>
      )}
      {loaded && canDraft && (
        <div style={{ padding: current ? "0 20px 14px" : "0 20px 16px" }}>
          <Callout tone="info" icon="checklist" title={hasAssessment ? "Gap questionnaire" : "Documents come first"}>
            {hasAssessment
              ? "It asks only the Tekion questions the documents on file left unanswered, plus targeted questions for open findings. It's drafted automatically when the vendor can't provide a requested document or the document request goes overdue."
              : "The questionnaire only goes to the vendor for what their documents can't answer. Send the document request under Evidence; once an assessment has run, the gap questionnaire is drafted from the checklist controls the evidence leaves unanswered."}
            {!hasAssessment && (
              <div style={{ marginTop: 8 }}>
                <button className="btn-sm" onClick={() => act(() => api.draftQuestionnaire(vendorId, true))} disabled={busy}>
                  Draft the generic onboarding questionnaire instead
                </button>
              </div>
            )}
          </Callout>
        </div>
      )}
      {current && (
        <>
          <div className="q-stats" style={{ padding: "4px 20px 16px" }}>
            <div className="q-stat">
              <span className="label">Status</span>
              <span className="value">
                <StatusPill status={current.overdue ? "overdue" : current.status} />
              </span>
            </div>
            <div className="q-stat">
              <span className="label">Type · scope</span>
              <span className="value">
                {humanize(current.kind)} <TierBadge tier={current.scoped_tier} />
              </span>
            </div>
            <div className="q-stat">
              <span className="label">Responses</span>
              <span className="value tabular">
                {current.status === "draft" || current.status === "drafting" ? (
                  <span className="muted">Not sent</span>
                ) : (
                  <>
                    {current.answered}/{current.total} <span className="muted small">({pct}%)</span>
                  </>
                )}
              </span>
              {current.sent_at && (
                <div className="progress">
                  <span style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
            <div className="q-stat">
              <span className="label">Due</span>
              <span className="value">
                {current.due_at ? (
                  <>
                    <span className={current.overdue ? "bad" : ""}>{formatDay(current.due_at)}</span>
                    <span className="xsmall muted">
                      {current.reminders_sent} reminder{current.reminders_sent === 1 ? "" : "s"}
                    </span>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
            </div>
          </div>
          {current.sent_at && (
            <div className="xsmall muted row" style={{ padding: "0 20px 14px" }}>
              <Icon name="send" size={12} />
              Sent to {current.sent_to} {timeAgo(current.sent_at)}
              {current.submitted_at && ` · submitted ${timeAgo(current.submitted_at)}`}
            </div>
          )}

          {current.status === "drafting" && (
            <div style={{ padding: "0 20px 16px" }}>
              <Callout tone="ai" icon="sparkles" title="Building the question set…">
                <div className="row">
                  <span className="spinner ai" />
                  Selecting library questions for this tier and drafting targeted questions from open findings.
                </div>
              </Callout>
            </div>
          )}
          {current.status === "failed" && (
            <div style={{ padding: "0 20px 16px" }}>
              <Callout tone="danger" title="Drafting failed">
                {current.error}
              </Callout>
            </div>
          )}
          {sentNote && (
            <div style={{ padding: "0 20px 16px" }}>
              <Callout tone="success" icon="send" title="Questionnaire sent">
                {sentNote}
              </Callout>
            </div>
          )}
          {current.status === "draft" && (
            <>
              <DraftEditor q={current} onChange={replace} />
              <SendForm
                q={current}
                defaultRecipient={vendorContact}
                onSent={(q) => {
                  replace(q);
                  setSentNote(`The vendor was emailed their link. It's the same link every time, so a later questionnaire or update needs no new link.`);
                  load();
                }}
              />
            </>
          )}
          {(current.status === "sent" || current.status === "in_progress") && <LiveEditor q={current} onChange={replace} />}
          {!["drafting", "draft", "failed", "sent", "in_progress"].includes(current.status) && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Question</th>
                    <th style={{ width: "38%" }}>Vendor answer</th>
                  </tr>
                </thead>
                <tbody>
                  {current.items
                    .filter((i) => i.included)
                    .map((item, index) => (
                      <tr key={item.id} style={{ verticalAlign: "top" }}>
                        {/* Same numbering the vendor saw in the portal. */}
                        <td className="num muted" style={{ verticalAlign: "top" }}>
                          {index + 1}
                        </td>
                        <td style={{ verticalAlign: "top" }}>
                          <div style={{ fontWeight: 520 }}>{item.text}</div>
                          <div className="row" style={{ marginTop: 4, gap: 6 }}>
                            <SourceChip source={item.source} />
                            <span className="xsmall muted">{humanize(item.domain)}</span>
                          </div>
                        </td>
                        <td style={{ verticalAlign: "top" }}>
                          <Answer item={item} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <Outbox messages={messages} />
    </Card>
  );
}
