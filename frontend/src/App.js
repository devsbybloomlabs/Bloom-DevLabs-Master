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
// RevenuePage removed Feb 2026 — AgencyHandy integration dropped.
import BlogPage from "@/pages/admin/BlogPage";
import OnboardingAdmin from "@/pages/admin/OnboardingAdmin";
import PayPalPlansPage from "@/pages/admin/PayPalPlansPage";
import PayPalOrdersPage from "@/pages/admin/PayPalOrdersPage";
import InvoicesAdmin from "@/pages/admin/InvoicesAdmin";
import SubscriptionsAdmin from "@/pages/admin/SubscriptionsAdmin";
import LeadMagnetsAdmin from "@/pages/admin/LeadMagnetsAdmin";
import WarmLeadsAdmin from "@/pages/admin/WarmLeadsAdmin";
import MilestonesAdmin from "@/pages/admin/MilestonesAdmin";
import ProjectModeAdmin from "@/pages/admin/ProjectModeAdmin";
import ProjectFilesAdmin from "@/pages/admin/ProjectFilesAdmin";
import SupportTriageAdmin from "@/pages/admin/SupportTriageAdmin";
import IntegrationsAdmin from "@/pages/admin/IntegrationsAdmin";
import ClientsAdmin from "@/pages/admin/ClientsAdmin";
import CompaniesAdmin from "@/pages/admin/CompaniesAdmin";
import ProposalsAdmin from "@/pages/admin/ProposalsAdmin";
import SupportClearanceAdmin from "@/pages/admin/SupportClearanceAdmin";
import { AuthProvider, RequireAuth } from "@/lib/auth";
import { ClientAuthProvider, RequireClient } from "@/lib/clientAuth";
import ClientLogin from "@/pages/client/ClientLogin";
import ClientRegister from "@/pages/client/ClientRegister";
import ClientPortal from "@/pages/client/ClientPortal";
import SetPassword from "@/pages/client/SetPassword";
import ForgotPassword from "@/pages/client/ForgotPassword";
import CheckoutSuccess from "@/pages/client/CheckoutSuccess";
import CompanyWelcomeWizard from "@/pages/client/CompanyWelcomeWizard";
import CompanyInviteAccept from "@/pages/client/CompanyInviteAccept";
import OnboardingWizard from "@/pages/client/OnboardingWizard";
import PublicCaseStudies from "@/pages/PublicCaseStudies";
import PublicBlog from "@/pages/PublicBlog";
import PublicBlogPost from "@/pages/PublicBlogPost";
import PublicSandboxTour from "@/pages/PublicSandboxTour";
import PayInvoice from "@/pages/PayInvoice";
import AnalyticsTracker from "@/components/Analytics";
import AuthCallback from "@/pages/AuthCallback";
import GymHeroPage from "@/pages/gym/GymHeroPage";
import GymHowItWorksPage from "@/pages/gym/GymHowItWorksPage";
import GymProcessPage from "@/pages/gym/GymProcessPage";
import GymResultsPage from "@/pages/gym/GymResultsPage";
import CoachHeroPage from "@/pages/coach/CoachHeroPage";
import CoachHowItWorksPage from "@/pages/coach/CoachHowItWorksPage";
import CoachProcessPage from "@/pages/coach/CoachProcessPage";
import CoachResultsPage from "@/pages/coach/CoachResultsPage";
import REHeroPage from "@/pages/realestate/REHeroPage";
import REHowItWorksPage from "@/pages/realestate/REHowItWorksPage";
import REProcessPage from "@/pages/realestate/REProcessPage";
import REResultsPage from "@/pages/realestate/REResultsPage";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <ClientAuthProvider>
          <AuthProvider>
            <AnalyticsTracker />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/case-studies" element={<PublicCaseStudies />} />
              <Route path="/blog" element={<PublicBlog />} />
              <Route path="/blog/:slug" element={<PublicBlogPost />} />
              <Route path="/tour" element={<PublicSandboxTour />} />
              <Route path="/gym-owners" element={<GymHeroPage />} />
              <Route path="/gym-owners/how-it-works" element={<GymHowItWorksPage />} />
              <Route path="/gym-owners/process" element={<GymProcessPage />} />
              <Route path="/gym-owners/results" element={<GymResultsPage />} />
              <Route path="/coaches" element={<CoachHeroPage />} />
              <Route path="/coaches/how-it-works" element={<CoachHowItWorksPage />} />
              <Route path="/coaches/process" element={<CoachProcessPage />} />
              <Route path="/coaches/results" element={<CoachResultsPage />} />
              <Route path="/real-estate" element={<REHeroPage />} />
              <Route path="/real-estate/how-it-works" element={<REHowItWorksPage />} />
              <Route path="/real-estate/process" element={<REProcessPage />} />
              <Route path="/real-estate/results" element={<REResultsPage />} />
              <Route path="/pay/invoice/:invoiceId" element={<PayInvoice />} />

              {/* Client (public-facing) auth + portal */}
              <Route path="/login" element={<ClientLogin />} />
              <Route path="/register" element={<ClientRegister />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/set-password" element={<SetPassword mode="set" />} />
              <Route path="/reset-password" element={<SetPassword mode="reset" />} />
              <Route path="/checkout/success" element={<CheckoutSuccess />} />
              <Route path="/portal/welcome" element={<CompanyWelcomeWizard />} />
              <Route path="/join/:token" element={<CompanyInviteAccept />} />
              <Route path="/checkout/cancel" element={<Navigate to="/" replace />} />
              {/* OAuth integration callbacks (Nifty et al.) */}
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/callback" element={<AuthCallback />} />
              {/* Public onboarding by token (no auth required) */}
              <Route path="/portal/onboarding" element={<OnboardingWizard />} />
              {/* Legacy email deep-links — redirect to the right tab. Older
                  invoice/receipt emails point to /portal/invoices etc. which
                  used to 404 silently (white screen). */}
              <Route path="/portal/invoices" element={<Navigate to="/portal?tab=invoices" replace />} />
              <Route path="/portal/milestones" element={<Navigate to="/portal?tab=milestones" replace />} />
              <Route path="/portal/subscriptions" element={<Navigate to="/portal?tab=subscriptions" replace />} />
              <Route path="/portal/proposals" element={<Navigate to="/portal?tab=proposals" replace />} />
              <Route path="/portal/orders" element={<Navigate to="/portal?tab=orders" replace />} />
              <Route path="/portal/support" element={<Navigate to="/portal?tab=contact" replace />} />
              <Route path="/portal/contact" element={<Navigate to="/portal?tab=contact" replace />} />
              <Route path="/portal/profile" element={<Navigate to="/portal?tab=profile" replace />} />
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
                {/* `revenue` route removed (Feb 2026 — AgencyHandy dropped) */}
                <Route path="credibility" element={<CredibilityPage />} />
                <Route path="case-studies" element={<CaseStudiesPage />} />
                <Route path="testimonials" element={<TestimonialsPage />} />
                <Route path="thought-leadership" element={<ThoughtLeadershipPage />} />
                <Route path="authority" element={<AuthorityPage />} />
                <Route path="blog" element={<BlogPage />} />
                <Route path="onboarding" element={<OnboardingAdmin />} />
                <Route path="paypal-plans" element={<PayPalPlansPage />} />
                <Route path="paypal-orders" element={<PayPalOrdersPage />} />
                <Route path="invoices" element={<InvoicesAdmin />} />
                <Route path="proposals" element={<ProposalsAdmin />} />
                <Route path="support-clearance" element={<SupportClearanceAdmin />} />
                <Route path="subscriptions" element={<SubscriptionsAdmin />} />
                <Route path="lead-magnets" element={<LeadMagnetsAdmin />} />
                <Route path="warm-leads" element={<WarmLeadsAdmin />} />
                <Route path="milestones" element={<MilestonesAdmin />} />
                <Route path="project-mode" element={<ProjectModeAdmin />} />
                <Route path="project-mode/:projectId" element={<ProjectModeAdmin />} />
                <Route path="project-files" element={<ProjectFilesAdmin />} />
                <Route path="support-triage" element={<SupportTriageAdmin />} />
                <Route path="clients" element={<ClientsAdmin />} />
                <Route path="companies" element={<CompaniesAdmin />} />
                <Route path="integrations" element={<IntegrationsAdmin />} />
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
