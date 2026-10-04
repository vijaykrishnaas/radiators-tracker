import React, { lazy, Suspense, useMemo } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { Navigate } from "react-router-dom";
import AppShell from "./layout/AppShell";
import { adminNav, tenantNav, verticalBase } from "./layout/navConfig";
import { ToastRegion } from "./Components/ui/Toast";
import Icons from "./Components/Icons";

// Landing route — kept eager so the first paint isn't gated on a chunk fetch.
import LoginPage from "./Pages/IssueCounter/Login/Index";

// Everything else is code-split: each route loads its own chunk on demand,
// keeping the initial bundle small (esp. for tablets on the shop floor).
const Dashboard = lazy(() => import("./Pages/IssueCounter/Dashboard/Index"));
const BillingPage = lazy(() => import("./Pages/IssueCounter/Billing/Index"));
const ExpensesPage = lazy(() => import("./Pages/IssueCounter/Expenses/Index"));
const CreateRadiators = lazy(() => import("./Pages/IssueCounter/Dashboard/Components/CreateRadiators"));
const SettingsPage = lazy(() => import("./Pages/Settings/Index"));
const AutoDashboard = lazy(() => import("./Pages/Automobile/Dashboard/Index"));
const AutoBillingPage = lazy(() => import("./Pages/Automobile/Billing/Index"));
const CreateAutoBill = lazy(() => import("./Pages/Automobile/Dashboard/Components/CreateAutoBill"));
const MechanicBonus = lazy(() => import("./Pages/Bonus/Mechanic"));
const LabourBonus = lazy(() => import("./Pages/Bonus/Labour"));
const MechanicReview = lazy(() => import("./Pages/Bonus/MechanicReview"));
const LabourReview = lazy(() => import("./Pages/Bonus/LabourReview"));
const ClientAudit = lazy(() => import("./Pages/IssueCounter/Audit/Index"));
const AdminLogin = lazy(() => import("./Pages/Admin/Login/Index"));
const AdminClients = lazy(() => import("./Pages/Admin/Clients/Index"));
const AdminAudit = lazy(() => import("./Pages/Admin/Audit/Index"));
const ChangePassword = lazy(() => import("./Pages/ChangePassword/Index"));
const SalaryEmployees = lazy(() => import("./Pages/Salary/Employees/Index"));
const SalarySettlePeriod = lazy(() => import("./Pages/Salary/SettlePeriod/Index"));
const EngDashboard = lazy(() => import("./Pages/Engineering/Dashboard/Index"));
const EngCreate = lazy(() => import("./Pages/Engineering/Dashboard/Create"));
const EngBilling = lazy(() => import("./Pages/Engineering/Billing/Index"));

import { SettingsProvider, useSettings } from "./Context/SettingsContext";
import { isLoggedIn, isSuperAdmin, getUser, clearSession } from "./Services/Auth";

// Route-chunk / settings wait: an in-page spinner, never a full-screen overlay (spec §4.17).
const PageSpinner = () => (
  <div className="d-flex justify-content-center py-5" role="status" aria-label="Loading">
    <span className="spinner t-muted" style={{ width: 24, height: 24 }} aria-hidden="true" />
  </div>
);

// Client-app routes: must be logged in and NOT a super-admin.
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!isLoggedIn()) {
    return <Navigate to="/issueCounter/login" replace />;
  }
  if (isSuperAdmin()) {
    return <Navigate to="/admin/clients" replace />;
  }
  return <>{children}</>;
};

// Gates radiator-only and automobile-only screens by the tenant's businessType
// (learned from GET /settings). Waits for settings to load before deciding, so
// a radiator tenant never sees a flash-redirect off their own dashboard.
const BusinessRoute: React.FC<{ children: React.ReactNode; type: "radiator" | "automobile" | "engineering" }> = ({ children, type }) => {
  const { settings, loading } = useSettings();
  if (loading) return <PageSpinner />;
  if (settings.businessType !== type) {
    return (
      <Navigate
        to={settings.businessType === "automobile" ? "/automobile/billing" : settings.businessType === "engineering" ? "/engineering/dashboard" : "/issueCounter/billing"}
        replace
      />
    );
  }
  return <>{children}</>;
};

// Super-admin portal routes.
const RequireSuperAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!isLoggedIn() || !isSuperAdmin()) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
};

const VERTICAL_NAME: Record<string, string> = { radiator: "Radiator", automobile: "Automobile", engineering: "Engineering" };

const AppLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useSettings();

  const path = location.pathname;
  const isClientLogin = path === "/issueCounter/login" || /^\/t\/[^/]+\/login$/.test(path);
  const isAdminLogin = path === "/admin/login";
  const isAdminArea = path.startsWith("/admin");
  // No shell on any login screen or the standalone change-password screen (spec §3.5).
  const noShell = isClientLogin || isAdminLogin || path === "/change-password";

  const user = getUser();
  const tenantNavGroups = useMemo(() => tenantNav(settings), [settings]);

  const logout = () => {
    if (isAdminArea) {
      clearSession();
      navigate("/admin/login");
      return;
    }
    // Back to the tenant's own login (/t/<code>/login) so the business code is pre-filled.
    const code = (getUser()?.code || "").trim();
    clearSession();
    navigate(code ? `/t/${encodeURIComponent(code)}/login` : "/issueCounter/login");
  };

  const routes = (
        <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/" element={<Navigate to="/issueCounter/login" replace />} />
          <Route path="/issueCounter/login" element={<LoginPage />} />
          <Route path="/t/:code/login" element={<LoginPage />} />
          <Route path="/change-password" element={isLoggedIn() ? <ChangePassword /> : <Navigate to="/issueCounter/login" replace />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/clients" element={<RequireSuperAdmin><AdminClients /></RequireSuperAdmin>} />
          <Route path="/admin/audit" element={<RequireSuperAdmin><AdminAudit /></RequireSuperAdmin>} />
          <Route path="/issueCounter/dashboard" element={<ProtectedRoute><BusinessRoute type="radiator"><Dashboard /></BusinessRoute></ProtectedRoute>} />
          <Route path="/issueCounter/dashboard/create" element={<ProtectedRoute><BusinessRoute type="radiator"><CreateRadiators /></BusinessRoute></ProtectedRoute>} />
          <Route path="/issueCounter/dashboard/view/:id" element={<ProtectedRoute><BusinessRoute type="radiator"><CreateRadiators /></BusinessRoute></ProtectedRoute>} />
          <Route path="/issueCounter/dashboard/edit/:id" element={<ProtectedRoute><BusinessRoute type="radiator"><CreateRadiators /></BusinessRoute></ProtectedRoute>} />
          <Route path="/issueCounter/billing" element={<ProtectedRoute><BusinessRoute type="radiator"><BillingPage /></BusinessRoute></ProtectedRoute>} />
          <Route path="/automobile/dashboard" element={<ProtectedRoute><BusinessRoute type="automobile"><AutoDashboard /></BusinessRoute></ProtectedRoute>} />
          <Route path="/automobile/dashboard/create" element={<ProtectedRoute><BusinessRoute type="automobile"><CreateAutoBill /></BusinessRoute></ProtectedRoute>} />
          <Route path="/automobile/dashboard/view/:id" element={<ProtectedRoute><BusinessRoute type="automobile"><CreateAutoBill /></BusinessRoute></ProtectedRoute>} />
          <Route path="/automobile/dashboard/edit/:id" element={<ProtectedRoute><BusinessRoute type="automobile"><CreateAutoBill /></BusinessRoute></ProtectedRoute>} />
          <Route path="/automobile/billing" element={<ProtectedRoute><BusinessRoute type="automobile"><AutoBillingPage /></BusinessRoute></ProtectedRoute>} />
          <Route path="/engineering/dashboard" element={<ProtectedRoute><BusinessRoute type="engineering"><EngDashboard /></BusinessRoute></ProtectedRoute>} />
          <Route path="/engineering/dashboard/create" element={<ProtectedRoute><BusinessRoute type="engineering"><EngCreate /></BusinessRoute></ProtectedRoute>} />
          <Route path="/engineering/dashboard/view/:id" element={<ProtectedRoute><BusinessRoute type="engineering"><EngCreate /></BusinessRoute></ProtectedRoute>} />
          <Route path="/engineering/dashboard/edit/:id" element={<ProtectedRoute><BusinessRoute type="engineering"><EngCreate /></BusinessRoute></ProtectedRoute>} />
          <Route path="/engineering/billing" element={<ProtectedRoute><BusinessRoute type="engineering"><EngBilling /></BusinessRoute></ProtectedRoute>} />
          <Route path="/issueCounter/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute><ClientAudit /></ProtectedRoute>} />
          <Route path="/bonus/mechanics" element={<ProtectedRoute><MechanicBonus /></ProtectedRoute>} />
          <Route path="/bonus/labour" element={<ProtectedRoute><LabourBonus /></ProtectedRoute>} />
          <Route path="/bonus/mechanics/review" element={<ProtectedRoute><MechanicReview /></ProtectedRoute>} />
          <Route path="/bonus/labour/review" element={<ProtectedRoute><LabourReview /></ProtectedRoute>} />
          {/* Salary Management — no BusinessRoute; applies identically to radiator and automobile tenants. */}
          <Route path="/salary/employees" element={<ProtectedRoute><SalaryEmployees /></ProtectedRoute>} />
          <Route path="/salary/settle" element={<ProtectedRoute><SalarySettlePeriod /></ProtectedRoute>} />
        </Routes>
        </Suspense>
  );

  if (noShell) return <>{routes}<ToastRegion /></>;

  const name = user?.name || user?.userId || (isAdminArea ? "Admin" : "User");
  const shell = isAdminArea ? (
    <AppShell
      nav={adminNav}
      brand={{ name: "Super Admin", sub: "Console", homeTo: "/admin/clients", mark: <span className="initials-tile" aria-hidden="true"><Icons iconName="shield" /></span> }}
      user={{
        name,
        meta: "Super admin",
        items: [
          { label: "Change Password", icon: "key", to: "/change-password" },
          { divider: true },
          { label: "Logout", icon: "logout", onClick: logout },
        ],
      }}
    >
      {routes}
    </AppShell>
  ) : (
    <AppShell
      nav={tenantNavGroups}
      brand={{ name: settings.company.name || "", logoUrl: settings.company.logoUrl, homeTo: `${verticalBase(settings)}/dashboard` }}
      user={{
        name,
        meta: [user?.code, VERTICAL_NAME[settings.businessType] || ""].filter(Boolean).join(" · "),
        items: [
          // Q2: Settings and Activity Log stay in the user menu as well as the sidebar.
          { label: "Settings", icon: "settings", to: "/settings" },
          { label: "Activity Log", icon: "history", to: "/audit" },
          { label: "Change Password", icon: "key", to: "/change-password" },
          { divider: true },
          { label: "Logout", icon: "logout", onClick: logout },
        ],
      }}
    >
      {routes}
    </AppShell>
  );
  return <>{shell}<ToastRegion /></>;
};
const App: React.FC = () => {
  return (
    <SettingsProvider>
      <Router>
        <AppLayout />
      </Router>
    </SettingsProvider>
  );
};

export default App;
