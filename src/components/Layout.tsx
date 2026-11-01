import { useEffect, useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { getApi } from "../api";
import type { Role } from "../api/types";
import { useAuth } from "../auth";

const NAV: Record<Role, Array<{ to: string; label: string }>> = {
  teacher: [
    { to: "/search", label: "סימון" },
    { to: "/mine", label: "שלי" },
    { to: "/reports", label: "דוחות" },
  ],
  homeroom: [
    { to: "/search", label: "סימון" },
    { to: "/mine", label: "שלי" },
    { to: "/class", label: "הכיתה" },
    { to: "/reports", label: "דוחות" },
  ],
  secretary: [
    { to: "/dashboard", label: "היום" },
    { to: "/search", label: "סימון" },
    { to: "/reports", label: "דוחות" },
  ],
  admin: [
    { to: "/dashboard", label: "היום" },
    { to: "/search", label: "סימון" },
    { to: "/reports", label: "דוחות" },
    { to: "/admin", label: "ניהול" },
  ],
};

export function Layout() {
  const { session, demo } = useAuth();
  const role = session?.profile.role ?? "teacher";
  const [school, setSchool] = useState("השארות");

  useEffect(() => {
    void getApi()
      .getSettings()
      .then((settings) => setSchool(settings.schoolName))
      .catch(() => setSchool("השארות"));
  }, []);

  return (
    <div className="app-shell">
      {demo ? <div className="demo-banner">מצב הדגמה. הנתונים נשמרים רק בדפדפן הזה.</div> : null}
      <header className="topbar no-print">
        <div className="brand">
          <strong>{school}</strong>
          <span>{session?.profile.fullName || session?.email}</span>
        </div>
        <Link className="btn btn-ghost" to="/account">
          חשבון
        </Link>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <nav className="tabbar no-print">
        {NAV[role].map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
