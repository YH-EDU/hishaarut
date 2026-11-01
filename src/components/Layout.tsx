import { useEffect, useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { getApi } from "../api";
import type { Role } from "../api/types";
import { useAuth } from "../auth";

interface NavItem {
  to: string;
  label: string;
  short: string;
}

function navFor(role: Role): NavItem[] {
  const today = { to: "/dashboard", label: "היום", short: "היום" };
  const mark = { to: "/search", label: "סימון תלמיד", short: "סימון" };
  const mine = { to: "/mine", label: "הסימונים שלי", short: "שלי" };
  const students = { to: "/roster", label: "תלמידים וכיתות", short: "תלמידים" };
  const ownClass = { to: "/class", label: "הכיתה שלי", short: "הכיתה" };
  const staff = { to: "/staff", label: "צוות", short: "צוות" };
  const reports = { to: "/reports", label: "דוחות", short: "דוחות" };
  const settings = { to: "/settings", label: "הגדרות", short: "הגדרות" };
  if (role === "admin") return [today, mark, students, staff, reports, settings];
  if (role === "secretary") return [today, mark, students, staff, reports];
  if (role === "homeroom") return [mark, mine, ownClass, reports];
  return [mark, mine, reports];
}

export function Layout() {
  const { session, demo } = useAuth();
  const role = session?.profile.role ?? "teacher";
  const items = navFor(role);
  const [school, setSchool] = useState("נשארים");

  useEffect(() => {
    void getApi()
      .getSettings()
      .then((settings) => setSchool(settings.schoolName))
      .catch(() => setSchool("נשארים"));
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidenav no-print">
        <div className="brand">
          <strong>נשארים</strong>
          <span>{school}</span>
        </div>
        <nav>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="workspace">
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
      </div>
      <nav className="tabbar no-print">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
            {item.short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
