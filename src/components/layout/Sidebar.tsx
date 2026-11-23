import React from 'react';
import { NavLink } from 'react-router-dom';

import {
  BannersImageIcon,
  CategoriesGridIcon,
  CloseSmallIcon,
  CommissionLayersIcon,
  CouponsTagIcon,
  CustomersUserIcon,
  DashboardHomeIcon,
  OrdersCartIcon,
  PaymentsCardIcon,
  ProductsCubeIcon,
  ReportsChartIcon,
  SettingsGearIcon,
  VendorsStoreIcon,
} from '@/components/icons/AdminIcons';

export interface NavItemConfig {
  label: string;
  to: string;
  icon: React.FC<{ className?: string }>;
  end?: boolean;
}

export const SIDEBAR_NAV_ITEMS: NavItemConfig[] = [
  { label: 'Dashboard', to: '/', icon: DashboardHomeIcon, end: true },
  { label: 'Vendors', to: '/vendors', icon: VendorsStoreIcon },
  { label: 'Products', to: '/products', icon: ProductsCubeIcon },
  { label: 'Categories', to: '/categories', icon: CategoriesGridIcon },
  { label: 'Banners', to: '/banners', icon: BannersImageIcon },
  { label: 'Orders', to: '/orders', icon: OrdersCartIcon },
  { label: 'Customers', to: '/customers', icon: CustomersUserIcon },
  { label: 'Coupons & Offers', to: '/coupons', icon: CouponsTagIcon },
  { label: 'Commission', to: '/commission', icon: CommissionLayersIcon },
  { label: 'Financials & Payouts', to: '/payments', icon: PaymentsCardIcon },
  { label: 'Reports', to: '/reports', icon: ReportsChartIcon },
  { label: 'Settings', to: '/settings', icon: SettingsGearIcon },
];

export interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  mobileOpen,
  onCloseMobile,
}) => {
  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-[#F0F2F5] select-none">
      {/* ZemiGo Brand Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <img
            src="/zemigo-icon.png"
            alt="ZemiGo"
            className="w-11 h-11 object-contain shrink-0"
          />
          <div className="leading-none">
            <div className="text-[24px] font-extrabold tracking-tight leading-none">
              <span className="text-[#111827]">Zemi</span>
              <span className="text-[#16A34A]">Go</span>
            </div>
            <div className="text-[13.5px] font-medium text-[#1F2937] mt-1">
              Admin Panel
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-lg text-[#6B7280] hover:bg-gray-100 hover:text-[#111827]"
        >
          <CloseSmallIcon className="w-5 h-5" />
        </button>
      </div>

      {/* 12 Sidebar Navigation Links */}
      <nav
        aria-label="Admin Navigation"
        className="flex-1 overflow-y-auto px-3.5 pb-6 space-y-1"
      >
        {SIDEBAR_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[14.5px] transition-colors',
                  isActive
                    ? 'bg-[#DFF8E5] text-[#15803D] font-semibold'
                    : 'text-[#1F2937] font-medium hover:bg-[#F8FAFC] hover:text-[#111827]',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={[
                      'w-[19px] h-[19px] shrink-0 transition-colors',
                      isActive
                        ? 'text-[#16A34A]'
                        : 'text-[#1F2937] group-hover:text-[#111827]',
                    ].join(' ')}
                  />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-[248px]">
        {sidebarContent}
      </aside>

      {/* Mobile & Tablet Slide-Over Drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 w-[264px] max-w-[82vw] z-10 shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      ) : null}
    </>
  );
};
