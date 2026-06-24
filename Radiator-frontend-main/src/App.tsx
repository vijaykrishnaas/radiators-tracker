import React, { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.min.js";
import "./Assets/css/base-theme.css";
import "./Assets/css/common.css";
import "./Assets/css/style.css";
import "./Assets/css/responsive.css";
import "./Assets/css/admin.css";
import "./Assets/css/warm-rebrand.css";

import { Navigate } from "react-router-dom";
import Header from "./Common/Header";
import AdminHeader from "./Common/AdminHeader";
import Footer from "./Common/Footer";
import Loader from "./Components/Loader";

// Landing route — kept eager so the first paint isn't gated on a chunk fetch.
import LoginPage from "./Pages/IssueCounter/Login/Index";

// Everything else is code-split: each route loads its own chunk on demand,
// keeping the initial bundle small (esp. for tablets on the shop floor).
const Dashboard = lazy(() => import("./Pages/IssueCounter/Dashboard/Index"));
const BillingPage = lazy(() => import("./Pages/IssueCounter/Billing/Index"));
const ExpensesPage = lazy(() => import("./Pages/IssueCounter/Expenses/Index"));
const CreateRadiators = lazy(() => import("./Pages/IssueCounter/Dashboard/Components/CreateRadiators"));
const SettingsPage = lazy(() => import("./Pages/Settings/Index"));
const MechanicBonus = lazy(() => import("./Pages/Bonus/Mechanic"));
const LabourBonus = lazy(() => import("./Pages/Bonus/Labour"));
const MechanicReview = lazy(() => import("./Pages/Bonus/MechanicReview"));
const LabourReview = lazy(() => import("./Pages/Bonus/LabourReview"));
const ClientAudit = lazy(() => import("./Pages/IssueCounter/Audit/Index"));
const AdminLogin = lazy(() => import("./Pages/Admin/Login/Index"));
const AdminClients = lazy(() => import("./Pages/Admin/Clients/Index"));
const AdminAudit = lazy(() => import("./Pages/Admin/Audit/Index"));
const ChangePassword = lazy(() => import("./Pages/ChangePassword/Index"));

import { SettingsProvider } from "./Context/SettingsContext";
import { isLoggedIn, isSuperAdmin } from "./Services/Auth";

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

// Super-admin portal routes.
const RequireSuperAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!isLoggedIn() || !isSuperAdmin()) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
};

const AppLayout: React.FC = () => {
  const location = useLocation();
  const [screenHeight, setScreenHeight] = useState<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);

  const path = location.pathname;
  const isClientLogin = path === "/issueCounter/login" || /^\/t\/[^/]+\/login$/.test(path);
  const isAdminLogin = path === "/admin/login";
  const isAdminArea = path.startsWith("/admin");
  // No chrome on any login screen or the standalone change-password screen.
  const isLoginPage = isClientLogin || isAdminLogin || path === "/change-password";

  const handleResize = () => {
    const header = document.getElementById("header");
    const headerH = header?.offsetHeight ?? 0;
    const bodyHeight = window.innerHeight - headerH + 8;
    setScreenHeight(bodyHeight);
    setHeaderHeight(headerH);
  };

  useEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Re-measure the header on every navigation. The header is absent on the login
  // screens (so the initial measurement is 0); without this, the first app page
  // after login renders UNDER the fixed header until a window resize. useLayoutEffect
  // applies the corrected padding before paint, avoiding a visible jump.
  useLayoutEffect(() => {
    handleResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, isLoginPage, isAdminArea]);

  return (
    <>
      {!isLoginPage && (isAdminArea ? <AdminHeader /> : <Header />)}
      <div
        className="section bg-light"
        id="section"
        style={{
          minHeight: screenHeight ?? undefined,
          paddingTop: isLoginPage ? 0 : (headerHeight ?? 0),
          paddingLeft: isLoginPage ? 0 : 20,
          paddingRight: isLoginPage ? 0 : 20,
          paddingBottom: isLoginPage ? 0 : 15,
        }}
      >
        <Suspense fallback={<Loader loading={true} />}>
        <Routes>
          <Route path="/" element={<Navigate to="/issueCounter/login" replace />} />
          <Route path="/issueCounter/login" element={<LoginPage />} />
          <Route path="/t/:code/login" element={<LoginPage />} />
          <Route path="/change-password" element={isLoggedIn() ? <ChangePassword /> : <Navigate to="/issueCounter/login" replace />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/clients" element={<RequireSuperAdmin><AdminClients /></RequireSuperAdmin>} />
          <Route path="/admin/audit" element={<RequireSuperAdmin><AdminAudit /></RequireSuperAdmin>} />
          <Route path="/issueCounter/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/issueCounter/dashboard/create" element={<ProtectedRoute><CreateRadiators /></ProtectedRoute>} />
          <Route path="/issueCounter/dashboard/view/:id" element={<ProtectedRoute><CreateRadiators /></ProtectedRoute>} />
          <Route path="/issueCounter/dashboard/edit/:id" element={<ProtectedRoute><CreateRadiators /></ProtectedRoute>} />
          <Route path="/issueCounter/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
          <Route path="/issueCounter/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute><ClientAudit /></ProtectedRoute>} />
          <Route path="/bonus/mechanics" element={<ProtectedRoute><MechanicBonus /></ProtectedRoute>} />
          <Route path="/bonus/labour" element={<ProtectedRoute><LabourBonus /></ProtectedRoute>} />
          <Route path="/bonus/mechanics/review" element={<ProtectedRoute><MechanicReview /></ProtectedRoute>} />
          <Route path="/bonus/labour/review" element={<ProtectedRoute><LabourReview /></ProtectedRoute>} />
        </Routes>
        </Suspense>
      </div>
      {!isLoginPage && !isAdminArea && <Footer />}
    </>
  );
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
