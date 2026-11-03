import { useEffect, useState, type FormEvent } from "react";
import { api, type EvidenceStatus, type EvidenceStep, type TrustPortal, type TrustPortalStatus } from "../api";
import { Callout, Card, ErrorBanner, Icon, formatDate, humanize, timeAgo } from "../ui";

type Tone = "good" | "warning" | "danger" | "neutral" | "info";

const PORTAL_STATUS: Record<TrustPortalStatus, [string, Tone, string]> = {
  no_portal: ["No portal", "neutral", "globe"],
  not_requested: ["Not requested", "neutral", "lock"],
  submitting: ["Raising request…", "info", "send"],
  awaiting_captcha: ["Needs a code from you", "warning", "alert"],
  submitted: ["Waiting for access", "warning", "clock"],
  access_granted: ["Access granted", "good", "check"],
  needs_manual: ["Needs a person", "danger", "alert"],
  failed: ["Failed", "danger", "x"],
};

const MARK: Record<EvidenceStep["state"], string> = { done: "done", active: "active", waiting: "waiting", todo: "todo", attention: "attention" };

function StepMark({ state }: { state: EvidenceStep["state"] }) {
  return (
    <span className={`ev-mark ${MARK[state]}`} aria-hidden>
      {state === "done" && <Icon name="check" size={13} strokeWidth={2.8} />}
      {state === "active" && <span className="spinner" style={{ width: 12, height: 12 }} />}
      {state === "waiting" && <Icon name="clock" size={13} />}
      {state === "attention" && <Icon name="alert" size={13} />}
    </span>
  );
}

const STATE_WORD: Record<EvidenceStep["state"], string> = {
  done: "Done",
  active: "In progress",
  waiting: "Waiting",
  todo: "To do",
  attention: "Needs attention",
};

function inFuture(iso: string | null) {
  return iso ? new Date(iso).getTime() > Date.now() : false;
}

/** The portal's security code, relayed to a person: they read the picture and type it, and the held browser submits. */
function CaptchaPrompt({ vendorId, attempt, onDone }: { vendorId: number; attempt: number; onDone: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setSrc(null);
    setCode("");
    api
      .portalCaptchaImage(vendorId)
      .then((bytes) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        setSrc(url);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [vendorId, attempt]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="captcha-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) act(() => api.answerPortalCaptcha(vendorId, code.trim()));
      }}
    >
      <div className="strong small">The portal asks for a security code</div>
      <p className="xsmall muted" style={{ margin: "2px 0 8px" }}>
        It needs a person to read it. Type what the picture shows; the request is submitted straight away.
        {attempt > 1 && " The last code wasn't accepted, so this is a new one."} The browser is being held open for you, so this expires in a few minutes.
      </p>
      {src ? (
        <img className="captcha-img" src={src} alt="The portal's security code. Type the characters it shows." />
      ) : (
        <div className="skeleton" style={{ height: 90, maxWidth: 360 }} />
      )}
      <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
        <label className="grow" style={{ minWidth: 180, maxWidth: 260 }}>
          <span className="sr-only">Security code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={32}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Code from the picture"
            aria-label="Security code"
          />
        </label>
        <button className="btn-primary btn-sm" type="submit" disabled={busy || !src || !code.trim()}>
          {busy ? <span className="spinner" style={{ borderTopColor: "#fff", width: 12, height: 12 }} /> : <Icon name="send" size={13} />}
          Submit request
        </button>
        <button className="btn-sm btn-ghost" type="button" disabled={busy} onClick={() => act(() => api.skipPortalCaptcha(vendorId))}>
          I'll do it myself
        </button>
      </div>
      <div role="alert">
        <ErrorBanner error={error} />
      </div>
    </form>
  );
}

/** The vendor's trust portal: its link, the access request we raised on it, and when it is next checked. */
function PortalBox({ vendorId, portal, onChange }: { vendorId: number; portal: TrustPortal; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [label, tone, icon] = PORTAL_STATUS[portal.status];

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = ((new FormData(e.currentTarget).get("url") as string) || "").trim();
    act(() => api.setTrustPortal(vendorId, url || null));
  }

  const canRaise = portal.url && portal.enabled && ["not_requested", "needs_manual", "failed"].includes(portal.status);
  const canCheck = portal.url && ["submitted", "access_granted", "needs_manual", "failed"].includes(portal.status) && portal.status !== "submitting";
  const polling = (portal.status === "submitted" || portal.status === "access_granted") && portal.next_check_at;

  return (
    <div className="portal-box">
      <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <Icon name="lock" size={15} />
          <span className="strong">Trust portal</span>
          <span className={`pill tone-${tone}`}>
            <Icon name={icon} size={12} />
            {label}
          </span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {canRaise && (
            <button className="btn-primary btn-sm" onClick={() => act(() => api.requestPortalAccess(vendorId))} disabled={busy}>
              <Icon name="send" size={13} />
              {portal.status === "not_requested" ? "Raise access request" : "Try again"}
            </button>
          )}
          {portal.url && portal.enabled && ["not_requested", "needs_manual", "failed"].includes(portal.status) && (
            <button className="btn-sm" onClick={() => act(() => api.requestPortalAccess(vendorId, { manual: true }))} disabled={busy} title="You submitted the form on the portal yourself; start checking for access">
              <Icon name="check" size={13} />
              I submitted it myself
            </button>
          )}
          {canCheck && (
            <button className="btn-sm" onClick={() => act(() => api.checkPortalNow(vendorId))} disabled={busy}>
              {busy ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Icon name="refresh" size={13} />}
              Check now
            </button>
          )}
        </div>
      </div>

      {!editing && portal.url ? (
        <div className="link-box" style={{ fontFamily: "var(--font)", marginTop: 10 }}>
          <Icon name="globe" size={15} />
          <a href={portal.url} target="_blank" rel="noreferrer" className="truncate">
            {portal.url}
          </a>
          <span className="xsmall muted nowrap">{portal.source === "discovered" ? "found on the vendor's site" : "given at intake"}</span>
          <button className="link-button xsmall" onClick={() => setEditing(true)}>
            Change
          </button>
        </div>
      ) : (
        <form className="row" style={{ marginTop: 10, gap: 8 }} onSubmit={save}>
          <input name="url" defaultValue={portal.url ?? ""} inputMode="url" placeholder="https://trust.vendor.com" aria-label="Trust portal link" style={{ flex: 1 }} />
          <button className="btn-sm" type="submit" disabled={busy}>
            Save
          </button>
          {portal.url && (
            <button className="btn-sm btn-ghost" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
        </form>
      )}
      {!portal.url && <div className="xsmall muted" style={{ marginTop: 6 }}>No link yet. Re-scanning the vendor's website looks for one; or paste it here.</div>}

      {portal.status === "awaiting_captcha" && portal.captcha_pending && (
        <CaptchaPrompt vendorId={vendorId} attempt={portal.captcha_attempt} onDone={onChange} />
      )}
      {portal.detail && <p className="small" style={{ margin: "10px 0 0" }}>{portal.detail}</p>}
      <div className="xsmall muted row" style={{ marginTop: 6, flexWrap: "wrap", gap: 12 }}>
        {portal.submitted_at && <span title={formatDate(portal.submitted_at)}>Requested {timeAgo(portal.submitted_at)}</span>}
        {portal.last_checked_at && (
          <span title={formatDate(portal.last_checked_at)}>
            Checked {timeAgo(portal.last_checked_at)} ({portal.check_count}×)
          </span>
        )}
        {polling && inFuture(portal.next_check_at) && <span title={formatDate(portal.next_check_at!)}>Next check {timeAgo(portal.next_check_at!)}</span>}
        {polling && !inFuture(portal.next_check_at) && <span>Checking soon</span>}
      </div>
      {portal.requested_documents.length > 0 && (
        <div className="row-wrap" style={{ marginTop: 8, gap: 6 }}>
          {portal.requested_documents.map((d) => (
            <span key={d} className={`chip ${portal.still_gated.includes(d) ? "" : "chip-good"}`}>
              <Icon name={portal.still_gated.includes(d) ? "lock" : "check"} size={11} />
              {d}
            </span>
          ))}
        </div>
      )}
      {portal.submission && portal.submission.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button className="link-button xsmall" onClick={() => setShowSent(!showSent)}>
            {showSent ? "Hide" : portal.status === "needs_manual" || portal.status === "failed" ? "Details to enter by hand" : "What was sent to the portal"}
          </button>
          {showSent && (
            <dl className="sent-grid">
              {portal.submission.map((s, i) => (
                <div key={i}>
                  <dt>{s.label || humanize(s.field)}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
      {!portal.enabled && portal.url && (
        <div style={{ marginTop: 10 }}>
          <Callout tone="info" title="Automatic requests are off">
            Set <span className="mono">TPRA_REQUESTER_FIRST_NAME</span>, <span className="mono">TPRA_REQUESTER_LAST_NAME</span> and <span className="mono">TPRA_REQUESTER_EMAIL</span> on the server so the
            portal's request form can be filled in and submitted for you. You can still submit it by hand and press "I submitted it myself".
          </Callout>
        </div>
      )}
      <ErrorBanner error={error} />
    </div>
  );
}

/** Start without all the evidence: a reason is required and goes in the audit log. */
function StartAnyway({ onStart, starting }: { onStart: (reason: string) => void; starting: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button className="link-button small" onClick={() => setOpen(true)}>
        Start anyway…
      </button>
    );
  }
  return (
    <form
      className="stack-sm"
      style={{ marginTop: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        onStart(reason.trim());
      }}
    >
      <label className="field">
        <span className="field-label">Why start before the evidence is in?</span>
        <textarea rows={2} value={reason} minLength={10} maxLength={2000} required onChange={(e) => setReason(e.target.value)} placeholder="e.g. The vendor confirmed it has no pentest; assess on what we have." />
        <span className="field-hint">Recorded in the audit trail with what was still outstanding.</span>
      </label>
      <div className="row">
        <button className="btn-sm btn-primary" type="submit" disabled={starting || reason.trim().length < 10}>
          Start without all evidence
        </button>
        <button className="btn-sm btn-ghost" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** What has been collected, what is still owed, and who is working on it. The AI assessment starts when it's all in. */
export function EvidenceStatusPanel({ vendorId, status, onChange, onStartAnyway, starting }: {
  vendorId: number;
  status: EvidenceStatus;
  onChange: () => void;
  onStartAnyway: (reason: string) => void;
  starting: boolean;
}) {
  const c = status.counts;
  return (
    <Card
      title="Evidence collection"
      icon="layers"
      subtitle="The AI assessment starts once the evidence is in. This updates by itself."
      actions={
        <span className={`pill tone-${status.ready ? "good" : "warning"}`}>
          <Icon name={status.ready ? "check" : "clock"} size={12} />
          {status.ready ? "Ready to assess" : "Gathering evidence"}
        </span>
      }
    >
      <div className="stack">
        <div className="tiles">
          {([
            [c.received, "Required on file", "tile-good"],
            [c.remaining, "Still owed", c.remaining ? "tile-bad" : "tile-good"],
            [c.waived, "Explained by vendor", "tile-info"],
            [c.processing, "Being read", "tile-warn"],
          ] as const).map(([n, l, cls]) => (
            <div key={l} className={`tile ${cls}`}>
              <span className="n">{n}</span>
              <span className="l">{l}</span>
            </div>
          ))}
        </div>

        <ol className="ev-steps">
          {status.steps.map((s) => (
            <li key={s.id} className={`ev-step ${s.state}`}>
              <StepMark state={s.state} />
              <div className="grow">
                <div className="strong small">
                  {s.title} <span className="sr-only">{STATE_WORD[s.state]}</span>
                </div>
                <div className="xsmall muted">{s.detail}</div>
              </div>
            </li>
          ))}
        </ol>

        <PortalBox vendorId={vendorId} portal={status.trust_portal} onChange={onChange} />

        {status.ready ? (
          <Callout tone="success" title="All the evidence is in">
            The AI assessment can start. Every control is checked against what's on file.
          </Callout>
        ) : (
          <Callout tone="warning" icon="clock" title="The AI assessment is waiting for">
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {status.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <StartAnyway onStart={onStartAnyway} starting={starting} />
          </Callout>
        )}
      </div>
    </Card>
  );
}
