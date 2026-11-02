import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { getApi } from "../api";
import type { Role } from "../api/types";
import { useAuth } from "../auth";
import { jerusalemToday } from "../lib/dates";
import { Sheet } from "./Sheet";

interface NavItem {
  to: string;
  label: string;
  icon: "today" | "mark" | "students" | "more" | "account" | "release";
}

function desktopNav(role: Role): Array<{ to: string; label: string }> {
  const mark = { to: "/search", label: "סימון תלמיד" };
  const releases = { to: "/dashboard", label: "שחרורים" };
  const students = { to: "/roster", label: "תלמידים וכיתות" };
  const staff = { to: "/staff", label: "צוות" };
  const reports = { to: "/reports", label: "דוחות" };
  const settings = { to: "/settings", label: "הגדרות" };
  if (role === "admin") return [mark, releases, students, staff, reports, settings];
  if (role === "secretary") return [mark, releases, students, staff, reports];
  if (role === "homeroom") return [mark, releases, students, reports];
  return [mark, releases];
}

function phoneTabs(role: Role): NavItem[] {
  const mark = { to: "/search", label: "סימון", icon: "mark" as const };
  const releases = { to: "/dashboard", label: "שחרורים", icon: "release" as const };
  const students = { to: "/roster", label: "תלמידים", icon: "students" as const };
  const more = { to: "#more", label: "עוד", icon: "more" as const };
  if (role === "teacher") return [mark, releases, more];
  return [mark, releases, students, more];
}

function moreLinksFor(role: Role): Array<{ to: string; label: string }> {
  const staff = { to: "/staff", label: "צוות" };
  const reports = { to: "/reports", label: "דוחות" };
  const settings = { to: "/settings", label: "הגדרות" };
  const account = { to: "/account", label: "החשבון" };
  if (role === "admin") return [staff, reports, settings, account];
  if (role === "secretary") return [staff, reports, account];
  if (role === "homeroom") return [reports, account];
  return [account];
}

function titleFor(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "שחרורים";
  if (pathname.startsWith("/mine")) return "היום";
  if (pathname.startsWith("/search") || pathname.startsWith("/students/")) return "סימון";
  if (pathname.startsWith("/class")) return "הכיתה שלי";
  if (pathname.startsWith("/roster")) return "תלמידים";
  if (pathname.startsWith("/staff")) return "צוות";
  if (pathname.startsWith("/reports")) return "דוחות";
  if (pathname.startsWith("/settings")) return "הגדרות";
  if (pathname.startsWith("/account")) return "החשבון";
  return "נשארים";
}

export function Layout() {
  const { session, demo } = useAuth();
  const { pathname } = useLocation();
  const role = session?.profile.role ?? "teacher";
  const side = desktopNav(role);
  const tabs = phoneTabs(role);
  const [school, setSchool] = useState("נשארים");
  const [moreOpen, setMoreOpen] = useState(false);
  const [readyCount, setReadyCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const showFab = pathname.startsWith("/roster") || pathname.startsWith("/mine");

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const rows = await getApi().listDetentions({ date: jerusalemToday() });
        const count = rows.filter((row) => row.status === "pending" && new Date(row.releaseAt).getTime() <= Date.now()).length;
        if (!stop) setReadyCount(count);
      } catch {
        if (!stop) setReadyCount(0);
      }
    };
    void load();
    const unsub = getApi().subscribeDetentions(() => void load());
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      stop = true;
      unsub();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (role !== "admin" && role !== "secretary") return;
    let stop = false;
    const load = async () => {
      try {
        const profiles = await getApi().listProfiles();
        const count = profiles.filter((profile) => !profile.role && profile.requestedRole).length;
        if (!stop) setPendingCount(count);
      } catch {
        if (!stop) setPendingCount(0);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [role]);

  useEffect(() => {
    void getApi()
      .getSettings()
      .then((settings) => setSchool(settings.schoolName))
      .catch(() => setSchool("נשארים"));
  }, []);

  useEffect(() => {
    const queries = ["(display-mode: standalone)", "(display-mode: fullscreen)"].map((query) => window.matchMedia(query));
    const apply = () => {
      const ios = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      document.documentElement.classList.toggle("standalone", ios || queries.some((media) => media.matches));
    };
    apply();
    queries.forEach((media) => media.addEventListener("change", apply));
    return () => queries.forEach((media) => media.removeEventListener("change", apply));
  }, []);

  const moreLinks = moreLinksFor(role);

  return (
    <div className="app-shell">
      <aside className="sidenav no-print">
        <div className="brand">
          <strong>נשארים</strong>
          <span>{school}</span>
        </div>
        <nav>
          {side.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
              <span>{item.label}</span>
              {item.to === "/dashboard" ? <ReadyBadge count={readyCount} /> : null}
              {item.to === "/staff" ? <ReadyBadge count={pendingCount} /> : null}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        {demo ? <div className="demo-banner no-print">מצב הדגמה. הנתונים נשמרים רק בדפדפן הזה.</div> : null}
        <header className="topbar no-print">
          <div className="brand desktop-brand">
            <strong>{school}</strong>
            <span>{session?.profile.fullName || session?.email}</span>
          </div>
          <h1 className="appbar-title">{titleFor(pathname)}</h1>
          <Link className="btn btn-ghost desktop-account" to="/account">
            חשבון
          </Link>
        </header>
        <main className="main">
          <Outlet />
        </main>
        {showFab ? (
          <Link className="fab no-print" to="/search">
            סמן תלמיד
          </Link>
        ) : null}
      </div>
      <nav className="tabbar no-print" aria-label="ניווט">
        {tabs.map((item) =>
          item.to === "#more" ? (
            <button key="more" type="button" className={moreOpen ? "active" : undefined} onClick={() => setMoreOpen(true)}>
              <TabIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ) : (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
              <TabIcon name={item.icon} />
              {item.to === "/dashboard" ? <ReadyBadge count={readyCount} /> : null}
              <span>{item.label}</span>
            </NavLink>
          ),
        )}
      </nav>
      {moreOpen ? (
        <Sheet title="עוד" onClose={() => setMoreOpen(false)}>
          <div className="more-list">
            {moreLinks.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMoreOpen(false)}>
                <span>{item.label}</span>
                {item.to === "/staff" ? <ReadyBadge count={pendingCount} /> : null}
              </Link>
            ))}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function ReadyBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="nav-badge">{count > 99 ? "99" : count}</span>;
}

function TabIcon({ name }: { name: NavItem["icon"] }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true as const };
  if (name === "release") {
    return (
      <svg {...common}>
        <path d="M5 12.5l4 4L19 7" />
      </svg>
    );
  }
  if (name === "today") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }
  if (name === "mark") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="6" />
        <path d="M15.5 15.5L20 20" />
      </svg>
    );
  }
  if (name === "students") {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="3" />
        <path d="M4 18c.6-2.4 2.5-4 5-4s4.4 1.6 5 4" />
        <circle cx="17" cy="10" r="2.2" />
        <path d="M16 18c.3-1.4 1.2-2.5 2.6-3" />
      </svg>
    );
  }
  if (name === "account") {
    return (
      <svg {...common}>
        <circle cx="12" cy="9" r="3" />
        <path d="M6 19c1-2.8 3-4 6-4s5 1.2 6 4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}
