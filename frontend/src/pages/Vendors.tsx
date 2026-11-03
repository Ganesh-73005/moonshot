import { useEffect, useMemo, useState } from "react";
import { api, type Tier, type VendorSummary } from "../api";
import { Card, Empty, ErrorBanner, Icon, LoadingPage, PageHeader, TIERS, TierShape, humanize, statusLabel, tierLabel } from "../ui";
import { VendorTable } from "./Dashboard";

const PAGE_SIZE = 10;
const TIER_RANK: Record<Tier, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function Vendors({ query }: { query: string }) {
  const [vendors, setVendors] = useState<VendorSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(query);
  const [tier, setTier] = useState<Tier | "all">("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("risk");
  const [page, setPage] = useState(1);
  /** Changing a filter sends the list back to its first page. */
  const setFilter = <T,>(set: (v: T) => void, v: T) => {
    set(v);
    setPage(1);
  };

  useEffect(() => {
    api.vendors().then(setVendors).catch((e: Error) => setError(e.message));
  }, []);

  const statuses = useMemo(() => [...new Set((vendors ?? []).map((v) => v.status))].sort(), [vendors]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (vendors ?? []).filter(
      (v) =>
        (tier === "all" || v.current_tier === tier) &&
        (status === "all" || v.status === status) &&
        (!needle ||
          [v.name, v.domain ?? "", humanize(v.category), v.business_owner].some((s) => s.toLowerCase().includes(needle))),
    );
    return list.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "recent"
          ? b.created_at.localeCompare(a.created_at)
          : TIER_RANK[a.current_tier] - TIER_RANK[b.current_tier] || b.inherent_score - a.inherent_score,
    );
  }, [vendors, q, tier, status, sort]);

  if (error) return <ErrorBanner error={error} />;
  if (!vendors) return <LoadingPage />;

  const count = (t: Tier) => vendors.filter((v) => v.current_tier === t).length;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const from = (current - 1) * PAGE_SIZE;
  const visible = shown.slice(from, from + PAGE_SIZE);
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - current) <= 1);

  return (
    <div className="stack">
      <PageHeader
        title="Vendor inventory"
        sub="Every third party under assessment or approved, with its current risk tier and where it sits in the workflow."
        actions={
          <a className="btn btn-primary" href="#/vendors/new">
            <Icon name="plus" size={15} />
            New vendor request
          </a>
        }
      />

      <Card flush>
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={15} />
            <input type="search" value={q} onChange={(e) => setFilter(setQ, e.target.value)} placeholder="Filter by name, domain, category, owner" aria-label="Filter vendors" />
          </div>
          <div className="sev-summary" role="group" aria-label="Filter by tier">
            <button className={`sev-chip ${tier === "all" ? "active" : ""}`} onClick={() => setFilter(setTier, "all")} aria-pressed={tier === "all"}>
              All <span className="count">{vendors.length}</span>
            </button>
            {TIERS.map((t) => (
              <button key={t} className={`sev-chip ${tier === t ? "active" : ""}`} onClick={() => setFilter(setTier, tier === t ? "all" : t)} aria-pressed={tier === t}>
                <TierShape tier={t} />
                {tierLabel(t)} <span className="count">{count(t)}</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ marginLeft: "auto" }}>
            <select value={status} onChange={(e) => setFilter(setStatus, e.target.value)} aria-label="Filter by workflow stage">
              <option value="all">All stages</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              <option value="risk">Sort: highest risk</option>
              <option value="recent">Sort: most recent</option>
              <option value="name">Sort: name</option>
            </select>
          </div>
        </div>
        {shown.length === 0 ? (
          <Empty icon="search" title={vendors.length ? "No vendors match these filters" : "No vendors yet"}>
            {vendors.length ? "Try clearing the search or tier filter." : <a href="#/vendors/new">Submit the first vendor request.</a>}
          </Empty>
        ) : (
          <>
            <VendorTable vendors={visible} />
            <div className="pager">
              <span>
                Showing {from + 1}–{from + visible.length} of {shown.length} vendor{shown.length === 1 ? "" : "s"}
                {shown.length !== vendors.length && <span className="muted"> (filtered from {vendors.length})</span>}
              </span>
              {pages > 1 && (
                <nav className="pager-nav" aria-label="Pagination">
                  <button className="pager-btn" onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page">
                    <Icon name="chevronLeft" size={14} />
                  </button>
                  {pageNumbers.map((n, i) => (
                    <span key={n} className="row" style={{ gap: 6 }}>
                      {i > 0 && n - pageNumbers[i - 1] > 1 && <span className="pager-gap">…</span>}
                      <button className={`pager-btn ${n === current ? "active" : ""}`} onClick={() => setPage(n)} aria-current={n === current ? "page" : undefined}>
                        {n}
                      </button>
                    </span>
                  ))}
                  <button className="pager-btn" onClick={() => setPage(current + 1)} disabled={current === pages} aria-label="Next page">
                    <Icon name="chevronRight" size={14} />
                  </button>
                </nav>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
