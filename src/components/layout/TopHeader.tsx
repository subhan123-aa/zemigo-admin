import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ChevronDownSmallIcon,
  MenuHamburgerIcon,
} from '@/components/icons/AdminIcons';
import { useAuth } from '@/context/AuthContext';

export interface TopHeaderProps {
  onOpenMobileMenu: () => void;
}

/**
 * Minimal White Top Header matching the ZemiGo Admin Dashboard reference:
 * - No search bar
 * - No three-dot overflow menu
 * - No notification bell
 * - Only Admin profile avatar, name, email, and dropdown on the right
 */
export const TopHeader: React.FC<TopHeaderProps> = ({ onOpenMobileMenu }) => {
  const { user, isConfigured, logout } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayName = user?.displayName?.trim() || 'Admin';
  const displayEmail = user?.email?.trim() || 'admin@zemigo.com';
  const avatarInitial = displayName.charAt(0).toUpperCase() || 'A';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setDropdownOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 h-[68px] bg-white border-b border-[#F1F3F6] px-4 sm:px-7 lg:px-9 flex items-center justify-between">
      {/* Left: Hamburger button on mobile/tablet only; completely clean on desktop */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open sidebar navigation"
          className="lg:hidden p-2 -ml-1.5 rounded-xl text-[#1F2937] hover:bg-gray-100 transition-colors"
        >
          <MenuHamburgerIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Right: Admin Profile, Email & Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={dropdownOpen}
          className="flex items-center gap-3 py-1.5 px-2 rounded-xl hover:bg-[#F9FAFB] transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-[#15803D] text-white font-bold text-[16px] flex items-center justify-center shrink-0">
            {avatarInitial}
          </div>

          <div className="hidden sm:block leading-tight">
            <div className="text-[14.5px] font-bold text-[#111827]">
              {displayName}
            </div>
            <div className="text-[12.5px] text-[#6B7280] mt-0.5">
              {displayEmail}
            </div>
          </div>

          <ChevronDownSmallIcon
            className={[
              'w-4 h-4 text-[#4B5563] ml-0.5 transition-transform duration-150',
              dropdownOpen ? 'rotate-180' : '',
            ].join(' ')}
          />
        </button>

        {dropdownOpen ? (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-60 rounded-2xl bg-white border border-[#ECEEF2] shadow-lg py-2 z-40"
          >
            <div className="px-4 py-2.5 border-b border-[#F3F4F6]">
              <p className="text-[13.5px] font-bold text-[#111827] truncate">
                {displayName}
              </p>
              <p className="text-[12px] text-[#6B7280] truncate">
                {displayEmail}
              </p>
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#EAF7EF] text-[#15803D]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                {isConfigured
                  ? user
                    ? 'Firebase Authenticated'
                    : 'Firebase Connected'
                  : 'Awaiting Firebase .env'}
              </div>
            </div>

            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setDropdownOpen(false);
                  navigate('/settings');
                }}
                className="w-full text-left px-4 py-2 text-[13.5px] text-[#374151] hover:bg-[#F9FAFB] font-medium"
              >
                Admin Settings
              </button>

              {user ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-2 text-[13.5px] text-[#DC2626] hover:bg-[#FEF2F2] font-medium"
                >
                  Sign Out
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate('/login');
                  }}
                  className="w-full text-left px-4 py-2 text-[13.5px] text-[#15803D] hover:bg-[#F0FDF4] font-semibold"
                >
                  Admin Sign In
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
};
