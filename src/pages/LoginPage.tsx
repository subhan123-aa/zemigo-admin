import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';

export const LoginPage: React.FC = () => {
  const { user, isAdmin, loading, authError, loginWithEmail, isConfigured } =
    useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user && isAdmin) {
    return <Navigate to="/" replace />;
  }

  const displayError = error || authError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
      navigate('/');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Check your admin credentials.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFB] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-7 sm:p-8">
        <div className="flex items-center justify-center gap-3 mb-6">
          <img
            src="/zemigo-icon.png"
            alt="ZemiGo"
            className="w-11 h-11 object-contain"
          />
          <div className="leading-none">
            <div className="text-[25px] font-extrabold tracking-tight">
              <span className="text-[#111827]">Zemi</span>
              <span className="text-[#16A34A]">Go</span>
            </div>
            <div className="text-[13px] font-medium text-[#6B7280] mt-1">
              Admin Panel
            </div>
          </div>
        </div>

        <h1 className="text-[20px] font-bold text-[#111827] text-center">
          Admin Sign In
        </h1>
        <p className="text-[13.5px] text-[#6B7280] text-center mt-1">
          Sign in with your Firebase Admin account
        </p>

        {!isConfigured ? (
          <div className="mt-5 rounded-xl bg-[#FEF3C7]/60 border border-[#FDE68A] px-4 py-3 text-[12.5px] text-[#92400E]">
            Firebase environment variables are not set yet. Copy{' '}
            <code className="font-semibold">.env.example</code> to{' '}
            <code className="font-semibold">.env</code> and add your ZemiGo
            Firebase keys.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#374151] mb-1.5">
              Admin Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@zemigo.com"
              className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-[14px] text-[#111827] focus:outline-none focus:border-[#16A34A]"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#374151] mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-[14px] text-[#111827] focus:outline-none focus:border-[#16A34A]"
            />
          </div>

          {displayError ? (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-[13px] text-[#DC2626]">
              {displayError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-60 text-white font-semibold text-[14.5px] py-2.5 transition-colors"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-5 text-center text-[12px] text-[#6B7280]">
          Authorized ZemiGo Administrators only.
        </p>
      </div>
    </div>
  );
};
