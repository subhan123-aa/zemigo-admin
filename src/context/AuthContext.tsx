import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ZEMIGO_COLLECTIONS,
  firebaseAuth,
  firestoreDb,
  isFirebaseConfigured,
} from '@/lib/firebase';

export type ZemiGoUserRole = 'customer' | 'vendor' | 'admin';

export interface AuthContextValue {
  user: User | null;
  role: ZemiGoUserRole | null;
  isAdmin: boolean;
  loading: boolean;
  isConfigured: boolean;
  authError: string | null;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchUserRole(uid: string): Promise<ZemiGoUserRole | null> {
  if (!firestoreDb || !uid) return null;
  const userRef = doc(firestoreDb, ZEMIGO_COLLECTIONS.users, uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  const rawStatus = String(data?.status ?? 'active').toLowerCase().trim();
  if (rawStatus === 'suspended' || rawStatus === 'disabled' || rawStatus === 'rejected') {
    return null;
  }
  const rawRole = String(data?.role ?? '').toLowerCase().trim();
  if (rawRole === 'admin' || rawRole === 'vendor' || rawRole === 'customer') {
    return rawRole;
  }
  return null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<ZemiGoUserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(isFirebaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !firebaseAuth) {
      setLoading(false);
      return;
    }

    const auth = firebaseAuth;
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!firebaseUser) {
          setUser(null);
          setRole(null);
          setAuthError(null);
          setLoading(false);
          return;
        }

        setLoading(true);
        try {
          const activeUid = auth.currentUser?.uid ?? firebaseUser.uid;
          const resolvedRole = await fetchUserRole(activeUid);
          if (resolvedRole !== 'admin') {
            setAuthError(
              'Access denied: Admin privileges required (`users/' +
                activeUid +
                '` must have `role: "admin"` in Firestore).'
            );
            await signOut(auth);
            setUser(null);
            setRole(null);
          } else {
            setAuthError(null);
            setUser(firebaseUser);
            setRole('admin');
          }
        } catch (err) {
          await signOut(auth).catch(() => {});
          setAuthError(
            err instanceof Error
              ? err.message
              : 'Unable to verify Admin role from Firestore.'
          );
          setUser(null);
          setRole(null);
        } finally {
          setLoading(false);
        }
      }
    );

    return unsubscribe;
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    if (!isFirebaseConfigured || !firebaseAuth) {
      throw new Error(
        'Firebase Auth is not configured yet. Add your VITE_FIREBASE_* keys to .env.'
      );
    }
    setAuthError(null);
    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email.trim(),
        password
      );
      const activeUid = firebaseAuth.currentUser?.uid ?? credential.user.uid;
      const resolvedRole = await fetchUserRole(activeUid);
      if (resolvedRole !== 'admin') {
        await signOut(firebaseAuth);
        const errMsg =
          'Access denied: This account does not have Admin privileges. Ensure Firestore document `users/' +
          activeUid +
          '` has `role: "admin"`.';
        setAuthError(errMsg);
        throw new Error(errMsg);
      }
      setUser(credential.user);
      setRole('admin');
    } catch (err) {
      await signOut(firebaseAuth).catch(() => {});
      setUser(null);
      setRole(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (firebaseAuth) {
        await signOut(firebaseAuth);
      }
    } finally {
      setUser(null);
      setRole(null);
      setAuthError(null);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      isAdmin: Boolean(user && role === 'admin'),
      loading,
      isConfigured: isFirebaseConfigured,
      authError,
      loginWithEmail,
      logout,
    }),
    [user, role, loading, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
