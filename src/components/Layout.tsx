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
  icon: "mark" | "release" | "reports";
}

/** The three main destinations, the same for every role (on phone and desktop). */
const MAIN_NAV: NavItem[] = [
  { to: "/search", label: "סימון תלמידים", icon: "mark" },
  { to: "/dashboard", label: "שחרורים", icon: "release" },
  { to: "/reports", label: "דוחות", icon: "reports" },
];

/** Everything else, under ⋮, by importance. Routes in App.tsx enforce the same roles. */
function moreLinksFor(role: Role): Array<{ to: string; label: string }> {
  const links: Array<{ to: string; label: string; roles: Role[] }> = [
    { to: "/mine", label: "הסימונים שלי היום", roles: ["teacher", "homeroom", "secretary", "admin"] },
    { to: "/roster", label: "תלמידים וכיתות", roles: ["homeroom", "secretary", "admin"] },
    { to: "/staff", label: "צוות", roles: ["secretary", "admin"] },
    { to: "/settings", label: "הגדרות בית הספר", roles: ["secretary", "admin"] },
    { to: "/account", label: "החשבון שלי", roles: ["teacher", "homeroom", "secretary", "admin"] },
  ];
  return links.filter((link) => link.roles.includes(role));
}

function titleFor(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "שחרורים";
  if (pathname.startsWith("/mine")) return "היום";
  if (pathname.startsWith("/search") || pathname.startsWith("/students/")) return "סימון תלמידים";
  if (pathname.startsWith("/class")) return "הכיתה שלי";
  if (pathname.startsWith("/roster")) return "תלמידים וכיתות";
  if (pathname.startsWith("/staff")) return "צוות";
  if (pathname.startsWith("/reports")) return "דוחות";
  if (pathname.startsWith("/settings")) return "הגדרות";
  if (pathname.startsWith("/account")) return "החשבון שלי";
  return "נשארים";
}

export function Layout() {
  const { session, demo } = useAuth();
  const { pathname } = useLocation();
  const role = session?.profile.role ?? "teacher";
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
        <nav aria-label="ניווט ראשי">
          {MAIN_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
              <span>{item.label}</span>
              {item.to === "/dashboard" ? <ReadyBadge count={readyCount} /> : null}
            </NavLink>
          ))}
          <button type="button" className="more-button" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
            <span aria-hidden="true">⋮</span>
            <span>עוד</span>
            {role === "admin" || role === "secretary" ? <ReadyBadge count={pendingCount} /> : null}
          </button>
        </nav>
      </aside>
      <div className="workspace">
        {demo ? <div className="demo-banner no-print">מצב הדגמה. הנתונים נשמרים רק בדפדפן הזה.</div> : null}
        <header className="topbar no-print">
          <div className="brand desktop-brand">
            <strong>{school}</strong>
            <span>
              {session?.profile.fullName || session?.email}
              {session?.profile.isOwner ? <span className="owner-badge">בעלים</span> : null}
            </span>
          </div>
          <h1 className="appbar-title">{titleFor(pathname)}</h1>
        </header>
        <main className="main">
          <ProfilePrompt />
          <Outlet />
        </main>
        {showFab ? (
          <Link className="fab no-print" to="/search">
            סמן תלמיד
          </Link>
        ) : null}
      </div>
      <nav className="tabbar no-print" aria-label="ניווט">
        {MAIN_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
            <TabIcon name={item.icon} />
            {item.to === "/dashboard" ? <ReadyBadge count={readyCount} /> : null}
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={moreOpen ? "active" : undefined}
          aria-label="תפריט נוסף"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <TabIcon name="more" />
          {role === "admin" || role === "secretary" ? <ReadyBadge count={pendingCount} /> : null}
          <span>עוד</span>
        </button>
      </nav>
      {moreOpen ? (
        <Sheet title="תפריט" onClose={() => setMoreOpen(false)}>
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

function TabIcon({ name }: { name: NavItem["icon"] | "more" }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true as const };
  if (name === "release") {
    return (
      <svg {...common}>
        <path d="M5 12.5l4 4L19 7" />
      </svg>
    );
  }
  if (name === "reports") {
    return (
      <svg {...common}>
        <path d="M5 20V10M12 20V4M19 20v-7" />
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
  return (
    <svg {...common}>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

/** One-time nudge for users who signed up before titles existed. */
function ProfilePrompt() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const key = `profile-prompt-${session?.userId ?? ""}`;
  const [hidden, setHidden] = useState(() => localStorage.getItem(key) === "1");
  const profile = session?.profile;
  if (!profile?.role || hidden || pathname === "/account") return null;
  const missingName = profile.fullName.trim().split(/\s+/).filter(Boolean).length < 2;
  if (!missingName) return null;
  return (
    <div className="banner banner-warn profile-prompt no-print">
      <span>
        השלימו שם פרטי ומשפחה, כדי שהחתימה בהודעות להורים תהיה נכונה.{" "}
        <Link to="/account" onClick={() => { localStorage.setItem(key, "1"); setHidden(true); }}>להשלמה</Link>
      </span>
      <button type="button" className="btn btn-ghost" onClick={() => { localStorage.setItem(key, "1"); setHidden(true); }}>
        לא עכשיו
      </button>
    </div>
  );
}
