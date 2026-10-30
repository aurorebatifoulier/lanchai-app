import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useScreenInsets } from '@/components/account/ui';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { effectiveStock, computeAvailableUnits, type OccupancyRecord } from '@/utils/availability';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  name: string;
  stockLeft: number;
  inRepairUnits: number;
  lostUnits: number;
  pendingSettlementUnits: number;
  status: 'draft' | 'published' | 'archived';
}

interface OverdueRow {
  id: string;
  productName: string;
  returnAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminInventoryScreen() {
  // Top + bottom insets: the list stops above the Android 3-button / gesture bar.
  const screen = useScreenInsets();
  const router = useRouter();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [occupancyByProductId, setOccupancyByProductId] = useState<Record<string, OccupancyRecord[]>>({});
  const [overdue, setOverdue] = useState<OverdueRow[]>([]);

  // Live product list — status/condition counts (inRepairUnits/lostUnits/archived)
  // update instantly, matching the already-established onSnapshot convention on
  // app/admin/products.tsx and app/admin/claims.tsx.
  useEffect(() => {
    return onSnapshot(
      collection(db, 'products'),
      snap => {
        setProducts(snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? '',
            stockLeft: data.quantity ?? data.stockLeft ?? 0,
            inRepairUnits: data.inRepairUnits ?? 0,
            lostUnits: data.lostUnits ?? 0,
            pendingSettlementUnits: data.pendingSettlementUnits ?? 0,
            status: data.status ?? 'draft',
          };
        }));
        setLoadingProducts(false);
      },
      () => setLoadingProducts(false),
    );
  }, []);

  // Single collection-wide listener, not one per product — reservationOccupancy is
  // small, flat, and PII-free (functions/src/index.ts's syncReservationOccupancy
  // deletes terminal reservations from it rather than keeping them stale), so one
  // subscription covers every product's live occupancy at once. Grouped by
  // productId client-side, mirroring app/bag.tsx's stockMap/conflictMap shape at
  // catalogue scope instead of per-bag scope.
  useEffect(() => {
    return onSnapshot(collection(db, 'reservationOccupancy'), snap => {
      const grouped: Record<string, OccupancyRecord[]> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const pickupAt: Timestamp | undefined = data.pickupAt;
        const returnAt: Timestamp | undefined = data.returnAt;
        if (!pickupAt || !returnAt || !data.productId) return;
        const record: OccupancyRecord = {
          pickupAt: pickupAt.toMillis(),
          returnAt: returnAt.toMillis(),
          quantity: data.quantity ?? 0,
          reservationId: d.id,
        };
        (grouped[data.productId] ??= []).push(record);
      });
      setOccupancyByProductId(grouped);
    });
  }, []);

  // Mirrors functions/src/index.ts's lateReturnAlerts detection exactly (status ==
  // 'active' AND returnAt in the past) so the two can't silently diverge — this is
  // a display-only reuse of that same logic, not a second competing definition.
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'reservations'), where('status', '==', 'active')),
      snap => {
        const now = Date.now();
        const rows: OverdueRow[] = [];
        snap.docs.forEach(d => {
          const data = d.data();
          const returnAt: Timestamp | undefined = data.returnAt;
          if (!returnAt || returnAt.toMillis() >= now) return;
          rows.push({ id: d.id, productName: data.productName ?? '', returnAt: returnAt.toMillis() });
        });
        setOverdue(rows);
      },
    );
  }, []);

  // Six unit-count buckets, all summed as units (not product/listing counts).
  // Debug invariant: available + rented + inRepair + pendingSettlement + lost +
  // removed should equal the sum of stockLeft across every product.
  const { buckets, perProduct, soldOutPublished, pendingSettlement } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setDate(todayEnd.getDate() + 1);

    let available = 0, rented = 0, inRepair = 0, lost = 0, removed = 0, pending = 0;
    const perProduct: Record<string, { available: number; rented: number }> = {};
    const soldOutPublished: ProductRow[] = [];
    const pendingSettlement: ProductRow[] = [];

    products.forEach(p => {
      if (p.status === 'archived') {
        removed += p.stockLeft;
        return;
      }
      const eff = effectiveStock(p);
      const occ = occupancyByProductId[p.id] ?? [];
      const availNow = computeAvailableUnits(occ, today, todayEnd, eff);
      const rentedNow = Math.max(0, eff - availNow);
      available += availNow;
      rented += rentedNow;
      inRepair += p.inRepairUnits;
      lost += p.lostUnits;
      pending += p.pendingSettlementUnits;
      perProduct[p.id] = { available: availNow, rented: rentedNow };
      if (p.status === 'published' && availNow <= 0) soldOutPublished.push(p);
      if (p.pendingSettlementUnits > 0) pendingSettlement.push(p);
    });

    return {
      buckets: { available, rented, inRepair, pending, lost, removed },
      perProduct,
      soldOutPublished,
      pendingSettlement,
    };
  }, [products, occupancyByProductId]);

  const nonArchived = useMemo(() => products.filter(p => p.status !== 'archived'), [products]);
  const loading = loadingProducts;

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />

      {/* Fixed top: header + summary + attention — grouped in one flexShrink:0
          wrapper above the scrolling list (Android/Fabric new-arch layout fix,
          required whenever a screen stacks fixed content above a flex:1 list). */}
      <View style={s.topFixed}>
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>Inventory</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.bucketRow}
        >
          <BucketCard label="Available" value={buckets.available} color={COLORS.success} />
          <BucketCard label="Rented" value={buckets.rented} color={COLORS.pending} />
          <BucketCard label="In repair" value={buckets.inRepair} color="#92400E" />
          <BucketCard label="Pending settlement" value={buckets.pending} color={COLORS.fg2} />
          <BucketCard label="Lost" value={buckets.lost} color={COLORS.danger} />
          <BucketCard label="Removed" value={buckets.removed} color={COLORS.fg3} />
        </ScrollView>

        {(overdue.length > 0 || soldOutPublished.length > 0 || pendingSettlement.length > 0) && (
          <View style={s.attentionBox}>
            <Text style={s.attentionTitle}>Needs attention</Text>
            {overdue.map(r => (
              <TouchableOpacity
                key={r.id}
                style={s.attentionRow}
                onPress={() => router.push(`/admin/reservations/${r.id}`)}
                activeOpacity={0.75}
              >
                <Feather name="alert-triangle" size={13} color={COLORS.danger} />
                <Text style={s.attentionText} numberOfLines={1}>
                  Overdue: {r.productName}
                </Text>
                <Feather name="chevron-right" size={14} color={COLORS.fg3} />
              </TouchableOpacity>
            ))}
            {soldOutPublished.map(p => (
              <TouchableOpacity
                key={p.id}
                style={s.attentionRow}
                onPress={() => router.push(`/admin/inventory/${p.id}`)}
                activeOpacity={0.75}
              >
                <Feather name="alert-circle" size={13} color="#92400E" />
                <Text style={s.attentionText} numberOfLines={1}>
                  Sold out, still published: {p.name}
                </Text>
                <Feather name="chevron-right" size={14} color={COLORS.fg3} />
              </TouchableOpacity>
            ))}
            {pendingSettlement.map(p => (
              <TouchableOpacity
                key={p.id}
                style={s.attentionRow}
                onPress={() => router.push(`/admin/inventory/${p.id}`)}
                activeOpacity={0.75}
              >
                <Feather name="info" size={13} color={COLORS.fg2} />
                <Text style={s.attentionText} numberOfLines={1}>
                  Returned, deposit not settled ({p.pendingSettlementUnits}): {p.name}
                </Text>
                <Feather name="chevron-right" size={14} color={COLORS.fg3} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Scrolling product list — the only other flex sibling. */}
      <ScrollView
        style={s.list}
        contentContainerStyle={[s.listContent, (loading || nonArchived.length === 0) && s.listContentCenter, { paddingBottom: screen.contentBottom }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.amber} />
        ) : nonArchived.length === 0 ? (
          <Text style={s.emptyText}>No products yet.</Text>
        ) : (
          nonArchived.map((p, i) => {
            const stats = perProduct[p.id] ?? { available: 0, rented: 0 };
            return (
              <React.Fragment key={p.id}>
                {i > 0 && <View style={s.sep} />}
                <TouchableOpacity
                  style={s.row}
                  onPress={() => router.push(`/admin/inventory/${p.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={s.rowMain}>
                    <Text style={s.rowName} numberOfLines={1}>{p.name}</Text>
                    <Text style={s.rowMeta} numberOfLines={1}>
                      {stats.available} available · {stats.rented} rented
                      {p.inRepairUnits > 0 ? ` · ${p.inRepairUnits} in repair` : ''}
                      {p.pendingSettlementUnits > 0 ? ` · ${p.pendingSettlementUnits} pending settlement` : ''}
                      {p.lostUnits > 0 ? ` · ${p.lostUnits} lost` : ''}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={15} color={COLORS.fg3} />
                </TouchableOpacity>
              </React.Fragment>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function BucketCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.bucketCard}>
      <Text style={[s.bucketValue, { color }]}>{value}</Text>
      <Text style={s.bucketLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  topFixed: { flexShrink: 0 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0,
    textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },

  bucketRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  bucketCard: {
    minWidth: 84,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 4,
  },
  bucketValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  bucketLabel: { fontSize: 11, fontWeight: '600', color: COLORS.fg3 },

  attentionBox: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: COLORS.warmBeige,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 12,
    gap: 8,
  },
  attentionTitle: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.2,
    color: COLORS.fg3,
  },
  attentionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  attentionText: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.carbon },

  list: { flex: 1 },
  listContent: { paddingTop: 4, paddingBottom: 24 },
  listContentCenter: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 0 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  rowMain: { flex: 1, gap: 3 },
  rowName: { fontSize: 14, fontWeight: '700', color: COLORS.carbon, letterSpacing: -0.1 },
  rowMeta: { fontSize: 12, fontWeight: '500', color: COLORS.fg3 },
  sep: { height: 1, backgroundColor: COLORS.softGray200, marginLeft: 20 },

  emptyText: { fontSize: 14, fontWeight: '600', color: COLORS.fg3 },
});
