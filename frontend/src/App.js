import "@/App.css";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

// Public pages — eager (LCP critical, loaded on first paint)
import Landing from "@/pages/Landing";
import PublicCaseStudies from "@/pages/PublicCaseStudies";
import PublicBlog from "@/pages/PublicBlog";
import PublicBlogPost from "@/pages/PublicBlogPost";
import GetAuditPage from "@/pages/GetAuditPage";
import NotFound from "@/pages/NotFound";
import ShowcasePage from "@/pages/ShowcasePage";
import WinPage from "@/pages/WinPage";
import AffiliatePage from "@/pages/AffiliatePage";
import ExitIntentPopup from "@/components/ExitIntentPopup";
import AnalyticsTracker from "@/components/Analytics";
import AffiliateTracker from "@/lib/affiliate";

// Auth providers (small, always-on)
import { AuthProvider, RequireAuth } from "@/lib/auth";
import { ClientAuthProvider, RequireClient } from "@/lib/clientAuth";

// Niche solution pages — lazy (only one set is ever viewed per session)
const GymHeroPage = lazy(() => import("@/pages/gym/GymHeroPage"));
const GymHowItWorksPage = lazy(() => import("@/pages/gym/GymHowItWorksPage"));
const GymProcessPage = lazy(() => import("@/pages/gym/GymProcessPage"));
const GymResultsPage = lazy(() => import("@/pages/gym/GymResultsPage"));
const CoachHeroPage = lazy(() => import("@/pages/coach/CoachHeroPage"));
const CoachHowItWorksPage = lazy(() => import("@/pages/coach/CoachHowItWorksPage"));
const CoachProcessPage = lazy(() => import("@/pages/coach/CoachProcessPage"));
const CoachResultsPage = lazy(() => import("@/pages/coach/CoachResultsPage"));
const REHeroPage = lazy(() => import("@/pages/realestate/REHeroPage"));
const REHowItWorksPage = lazy(() => import("@/pages/realestate/REHowItWorksPage"));
const REProcessPage = lazy(() => import("@/pages/realestate/REProcessPage"));
const REResultsPage = lazy(() => import("@/pages/realestate/REResultsPage"));

// Other public pages — lazy
const AffiliateDashboard = lazy(() => import("@/pages/AffiliateDashboard"));
const AffiliateVerifyPage = lazy(() => import("@/pages/AffiliateVerifyPage"));
const PublicSandboxTour = lazy(() => import("@/pages/PublicSandboxTour"));
const PayInvoice = lazy(() => import("@/pages/PayInvoice"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));

// Client portal / auth — lazy (unauthenticated visitors don't need them)
const ClientLogin = lazy(() => import("@/pages/client/ClientLogin"));
const ClientRegister = lazy(() => import("@/pages/client/ClientRegister"));
const ClientPortal = lazy(() => import("@/pages/client/ClientPortal"));
const SetPassword = lazy(() => import("@/pages/client/SetPassword"));
const ForgotPassword = lazy(() => import("@/pages/client/ForgotPassword"));
const CheckoutSuccess = lazy(() => import("@/pages/client/CheckoutSuccess"));
const CompanyWelcomeWizard = lazy(() => import("@/pages/client/CompanyWelcomeWizard"));
const CompanyInviteAccept = lazy(() => import("@/pages/client/CompanyInviteAccept"));
const OnboardingWizard = lazy(() => import("@/pages/client/OnboardingWizard"));

// Admin — lazy ENTIRELY (founder-only; never on the public hot path)
const Login = lazy(() => import("@/pages/admin/Login"));
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout"));
const DashboardHome = lazy(() => import("@/pages/admin/DashboardHome"));
const RoutinePage = lazy(() => import("@/pages/admin/RoutinePage"));
const OutreachPage = lazy(() => import("@/pages/admin/OutreachPage"));
const ContentPage = lazy(() => import("@/pages/admin/ContentPage"));
const PipelinePage = lazy(() => import("@/pages/admin/PipelinePage"));
const CredibilityPage = lazy(() => import("@/pages/admin/CredibilityPage"));
const AnalyticsPage = lazy(() => import("@/pages/admin/AnalyticsPage"));
const SettingsPage = lazy(() => import("@/pages/admin/SettingsPage"));
const CaseStudiesPage = lazy(() => import("@/pages/admin/CaseStudiesPage"));
const TestimonialsPage = lazy(() => import("@/pages/admin/TestimonialsPage"));
const ThoughtLeadershipPage = lazy(() => import("@/pages/admin/ThoughtLeadershipPage"));
const AuthorityPage = lazy(() => import("@/pages/admin/AuthorityPage"));
const BlogPage = lazy(() => import("@/pages/admin/BlogPage"));
const OnboardingAdmin = lazy(() => import("@/pages/admin/OnboardingAdmin"));
const PayPalPlansPage = lazy(() => import("@/pages/admin/PayPalPlansPage"));
const PayPalOrdersPage = lazy(() => import("@/pages/admin/PayPalOrdersPage"));
const InvoicesAdmin = lazy(() => import("@/pages/admin/InvoicesAdmin"));
const SubscriptionsAdmin = lazy(() => import("@/pages/admin/SubscriptionsAdmin"));
const LeadMagnetsAdmin = lazy(() => import("@/pages/admin/LeadMagnetsAdmin"));
const WarmLeadsAdmin = lazy(() => import("@/pages/admin/WarmLeadsAdmin"));
const MilestonesAdmin = lazy(() => import("@/pages/admin/MilestonesAdmin"));
const ProjectModeAdmin = lazy(() => import("@/pages/admin/ProjectModeAdmin"));
const ProjectFilesAdmin = lazy(() => import("@/pages/admin/ProjectFilesAdmin"));
const SupportTriageAdmin = lazy(() => import("@/pages/admin/SupportTriageAdmin"));
const IntegrationsAdmin = lazy(() => import("@/pages/admin/IntegrationsAdmin"));
const SeoAdmin = lazy(() => import("@/pages/admin/SeoAdmin"));
const AbTestsDashboard = lazy(() => import("@/pages/admin/AbTestsDashboard"));
const AbTestWizard = lazy(() => import("@/pages/admin/AbTestWizard"));
const AbTestDetail = lazy(() => import("@/pages/admin/AbTestDetail"));
const AuditsAdmin = lazy(() => import("@/pages/admin/AuditsAdmin"));
const AuditDetailAdmin = lazy(() => import("@/pages/admin/AuditDetailAdmin"));
const AffiliatesAdmin = lazy(() => import("@/pages/admin/AffiliatesAdmin"));
const CommissionDashboard = lazy(() => import("@/pages/admin/CommissionDashboard"));
const PeopleAdmin = lazy(() => import("@/pages/admin/PeopleAdmin"));
const AssignmentsAdmin = lazy(() => import("@/pages/admin/AssignmentsAdmin"));
const CommissionLedger = lazy(() => import("@/pages/admin/CommissionLedger"));
const RevenuePage = lazy(() => import("@/pages/admin/RevenuePage"));
const ClientsAdmin = lazy(() => import("@/pages/admin/ClientsAdmin"));
const CompaniesAdmin = lazy(() => import("@/pages/admin/CompaniesAdmin"));
const ProposalsAdmin = lazy(() => import("@/pages/admin/ProposalsAdmin"));
const SupportClearanceAdmin = lazy(() => import("@/pages/admin/SupportClearanceAdmin"));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" data-testid="route-suspense-fallback">
      <div className="text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <ClientAuthProvider>
          <AuthProvider>
            <AnalyticsTracker />
            <AffiliateTracker />
            <ExitIntentPopup />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/case-studies" element={<PublicCaseStudies />} />
                <Route path="/showcase" element={<ShowcasePage />} />
                <Route path="/win" element={<WinPage />} />
                <Route path="/blog" element={<PublicBlog />} />
                <Route path="/blog/:slug" element={<PublicBlogPost />} />
                <Route path="/get-audit" element={<GetAuditPage />} />
                <Route path="/affiliate" element={<AffiliatePage />} />
                <Route path="/affiliate/dashboard" element={<AffiliateDashboard />} />
                <Route path="/affiliate/verify" element={<AffiliateVerifyPage />} />
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
                {/* SEO-friendly /solutions/* aliases */}
                <Route path="/solutions/gym-management-software" element={<GymHeroPage />} />
                <Route path="/solutions/gym-management-software/how-it-works" element={<GymHowItWorksPage />} />
                <Route path="/solutions/gym-management-software/process" element={<GymProcessPage />} />
                <Route path="/solutions/gym-management-software/results" element={<GymResultsPage />} />
                <Route path="/solutions/coach-funnel" element={<CoachHeroPage />} />
                <Route path="/solutions/coach-funnel/how-it-works" element={<CoachHowItWorksPage />} />
                <Route path="/solutions/coach-funnel/process" element={<CoachProcessPage />} />
                <Route path="/solutions/coach-funnel/results" element={<CoachResultsPage />} />
                <Route path="/solutions/real-estate-leads" element={<REHeroPage />} />
                <Route path="/solutions/real-estate-leads/how-it-works" element={<REHowItWorksPage />} />
                <Route path="/solutions/real-estate-leads/process" element={<REProcessPage />} />
                <Route path="/solutions/real-estate-leads/results" element={<REResultsPage />} />
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
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/callback" element={<AuthCallback />} />
                <Route path="/portal/onboarding" element={<OnboardingWizard />} />
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
                  <Route path="seo" element={<SeoAdmin />} />
                  <Route path="ab-tests" element={<AbTestsDashboard />} />
                  <Route path="ab-tests/new" element={<AbTestWizard />} />
                  <Route path="ab-tests/:testId" element={<AbTestDetail />} />
                  <Route path="audits" element={<AuditsAdmin />} />
                  <Route path="audits/:auditId" element={<AuditDetailAdmin />} />
                  <Route path="affiliates" element={<AffiliatesAdmin />} />
                  <Route path="commissions" element={<CommissionDashboard />} />
                  <Route path="people" element={<PeopleAdmin />} />
                  <Route path="commission-assignments" element={<AssignmentsAdmin />} />
                  <Route path="commission-ledger" element={<CommissionLedger />} />
                  <Route path="revenue" element={<RevenuePage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </ClientAuthProvider>
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

export default App;
