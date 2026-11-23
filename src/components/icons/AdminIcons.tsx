import React from 'react';

export interface IconProps {
  className?: string;
}

export const DashboardHomeIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3.5 10.5L12 3.5L20.5 10.5" />
    <path d="M5.5 9V19.5C5.5 20.05 5.95 20.5 6.5 20.5H17.5C18.05 20.5 18.5 20.05 18.5 19.5V9" />
    <path d="M9.75 20.5V14.25H14.25V20.5" />
  </svg>
);

export const VendorsStoreIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3.5 9.5L5.2 4.5H18.8L20.5 9.5" />
    <path d="M3.5 9.5C3.5 11 4.6 12 6.1 12C7.6 12 8.7 11 8.7 9.5C8.7 11 9.9 12 12 12C14.1 12 15.3 11 15.3 9.5C15.3 11 16.4 12 17.9 12C19.4 12 20.5 11 20.5 9.5" />
    <path d="M5 11.8V19.5C5 20.05 5.45 20.5 6 20.5H18C18.55 20.5 19 20.05 19 19.5V11.8" />
    <path d="M9.75 20.5V15H14.25V20.5" />
  </svg>
);

export const ProductsCubeIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" />
    <path d="M4 7.5L12 12L20 7.5" />
    <path d="M12 12V21" />
    <path d="M8 5.25L16 9.75" />
  </svg>
);

export const CategoriesGridIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
  </svg>
);

export const BannersImageIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
    <circle cx="8.8" cy="9.3" r="1.5" />
    <path d="M4.2 17.2L9.6 12.4L13.5 15.8L16.3 13.3L20.1 17.2" />
  </svg>
);

export const OrdersCartIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M2.8 4H5.3L7.6 15.2C7.78 16.08 8.56 16.7 9.46 16.7H18.1C18.96 16.7 19.72 16.12 19.94 15.28L21.5 8.2H6.2" />
    <circle cx="9.6" cy="19.8" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="17.8" cy="19.8" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const CustomersUserIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 19.8C5.4 16.4 8.35 14 12 14C15.65 14 18.6 16.4 19 19.8" />
  </svg>
);

export const CustomersGroupIcon: React.FC<IconProps> = ({
  className = 'w-6 h-6',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="7.5" r="3.1" />
    <path d="M6.8 18.8C7.1 15.9 9.3 14 12 14C14.7 14 16.9 15.9 17.2 18.8" />
    <circle cx="5.6" cy="9.5" r="2.1" />
    <path d="M2.3 18.2C2.5 16.2 3.85 14.8 5.7 14.8" />
    <circle cx="18.4" cy="9.5" r="2.1" />
    <path d="M21.7 18.2C21.5 16.2 20.15 14.8 18.3 14.8" />
  </svg>
);

export const CouponsTagIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M20.4 13.2L13.2 20.4C12.42 21.18 11.16 21.18 10.38 20.4L3.5 13.52V4H13.02L20.4 11.38C21.18 12.16 21.18 12.42 20.4 13.2Z" />
    <circle cx="8.2" cy="8.7" r="1.35" fill="currentColor" stroke="none" />
  </svg>
);

export const CommissionLayersIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 3.5L21 8.25L12 13L3 8.25L12 3.5Z" />
    <path d="M3 12.5L12 17.25L21 12.5" />
    <path d="M3 16.5L12 21.25L21 16.5" />
  </svg>
);

export const PaymentsCardIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="5" width="18" height="14" rx="2.4" />
    <path d="M3 9.5H21" />
    <path d="M6.8 14.5H10.5" />
  </svg>
);

export const ReportsChartIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="4" y="11" width="3.8" height="9" rx="1" />
    <rect x="10.1" y="5" width="3.8" height="15" rx="1" />
    <rect x="16.2" y="8.5" width="3.8" height="11.5" rx="1" />
  </svg>
);

export const SettingsGearIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 15A1.65 1.65 0 0 0 19.73 16.82L19.79 16.88A2 2 0 1 1 16.96 19.71L16.9 19.65A1.65 1.65 0 0 0 15.08 19.32A1.65 1.65 0 0 0 14 20.83V21A2 2 0 1 1 10 21V20.91A1.65 1.65 0 0 0 8.92 19.4A1.65 1.65 0 0 0 7.1 19.73L7.04 19.79A2 2 0 1 1 4.21 16.96L4.27 16.9A1.65 1.65 0 0 0 4.6 15.08A1.65 1.65 0 0 0 3.09 14H3A2 2 0 1 1 3 10H3.09A1.65 1.65 0 0 0 4.6 8.92A1.65 1.65 0 0 0 4.27 7.1L4.21 7.04A2 2 0 1 1 7.04 4.21L7.1 4.27A1.65 1.65 0 0 0 8.92 4.6H9A1.65 1.65 0 0 0 10 3.09V3A2 2 0 1 1 14 3V3.09A1.65 1.65 0 0 0 15 4.6A1.65 1.65 0 0 0 16.82 4.27L16.88 4.21A2 2 0 1 1 19.71 7.04L19.65 7.1A1.65 1.65 0 0 0 19.32 8.92V9A1.65 1.65 0 0 0 20.83 10H21A2 2 0 1 1 21 14H20.91A1.65 1.65 0 0 0 19.4 15Z" />
  </svg>
);

export const CalendarOutlineIcon: React.FC<IconProps> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.85}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3.5" y="4.5" width="17" height="16" rx="2.4" />
    <path d="M8 2.8V6.2" />
    <path d="M16 2.8V6.2" />
    <path d="M3.5 9.5H20.5" />
    <circle cx="8.5" cy="14" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="14" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const ChevronDownSmallIcon: React.FC<IconProps> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M6 9L12 15L18 9" />
  </svg>
);

export const TrendUpRightIcon: React.FC<IconProps> = ({
  className = 'w-3.5 h-3.5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.3}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M7 17L17 7" />
    <path d="M9 7H17V15" />
  </svg>
);

export const ArrowRightSmallIcon: React.FC<IconProps> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 12H19" />
    <path d="M13 6L19 12L13 18" />
  </svg>
);

export const MenuHamburgerIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    className={className}
  >
    <path d="M4 7H20" />
    <path d="M4 12H20" />
    <path d="M4 17H20" />
  </svg>
);

export const CloseSmallIcon: React.FC<IconProps> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    className={className}
  >
    <path d="M6 6L18 18" />
    <path d="M18 6L6 18" />
  </svg>
);
