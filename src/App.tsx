import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { Role } from "./api/types";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { ClassPage } from "./pages/ClassPage";
import { DashboardPage } from "./pages/DashboardPage";
import { Forbidden, LoginPage, PendingPage, SetupMissingPage } from "./pages/LoginPage";
import { MarkPage } from "./pages/MarkPage";
import { MyMarksPage } from "./pages/MyMarksPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SearchPage } from "./pages/SearchPage";

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
        <h1>השארות</h1>
        <p>טוען…</p>
      </div>
    );
  }
  if (!session) return <LoginPage />;
  if (!session.profile.role) return <PendingPage />;

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
            <Allow roles={["homeroom", "admin"]}>
              <ClassPage />
            </Allow>
          }
        />
        <Route
          path="class/:classId"
          element={
            <Allow roles={["homeroom", "admin"]}>
              <ClassPage />
            </Allow>
          }
        />
        <Route path="reports" element={<ReportsPage />} />
        <Route
          path="admin"
          element={
            <Allow roles={["admin"]}>
              <AdminPage />
            </Allow>
          }
        />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
