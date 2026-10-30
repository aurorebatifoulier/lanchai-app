import { useCallback, useEffect, useRef, useState } from 'react';
import { PROMO_COPY } from '@/constants/promoCopy';
import { usePromoCode, useMyCodes, savePromoCode, type PromoItem } from './promoCodes';

// ONE discount per booking, shared by "Your booking" and the bag checkout: the loyalty
// coupons, the renter's wallet codes that apply to this booking (evaluateMyCodes) and a
// typed promo code (validatePromoCode) become radio-like rows; the best one is
// preselected until the renter picks (or clears) one themselves. Only what's chosen is
// sent to createReservations (couponId OR promoCode) — the server re-checks everything.

export interface CouponChoice { id: string; label: string; savings: number }

export interface DiscountRowUi {
  key: string;
  label: string;
  amount: number;
  selected: boolean;
  onPress: () => void;
  /** Typed code only (wallet codes stay in the wallet). */
  onRemove?: () => void;
}

export interface PromoFieldUi {
  /** Shown only while no typed code is applied. */
  visible: boolean;
  onApply: (code: string) => void;
  checking: boolean;
  error: string | null;
  /** "Save to my codes" for a typed code that isn't in the wallet yet. */
  save: { label: string; disabled: boolean; onSave: () => void } | null;
  saveMessage: string | null;
  /** "n of your codes don't apply to this booking." */
  walletNote: string | null;
}

const n = (v: number) => Math.round(v).toLocaleString('en-US');

export function useDiscountChoice({ coupons, items }: { coupons: CouponChoice[]; items: PromoItem[] | null }) {
  const typed = usePromoCode(items);
  const wallet = useMyCodes(items);
  const [choice, setChoice] = useState<string | null>(null);
  const userChose = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedCodes, setSavedCodes] = useState<string[]>([]);

  // Promo options: wallet codes + the typed one (same code → one row).
  const promoAmounts = new Map<string, number>();
  wallet.codes.forEach(w => promoAmounts.set(w.code, w.discountTotal));
  if (typed.applied) promoAmounts.set(typed.applied.code, typed.applied.discountTotal);
  const options = [
    ...coupons.map(c => ({ key: `c:${c.id}`, amount: c.savings })),
    ...[...promoAmounts].map(([code, amount]) => ({ key: `p:${code}`, amount })),
  ];
  const optionsKey = options.map(o => `${o.key}=${o.amount}`).join('|');

  // Best one preselected — until the renter chooses; a chosen option that disappears
  // (code no longer valid) hands back to the best one.
  useEffect(() => {
    const stillThere = choice != null && options.some(o => o.key === choice);
    if (userChose.current && (choice == null || stillThere)) return;
    userChose.current = false;
    const best = [...options].sort((a, b) => b.amount - a.amount)[0];
    setChoice(best && best.amount > 0 ? best.key : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  const pick = (key: string) => { userChose.current = true; setChoice(cur => (cur === key ? null : key)); };

  const applyTyped = useCallback(async (code: string) => {
    setSaveMessage(null);
    const r = await typed.apply(code);
    if (r) userChose.current = false; // re-preselect the better one
  }, [typed]);

  const removeTyped = () => { typed.remove(); setSaveMessage(null); };

  const typedCode = typed.applied?.code ?? null;
  const typedInWallet = !!typedCode && (wallet.codes.some(w => w.code === typedCode) || savedCodes.includes(typedCode));
  const saveTyped = async () => {
    if (!typedCode || saving) return;
    setSaving(true);
    const r = await savePromoCode(typedCode);
    setSaving(false);
    if (r.ok) { setSavedCodes(s => [...s, typedCode]); setSaveMessage(PROMO_COPY.saved); }
    else setSaveMessage(r.message);
  };

  const rows: DiscountRowUi[] = [
    ...coupons.map(c => {
      const key = `c:${c.id}`;
      const on = choice === key;
      return { key, label: on && c.savings > 0 ? `${c.label} · −${n(c.savings)} LAK` : c.label, amount: c.savings, selected: on, onPress: () => pick(key) };
    }),
    ...[...promoAmounts].map(([code, amount]) => {
      const key = `p:${code}`;
      return {
        key, label: PROMO_COPY.line(code, n(amount)), amount, selected: choice === key, onPress: () => pick(key),
        ...(code === typedCode && !wallet.codes.some(w => w.code === code) ? { onRemove: removeTyped } : {}),
      };
    }),
  ];

  const chosen = options.find(o => o.key === choice) ?? null;
  const promoField: PromoFieldUi = {
    visible: !typed.applied,
    onApply: applyTyped,
    checking: typed.checking,
    error: typed.error,
    save: typedCode && !typedInWallet ? { label: PROMO_COPY.save, disabled: saving, onSave: saveTyped } : null,
    saveMessage,
    walletNote: wallet.notApplicable > 0 ? PROMO_COPY.notApplicable(wallet.notApplicable) : null,
  };

  return {
    rows,
    promoField,
    discountTotal: chosen?.amount ?? 0,
    couponId: chosen?.key.startsWith('c:') ? chosen.key.slice(2) : null,
    promoCode: chosen?.key.startsWith('p:') ? chosen.key.slice(2) : null,
  };
}
