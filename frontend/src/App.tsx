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
type Theme = "system" | "light" | "dark";
const THEME_KEY = "tpra.theme";

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || "system");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    localStorage.setItem(THEME_KEY, theme);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return [theme, setTheme];
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
    <a
      href={href}
      className={`nav-item ${active ? "active" : ""} ${badge && !quiet ? "has-badge" : ""}`}
      aria-current={active ? "page" : undefined}
      title={label}
      data-testid={`nav-${href.replace(/[#/]/g, "") || "overview"}`}
    >
      <Icon name={icon} size={18} />
      <span className="nav-label">{label}</span>
      {!!badge && (
        <span className={`nav-badge ${quiet ? "quiet" : ""}`} aria-label={`${badge} ${quiet ? "vendors" : "items need you"}`}>
          {badge}
        </span>
      )}
    </a>
  );
}

function Sidebar({ route, user, onUser, summary, chain, pending, open, onClose }: {
  route: string;
  user: string;
  onUser: (u: string) => void;
  summary: DashboardData | null;
  chain: { valid: boolean; events_checked: number } | null;
  pending: number;
  open: boolean;
  onClose: () => void;
}) {
  const path = route.split("?")[0];
  const person = PEOPLE[user] ?? { name: user, role: "" };
  return (
    <>
      {open && <div className="drawer-backdrop" onClick={onClose} aria-hidden />}
      <aside className={`sidebar ${open ? "open" : ""}`} data-testid="sidebar">
        <div className="sidebar-head">
          <a href="#/" className="sidebar-brand" data-testid="brand-link">
            <div className="brand-name">AI TPRA</div>
            <div className="brand-sub">Third-party risk platform</div>
          </a>
          <button className="btn icon-btn sidebar-close" onClick={onClose} aria-label="Close menu">
            <Icon name="x" size={18} />
          </button>
        </div>
        <nav className="nav" aria-label="Primary">
          <NavItem href="#/" icon="home" label="Risk overview" active={path === "#/" || path === ""} badge={pending} />
          <NavItem href="#/vendors" icon="building" label="Vendor inventory" active={path === "#/vendors" || /^#\/vendors\/\d+$/.test(path)} badge={summary?.vendor_count} quiet />
          <NavItem href="#/vendors/new" icon="plus" label="New vendor request" active={path === "#/vendors/new"} />
          <NavItem href="#/platform" icon="layers" label="How assessments work" active={path === "#/platform"} />
        </nav>
        <div className="sidebar-footer">
          {chain && (
            <div className={`ledger ${chain.valid ? "" : "broken"}`} title="Every user, agent and system action is SHA-256 hash-chained" data-testid="ledger-status" role="status">
              <Icon name={chain.valid ? "shieldCheck" : "alert"} size={18} />
              <div>
                <div className="ledger-title">{chain.valid ? "Audit ledger verified" : "Audit chain broken"}</div>
                <div className="ledger-sub">{chain.events_checked.toLocaleString()} events · SHA-256 chain</div>
              </div>
            </div>
          )}
          <div className="acting-as" id="acting-as-label">Acting as</div>
          <label className="user-card btn">
            <Avatar name={person.name} round />
            <span>
              <div className="user-name">{person.name}</div>
              <div className="user-role">{person.role}</div>
            </span>
            <Icon name="chevronsUpDown" size={15} className="chev" />
            <select value={user} onChange={(e) => onUser(e.target.value)} aria-labelledby="acting-as-label" data-testid="acting-as-select">
              {USERS.map((id) => (
                <option key={id} value={id}>
                  {PEOPLE[id].name} — {PEOPLE[id].role}
                </option>
              ))}
            </select>
          </label>
        </div>
      </aside>
    </>
  );
}

function UserMenu({ user, onUser, theme, onTheme }: { user: string; onUser: (u: string) => void; theme: Theme; onTheme: (t: Theme) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const first = wrap.current?.querySelector<HTMLElement>(".menu button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);
  const name = PEOPLE[user]?.name ?? user;
  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        ref={trigger}
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${name}: switch person and theme`}
        onClick={() => setOpen((o) => !o)}
        data-testid="user-menu-button"
      >
        {initials(name)}
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="User menu" data-testid="user-menu">
          <div className="menu-section">Acting as</div>
          {USERS.map((id) => (
            <button
              key={id}
              role="menuitemradio"
              aria-checked={id === user}
              className="menu-item"
              onClick={() => {
                onUser(id);
                setOpen(false);
              }}
              data-testid={`user-menu-${id}`}
            >
              <Avatar name={PEOPLE[id].name} size="sm" round />
              <span>
                <div className="strong">{PEOPLE[id].name}</div>
                <div className="xsmall muted">{PEOPLE[id].role}</div>
              </span>
              {id === user && <Icon name="check" size={16} className="check" />}
            </button>
          ))}
          <div className="menu-sep" />
          <div className="menu-section">Theme</div>
          <div className="seg-theme" role="group" aria-label="Theme">
            {(["system", "light", "dark"] as Theme[]).map((t) => (
              <button key={t} aria-pressed={theme === t} onClick={() => onTheme(t)} data-testid={`theme-${t}`}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Topbar({ route, crumb, user, pending, onMenu, onUser, theme, onTheme }: {
  route: string;
  crumb: string | null;
  user: string;
  pending: number;
  onMenu: () => void;
  onUser: (u: string) => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
}) {
  const path = route.split("?")[0];
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  let crumbs: ReactNode[] = [];
  if (path === "#/vendors") crumbs = [<span className="current" key="v" aria-current="page">Vendor inventory</span>];
  else if (path === "#/vendors/new") crumbs = [<a href="#/vendors" key="v">Vendors</a>, <span className="current" key="n" aria-current="page">New request</span>];
  else if (/^#\/vendors\/\d+$/.test(path)) crumbs = [<a href="#/vendors" key="v">Vendors</a>, <span className="current truncate" key="n" aria-current="page">{crumb ?? "…"}</span>];
  else if (path === "#/platform") crumbs = [<span className="current" key="p" aria-current="page">How assessments work</span>];
  else crumbs = [<span className="current" key="o" aria-current="page">Risk overview</span>];

  const bellLabel = pending ? `${pending} item${pending === 1 ? "" : "s"} need${pending === 1 ? "s" : ""} your attention` : "Nothing needs your attention";
  return (
    <header className="topbar">
      <button className="btn icon-btn menu-btn" onClick={onMenu} aria-label="Open menu" data-testid="open-menu-button">
        <Icon name="grid" size={18} />
      </button>
      <nav className="crumbs" aria-label="Breadcrumb" data-testid="breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} className="row" style={{ gap: 8, minWidth: 0 }}>
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
          <input ref={search} type="search" placeholder="Search vendors, domains…" aria-label="Search vendors (press / to focus)" data-testid="global-search-input" />
          <kbd aria-hidden>/</kbd>
        </form>
        <a className="btn icon-btn" href="#/" aria-label={bellLabel} title={bellLabel} data-testid="bell-link">
          <Icon name="bell" size={19} />
          {pending > 0 && <span className="dot" />}
        </a>
        <UserMenu user={user} onUser={onUser} theme={theme} onTheme={onTheme} />
      </div>
    </header>
  );
}

const TITLES: Record<string, string> = {
  "#/vendors": "Vendor inventory",
  "#/vendors/new": "New vendor request",
  "#/platform": "How assessments work",
};

export function App() {
  const route = useHashRoute();
  const [user, setUserState] = useState(getUser());
  const [crumb, setCrumb] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [chain, setChain] = useState<{ valid: boolean; events_checked: number } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [theme, setTheme] = useTheme();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

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
    setDrawer(false);
    if (firstRender.current) firstRender.current = false;
    else mainRef.current?.focus({ preventScroll: true });
  }, [path]);

  useEffect(() => {
    if (portalMatch) return;
    const name = /^#\/vendors\/\d+$/.test(path) ? crumb ?? "Vendor" : TITLES[path] ?? "Risk overview";
    document.title = `${name} · AI TPRA`;
  }, [path, crumb, portalMatch]);

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
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }} data-testid="skip-link">
        Skip to main content
      </a>
      <div className="app">
        <Sidebar route={route} user={user} onUser={switchUser} summary={summary} chain={chain} pending={pending} open={drawer} onClose={() => setDrawer(false)} />
        <div className="main">
          <Topbar route={route} crumb={crumb} user={user} pending={pending} onMenu={() => setDrawer(true)} onUser={switchUser} theme={theme} onTheme={setTheme} />
          <main id="main" ref={mainRef} tabIndex={-1} className="content fade-in" key={path} style={{ outline: "none" }}>
            {page}
          </main>
        </div>
      </div>
    </CrumbContext.Provider>
  );
}
