import React from 'react';
import AdminTabsScreen from '@/components/admin/AdminTabsScreen';
import AdminHomeSlidesScreen from './home-slides';
import AdminOnboardingScreen from './onboarding';

// Admin → App content: Home slides · Onboarding — the existing screens in their
// `embedded` mode. `?tab=slides|onboarding`. /admin/home-slides and /admin/onboarding
// still work on their own.
export default function AdminAppContentScreen() {
  return (
    <AdminTabsScreen
      title="App content"
      tabs={[
        { key: 'slides', label: 'Home slides', render: () => <AdminHomeSlidesScreen embedded /> },
        { key: 'onboarding', label: 'Onboarding', render: () => <AdminOnboardingScreen embedded /> },
      ]}
    />
  );
}
