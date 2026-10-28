import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, LayoutAnimation } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { SHADES } from '@/constants/brandShades';
import { BOOKING_COPY } from '@/constants/bookingCopy';
import { UI, SectionTitle, IconCircle } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import { BookingPointsHint } from '@/components/BookingPointsHint';
import { useResidentPromo } from '@/lib/residency';

// Booking flow blocks (validated mockups) shared by "Your booking" (booking/new) and the
// bag checkout — same cards, same wording, same order. Copy in constants/bookingCopy.ts.

const n = (v: number) => Math.round(v).toLocaleString('en-US');

// ── Product card ─────────────────────────────────────────────────────────────

export function BookingProductCard({ name, image, sub, lines, right, onPress }: {
  name: string;
  image?: string | null;
  sub?: string;
  /** Extra grey lines (bag checkout: dates · times, quantity). */
  lines?: string[];
  right?: string;
  onPress?: () => void;
}) {
  return (
    <PressScale style={[UI.card, s.product]} onPress={onPress} disabled={!onPress}>
      <View style={s.thumb}>
        {image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          : <Feather name="package" size={24} color={SHADES.carbonFaint} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={UI.title} numberOfLines={2}>{name}</Text>
        {!!sub && <Text style={UI.subtitle}>{sub}</Text>}
        {lines?.map(l => <Text key={l} style={UI.subtitle} numberOfLines={1}>{l}</Text>)}
      </View>
      {!!right && <Text style={s.productRight}>{right}</Text>}
    </PressScale>
  );
}

// ── When? ────────────────────────────────────────────────────────────────────

export function WhenCard({ datesLabel, pickup, ret, onDates, onPickup, onReturn, hint, error }: {
  datesLabel: string | null;
  pickup: string | null;
  ret: string | null;
  onDates: () => void;
  onPickup: () => void;
  onReturn: () => void;
  hint?: string | null;
  error?: string | null;
}) {
  const c = BOOKING_COPY;
  return (
    <View>
      <SectionTitle>{c.when}</SectionTitle>
      <View style={UI.card}>
        <TouchableOpacity style={s.datesRow} onPress={onDates} activeOpacity={0.7}>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>{c.dates}</Text>
            <Text style={[s.fieldValue, !datesLabel && s.fieldEmpty]}>{datesLabel ?? c.selectDates}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={SHADES.carbonMuted} />
        </TouchableOpacity>
        <View style={s.timesRow}>
          <TouchableOpacity style={s.timeCell} onPress={onPickup} activeOpacity={0.7}>
            <Text style={s.fieldLabel}>{c.pickup}</Text>
            <Text style={[s.fieldValue, !pickup && s.fieldEmpty]}>{pickup ?? c.select}</Text>
          </TouchableOpacity>
          <View style={s.vSep} />
          <TouchableOpacity style={s.timeCell} onPress={onReturn} activeOpacity={0.7}>
            <Text style={s.fieldLabel}>{c.return}</Text>
            <Text style={[s.fieldValue, !ret && s.fieldEmpty]}>{ret ?? c.select}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {!!error && <Text style={[UI.errorText, { marginTop: 8 }]}>{error}</Text>}
      {!error && !!hint && (
        <View style={s.hint}>
          <Feather name="sun" size={14} color={SHADES.amberDeep} />
          <Text style={s.hintText}>{hint}</Text>
        </View>
      )}
    </View>
  );
}

// ── Quantity ─────────────────────────────────────────────────────────────────

export function QuantityRow({ quantity, available, onChange }: { quantity: number; available: number; onChange: (q: number) => void }) {
  const c = BOOKING_COPY;
  return (
    <View>
      <View style={s.qtyRow}>
        <Text style={s.qtyLabel}>
          {c.quantity}
          {available > 0 && <Text style={s.qtyAvail}>{` · ${c.available(available)}`}</Text>}
        </Text>
        <PressScale style={[s.qtyBtn, quantity <= 1 && s.qtyOff]} onPress={() => onChange(quantity - 1)} disabled={quantity <= 1} accessibilityLabel="Less">
          <Feather name="minus" size={16} color={SHADES.carbon} />
        </PressScale>
        <Text style={s.qtyNum}>{quantity}</Text>
        <PressScale style={[s.qtyBtn, quantity >= available && s.qtyOff]} onPress={() => onChange(quantity + 1)} disabled={quantity >= available} accessibilityLabel="More">
          <Feather name="plus" size={16} color={SHADES.carbon} />
        </PressScale>
      </View>
      {available <= 0 && <Text style={[UI.errorText, { marginTop: 4 }]}>{c.outOfStock}</Text>}
    </View>
  );
}

// ── Your total ───────────────────────────────────────────────────────────────

export interface CouponOption { id: string; label: string; savings: number }

export function TotalCard({
  lines, coupons, selectedCouponId, onToggleCoupon, discount, vat, toPay, deposit, pointsSubtotals,
}: {
  lines: { label: string; value: number }[];
  coupons: CouponOption[];
  selectedCouponId: string | null;
  onToggleCoupon: (id: string) => void;
  discount: number;
  /** null = VAT display off. */
  vat: { ht: number; amount: number; pct: number } | null;
  toPay: number;
  deposit: number;
  pointsSubtotals: number[];
}) {
  const c = BOOKING_COPY;
  return (
    <View>
      <SectionTitle>{c.total}</SectionTitle>
      <View style={[UI.card, s.total]}>
        {lines.map(l => (
          <View key={l.label} style={s.line}>
            <Text style={s.lineLabel}>{l.label}</Text>
            <Text style={s.lineValue}>{`${n(l.value)} LAK`}</Text>
          </View>
        ))}
        {coupons.map(cp => {
          const on = cp.id === selectedCouponId;
          return (
            <TouchableOpacity key={cp.id} style={s.coupon} onPress={() => onToggleCoupon(cp.id)} activeOpacity={0.8}>
              <Feather name="tag" size={15} color={SHADES.amberDeep} />
              <Text style={s.couponText}>{cp.label}</Text>
              <Text style={s.couponAction}>{on ? c.remove : c.apply}</Text>
            </TouchableOpacity>
          );
        })}
        {discount > 0 && (
          <View style={s.line}>
            <Text style={s.lineLabel}>{c.couponApplied(n(discount))}</Text>
          </View>
        )}
        <View style={s.sep} />
        {vat && (
          <>
            <View style={s.line}><Text style={s.lineLabel}>{c.subtotalHt}</Text><Text style={s.lineValue}>{`${n(vat.ht)} LAK`}</Text></View>
            <View style={s.line}><Text style={s.lineLabel}>{c.vat(vat.pct)}</Text><Text style={s.lineValue}>{`${n(vat.amount)} LAK`}</Text></View>
          </>
        )}
        <View style={s.line}>
          <Text style={s.toPayLabel}>{c.toPay}</Text>
          <Text style={s.toPayValue}>{`${n(toPay)} LAK`}</Text>
        </View>
        <View style={s.line}>
          <Text style={s.lineLabel}>{c.deposit}</Text>
          <Text style={s.depositValue}>{`${n(deposit)} LAK`}</Text>
        </View>
        <BookingPointsHint subtotals={pointsSubtotals} compact />
      </View>
    </View>
  );
}

// ── How does the deposit work? ───────────────────────────────────────────────

export function DepositExplainer() {
  const router = useRouter();
  const residentPct = useResidentPromo();
  const [open, setOpen] = useState(false);
  const c = BOOKING_COPY;
  return (
    <View style={{ marginTop: 14 }}>
      <TouchableOpacity
        style={s.linkRow}
        onPress={() => { LayoutAnimation.easeInEaseOut(); setOpen(o => !o); }}
        hitSlop={8}
        activeOpacity={0.7}
      >
        <Text style={UI.link}>{c.depositLink}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={SHADES.amberText} />
      </TouchableOpacity>
      {open && (
        <View style={[UI.card, s.explain]}>
          {c.depositSteps.map((step, i) => (
            <Text key={step} style={s.step}>
              <Text style={s.stepNum}>{`${i + 1}. `}</Text>{step}
            </Text>
          ))}
          <Text style={[UI.small, { marginTop: 8 }]}>{c.depositNote}</Text>
          {residentPct != null && (
            <Text style={[UI.body, { marginTop: 10 }]}>
              {c.residentLess(residentPct)}
              <Text style={{ color: SHADES.amberText, fontWeight: '700' }} onPress={() => router.push('/profile/id-residency')}>{c.verifyStatus}</Text>
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Cancellation, note, terms ────────────────────────────────────────────────

export function CancellationLine() {
  const router = useRouter();
  const c = BOOKING_COPY;
  return (
    <View style={s.cancel}>
      <IconCircle icon={{ name: 'calendar' }} tone="amber" size={40} />
      <Text style={[UI.body, { flex: 1, color: SHADES.carbon }]}>
        {`${c.cancellation} `}
        <Text style={s.underline} onPress={() => router.push('/legal/cancellation')}>{c.policy}</Text>
      </Text>
    </View>
  );
}

export function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!!value);
  if (!open) {
    return (
      <TouchableOpacity onPress={() => { LayoutAnimation.easeInEaseOut(); setOpen(true); }} hitSlop={8} style={{ marginTop: 16 }}>
        <Text style={UI.link}>{BOOKING_COPY.addNote}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TextInput
      style={s.note}
      value={value}
      onChangeText={onChange}
      placeholder={BOOKING_COPY.notePlaceholder}
      placeholderTextColor={SHADES.carbonFaint}
      multiline
      maxLength={500}
      textAlignVertical="top"
      autoFocus
    />
  );
}

export function TermsCheck({ agreed, onToggle }: { agreed: boolean; onToggle: () => void }) {
  const router = useRouter();
  const c = BOOKING_COPY;
  return (
    <TouchableOpacity style={s.terms} onPress={onToggle} activeOpacity={0.75}>
      <View style={[s.box, agreed && s.boxOn]}>
        {agreed && <Feather name="check" size={13} color={SHADES.amber} />}
      </View>
      <Text style={[UI.body, { color: SHADES.carbon, flex: 1 }]}>
        {c.terms}
        <Text style={s.underline} onPress={() => router.push('/legal/terms')}>{c.termsLink}</Text>.
      </Text>
    </TouchableOpacity>
  );
}

// ── Business document reminder ───────────────────────────────────────────────

export function BusinessDocCard({ onGo }: { onGo: () => void }) {
  return (
    <View style={[UI.card, s.doc]}>
      <IconCircle icon={{ name: 'upload' }} tone="amber" />
      <View style={{ flex: 1 }}>
        <Text style={[UI.body, { color: SHADES.carbon }]}>{BOOKING_COPY.businessDoc}</Text>
        <TouchableOpacity onPress={onGo} hitSlop={8} style={{ marginTop: 6 }}>
          <Text style={UI.link}>{BOOKING_COPY.businessDocLink}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Bottom bar ───────────────────────────────────────────────────────────────

export function BookingBottomBar({ total, sub, label, disabled, busy, onPress, bottom }: {
  total: number | null;
  sub: string;
  label: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
  bottom: number;
}) {
  return (
    <View style={[s.bar, { paddingBottom: bottom }]}>
      <View style={{ flex: 1 }}>
        {total != null && total > 0 && (
          <>
            <Text style={s.barTotal}>{`${n(total)} LAK`}</Text>
            <Text style={UI.small}>{sub}</Text>
          </>
        )}
      </View>
      <PressScale style={[UI.btnPrimary, s.barBtn, (disabled || busy) && UI.btnDisabled]} onPress={onPress} disabled={disabled || busy}>
        {busy ? (
          <>
            <ActivityIndicator size="small" color={SHADES.carbon} />
            <Text style={UI.btnPrimaryText}>{BOOKING_COPY.cta.confirming}</Text>
          </>
        ) : <Text style={UI.btnPrimaryText}>{label}</Text>}
      </PressScale>
    </View>
  );
}

const s = StyleSheet.create({
  product: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  thumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: SHADES.carbonLight, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  productRight: { fontSize: 14, fontWeight: '700', color: SHADES.carbon },
  datesRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  timesRow: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: SHADES.border },
  timeCell: { flex: 1, padding: 16 },
  vSep: { width: 0.5, backgroundColor: SHADES.border },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: SHADES.carbonMuted },
  fieldValue: { fontSize: 16, fontWeight: '700', color: SHADES.carbon, marginTop: 3 },
  fieldEmpty: { color: SHADES.carbonFaint, fontWeight: '600' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  hintText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: SHADES.amberDeep },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },
  qtyLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: SHADES.carbon },
  qtyAvail: { fontSize: 13.5, fontWeight: '500', color: SHADES.carbonMuted },
  qtyBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: SHADES.carbon, alignItems: 'center', justifyContent: 'center' },
  qtyOff: { borderColor: SHADES.border, opacity: 0.5 },
  qtyNum: { fontSize: 16, fontWeight: '700', color: SHADES.carbon, minWidth: 18, textAlign: 'center' },
  total: { padding: 16, gap: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  lineLabel: { flex: 1, fontSize: 14.5, fontWeight: '500', color: SHADES.carbonMuted },
  lineValue: { fontSize: 14.5, fontWeight: '600', color: SHADES.carbon },
  coupon: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SHADES.amberLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  couponText: { flex: 1, fontSize: 14, fontWeight: '600', color: SHADES.amberDeep },
  couponAction: { fontSize: 14, fontWeight: '700', color: SHADES.amberDeep },
  sep: { height: 0.5, backgroundColor: SHADES.border, marginVertical: 2 },
  toPayLabel: { flex: 1, fontSize: 16, fontWeight: '700', color: SHADES.carbon },
  toPayValue: { fontSize: 20, fontWeight: '800', color: SHADES.carbon },
  depositValue: { fontSize: 14.5, fontWeight: '500', color: SHADES.carbonMuted },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  explain: { padding: 16, marginTop: 10, gap: 6 },
  step: { fontSize: 14.5, fontWeight: '500', color: SHADES.carbon, lineHeight: 21 },
  stepNum: { fontWeight: '800', color: SHADES.amberText },
  cancel: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  underline: { textDecorationLine: 'underline', color: SHADES.carbon, fontWeight: '600' },
  note: {
    marginTop: 16, minHeight: 90, borderRadius: 14, borderWidth: 0.5, borderColor: SHADES.border, backgroundColor: SHADES.white,
    padding: 12, fontSize: 14.5, color: SHADES.carbon,
  },
  terms: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: SHADES.carbon, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: SHADES.carbon },
  doc: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, marginTop: 16 },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: SHADES.white, borderTopWidth: 0.5, borderTopColor: SHADES.border, paddingHorizontal: 16, paddingTop: 12,
  },
  barTotal: { fontSize: 20, fontWeight: '800', color: SHADES.carbon },
  barBtn: { height: 54, paddingHorizontal: 22, borderRadius: 16 },
});
