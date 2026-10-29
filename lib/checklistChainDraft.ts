import type { ChecklistData } from './firestore';

// In-memory-only store carrying each item's condition-checklist data (ratings + photos)
// across the per-item screens of a chained multi-item checklist flow, until the final
// consolidated summary screen assembles and submits everything at once. Not persisted —
// if the app is killed mid-chain, the summary screen's missing-draft guard catches it.
export interface ChainItemDraft {
  categories: ChecklistData['categories'];
  photos: string[];
  // Set only when the worst category rating is 'damaged'/'unusable' on a return
  // checklist — decided and frozen at this item's own condition screen, since return
  // currency is already locked per-item (from that item's own handoverChecklist), well
  // before the chain's consolidated summary screen runs.
  chargeAmount?: number;
  chargeCurrency?: 'LAK' | 'USD' | 'THB';
  chargeReason?: string;
  chargeSeverity?: 'damaged' | 'unusable';
  chargePercent?: number;
  /** Units the damage charge is about (1..quantity) — see shared/returnStock.ts. */
  chargeUnits?: number;
  // Late-return penalty — independent of the damage fields above; either, neither, or
  // both may be set. Shares chargeCurrency.
  lateChargeAmount?: number;
  lateChargeReason?: string;
  // Explicit staff waivers (see RentalDoc) — decided on the item screen, forwarded as-is.
  lateChargeWaived?: boolean;
  lateChargeWaivedAmount?: number;
  lateChargeWaivedReason?: string;
  lateChargeWaivedBy?: string;
  damageChargeWaived?: boolean;
  damageChargeWaivedAmount?: number;
  damageChargeWaivedReason?: string;
  damageChargeWaivedPercent?: number;
  damageChargeWaivedBy?: string;
  depositAppliedToCharge?: number;
  outstandingBalance?: number;
}

const drafts = new Map<string, ChainItemDraft>();

export function setChainItemDraft(id: string, draft: ChainItemDraft): void {
  drafts.set(id, draft);
}

export function getChainItemDraft(id: string): ChainItemDraft | undefined {
  return drafts.get(id);
}

export function clearChainDrafts(ids: string[]): void {
  ids.forEach(id => drafts.delete(id));
}
