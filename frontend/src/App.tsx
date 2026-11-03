import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, getUser, setUser, type Dashboard as DashboardData } from "./api";
import { Dashboard } from "./pages/Dashboard";
import { NewVendor } from "./pages/NewVendor";
import { Platform } from "./pages/Platform";
import { Portal } from "./pages/Portal";
import { VendorDetail } from "./pages/VendorDetail";
import { Vendors } from "./pages/Vendors";
import { Avatar, Icon, PEOPLE, initials } from "./ui";

const USERS = Object.keys(PEOPLE);

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

/** Lets a page put its entity name in the topbar breadcrumb. */
const CrumbContext = createContext<(title: string | null) => void>(() => {});
export const useCrumb = (title: string | null | undefined) => {
  const set = useContext(CrumbContext);
  useEffect(() => {
    set(title ?? null);
    return () => set(null);
  }, [title, set]);
};

function NavItem({ href, icon, label, active, badge, quiet }: { href: string; icon: string; label: string; active: boolean; badge?: number; quiet?: boolean }) {
  return (
    <a href={href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
      <Icon name={icon} size={17} />
      {label}
      {!!badge && <span className={`nav-badge ${quiet ? "quiet" : ""}`}>{badge}</span>}
    </a>
  );
}

function Sidebar({ route, user, onUser, summary, chain }: {
  route: string;
  user: string;
  onUser: (u: string) => void;
  summary: DashboardData | null;
  chain: { valid: boolean; events_checked: number } | null;
}) {
  const path = route.split("?")[0];
  const person = PEOPLE[user] ?? { name: user, role: "" };
  const pending = summary
    ? user === "sam.approver"
      ? summary.awaiting_signoff.length
      : summary.awaiting_review.length + summary.needs_rereview.length
    : 0;
  return (
    <aside className="sidebar">
      <a href="#/" className="sidebar-brand">
        <div className="brand-name">AI TPRA</div>
        <div className="brand-sub">Third-party risk platform</div>
      </a>
      <nav className="nav" aria-label="Primary">
        <NavItem href="#/" icon="home" label="Risk overview" active={path === "#/" || path === ""} badge={pending} />
        <NavItem href="#/vendors" icon="building" label="Vendor inventory" active={path === "#/vendors" || /^#\/vendors\/\d+$/.test(path)} badge={summary?.vendor_count} quiet />
        <NavItem href="#/vendors/new" icon="plus" label="New vendor request" active={path === "#/vendors/new"} />
        <NavItem href="#/platform" icon="layers" label="How assessments work" active={path === "#/platform"} />
      </nav>
      <div className="sidebar-footer">
        {chain && (
          <div className={`ledger ${chain.valid ? "" : "broken"}`} title="Every user, agent and system action is SHA-256 hash-chained">
            <Icon name={chain.valid ? "shieldCheck" : "alert"} size={18} />
            <div>
              <div className="ledger-title">{chain.valid ? "Audit ledger verified" : "Audit chain broken"}</div>
              <div className="ledger-sub">{chain.events_checked.toLocaleString()} events · SHA-256 chain</div>
            </div>
          </div>
        )}
        <div className="acting-as">Acting as</div>
        <label className="user-card">
          <Avatar name={person.name} round />
          <span>
            <div className="user-name">{person.name}</div>
            <div className="user-role">{person.role}</div>
          </span>
          <Icon name="chevronsUpDown" size={15} className="chev" />
          <select value={user} onChange={(e) => onUser(e.target.value)} aria-label="Acting as">
            {USERS.map((id) => (
              <option key={id} value={id}>
                {PEOPLE[id].name} — {PEOPLE[id].role}
              </option>
            ))}
          </select>
        </label>
      </div>
    </aside>
  );
}

function Topbar({ route, crumb, user, pending }: { route: string; crumb: string | null; user: string; pending: number }) {
  const path = route.split("?")[0];
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  let crumbs: ReactNode[] = [];
  if (path === "#/vendors") crumbs = [<span className="current" key="v">Vendor inventory</span>];
  else if (path === "#/vendors/new") crumbs = [<a href="#/vendors" key="v">Vendors</a>, <span className="current" key="n">New request</span>];
  else if (/^#\/vendors\/\d+$/.test(path)) crumbs = [<a href="#/vendors" key="v">Vendors</a>, <span className="current" key="n">{crumb ?? "…"}</span>];
  else if (path === "#/platform") crumbs = [<span className="current" key="p">How assessments work</span>];
  else crumbs = [<span className="current" key="o">Risk overview</span>];

  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} className="row" style={{ gap: 8 }}>
            {i > 0 && <Icon name="chevronRight" size={13} />}
            {c}
          </span>
        ))}
      </nav>
      <div className="topbar-right">
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = search.current?.value.trim() ?? "";
            window.location.hash = q ? `#/vendors?q=${encodeURIComponent(q)}` : "#/vendors";
            search.current?.blur();
          }}
        >
          <Icon name="search" size={15} />
          <input ref={search} type="search" placeholder="Search vendors, domains…" aria-label="Search vendors" />
          <kbd>/</kbd>
        </form>
        <a className="btn icon-btn" href="#/" aria-label={pending ? `${pending} decisions waiting` : "Notifications"} title={pending ? `${pending} decisions waiting` : "Nothing waiting"}>
          <Icon name="bell" size={19} />
          {pending > 0 && <span className="dot" />}
        </a>
        <span className="avatar-btn" title={PEOPLE[user]?.name ?? user}>
          {initials(PEOPLE[user]?.name ?? user)}
        </span>
      </div>
    </header>
  );
}

export function App() {
  const route = useHashRoute();
  const [user, setUserState] = useState(getUser());
  const [crumb, setCrumb] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [chain, setChain] = useState<{ valid: boolean; events_checked: number } | null>(null);

  const portalMatch = route.match(/^#\/portal\/([\w.-]+)$/);
  const [path, query] = route.split("?");

  // Refresh the sidebar counters on navigation and user switch (the vendor portal has no console session).
  useEffect(() => {
    if (route.startsWith("#/portal/")) return;
    api.dashboard().then(setSummary).catch(() => setSummary(null));
    api.verifyAudit().then(setChain).catch(() => setChain(null));
  }, [route, user]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  if (portalMatch) return <Portal token={portalMatch[1]} />;

  function switchUser(next: string) {
    setUser(next);
    setUserState(next);
  }

  const pending = summary
    ? user === "sam.approver"
      ? summary.awaiting_signoff.length
      : summary.awaiting_review.length + summary.needs_rereview.length
    : 0;

  const vendorMatch = path.match(/^#\/vendors\/(\d+)$/);
  let page;
  if (path === "#/vendors/new") page = <NewVendor />;
  else if (path === "#/vendors") page = <Vendors key={`${user}-${query}`} query={new URLSearchParams(query ?? "").get("q") ?? ""} />;
  else if (vendorMatch) page = <VendorDetail key={`${vendorMatch[1]}-${user}`} id={Number(vendorMatch[1])} />;
  else if (path === "#/platform") page = <Platform />;
  else page = <Dashboard key={user} user={user} />;

  return (
    <CrumbContext.Provider value={setCrumb}>
      <div className="app">
        <Sidebar route={route} user={user} onUser={switchUser} summary={summary} chain={chain} />
        <div className="main">
          <Topbar route={route} crumb={crumb} user={user} pending={pending} />
          <main className="content fade-in" key={path}>
            {page}
          </main>
        </div>
      </div>
    </CrumbContext.Provider>
  );
}
