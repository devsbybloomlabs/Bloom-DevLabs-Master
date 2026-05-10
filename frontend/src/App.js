import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Landing from "@/pages/Landing";
import Login from "@/pages/admin/Login";
import AdminLayout from "@/pages/admin/AdminLayout";
import DashboardHome from "@/pages/admin/DashboardHome";
import RoutinePage from "@/pages/admin/RoutinePage";
import OutreachPage from "@/pages/admin/OutreachPage";
import ContentPage from "@/pages/admin/ContentPage";
import PipelinePage from "@/pages/admin/PipelinePage";
import CredibilityPage from "@/pages/admin/CredibilityPage";
import AnalyticsPage from "@/pages/admin/AnalyticsPage";
import SettingsPage from "@/pages/admin/SettingsPage";
import CaseStudiesPage from "@/pages/admin/CaseStudiesPage";
import TestimonialsPage from "@/pages/admin/TestimonialsPage";
import ThoughtLeadershipPage from "@/pages/admin/ThoughtLeadershipPage";
import AuthorityPage from "@/pages/admin/AuthorityPage";
import RevenuePage from "@/pages/admin/RevenuePage";
import { AuthProvider, RequireAuth } from "@/lib/auth";
import { ClientAuthProvider, RequireClient } from "@/lib/clientAuth";
import ClientLogin from "@/pages/client/ClientLogin";
import ClientRegister from "@/pages/client/ClientRegister";
import ClientPortal from "@/pages/client/ClientPortal";
import SetPassword from "@/pages/client/SetPassword";
import ForgotPassword from "@/pages/client/ForgotPassword";
import CheckoutSuccess from "@/pages/client/CheckoutSuccess";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <ClientAuthProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Landing />} />

              {/* Client (public-facing) auth + portal */}
              <Route path="/login" element={<ClientLogin />} />
              <Route path="/register" element={<ClientRegister />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/set-password" element={<SetPassword mode="set" />} />
              <Route path="/reset-password" element={<SetPassword mode="reset" />} />
              <Route path="/checkout/success" element={<CheckoutSuccess />} />
              <Route path="/checkout/cancel" element={<Navigate to="/" replace />} />
              <Route
                path="/portal"
                element={
                  <RequireClient>
                    <ClientPortal />
                  </RequireClient>
                }
              />

              {/* Admin (hidden) */}
              <Route path="/admin/login" element={<Login />} />
              <Route
                path="/admin"
                element={
                  <RequireAuth>
                    <AdminLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardHome />} />
                <Route path="routine" element={<RoutinePage />} />
                <Route path="outreach" element={<OutreachPage />} />
                <Route path="content" element={<ContentPage />} />
                <Route path="pipeline" element={<PipelinePage />} />
                <Route path="revenue" element={<RevenuePage />} />
                <Route path="credibility" element={<CredibilityPage />} />
                <Route path="case-studies" element={<CaseStudiesPage />} />
                <Route path="testimonials" element={<TestimonialsPage />} />
                <Route path="thought-leadership" element={<ThoughtLeadershipPage />} />
                <Route path="authority" element={<AuthorityPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </AuthProvider>
        </ClientAuthProvider>
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

export default App;
