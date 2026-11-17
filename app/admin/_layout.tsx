import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { canOpenAdminRoute } from '@/constants/adminSections';

// Admin area guard: not an active admin → Home; a STAFF member on an owner route (deep
// link, notification, old push) → the dashboard (Today panel). The server enforces the
// same split (firestore.rules / storage.rules / requireRole) — this only avoids showing
// screens whose writes would be refused.
export default function AdminLayout() {
  const { isAdmin, adminRole, loading, adminLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments() as string[];
  const blocked = !!adminRole && !canOpenAdminRoute(adminRole, segments);

  useEffect(() => {
    if (loading || adminLoading) return;
    if (!isAdmin) router.replace('/');
    else if (blocked) router.replace('/admin');
  }, [isAdmin, blocked, loading, adminLoading, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
