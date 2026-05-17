import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import GlobalActionProgressBar from '@/components/shared/GlobalActionProgressBar';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { isPendingAuthCallbackUrl, isRecoveryCallbackUrl } from '@/lib/authCallback';
import PageNotFound from '@/lib/PageNotFound';
import AppLayout from './components/layout/AppLayout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Employees = lazy(() => import('./pages/Employees'));
const Customers = lazy(() => import('./pages/Customers'));
const Vendors = lazy(() => import('./pages/Vendors'));
const Bills = lazy(() => import('./pages/Bills'));
const PaymentCollectionPage = lazy(() => import('./pages/PaymentCollectionPage'));
const Expenses = lazy(() => import('./pages/Expenses'));
const VendorJobs = lazy(() => import('./pages/VendorJobs'));
const VendorOrdersPage = lazy(() => import('./pages/VendorOrdersPage'));
const VendorBillingPage = lazy(() => import('./pages/VendorBillingPage'));
const Salary = lazy(() => import('./pages/Salary'));
const DeliveryManagement = lazy(() => import('./pages/DeliveryManagement'));
const SalesReports = lazy(() => import('./pages/reports/SalesReports'));
const PaymentReports = lazy(() => import('./pages/reports/PaymentReports'));
const OutstandingReports = lazy(() => import('./pages/reports/OutstandingReports'));
const ExpenseBooks = lazy(() => import('./pages/reports/ExpenseBooks'));
const PnlReport = lazy(() => import('./pages/reports/PnlReport'));
const SalaryReport = lazy(() => import('./pages/reports/SalaryReport'));
const VendorVolumeReport = lazy(() => import('./pages/reports/VendorVolumeReport'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const Invitations = lazy(() => import('./pages/admin/Invitations'));
const TrashBin = lazy(() => import('./pages/admin/TrashBin'));
const VendorRates = lazy(() => import('./pages/admin/VendorRates'));
const CompanySettings = lazy(() => import('./pages/admin/CompanySettings'));
const RateList = lazy(() => import('./pages/admin/RateList'));
const IncentiveManagement = lazy(() => import('./pages/admin/IncentiveManagement'));
const ExpenseCategories = lazy(() => import('./pages/admin/ExpenseCategories'));
const RoleManagement = lazy(() => import('./pages/admin/RoleManagement'));
const CommunicationTemplates = lazy(() => import('./pages/admin/CommunicationTemplates'));
const EmailSettings = lazy(() => import('./pages/admin/EmailSettings'));
const DataOptimization = lazy(() => import('./pages/admin/DataOptimization'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const InstallAppPage = lazy(() => import('./pages/InstallAppPage'));
const AcceptInvitePage = lazy(() => import('./pages/auth/AcceptInvitePage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const AuthCallbackPage = lazy(() => import('./pages/auth/AuthCallbackPage'));
import { useCompanyBranding } from '@/hooks/useCompanyBranding';
import { useAppTheme } from '@/hooks/useAppTheme';
import { CompanyLogoMark } from '@/components/shared/CompanyLogoMark';

function AppThemeSync() {
  useAppTheme();
  return null;
}

const LoadingScreen = () => {
  const { companyName, resolvedLogoSrc } = useCompanyBranding();
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3 overflow-hidden ring-1 ring-primary/20">
          <CompanyLogoMark
            src={resolvedLogoSrc}
            companyName={companyName}
            imgClassName="w-full h-full object-contain bg-primary p-0.5"
            letterClassName="text-primary-foreground font-bold text-lg"
          />
        </div>
        <div className="w-8 h-8 border-3 border-muted border-t-primary rounded-full animate-spin mx-auto mt-4"></div>
      </div>
    </div>
  );
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();

  if (isRecoveryCallbackUrl()) {
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    return <Navigate to={`/auth/reset-password${search}${hash}`} replace />;
  }

  if (isPendingAuthCallbackUrl() || isLoadingAuth) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/payment-collection" element={<PaymentCollectionPage />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/vendor-jobs" element={<VendorJobs />} />
        <Route path="/vendor-orders" element={<VendorOrdersPage />} />
        <Route path="/vendor-billing" element={<VendorBillingPage />} />
        <Route path="/salary" element={<Salary />} />
        <Route path="/delivery" element={<DeliveryManagement />} />
        <Route path="/reports/sales" element={<SalesReports />} />
        <Route path="/reports/payments" element={<PaymentReports />} />
        <Route path="/reports/outstanding" element={<OutstandingReports />} />
        <Route path="/reports/expenses" element={<ExpenseBooks />} />
        <Route path="/reports/pnl" element={<PnlReport />} />
        <Route path="/reports/salary" element={<SalaryReport />} />
        <Route path="/reports/vendor-volume" element={<VendorVolumeReport />} />
        <Route path="/admin/users" element={<UserManagement />} />
        <Route path="/admin/invitations" element={<Invitations />} />
        <Route path="/admin/trash" element={<TrashBin />} />
        <Route path="/admin/vendor-rates" element={<VendorRates />} />
        <Route path="/admin/company-settings" element={<CompanySettings />} />
        <Route path="/admin/rate-list" element={<RateList />} />
        <Route path="/admin/incentives" element={<IncentiveManagement />} />
        <Route path="/admin/expense-categories" element={<ExpenseCategories />} />
        <Route path="/admin/role-management" element={<RoleManagement />} />
        <Route path="/admin/communication-templates" element={<CommunicationTemplates />} />
        <Route path="/admin/email-settings" element={<EmailSettings />} />
        <Route path="/admin/data-optimization" element={<DataOptimization />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <GlobalActionProgressBar />
        <AppThemeSync />
        <Router>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/install" element={<InstallAppPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/auth/accept-invite" element={<AcceptInvitePage />} />
              <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
              <Route path="/*" element={<AuthenticatedApp />} />
            </Routes>
          </Suspense>
        </Router>
        <Toaster />
        <SonnerToaster position="top-right" richColors closeButton duration={3000} />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;