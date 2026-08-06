import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth } from '@/lib/auth';
import { db } from '@/lib/firebase';

type AccountType = 'btoc' | 'btob';
type BtobStatus = 'pending_approval' | 'approved' | 'rejected';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  adminLoading: boolean;
  // BtoB account gate — accountType/btobStatus undefined = existing/BtoC user, never
  // gated. Reactive (live onSnapshot, not a one-shot fetch) so an admin's approval
  // while the pending screen is open can move the user into the app without a relaunch.
  accountType: AccountType | undefined;
  btobStatus: BtobStatus | undefined;
  businessLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  // adminLoading stays true from the moment a user is confirmed until the
  // admins/{uid} snapshot resolves. Setting it in the same synchronous
  // onAuthStateChanged callback as setUser ensures the gate never sees
  // loading=false + adminLoading=false + isAdmin=false simultaneously
  // during Firebase Auth session rehydration on a hard reload.
  const [adminLoading, setAdminLoading] = useState(false);

  const [accountType, setAccountType] = useState<AccountType | undefined>(undefined);
  const [btobStatus, setBtobStatus] = useState<BtobStatus | undefined>(undefined);
  // Same batching discipline as adminLoading — set true alongside setUser so the root
  // layout's gate never sees a moment where businessLoading=false but the profile
  // snapshot hasn't actually resolved yet.
  const [businessLoading, setBusinessLoading] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
      if (u) {
        setAdminLoading(true);     // batch with setUser — prevents premature gate redirect
        setBusinessLoading(true);
      } else {
        setIsAdmin(false);
        setAdminLoading(false);
        setAccountType(undefined);
        setBtobStatus(undefined);
        setBusinessLoading(false);
      }
      setLoading(false);
    });
  }, []);

  // admins/{uid} is readable only by that same uid (firestore.rules), so this
  // doubles as the live isAdmin check the moment the doc is granted/revoked.
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    return onSnapshot(
      doc(db, 'admins', user.uid),
      snap => { setIsAdmin(snap.exists()); setAdminLoading(false); },
      () => { setIsAdmin(false); setAdminLoading(false); },
    );
  }, [user]);

  // Live listener on the user's own profile doc, scoped (in effect) to just the BtoB
  // gate fields — this is the only reactive read of users/{uid} in the app; every
  // other screen still does its own one-shot getUserProfile() fetch as before.
  useEffect(() => {
    if (!user) {
      setAccountType(undefined);
      setBtobStatus(undefined);
      return;
    }
    return onSnapshot(
      doc(db, 'users', user.uid),
      snap => {
        const data = snap.data();
        setAccountType(data?.accountType);
        setBtobStatus(data?.btobStatus);
        setBusinessLoading(false);
      },
      () => {
        setAccountType(undefined);
        setBtobStatus(undefined);
        setBusinessLoading(false);
      },
    );
  }, [user]);

  const value: AuthContextValue = {
    user,
    loading,
    isAdmin,
    adminLoading,
    accountType,
    btobStatus,
    businessLoading,
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signUp: async (email, password) => {
      await createUserWithEmailAndPassword(auth, email, password);
    },
    signOut: async () => {
      await firebaseSignOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
