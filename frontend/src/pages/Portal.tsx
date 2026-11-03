import { useEffect, useRef, useState } from "react";
import { ApiError, portal, type PortalItem, type PortalView } from "../api";
import { BrandMark, Callout, ErrorBanner, Icon, formatDate } from "../ui";

const isAnswered = (i: PortalItem) => Boolean(i.answer_type === "yes_no" ? i.answer_choice : i.answer_text || i.uploaded_filename);

function ItemForm({ token, item, disabled, onSaved }: { token: string; item: PortalItem; disabled: boolean; onSaved: (view: PortalView) => void }) {
  const [text, setText] = useState(item.answer_text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(body: { answer_choice?: string | null; answer_text?: string | null }) {
    setSaving(true);
    setError(null);
    try {
      onSaved(await portal.answer(token, item.id, { answer_choice: item.answer_choice, answer_text: text || null, ...body }));
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    setSaving(true);
    setError(null);
    try {
      onSaved(await portal.upload(token, item.id, file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const saveText = () => {
    if (text !== (item.answer_text ?? "")) save({ answer_text: text || null });
  };

  return (
    <li className={`card q-card ${isAnswered(item) ? "answered" : ""}`}>
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <span className="q-num">{isAnswered(item) ? <Icon name="check" size={14} strokeWidth={2.6} /> : item.number}</span>
        <div className="grow stack-sm">
          <div>
            <div className="q-text">{item.text}</div>
            {item.help_text && <p className="small muted" style={{ marginTop: 4 }}>{item.help_text}</p>}
          </div>

          {item.answer_type === "yes_no" && (
            <div className="seg" role="radiogroup" aria-label={`Answer to question ${item.number}`}>
              {["yes", "no", "n/a"].map((choice) => (
                <label key={choice}>
                  <input
                    type="radio"
                    name={`choice-${item.id}`}
                    value={choice}
                    checked={item.answer_choice === choice}
                    disabled={disabled || saving}
                    onChange={() => save({ answer_choice: choice })}
                  />
                  {choice === "n/a" ? "Not applicable" : choice[0].toUpperCase() + choice.slice(1)}
                </label>
              ))}
            </div>
          )}

          {item.answer_type === "document" && item.received_from && (
            <div className="callout success" style={{ padding: "10px 12px" }}>
              <Icon name="check" size={16} />
              <div className="grow small">
                <strong>We already have this</strong>
                {item.uploaded_filename ? ` (${item.uploaded_filename})` : ""}
                {item.received_from === "trust_center" ? ", from your trust portal" : ""}. You don't need to send it.
              </div>
            </div>
          )}
          {item.answer_type === "document" && !item.received_from && (
            <div className="dropzone" style={{ padding: 12 }}>
              <span className="dropzone-icon" style={{ width: 34, height: 34 }}>
                <Icon name={item.uploaded_filename ? "check" : "upload"} size={16} />
              </span>
              <div className="grow" style={{ minWidth: 200 }}>
                {item.uploaded_filename ? (
                  <div className="ok small">{item.uploaded_filename}</div>
                ) : (
                  <div className="small muted">PDF, Word, Excel or text file, up to 50 MB</div>
                )}
                <input
                  type="file"
                  accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json"
                  aria-label={`Upload document for question ${item.number}`}
                  disabled={disabled || saving}
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                  style={{ border: 0, background: "none", padding: 0, marginTop: 4 }}
                />
              </div>
            </div>
          )}

          {!(item.answer_type === "document" && item.received_from) && (
          <textarea
            rows={item.answer_type === "text" ? 3 : 2}
            value={text}
            disabled={disabled}
            aria-label={`Answer text for question ${item.number}`}
            placeholder={
              item.answer_type === "text"
                ? "Your answer"
                : item.answer_type === "document"
                  ? "Optional note — or, if you can't share the document, explain why and what you can provide instead"
                  : "Optional comment"
            }
            onChange={(e) => setText(e.target.value)}
            onBlur={saveText}
          />
          )}
          <div className="xsmall muted row" style={{ minHeight: 16 }}>
            {saving && (
              <>
                <span className="spinner" style={{ width: 11, height: 11 }} /> Saving…
              </>
            )}
            {saved && !saving && (
              <span className="ok row" style={{ gap: 4 }}>
                <Icon name="check" size={12} /> Saved
              </span>
            )}
          </div>
          <ErrorBanner error={error} />
        </div>
      </div>
    </li>
  );
}

export function Portal({ token }: { token: string }) {
  const [view, setView] = useState<PortalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [updated, setUpdated] = useState(false);
  const current = useRef<PortalView | null>(null);
  current.current = view;

  useEffect(() => {
    portal
      .read(token)
      .then(setView)
      .catch((e: ApiError) => setError(e.status === 404 || e.status === 410 ? "This link is invalid or no longer active." : e.message));
  }, [token]);

  // Live: the questionnaire follows the owner's edits (and documents we receive elsewhere) without a reload.
  // Answers are saved as they're given, so taking the server's copy never loses anything.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      portal
        .read(token)
        .then((next) => {
          const prev = current.current;
          if (!prev) return;
          const shape = (v: PortalView) => JSON.stringify([v.state, v.revision, v.items.map((i) => [i.id, i.text, i.help_text, i.received_from, i.uploaded_filename])]);
          if (shape(next) === shape(prev)) return;
          if (next.revision !== prev.revision && prev.state !== "idle") {
            setUpdated(true);
            setTimeout(() => setUpdated(false), 8000);
          }
          setView(next);
        })
        .catch(() => undefined); // a blip shouldn't replace the page with an error
    }, 15000);
    return () => clearInterval(timer);
  }, [token]);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      setView(await portal.submit(token));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const answered = view?.items.filter(isAnswered).length ?? 0;
  const total = view?.items.length ?? 0;
  const readOnly = view?.state !== "open";
  const idle = view?.state === "idle";
  const pct = total ? Math.round((answered / total) * 100) : 0;

  return (
    <div className="portal">
      <header className="portal-header">
        <div className="portal-header-inner">
          <span className="brand-mark" style={{ width: 30, height: 30, borderRadius: 8 }}>
            <BrandMark size={16} />
          </span>
          <span className="strong">{view?.org_name ?? "Vendor"} · Vendor trust portal</span>
          <span className="pill" style={{ marginLeft: "auto" }}>
            <Icon name="lock" size={12} />
            Secure link · no account needed
          </span>
        </div>
      </header>

      <section className="portal-hero">
        <div className="portal-hero-inner">
          <div className="row" style={{ color: "#a5b4fc", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            <Icon name="shieldCheck" size={15} />
            Security & privacy questionnaire
          </div>
          <h1>{view ? `${view.vendor_name}` : error ? "Link unavailable" : "Loading…"}</h1>
          {view && !idle && (
            <p>
              {view.org_name} is reviewing <strong style={{ color: "#fff" }}>{view.vendor_name}</strong> as a vendor.
              {view.due_at && !readOnly && ` Please complete this by ${formatDate(view.due_at)}.`} Answers save automatically as you go.
            </p>
          )}
          {view && idle && (
            <p>
              {view.org_name} is reviewing <strong style={{ color: "#fff" }}>{view.vendor_name}</strong> as a vendor. Keep this link: any questionnaire or document request
              {` ${view.org_name}`} sends you appears here, on this same link.
            </p>
          )}
        </div>
      </section>

      <div className="portal-body">
        {error && (
          <div className="card" style={{ padding: 20 }}>
            <ErrorBanner error={error} />
          </div>
        )}
        {!view && !error && <div className="card skeleton" style={{ height: 240 }} />}
        {view && (
          <>
            {view.state === "submitted" && (
              <Callout tone="success" title={`Submitted ${view.submitted_at ? formatDate(view.submitted_at) : ""}`}>
                Thank you — the {view.org_name} risk team will follow up if anything else is needed.
              </Callout>
            )}
            {view.state === "closed" && <Callout tone="warning" title="This questionnaire is closed">No further changes can be made.</Callout>}
            {idle && (
              <Callout tone="info" title="Nothing for you to answer right now">
                There's no open questionnaire or document request. You'll get an email when there is, and it will show up on this page.
              </Callout>
            )}
            {updated && (
              <Callout tone="info" icon="refresh" title={`${view.org_name} updated this questionnaire`}>
                Your earlier answers are kept. Some questions may be new or reworded.
              </Callout>
            )}
            {!idle && (
            <section className="card portal-progress">
              <div className="row-between">
                <span className="strong">
                  {answered} of {total} answered
                </span>
                <span className="small muted tabular">{pct}%</span>
              </div>
              <div className="progress">
                <span style={{ width: `${pct}%` }} />
              </div>
            </section>
            )}
            <ol className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {view.items.map((item) => (
                <ItemForm key={item.id} token={token} item={item} disabled={readOnly} onSaved={setView} />
              ))}
            </ol>
          </>
        )}
      </div>

      {view && !readOnly && (
        <div className="submit-bar">
          <div className="submit-bar-inner">
            <div className="grow">
              <div className="strong small">
                {answered === total ? "All questions answered" : `${total - answered} question${total - answered === 1 ? "" : "s"} remaining`}
              </div>
              <div className="xsmall muted">Submitting sends your answers to the {view.org_name} risk team.</div>
            </div>
            <ErrorBanner error={submitError} />
            <button className="btn-primary btn-lg" onClick={submit} disabled={submitting}>
              {submitting ? <span className="spinner" style={{ borderTopColor: "#fff" }} /> : <Icon name="send" size={16} />}
              {submitting ? "Submitting…" : "Submit answers"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
