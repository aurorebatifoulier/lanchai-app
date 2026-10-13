import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { overdueSeverity, overdueLabel, overdueChipColors } from '@/utils/overdue';
import {
  RentalDoc,
  AdminTask,
  UserProfile,
  addAdminTask,
  updateAdminTask,
  deleteAdminTask,
  getUserProfile,
} from '@/lib/firestore';

// ── helpers ───────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtLak(n: number): string {
  return `${n.toLocaleString('en-US')} LAK`;
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, label, color }: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
}) {
  return (
    <View style={sh.row}>
      <Feather name={icon} size={15} color={color} />
      <Text style={[sh.label, { color }]}>{label}</Text>
    </View>
  );
}

const sh = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
});

function ReservationRow({ item, type, profile, onPress }: {
  item: RentalDoc;
  type: 'pickup' | 'return' | 'overdue' | 'pending';
  profile?: UserProfile;
  onPress: () => void;
}) {
  const timeLabel = type === 'return' || type === 'overdue' ? item.returnLabel : item.pickupLabel;
  const phone = profile?.phoneNumber ?? profile?.phone ?? null;
  const verified = profile?.phoneVerified ?? false;
  const showDeposit = type !== 'pending' && item.deposit > 0 && (type === 'pickup' || !item.depositReturned);
  const overdueChip = type === 'overdue' && item.returnAt
    ? { sev: overdueSeverity(item.returnAt), label: overdueLabel(item.returnAt) }
    : null;

  const depositLabel = type === 'pickup'
    ? `Collect deposit: ${fmtLak(item.deposit)}`
    : `Return deposit: ${fmtLak(item.deposit)}`;

  return (
    <TouchableOpacity
      style={[
        rr.card,
        type === 'overdue' && {
          backgroundColor: item.returnAt && overdueSeverity(item.returnAt) === 'severe' ? '#FEE2E2' : '#FFF8F8',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={{ flex: 1 }}>
        <Text style={rr.product} numberOfLines={1}>{item.productName}</Text>
        {timeLabel ? <Text style={rr.timeLabel} numberOfLines={1}>{timeLabel}</Text> : null}
        {overdueChip ? (() => {
          const { bg, border: bdr, fg: txt } = overdueChipColors(overdueChip.sev);
          return (
            <View style={[rr.depositChip, { backgroundColor: bg, borderColor: bdr, marginBottom: 4 }]}>
              <Text style={[rr.depositChipText, { color: txt }]}>{overdueChip.label}</Text>
            </View>
          );
        })() : null}
        <View style={rr.phoneRow}>
          <Text style={rr.renterName} numberOfLines={1}>
            {item.renterName ?? '—'}{phone ? ` · ${phone}` : ''}
          </Text>
          {phone ? (
            <View style={[rr.phoneBadge, verified ? rr.badgeVerified : rr.badgeUnverified]}>
              <Feather name={verified ? 'check-circle' : 'clock'} size={10} color={verified ? '#065F46' : COLORS.amberTintText} />
              <Text style={[rr.phoneBadgeText, verified ? rr.badgeTextVerified : rr.badgeTextUnverified]}>
                {verified ? 'Verified' : 'Not verified'}
              </Text>
            </View>
          ) : null}
        </View>
        {showDeposit && (
          <View style={rr.depositChip}>
            <Text style={rr.depositChipText}>{depositLabel}</Text>
          </View>
        )}
      </View>
      <Feather name="chevron-right" size={16} color={COLORS.fg3} style={{ flexShrink: 0 }} />
    </TouchableOpacity>
  );
}

const rr = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 13,
    marginBottom: 8,
    gap: 10,
  },
  product: { fontSize: 14, fontWeight: '700', color: COLORS.carbon, marginBottom: 2 },
  timeLabel: { fontSize: 12, color: COLORS.fg3, fontWeight: '500', marginBottom: 3 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  renterName: { fontSize: 12, color: COLORS.fg2, fontWeight: '500', flexShrink: 1 },
  phoneBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1,
  },
  badgeVerified: { backgroundColor: '#D1FAE5', borderColor: '#A7F3D0' },
  badgeUnverified: { backgroundColor: COLORS.amberTint, borderColor: COLORS.amberTintBorder },
  phoneBadgeText: { fontSize: 10, fontWeight: '700' },
  badgeTextVerified: { color: '#065F46' },
  badgeTextUnverified: { color: COLORS.amberTintText },
  depositChip: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.amberTint,
    borderWidth: 1,
    borderColor: COLORS.amberTintBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  depositChipText: { fontSize: 11, fontWeight: '700', color: COLORS.amberTintText },
});

// ── main screen ───────────────────────────────────────────────────────────────

export default function AdminCalendarDayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAdmin, loading: authLoading, adminLoading } = useAuth();
  const { date } = useLocalSearchParams<{ date: string }>();

  // Memoized to stabilize object references — prevents fetchDay from being
  // recreated on every render, which would cause the useEffect to re-fire
  // indefinitely and keep the spinner running.
  const parsedDate = useMemo(
    () => new Date((date ?? '') + 'T12:00:00'),
    [date],
  );
  const dayStart = useMemo(
    () => Timestamp.fromDate(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0)),
    [parsedDate],
  );
  const dayEnd = useMemo(
    () => Timestamp.fromDate(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate() + 1, 0, 0, 0, 0)),
    [parsedDate],
  );
  const todayKey = toDateKey(new Date());
  const isToday = date === todayKey;
  const displayDate = `${DAY_NAMES[parsedDate.getDay()]} ${parsedDate.getDate()} ${MONTH_NAMES[parsedDate.getMonth()]}`;

  const [pending, setPending] = useState<RentalDoc[]>([]);
  const [pickups, setPickups] = useState<RentalDoc[]>([]);
  const [returns, setReturns] = useState<RentalDoc[]>([]);
  const [overdue, setOverdue] = useState<RentalDoc[]>([]);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [renterProfiles, setRenterProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(false);

  const fetchDay = useCallback(async () => {
    const queries: Promise<any>[] = [
      getDocs(query(collection(db, 'reservations'), where('pickupAt', '>=', dayStart), where('pickupAt', '<', dayEnd))),
      getDocs(query(collection(db, 'reservations'), where('returnAt', '>=', dayStart), where('returnAt', '<', dayEnd))),
      getDocs(query(collection(db, 'adminTasks'), where('date', '>=', dayStart), where('date', '<', dayEnd))),
    ];
    if (isToday) {
      queries.push(getDocs(query(collection(db, 'reservations'), where('status', '==', 'active'))));
    }

    const results = await Promise.all(queries);
    const [pickupSnap, returnSnap, taskSnap] = results;

    const allPickups = pickupSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as RentalDoc));
    const allReturns = returnSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as RentalDoc));
    const allTasks = taskSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as AdminTask));

    const filteredPending = allPickups.filter((r: RentalDoc) => r.status === 'pending_payment');
    const filteredPickups = allPickups.filter((r: RentalDoc) => r.status === 'confirmed');
    const filteredReturns = allReturns.filter((r: RentalDoc) => r.status === 'active');

    let overdueList: RentalDoc[] = [];
    if (isToday) {
      const activeSnap = results[3];
      const allActive = activeSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as RentalDoc));
      overdueList = allActive.filter((r: RentalDoc) => r.returnAt && r.returnAt.toMillis() < dayStart.toMillis());
    }

    setPending(filteredPending);
    setPickups(filteredPickups);
    setReturns(filteredReturns);
    setOverdue(overdueList);
    setTasks(allTasks);

    // Secondary fetch: load user profiles for all renters appearing in the day's reservations
    const renterIds = [...new Set([...filteredPending, ...filteredPickups, ...filteredReturns, ...overdueList].map(r => r.renterId))];
    const profiles: Record<string, UserProfile> = {};
    await Promise.all(renterIds.map(async uid => {
      try {
        const p = await getUserProfile(uid);
        if (p) profiles[uid] = p;
      } catch {}
    }));
    setRenterProfiles(profiles);
  }, [dayStart, dayEnd, isToday]);

  useEffect(() => {
    if (authLoading || adminLoading || !isAdmin) return;
    setFetchError(false);
    setLoading(true);
    fetchDay()
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [authLoading, adminLoading, isAdmin, fetchDay]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setFetchError(false);
    try { await fetchDay(); } catch { setFetchError(true); }
    setRefreshing(false);
  }, [fetchDay]);

  const handleToggle = useCallback(async (task: AdminTask) => {
    const next = !task.completed;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: next } : t));
    try { await updateAdminTask(task.id, { completed: next }); } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: task.completed } : t));
    }
  }, []);

  const handleDeleteConfirm = useCallback(async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    setDeletingId(null);
    try { await deleteAdminTask(id); } catch {
      // silent — user can refresh to restore
    }
  }, []);

  const handleAddTask = useCallback(async () => {
    if (!newTitle.trim() || !user) return;
    setAdding(true);
    setAddError(false);
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: AdminTask = {
      id: optimisticId,
      title: newTitle.trim(),
      note: newNote.trim() || undefined,
      date: dayStart,
      completed: false,
      createdAt: Timestamp.now(),
      createdBy: user.uid,
    };
    setTasks(prev => [...prev, optimistic]);
    setNewTitle('');
    setNewNote('');
    try {
      const realId = await addAdminTask({
        title: optimistic.title,
        note: optimistic.note,
        date: dayStart,
        completed: false,
        createdBy: user.uid,
      });
      setTasks(prev => prev.map(t => t.id === optimisticId ? { ...t, id: realId } : t));
    } catch {
      setTasks(prev => prev.filter(t => t.id !== optimisticId));
      setAddError(true);
    }
    setAdding(false);
  }, [newTitle, newNote, user, dayStart]);

  const noReservations = pending.length === 0 && pickups.length === 0 && returns.length === 0 && overdue.length === 0;
  const isEmpty = noReservations && tasks.length === 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.fixedTop}>
        <View style={s.header}>
          <BackButton onPress={() => router.back()} style={{ flexShrink: 0 }} />
          <Text style={s.headerTitle} numberOfLines={1}>{displayDate}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.amber}
            colors={[COLORS.amber]}
          />
        }
      >
        {loading && !refreshing ? (
          <ActivityIndicator size="small" color={COLORS.amber} style={{ marginTop: 40 }} />
        ) : fetchError ? (
          <Text style={s.errorText}>Failed to load — pull to refresh</Text>
        ) : (
          <>
            {/* ── Awaiting payment ── */}
            {pending.length > 0 && (
              <View style={s.section}>
                <SectionHeader icon="credit-card" label="Awaiting payment" color={COLORS.pending} />
                {pending.map(r => (
                  <ReservationRow
                    key={r.id}
                    item={r}
                    type="pending"
                    profile={renterProfiles[r.renterId]}
                    onPress={() => router.push(`/admin/reservations/${r.id}` as any)}
                  />
                ))}
              </View>
            )}

            {/* ── Pickups ── */}
            {pickups.length > 0 && (
              <View style={s.section}>
                <SectionHeader icon="arrow-up-circle" label="Pickups today" color={COLORS.amber} />
                {pickups.map(r => (
                  <ReservationRow
                    key={r.id}
                    item={r}
                    type="pickup"
                    profile={renterProfiles[r.renterId]}
                    onPress={() => router.push(`/admin/reservations/${r.id}` as any)}
                  />
                ))}
              </View>
            )}

            {/* ── Returns ── */}
            {returns.length > 0 && (
              <View style={s.section}>
                <SectionHeader icon="arrow-down-circle" label="Returns today" color={COLORS.success} />
                {returns.map(r => {
                  const rowIsOverdue = r.returnAt && r.returnAt.toMillis() < Date.now();
                  return (
                    <ReservationRow
                      key={r.id}
                      item={r}
                      type={rowIsOverdue ? 'overdue' : 'return'}
                      profile={renterProfiles[r.renterId]}
                      onPress={() => router.push(`/admin/reservations/${r.id}` as any)}
                    />
                  );
                })}
              </View>
            )}

            {/* ── Overdue (today only) ── */}
            {isToday && overdue.length > 0 && (
              <View style={s.section}>
                <SectionHeader icon="alert-circle" label="Overdue returns" color={COLORS.danger} />
                {overdue.map(r => (
                  <ReservationRow
                    key={r.id}
                    item={r}
                    type="overdue"
                    profile={renterProfiles[r.renterId]}
                    onPress={() => router.push(`/admin/reservations/${r.id}` as any)}
                  />
                ))}
              </View>
            )}

            {/* ── Empty state for reservations ── */}
            {noReservations && !isEmpty && (
              <Text style={s.noReservations}>No reservations for this day</Text>
            )}

            {isEmpty && (
              <Text style={s.emptyText}>Nothing scheduled for this day</Text>
            )}

            {/* ── Tasks (always rendered) ── */}
            <View style={s.section}>
              <SectionHeader icon="check-square" label="Tasks" color={COLORS.carbon} />

              {tasks.map(task => (
                <View key={task.id} style={s.taskCard}>
                  <TouchableOpacity
                    style={s.taskCheckbox}
                    onPress={() => handleToggle(task)}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name={task.completed ? 'check-square' : 'square'}
                      size={20}
                      color={task.completed ? COLORS.success : COLORS.fg3}
                    />
                  </TouchableOpacity>

                  <View style={{ flex: 1 }}>
                    <Text style={[s.taskTitle, task.completed && s.taskTitleDone]}>
                      {task.title}
                    </Text>
                    {task.note ? <Text style={s.taskNote}>{task.note}</Text> : null}
                  </View>

                  {deletingId === task.id ? (
                    <View style={s.deleteConfirm}>
                      <Text style={s.deleteQuestion}>Delete?</Text>
                      <TouchableOpacity onPress={() => handleDeleteConfirm(task.id)} activeOpacity={0.7}>
                        <Text style={s.deleteYes}>Yes</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setDeletingId(null)} activeOpacity={0.7}>
                        <Text style={s.deleteNo}>No</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setDeletingId(task.id)}
                      activeOpacity={0.7}
                      style={s.trashBtn}
                    >
                      <Feather name="trash-2" size={16} color={COLORS.fg3} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {/* Add task form */}
              <View style={s.addForm}>
                <TextInput
                  style={s.addInput}
                  placeholder="Task title…"
                  placeholderTextColor={COLORS.fg3}
                  value={newTitle}
                  onChangeText={setNewTitle}
                  returnKeyType="next"
                  maxLength={120}
                />
                <TextInput
                  style={[s.addInput, s.addInputNote]}
                  placeholder="Note (optional)"
                  placeholderTextColor={COLORS.fg3}
                  value={newNote}
                  onChangeText={setNewNote}
                  returnKeyType="done"
                  maxLength={300}
                />
                {addError && (
                  <Text style={s.addError}>Failed to save task — try again</Text>
                )}
                <TouchableOpacity
                  style={[s.addBtn, (!newTitle.trim() || adding) && s.addBtnDisabled]}
                  onPress={handleAddTask}
                  disabled={!newTitle.trim() || adding}
                  activeOpacity={0.8}
                >
                  {adding ? (
                    <ActivityIndicator size="small" color={COLORS.carbon} />
                  ) : (
                    <Text style={s.addBtnLabel}>Add task</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  fixedTop: {
    flexShrink: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    backgroundColor: COLORS.white,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
    paddingHorizontal: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  section: {
    marginBottom: 24,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
    color: COLORS.fg3,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    color: COLORS.fg3,
    marginBottom: 24,
  },
  noReservations: {
    fontSize: 13,
    color: COLORS.fg3,
    marginBottom: 24,
  },
  // ── Task card ──
  taskCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  taskCheckbox: {
    paddingTop: 1,
    flexShrink: 0,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.carbon,
    marginBottom: 2,
  },
  taskTitleDone: {
    color: COLORS.fg3,
    textDecorationLine: 'line-through',
  },
  taskNote: {
    fontSize: 12,
    color: COLORS.fg3,
    lineHeight: 16,
  },
  trashBtn: {
    padding: 2,
    flexShrink: 0,
  },
  deleteConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  deleteQuestion: {
    fontSize: 12,
    color: COLORS.fg2,
    fontWeight: '600',
  },
  deleteYes: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
  deleteNo: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg3,
  },
  // ── Add task form ──
  addForm: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    gap: 10,
    marginTop: 4,
  },
  addInput: {
    backgroundColor: COLORS.porcelain,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.carbon,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  addInputNote: {
    fontSize: 13,
  },
  addError: {
    fontSize: 12,
    color: COLORS.danger,
  },
  addBtn: {
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    opacity: 0.45,
  },
  addBtnLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
  },
});
