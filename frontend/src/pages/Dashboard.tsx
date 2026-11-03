import { useEffect, useState, type ReactNode } from "react";
import { api, type AuditEvent, type Dashboard as DashboardData, type PendingItem, type Tier, type VendorSummary } from "../api";
import {
  Avatar,
  Card,
  Empty,
  ErrorBanner,
  Icon,
  LoadingPage,
  Meter,
  PEOPLE,
  PageHeader,
  StatusPill,
  TierBadge,
  TierShape,
  describeAction,
  displayName,
  formatDay,
  humanize,
  statusLabel,
  tierLabel,
  timeAgo,
} from "../ui";
import { MONITOR_SOURCE } from "./MonitoringPanel";

const TIER_RANK: Record<Tier, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Kpi({ label, value, unit, tone, foot }: { label: string; value: ReactNode; unit?: string; tone?: string; foot: ReactNode }) {
  return (
    <section className={`card kpi tone-${tone ?? "accent"}`}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      <div className="kpi-foot">{foot}</div>
    </section>
  );
}

function Distribution({ byTier, total }: { byTier: Record<Tier, number>; total: number }) {
  const order: Tier[] = ["low", "medium", "high", "critical"];
  return (
    <div>
      {total === 0 ? (
        <div className="dist-empty" />
      ) : (
        <div className="dist-bar" role="img" aria-label={order.map((t) => `${tierLabel(t)} ${byTier[t]}`).join(", ")}>
          {order
            .filter((t) => byTier[t] > 0)
            .map((t) => (
              <div key={t} className={`dist-seg ${t}`} style={{ flex: byTier[t] }}>
                <span className="tooltip">
                  {tierLabel(t)} · {byTier[t]} vendor{byTier[t] === 1 ? "" : "s"} · {Math.round((byTier[t] / total) * 100)}%
                </span>
              </div>
            ))}
        </div>
      )}
      <div className="dist-legend">
        {order.map((t) => (
          <div className={`dist-item ${t}`} key={t}>
            <div className="label">
              <TierShape tier={t} />
              {tierLabel(t)}
            </div>
            <div className="value">
              {byTier[t]}
              <span className="pct">{total ? Math.round((byTier[t] / total) * 100) : 0}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBreakdown({ byStatus }: { byStatus: Record<string, number> }) {
  const entries = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  if (entries.length === 0) return <p className="muted small">No vendors yet.</p>;
  return (
    <div className="status-list">
      {entries.map(([status, n]) => (
        <div className="status-row" key={status}>
          <span className="truncate">{statusLabel(status)}</span>
          <div className="bar" title={`${statusLabel(status)}: ${n}`}>
            <span style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <span className="num strong">{n}</span>
        </div>
      ))}
    </div>
  );
}

function QueueGroup({ title, items, mine, empty, render }: {
  title: string;
  items: unknown[];
  mine?: boolean;
  empty: string;
  render: () => ReactNode;
}) {
  return (
    <div className="queue-group">
      <div className={`queue-head ${mine ? "mine" : ""}`}>
        {mine && <Icon name="target" size={13} />}
        {title}
        {mine && <span className="chip" style={{ textTransform: "none", letterSpacing: 0 }}>Your queue</span>}
        <span className="count">{items.length}</span>
      </div>
      {items.length === 0 ? <div className="queue-empty">{empty}</div> : <ul className="list">{render()}</ul>}
    </div>
  );
}

function PendingRow({ item, hint }: { item: PendingItem; hint: string }) {
  return (
    <li>
      <a className="list-item" href={`#/vendors/${item.vendor_id}`}>
        <Avatar name={item.vendor_name} size="sm" />
        <div className="grow">
          <div className="strong truncate">{item.vendor_name}</div>
          <div className="xsmall muted">
            {hint} · {timeAgo(item.since)}
          </div>
        </div>
        <TierBadge tier={item.tier} />
        <Icon name="chevronRight" size={15} className="chev" />
      </a>
    </li>
  );
}

function ActorAvatar({ e }: { e: AuditEvent }) {
  const kind = e.actor_type === "agent" ? "agent" : e.actor_type === "system" ? "system" : "user";
  return <Avatar name={displayName(e.actor)} size="sm" round kind={kind} />;
}

export function ActivityItem({ e, showEntity = true }: { e: AuditEvent; showEntity?: boolean }) {
  return (
    <li className="tl-item">
      <ActorAvatar e={e} />
      <div className="tl-body">
        <div className="tl-text">
          <span className="actor">{e.actor_type === "user" ? displayName(e.actor) : e.actor}</span> {describeAction(e.action)}
        </div>
        <div className="tl-meta">
          <span title={new Date(e.occurred_at).toLocaleString()}>{timeAgo(e.occurred_at)}</span>
          {showEntity &&
            (e.entity_type === "vendor" ? (
              <a href={`#/vendors/${e.entity_id}`}>Vendor #{e.entity_id}</a>
            ) : (
              <span>
                {humanize(e.entity_type)} #{e.entity_id}
              </span>
            ))}
          <span className="hash" title={e.hash}>
            {e.hash.slice(0, 10)}
          </span>
        </div>
      </div>
    </li>
  );
}

export function Dashboard({ user }: { user: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [chain, setChain] = useState<{ valid: boolean; events_checked: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.dashboard(), api.vendors(), api.verifyAudit()])
      .then(([d, v, c]) => {
        setData(d);
        setVendors(v);
        setChain(c);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <ErrorBanner error={error} />;
  if (!data) return <LoadingPage />;

  const total = data.vendor_count;
  const elevated = data.by_tier.high + data.by_tier.critical;
  const assessed = vendors.filter((v) => v.latest_assessment_id).length;
  const decisions = data.awaiting_review.length + data.awaiting_signoff.length;
  const overdue = data.open_questionnaires.filter((q) => q.overdue).length;
  const register = [...vendors].sort((a, b) => TIER_RANK[a.current_tier] - TIER_RANK[b.current_tier] || b.inherent_score - a.inherent_score).slice(0, 6);
  const person = PEOPLE[user];
  const isApprover = user === "sam.approver";
  const vendorName = (id: number) => vendors.find((v) => v.id === id)?.name ?? `Vendor #${id}`;

  return (
    <div className="stack">
      <PageHeader
        eyebrow={
          <>
            <Icon name="sparkles" size={13} />
            {greeting()}, {person?.name ?? user} · {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </>
        }
        title="Third-party risk overview"
        sub={`Risk posture across ${total} vendor${total === 1 ? "" : "s"}, the decisions waiting on people, and outstanding vendor follow-ups.`}
        actions={
          <a className="btn" href="#/vendors">
            <Icon name="building" size={15} />
            Vendor inventory
          </a>
        }
      />

      <div className="grid cols-4">
        <Kpi
          label="Vendors in inventory"
          value={total}
          foot={
            <>
              <Icon name="sparkles" size={13} />
              {assessed} assessed by AI agents
            </>
          }
        />
        <Kpi
          label="High & critical exposure"
          value={elevated}
          unit={total ? `${Math.round((elevated / total) * 100)}%` : undefined}
          tone="critical"
          foot={
            <>
              <TierShape tier="critical" /> {data.by_tier.critical} critical
              <span className="subtle">·</span>
              <TierShape tier="high" /> {data.by_tier.high} high
            </>
          }
        />
        <Kpi
          label="Decisions awaiting people"
          value={decisions}
          tone="ai"
          foot={
            <>
              {data.awaiting_review.length} analyst review · {data.awaiting_signoff.length} approver sign-off
            </>
          }
        />
        <Kpi
          label="Vendor follow-ups open"
          value={data.open_questionnaires.length}
          tone="warning"
          foot={
            <>
              {overdue > 0 ? <span className="bad">{overdue} overdue</span> : "None overdue"} · {data.expiring_acceptances.length} acceptance
              {data.expiring_acceptances.length === 1 ? "" : "s"} expiring
            </>
          }
        />
      </div>

      <div className="grid split-wide">
        <Card title="Portfolio risk distribution" icon="chart" subtitle="Current tier per vendor — final decision where reviewed, otherwise the computed tier">
          <Distribution byTier={data.by_tier} total={total} />
          <div className="section-title" style={{ margin: "24px 0 12px" }}>
            Vendors by workflow stage
          </div>
          <StatusBreakdown byStatus={data.by_status} />
        </Card>

        <Card title="Action center" icon="bell" subtitle="Human-in-the-loop gates and time-bound follow-ups" flush>
          <QueueGroup
            title="Awaiting analyst review"
            items={data.awaiting_review}
            mine={user === "priya.analyst"}
            empty="Nothing waiting on analysts."
            render={() => data.awaiting_review.map((i) => <PendingRow key={i.assessment_id} item={i} hint="AI assessment complete" />)}
          />
          <QueueGroup
            title="Awaiting approver sign-off"
            items={data.awaiting_signoff}
            mine={isApprover}
            empty="Nothing waiting on approvers."
            render={() => data.awaiting_signoff.map((i) => <PendingRow key={i.assessment_id} item={i} hint="Analyst reviewed" />)}
          />
          <QueueGroup
            title="Needs re-review"
            items={data.needs_rereview}
            empty="Nothing needs re-review."
            render={() => data.needs_rereview.map((i) => <PendingRow key={i.assessment_id} item={i} hint="Expired acceptance or monitoring alert" />)}
          />
          <QueueGroup
            title="Acceptances expiring ≤ 30 days"
            items={data.expiring_acceptances}
            empty="No acceptances expiring soon."
            render={() =>
              data.expiring_acceptances.map((ra) => (
                <li key={ra.id}>
                  <a className="list-item" href={`#/vendors/${ra.vendor_id}`}>
                    <Avatar name={vendorName(ra.vendor_id)} size="sm" />
                    <div className="grow">
                      <div className="strong truncate">{vendorName(ra.vendor_id)}</div>
                      <div className="xsmall muted">Accepted by {displayName(ra.accepted_by)}</div>
                    </div>
                    <span className={`pill ${ra.status === "expired" || ra.days_remaining <= 7 ? "tone-danger" : "tone-warning"}`}>
                      <Icon name="clock" size={12} />
                      {ra.status === "expired" ? "Expired" : `${ra.days_remaining}d left`}
                    </span>
                    <Icon name="chevronRight" size={15} className="chev" />
                  </a>
                </li>
              ))
            }
          />
        </Card>
      </div>

      <Card
        title="Vendor risk register"
        icon="building"
        subtitle="Highest-risk vendors first"
        flush
        actions={
          <a className="btn btn-sm btn-ghost" href="#/vendors">
            View all {total}
            <Icon name="chevronRight" size={14} />
          </a>
        }
      >
        {register.length === 0 ? (
          <Empty icon="building" title="No vendors yet">
            <a href="#/vendors/new">Submit the first vendor request</a> to see the register fill in.
          </Empty>
        ) : (
          <VendorTable vendors={register} />
        )}
      </Card>

      <div className="grid split-wide">
        <Card title="Live activity" icon="activity" subtitle="Every user, agent and system action, hash-chained" actions={<span className="pill tone-info"><span className="dot" />Live</span>}>
          {data.recent_activity.length === 0 ? (
            <Empty icon="activity" title="No activity yet" />
          ) : (
            <ul className="timeline">
              {data.recent_activity.slice(0, 9).map((e) => (
                <ActivityItem key={e.id} e={e} />
              ))}
            </ul>
          )}
        </Card>

        <div className="stack">
          <Card
            title="Continuous monitoring"
            icon="radar"
            subtitle="New alerts on approved vendors"
            flush
            actions={data.monitoring_alerts.length > 0 ? <span className="pill tone-danger">{data.monitoring_alerts.length} new</span> : undefined}
          >
            {data.monitoring_alerts.length === 0 ? (
              <Empty icon="shieldCheck" title="No new monitoring alerts">
                News, exploited vulnerabilities, trust-centre changes, SOC 2 expiry and signal drift are watched on each tier's cadence.
              </Empty>
            ) : (
              <ul className="list">
                {data.monitoring_alerts.slice(0, 6).map((m) => {
                  const [label, icon] = MONITOR_SOURCE[m.source] ?? [humanize(m.source), "activity"];
                  return (
                    <li key={m.id}>
                      <a className="list-item" href={`#/vendors/${m.vendor_id}`} style={{ alignItems: "flex-start" }}>
                        <span className="kpi-icon critical" style={{ width: 28, height: 28 }}>
                          <Icon name={icon} size={14} />
                        </span>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="strong truncate">{m.title}</div>
                          <div className="xsmall muted">
                            {m.vendor_name} · {label} · {timeAgo(m.detected_at)}
                          </div>
                        </div>
                        <TierBadge tier={m.severity} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Vendor questionnaires" icon="mail" subtitle="Out with vendors, with automated reminders" flush>
            {data.open_questionnaires.length === 0 ? (
              <Empty icon="mail" title="No questionnaires out">
                Draft one from a vendor's workspace.
              </Empty>
            ) : (
              <ul className="list">
                {data.open_questionnaires.map((q) => (
                  <li key={q.questionnaire_id}>
                    <a className="list-item" href={`#/vendors/${q.vendor_id}`} style={{ alignItems: "flex-start" }}>
                      <Avatar name={q.vendor_name} size="sm" />
                      <div className="grow stack-xs">
                        <div className="row-between">
                          <span className="strong truncate">{q.vendor_name}</span>
                          <StatusPill status={q.overdue ? "overdue" : q.status} />
                        </div>
                        {q.sent_at ? (
                          <>
                            <div className="progress" aria-label={`${q.answered} of ${q.total} answered`}>
                              <span style={{ width: `${q.total ? (q.answered / q.total) * 100 : 0}%` }} />
                            </div>
                            <div className="xsmall muted">
                              {q.answered}/{q.total} answered · due {q.due_at ? formatDay(q.due_at) : "—"} · {q.reminders_sent} reminder
                              {q.reminders_sent === 1 ? "" : "s"}
                            </div>
                          </>
                        ) : (
                          <div className="xsmall muted">Draft — not sent yet</div>
                        )}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Assurance" icon="shieldCheck">
            <div className="stack-sm">
              <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                <span className={`kpi-icon ${chain?.valid === false ? "critical" : "good"}`}>
                  <Icon name={chain?.valid === false ? "alert" : "hash"} size={16} />
                </span>
                <div>
                  <div className="strong">{chain ? (chain.valid ? "Audit hash chain intact" : "Audit hash chain broken") : "Verifying audit chain…"}</div>
                  <div className="small muted">{chain ? `${chain.events_checked.toLocaleString()} events re-verified just now` : ""}</div>
                </div>
              </div>
              <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                <span className="kpi-icon">
                  <Icon name="users" size={16} />
                </span>
                <div>
                  <div className="strong">People decide, agents advise</div>
                  <div className="small muted">High and critical vendors need sign-off from a second, independent approver.</div>
                </div>
              </div>
              <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                <span className="kpi-icon ai">
                  <Icon name="file" size={16} />
                </span>
                <div>
                  <div className="strong">Citations verified against the source</div>
                  <div className="small muted">Every agent quote is matched back to the document page; unmatched quotes are flagged and down-weighted.</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function VendorTable({ vendors }: { vendors: VendorSummary[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Category</th>
            <th>Business owner</th>
            <th style={{ width: 180 }}>Inherent risk</th>
            <th>Current tier</th>
            <th>Workflow stage</th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id} className="clickable" onClick={() => (window.location.hash = `#/vendors/${v.id}`)}>
              <td>
                <div className="cell-entity">
                  <Avatar name={v.name} />
                  <div style={{ minWidth: 0 }}>
                    <a className="name" href={`#/vendors/${v.id}`} onClick={(e) => e.stopPropagation()}>
                      {v.name}
                    </a>
                    <div className="meta">{v.domain ?? "No website on record"}</div>
                  </div>
                </div>
              </td>
              <td className="muted">{humanize(v.category)}</td>
              <td>
                <div className="row">
                  <Avatar name={displayName(v.business_owner)} size="sm" round />
                  {displayName(v.business_owner)}
                </div>
              </td>
              <td>
                <Meter value={v.inherent_score} tier={v.inherent_tier} />
              </td>
              <td>
                <TierBadge tier={v.current_tier} />
              </td>
              <td>
                <StatusPill status={v.status} />
              </td>
              <td className="num">
                <Icon name="chevronRight" size={15} className="subtle" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

