import React, { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import GlobalActionProgressBar from '@/components/shared/GlobalActionProgressBar';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import PageNotFound from '@/lib/PageNotFound';

// Layout
import AppLayout from './components/layout/AppLayout';

// Pages
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Customers from './pages/Customers';
import Vendors from './pages/Vendors';
import Bills from './pages/Bills';
import PaymentCollectionPage from './pages/PaymentCollectionPage';
import Expenses from './pages/Expenses';
import VendorJobs from './pages/VendorJobs';
import VendorOrdersPage from './pages/VendorOrdersPage';
import VendorBillingPage from './pages/VendorBillingPage';
import Salary from './pages/Salary';
import DeliveryManagement from './pages/DeliveryManagement';

// Reports
import SalesReports from './pages/reports/SalesReports';
import PaymentReports from './pages/reports/PaymentReports';
import OutstandingReports from './pages/reports/OutstandingReports';
import ExpenseBooks from './pages/reports/ExpenseBooks';
import PnlReport from './pages/reports/PnlReport';
import SalaryReport from './pages/reports/SalaryReport';
import VendorVolumeReport from './pages/reports/VendorVolumeReport';

// Admin
import UserManagement from './pages/admin/UserManagement';
import Invitations from './pages/admin/Invitations';
import TrashBin from './pages/admin/TrashBin';
import VendorRates from './pages/admin/VendorRates';
import CompanySettings from './pages/admin/CompanySettings';
import RateList from './pages/admin/RateList';
import IncentiveManagement from './pages/admin/IncentiveManagement';
import ExpenseCategories from './pages/admin/ExpenseCategories';
import RoleManagement from './pages/admin/RoleManagement';
import CommunicationTemplates from './pages/admin/CommunicationTemplates';
import EmailSettings from './pages/admin/EmailSettings';
import DataOptimization from './pages/admin/DataOptimization';
import LoginPage from './pages/LoginPage';
import AcceptInvitePage from './pages/auth/AcceptInvitePage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
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

/** Supabase recovery links put tokens in the hash; React Router's Navigate to /login drops the hash and breaks reset. */
function authHashLooksLikeRecovery() {
  if (typeof window === "undefined") return false;
  const h = window.location.hash || "";
  return h.includes("access_token") || h.includes("type=recovery") || h.includes("refresh_token");
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();

  if (authHashLooksLikeRecovery()) {
    return <Navigate to={`/auth/reset-password${window.location.hash}`} replace />;
  }

  if (isLoadingAuth) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
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
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <GlobalActionProgressBar />
        <AppThemeSync />
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <Toaster />
        <SonnerToaster position="top-right" richColors closeButton duration={3000} />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;