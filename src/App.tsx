import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getApi } from "./api";
import type { AccessStatus, Role } from "./api/types";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { AccountPage } from "./pages/AccountPage";
import { ClassPage } from "./pages/ClassPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DeniedPage, Forbidden, LoginPage, PendingPage, SetupMissingPage } from "./pages/LoginPage";
import { MarkPage } from "./pages/MarkPage";
import { MyMarksPage } from "./pages/MyMarksPage";
import { ReportsPage } from "./pages/ReportsPage";
import { RosterPage } from "./pages/RosterPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StaffPage } from "./pages/StaffPage";

function Home() {
  const { session } = useAuth();
  const role = session?.profile.role;
  if (role === "secretary" || role === "admin") return <Navigate to="/dashboard" replace />;
  return <Navigate to="/search" replace />;
}

function Allow({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { session } = useAuth();
  if (!session?.profile.role || !roles.includes(session.profile.role)) return <Forbidden />;
  return children;
}

export default function App() {
  const { configured, loading, session } = useAuth();
  if (!configured) return <SetupMissingPage />;
  if (loading) {
    return (
      <div className="login">
        <h1>נשארים</h1>
        <p>טוען…</p>
      </div>
    );
  }
  if (!session) return <LoginPage />;
  return <SignedIn sessionRole={session.profile.role} />;
}

function SignedIn({ sessionRole }: { sessionRole: Role | null }) {
  const [status, setStatus] = useState<AccessStatus | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    void getApi()
      .accessStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus("denied");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionRole]);

  if (status === "loading") {
    return (
      <div className="login">
        <h1>נשארים</h1>
        <p>טוען…</p>
      </div>
    );
  }
  if (status === "denied") return <DeniedPage />;
  if (status === "pending" || !sessionRole) return <PendingPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="students/:id" element={<MarkPage />} />
        <Route path="mine" element={<MyMarksPage />} />
        <Route
          path="dashboard"
          element={
            <Allow roles={["secretary", "admin"]}>
              <DashboardPage />
            </Allow>
          }
        />
        <Route
          path="class"
          element={
            <Allow roles={["homeroom", "secretary", "admin"]}>
              <ClassPage />
            </Allow>
          }
        />
        <Route
          path="class/:classId"
          element={
            <Allow roles={["homeroom", "secretary", "admin"]}>
              <ClassPage />
            </Allow>
          }
        />
        <Route path="reports" element={<ReportsPage />} />
        <Route
          path="roster"
          element={
            <Allow roles={["homeroom", "secretary", "admin"]}>
              <RosterPage />
            </Allow>
          }
        />
        <Route
          path="staff"
          element={
            <Allow roles={["secretary", "admin"]}>
              <StaffPage />
            </Allow>
          }
        />
        <Route
          path="settings"
          element={
            <Allow roles={["admin"]}>
              <SettingsPage />
            </Allow>
          }
        />
        <Route path="admin" element={<Navigate to="/roster" replace />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
