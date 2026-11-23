import React, { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';

import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

export const AdminLayout: React.FC = () => {
  const { user, isAdmin, loading, isConfigured } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFB] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#DCFCE7] border-t-[#16A34A]" />
          <p className="text-[13.5px] font-medium text-[#6B7280]">
            Verifying ZemiGo Admin session...
          </p>
        </div>
      </div>
    );
  }

  if (!isConfigured || !user || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFB] text-[#111827]">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="lg:pl-[248px] flex min-h-screen flex-col">
        <TopHeader onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <main className="flex-1 px-4 sm:px-7 lg:px-9 py-6 sm:py-7">
          <div className="mx-auto max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
