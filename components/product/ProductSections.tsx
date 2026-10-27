import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { PRODUCT_COPY } from '@/constants/productCopy';
import { UI, SectionTitle, IconCircle, CategoryBadge, type IconTone } from '@/components/account/ui';
import PressScale from '@/components/PressScale';
import SignalLine from '@/components/SignalLine';
import ReviewCard from '@/components/product/ReviewCard';
import type { ProductSignal } from '@/lib/productSignal';
import type { Product } from '@/lib/mockData';
import type { ReviewDoc } from '@/lib/firestore';

// Product page sections (validated mockup) — My Account / Home language. Copy in
// constants/productCopy.ts. The page (app/product/[id].tsx) computes the figures.

const n = (v: number) => Math.round(v).toLocaleString('en-US');
/** "350K" / "1.2M" — compact price for the tier cells. */
export function kLak(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  return `${Math.round(v / 1000)}K`;
}

// ── 2–3 · Category, badges, title, signal ────────────────────────────────────

export interface Badge { key: string; label: string; icon?: 'lock' | 'award'; tone: 'amber' | 'amberLight' | 'carbon' }

export function ProductIntro({ product, categoryName, badges, signal }: {
  product: Product; categoryName: string; badges: Badge[]; signal: ProductSignal | null;
}) {
  const router = useRouter();
  return (
    <View>
      <View style={s.chipRow}>
        <PressScale style={s.catChip} onPress={() => router.push(`/category/${product.category}`)}>
          <CategoryBadge cat={product.category} size={24} />
          <Text style={s.catText}>{categoryName}</Text>
          <Feather name="chevron-right" size={14} color={SHADES.carbonMuted} />
        </PressScale>
        {badges.map(b => (
          <View key={b.key} style={[s.badge, b.tone === 'amber' ? s.bAmber : b.tone === 'carbon' ? s.bCarbon : s.bLight]}>
            {b.icon && <Feather name={b.icon} size={12} color={b.tone === 'carbon' ? SHADES.cream : SHADES.carbon} />}
            <Text style={[s.badgeText, b.tone === 'carbon' && { color: SHADES.cream }, b.tone === 'amberLight' && { color: SHADES.amberDeep }]}>{b.label}</Text>
          </View>
        ))}
      </View>
      <Text style={s.title} numberOfLines={2}>{product.name}</Text>
      {signal && <View style={{ marginTop: 6 }}><SignalLine signal={signal} large /></View>}
    </View>
  );
}

// ── 5 · Perfect for + key features ───────────────────────────────────────────

const FEATURE_TONES: IconTone[] = ['amber', 'carbon', 'amberMid' as IconTone, 'grey'];

export function PerfectFor({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <SectionTitle>{PRODUCT_COPY.perfectFor}</SectionTitle>
      <View style={s.wrap}>
        {items.map(t => <View key={t} style={s.pfChip}><Text style={s.pfText}>{t}</Text></View>)}
      </View>
    </View>
  );
}

export function KeyFeatures({ items }: { items: { icon: string; text: string }[] }) {
  if (items.length === 0) return null;
  return (
    <View style={s.grid}>
      {items.map((f, i) => (
        <View key={`${f.text}${i}`} style={[UI.card, s.feature]}>
          <FeatureCircle icon={f.icon} tone={FEATURE_TONES[i % FEATURE_TONES.length]} />
          <Text style={s.featureText} numberOfLines={2}>{f.text}</Text>
        </View>
      ))}
    </View>
  );
}

function FeatureCircle({ icon, tone }: { icon: string; tone: IconTone }) {
  // amberMid isn't an IconCircle tone — drawn here with the same geometry.
  if ((tone as string) === 'amberMid') {
    return (
      <View style={[s.fCircle, { backgroundColor: SHADES.amberMid }]}>
        <Feather name={(icon || 'check') as never} size={17} color={SHADES.carbon} />
      </View>
    );
  }
  return <IconCircle icon={{ name: (icon || 'check') as never }} tone={tone} size={38} />;
}

// ── 6 · Description (3 lines + Read more) ────────────────────────────────────

export function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  if (!text.trim()) return null;
  return (
    <View style={{ marginTop: 20 }}>
      <Text
        style={s.desc}
        numberOfLines={open ? undefined : 3}
        onTextLayout={e => { if (!open && e.nativeEvent.lines.length >= 3) setLong(true); }}
      >
        {text}
      </Text>
      {long && (
        <TouchableOpacity onPress={() => setOpen(o => !o)} hitSlop={8} style={{ marginTop: 6 }}>
          <Text style={UI.link}>{open ? PRODUCT_COPY.showLess : PRODUCT_COPY.readMore}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── 7 · Price tiers ──────────────────────────────────────────────────────────

export interface Tier { label: string; lak: number; discount: number | null }

export function PriceTiers({ tiers, weekLak, vatPct }: { tiers: Tier[]; weekLak: number | null; vatPct: number | null }) {
  const p = PRODUCT_COPY.pricing;
  if (tiers.length === 0) {
    return (
      <View>
        <SectionTitle>{p.title}</SectionTitle>
        <Text style={UI.body}>{p.notSet}</Text>
      </View>
    );
  }
  const cheapest = tiers.reduce((m, t, i) => (t.lak < tiers[m].lak ? i : m), 0);
  return (
    <View>
      <SectionTitle style={{ marginBottom: 2 }}>{p.title}</SectionTitle>
      <Text style={[UI.subtitle, { marginBottom: 12 }]}>{p.sub}</Text>
      <View style={s.tierRow}>
        {tiers.map((t, i) => {
          const first = i === 0;
          const best = i === cheapest && !first;
          return (
            <View key={t.label} style={[s.tier, first && s.tierFirst, best && s.tierBest]}>
              <Text style={[s.tierLabel, first && { color: SHADES.carbonFaint }]}>{t.label}</Text>
              <Text style={[s.tierPrice, first && { color: SHADES.white }]}>{kLak(t.lak)}</Text>
              {t.discount != null && <Text style={s.tierDisc}>{`−${t.discount}%`}</Text>}
            </View>
          );
        })}
      </View>
      {weekLak != null && (
        <Text style={[UI.body, { marginTop: 10 }]}>
          {p.week}<Text style={s.bold}>{n(weekLak)}</Text>{p.allLak}
        </Text>
      )}
      {vatPct != null && <Text style={[UI.small, { marginTop: 4 }]}>{p.vat(vatPct)}</Text>}
    </View>
  );
}

// ── 8 · Why buy it? ──────────────────────────────────────────────────────────

export function WhyBuyProduct({ retailLak, weekendLak }: { retailLak: number; weekendLak: number }) {
  const w = PRODUCT_COPY.whyBuy;
  return (
    <View style={[UI.card, s.why]}>
      <Text style={s.whyLabel}>{w.label}</Text>
      <Text style={s.whyBig}>{w.worth(n(retailLak))}</Text>
      <Text style={s.whyBig}>{w.weekend(n(weekendLak))}</Text>
      <Text style={s.whyKicker}>{w.kicker}</Text>
    </View>
  );
}

// ── 9 · The details (accordion rows) ─────────────────────────────────────────

type DetailRow =
  | { key: string; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; kind: 'list' | 'check'; items: string[] }
  | { key: string; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; kind: 'kv'; items: { label: string; value: string }[] };

export function DetailsCard({ product }: { product: Product }) {
  const d = PRODUCT_COPY.details;
  const rows: DetailRow[] = ([
    { key: 'inc', label: d.whatsIncluded, icon: 'package-variant-closed', kind: 'check', items: product.whatsIncluded ?? [] },
    { key: 'basic', label: d.basicInfo, icon: 'information-outline', kind: 'kv', items: product.basicInfo ?? [] },
    { key: 'tech', label: d.techSpecs, icon: 'ruler', kind: 'kv', items: product.techSpecs ?? [] },
    { key: 'good', label: d.goodToKnow, icon: 'lightbulb-outline', kind: 'list', items: product.goodToKnow ?? [] },
    { key: 'usage', label: d.usageExamples, icon: 'play-outline', kind: 'list', items: product.usageExamples ?? [] },
  ] as DetailRow[]).filter(r => r.items.length > 0);
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return null;
  return (
    <View>
      <SectionTitle>{d.title}</SectionTitle>
      <View style={[UI.card, { paddingHorizontal: 16 }]}>
        {rows.map((r, i) => {
          const on = open === r.key;
          return (
            <View key={r.key} style={i > 0 && s.sepTop}>
              <TouchableOpacity
                style={s.accRow}
                onPress={() => { LayoutAnimation.easeInEaseOut(); setOpen(on ? null : r.key); }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name={r.icon} size={20} color={SHADES.amberDeep} />
                <Text style={s.accLabel}>{r.label}</Text>
                <Feather name={on ? 'chevron-up' : 'chevron-down'} size={18} color={SHADES.carbonMuted} />
              </TouchableOpacity>
              {on && (
                <View style={s.accBody}>
                  {r.kind === 'kv'
                    ? r.items.map(kv => (
                      <View key={kv.label} style={s.kv}>
                        <Text style={s.kvLabel}>{kv.label}</Text>
                        <Text style={s.kvValue}>{kv.value}</Text>
                      </View>
                    ))
                    : r.items.map(t => (
                      <View key={t} style={s.li}>
                        <Feather name={r.kind === 'check' ? 'check' : 'circle'} size={r.kind === 'check' ? 14 : 6} color={SHADES.amberDeep} style={{ marginTop: r.kind === 'check' ? 3 : 7 }} />
                        <Text style={s.liText}>{t}</Text>
                      </View>
                    ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── 10 · How it works ────────────────────────────────────────────────────────

export function HowItWorks({
  depositLak, residentPct, points, pointsLine, street, hours, readyHours, onVerify, onDirections,
}: {
  depositLak: number | null;
  residentPct: number | null;
  points: number | null;
  pointsLine: string | null;
  street: string;
  hours: string;
  readyHours: number;
  onVerify: () => void;
  onDirections: () => void;
}) {
  const h = PRODUCT_COPY.how;
  return (
    <View>
      <SectionTitle>{h.title}</SectionTitle>
      <View style={[UI.card, { paddingHorizontal: 16 }]}>
        {depositLak != null && (
          <View style={s.howRow}>
            <IconCircle icon={{ name: 'shield' }} tone="carbon" size={44} />
            <View style={{ flex: 1 }}>
              <Text style={UI.title}>{h.deposit(n(depositLak))}</Text>
              {residentPct != null ? (
                <Text style={UI.subtitle}>
                  {h.residentLess(residentPct)}
                  <Text style={{ color: SHADES.amberText, fontWeight: '700' }} onPress={onVerify}>{h.verify}</Text>
                </Text>
              ) : <Text style={UI.subtitle}>{h.depositSub}</Text>}
            </View>
          </View>
        )}
        <View style={[s.howRow, depositLak != null && s.sepTop]}>
          <IconCircle icon={{ set: 'mci', name: 'cash-multiple' }} tone="amber" size={44} />
          <View style={{ flex: 1 }}>
            <Text style={UI.title}>{h.payTitle}</Text>
            <Text style={UI.subtitle}>{h.paySub}</Text>
          </View>
        </View>
        {points != null && points > 0 && (
          <View style={[s.howRow, s.sepTop]}>
            <View style={[s.fCircle44, { backgroundColor: SHADES.amberMid }]}>
              <Feather name="award" size={20} color={SHADES.carbon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={UI.title}>{h.points(points)}</Text>
              {!!pointsLine && <Text style={UI.subtitle}>{pointsLine}</Text>}
            </View>
          </View>
        )}
        <View style={[s.howRow, s.sepTop]}>
          <IconCircle icon={{ name: 'map-pin' }} tone="grey" size={44} />
          <View style={{ flex: 1 }}>
            <Text style={UI.title} numberOfLines={1}>{h.pickup(street)}</Text>
            <Text style={UI.subtitle}>{h.pickupSub(hours, readyHours)}</Text>
          </View>
          <TouchableOpacity onPress={onDirections} hitSlop={8}>
            <Text style={UI.link}>{h.directions}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── 11 · Reviews ─────────────────────────────────────────────────────────────

export function ReviewsBlock({ rating, count, latest, onSeeAll }: {
  rating: number; count: number; latest: ReviewDoc | null; onSeeAll: () => void;
}) {
  const r = PRODUCT_COPY.reviews;
  return (
    <View>
      <View style={s.revHead}>
        <SectionTitle style={{ marginTop: 0, marginBottom: 0 }}>{r.title}</SectionTitle>
        <TouchableOpacity onPress={onSeeAll} hitSlop={8}><Text style={UI.link}>{r.seeAll(count)}</Text></TouchableOpacity>
      </View>
      <View style={[UI.card, { paddingHorizontal: 16, paddingTop: 16 }]}>
        <View style={s.summary}>
          <Text style={s.big}>{rating.toFixed(1)}</Text>
          <View>
            <View style={{ flexDirection: 'row', gap: 2 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <Feather key={i} name="star" size={15} color={i <= Math.round(rating) ? SHADES.amber : SHADES.carbonFaint} />
              ))}
            </View>
            <Text style={[UI.subtitle, { marginTop: 4 }]}>{r.summary(count)}</Text>
          </View>
        </View>
        {latest && <ReviewCard review={latest} divider />}
      </View>
    </View>
  );
}

// ── 13 · A question about this item? ─────────────────────────────────────────

export function QuestionRow({ onPress }: { onPress: () => void }) {
  return (
    <PressScale style={[UI.card, s.question]} onPress={onPress}>
      <IconCircle icon={{ name: 'message-circle' }} tone="amber" size={46} />
      <View style={{ flex: 1 }}>
        <Text style={UI.title}>{PRODUCT_COPY.question.title}</Text>
        <Text style={UI.subtitle}>{PRODUCT_COPY.question.sub}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={SHADES.amberText} />
    </PressScale>
  );
}

const s = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: SHADES.white, borderRadius: 18,
    borderWidth: 0.5, borderColor: SHADES.border, paddingLeft: 5, paddingRight: 10, height: 34,
  },
  catText: { fontSize: 14, fontWeight: '600', color: SHADES.carbon },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 9, height: 28 },
  bAmber: { backgroundColor: SHADES.amber },
  bLight: { backgroundColor: SHADES.amberLight },
  bCarbon: { backgroundColor: SHADES.carbon },
  badgeText: { fontSize: 13, fontWeight: '700', color: SHADES.carbon },
  title: { fontSize: 21, fontWeight: '800', color: SHADES.carbon, letterSpacing: -0.3, lineHeight: 27, marginTop: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pfChip: { backgroundColor: SHADES.white, borderRadius: 10, borderWidth: 0.5, borderColor: SHADES.border, paddingHorizontal: 12, paddingVertical: 7 },
  pfText: { fontSize: 14, fontWeight: '500', color: SHADES.carbon },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 14 },
  feature: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  featureText: { flex: 1, fontSize: 14, fontWeight: '600', color: SHADES.carbon },
  fCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  fCircle44: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  desc: { fontSize: 15, fontWeight: '500', color: SHADES.carbonSoft, lineHeight: 22 },
  tierRow: { flexDirection: 'row', gap: 6 },
  tier: {
    flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 10, backgroundColor: SHADES.white,
    borderWidth: 0.5, borderColor: SHADES.border,
  },
  tierFirst: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },
  tierBest: { backgroundColor: SHADES.amberLight, borderColor: SHADES.amberLight },
  tierLabel: { fontSize: 11, fontWeight: '500', color: SHADES.carbonMuted },
  tierPrice: { fontSize: 15, fontWeight: '800', color: SHADES.carbon, marginTop: 2 },
  tierDisc: { fontSize: 11.5, fontWeight: '700', color: SHADES.amberText, marginTop: 1 },
  bold: { fontWeight: '800', color: SHADES.carbon },
  why: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon, padding: 20, marginTop: 24 },
  whyLabel: { fontSize: 14, fontWeight: '700', color: SHADES.amber, marginBottom: 8 },
  whyBig: { fontSize: 19, fontWeight: '800', color: SHADES.white, lineHeight: 25 },
  whyKicker: { fontSize: 14, fontWeight: '500', color: SHADES.carbonFaint, marginTop: 10 },
  sepTop: { borderTopWidth: 0.5, borderTopColor: SHADES.border },
  accRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  accLabel: { flex: 1, fontSize: 15.5, fontWeight: '600', color: SHADES.carbon },
  accBody: { paddingBottom: 14, paddingLeft: 32, gap: 8 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  kvLabel: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, flexShrink: 1 },
  kvValue: { fontSize: 14, fontWeight: '600', color: SHADES.carbon, flexShrink: 1, textAlign: 'right' },
  li: { flexDirection: 'row', gap: 10 },
  liText: { flex: 1, fontSize: 14, fontWeight: '500', color: SHADES.carbon, lineHeight: 20 },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  revHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingBottom: 14 },
  big: { fontSize: 40, fontWeight: '800', color: SHADES.carbon, letterSpacing: -1 },
  question: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, marginTop: 20 },
});
