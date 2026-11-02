import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { getApi } from "../api";
import type { Role } from "../api/types";
import { useAuth } from "../auth";
import { Sheet } from "./Sheet";

interface NavItem {
  to: string;
  label: string;
  icon: "today" | "mark" | "students" | "more" | "account";
}

function desktopNav(role: Role): Array<{ to: string; label: string }> {
  const today = { to: "/dashboard", label: "היום" };
  const mark = { to: "/search", label: "סימון תלמיד" };
  const mine = { to: "/mine", label: "הסימונים שלי" };
  const students = { to: "/roster", label: "תלמידים וכיתות" };
  const ownClass = { to: "/class", label: "הכיתה שלי" };
  const staff = { to: "/staff", label: "צוות" };
  const reports = { to: "/reports", label: "דוחות" };
  const settings = { to: "/settings", label: "הגדרות" };
  if (role === "admin") return [today, students, staff, mark, reports, settings];
  if (role === "secretary") return [today, students, mark, staff, reports];
  if (role === "homeroom") return [mark, ownClass, mine];
  return [mark, mine];
}

function phoneTabs(role: Role): NavItem[] {
  const today = { to: role === "teacher" || role === "homeroom" ? "/mine" : "/dashboard", label: "היום", icon: "today" as const };
  const mark = { to: "/search", label: "סימון", icon: "mark" as const };
  const ownClass = { to: "/class", label: "הכיתה שלי", icon: "students" as const };
  const students = { to: "/roster", label: "תלמידים", icon: "students" as const };
  const account = { to: "/account", label: "החשבון", icon: "account" as const };
  const more = { to: "#more", label: "עוד", icon: "more" as const };
  if (role === "admin" || role === "secretary") return [today, students, mark, more];
  if (role === "homeroom") return [mark, ownClass, today, account];
  return [mark, today, account];
}

function titleFor(pathname: string): string {
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/mine")) return "היום";
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
  const showFab = pathname.startsWith("/dashboard") || pathname.startsWith("/roster") || pathname.startsWith("/mine");

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

  const moreLinks = [
    { to: "/staff", label: "צוות" },
    { to: "/reports", label: "דוחות" },
    ...(role === "admin" ? [{ to: "/settings", label: "הגדרות" }] : []),
    { to: "/account", label: "החשבון" },
  ];

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
              {item.label}
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
                {item.label}
              </Link>
            ))}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function TabIcon({ name }: { name: NavItem["icon"] }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true as const };
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
