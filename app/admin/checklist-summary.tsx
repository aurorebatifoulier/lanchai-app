import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

// The old chained "order summary" screen. A whole order's pick-up is the 4-step Pick-up
// flow (app/admin/pickup.tsx) and its return the 3-step flow (app/admin/return.tsx) —
// old links land there.
export default function ChecklistSummaryRoute() {
  const { ids, type } = useLocalSearchParams<{ ids?: string; type?: 'handover' | 'return' }>();
  return <Redirect href={type === 'return' ? `/admin/return?ids=${ids ?? ''}` : `/admin/pickup?ids=${ids ?? ''}`} />;
}
