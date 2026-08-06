import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminLayout() {
  const { isAdmin, loading, adminLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !adminLoading && !isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, loading, adminLoading, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
