import { useState, useCallback } from 'react';

/**
 * Pickup/return time state shared by both booking flows (app/booking/new.tsx and the
 * bag's components/DateRangePicker.tsx). The return time FOLLOWS the pickup time
 * (24h-block billing: same time on the return day) until the renter picks a return
 * time themselves — from then on, changing the pickup time no longer overwrites it.
 */
export function useLinkedReturnTime() {
  const [pickupTime, setPickupTime] = useState<string | null>(null);
  const [returnTime, setReturnTime] = useState<string | null>(null);
  const [returnIsManual, setReturnIsManual] = useState(false);

  const selectPickupTime = useCallback((slot: string) => {
    setPickupTime(slot);
    if (!returnIsManual) setReturnTime(slot);
  }, [returnIsManual]);

  const selectReturnTime = useCallback((slot: string) => {
    setReturnTime(slot);
    setReturnIsManual(true);
  }, []);

  /**
   * Re-seed both times (e.g. when reopening a picker on an existing bag item). A return
   * time that differs from the pickup time can only have been chosen by hand, so it's
   * kept as manual; equal (or missing) times stay linked.
   */
  const resetTimes = useCallback((pickup: string | null, ret: string | null) => {
    setPickupTime(pickup);
    setReturnTime(ret);
    setReturnIsManual(pickup != null && ret != null && ret !== pickup);
  }, []);

  return { pickupTime, returnTime, selectPickupTime, selectReturnTime, resetTimes };
}
