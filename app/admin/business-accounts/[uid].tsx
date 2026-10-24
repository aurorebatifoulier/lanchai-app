import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { sendNotif } from '@/lib/notifications';
import { BTOB_STATUS_CONFIG } from '@/utils/btob';
import { ConfirmBox } from '@/components/ConfirmBox';
import {
  BTOB_REJECTION_REASONS, BTOB_REJECTION_KEYS, isBtobRejectionKey, type BtobRejectionKey,
} from '@/functions/src/shared/btob';

type BtobStatus = 'pending_approval' | 'approved' | 'rejected';

interface BusinessAccount {
  id: string;
  btobCompanyName?: string;
  btobLicenseNumber?: string;
  btobResponsibleName?: string;
  btobDocumentUrl?: string;
  btobStatus?: BtobStatus;
  btobSubmittedAt?: Timestamp;
  btobRejectionReason?: string;          // preset key (functions/src/shared/btob.ts)
  btobRejectionText?: string;
  btobRejectionFixable?: boolean;
  btobPreviousRejection?: { reason: string | null; text: string | null; reviewedBy: string | null };
  btobReviewedAt?: Timestamp;
  btobReviewedBy?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

function fmtDateTime(ts: Timestamp | undefined): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminBusinessAccountDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();

  const [account, setAccount] = useState<BusinessAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);
  const [staffName, setStaffName] = useState('');
  // Rejection: preset reason (shared list), optional/required free text, and for
  // "other" the admin chooses whether the applicant can fix it and resubmit.
  const [rejectKey, setRejectKey] = useState<BtobRejectionKey | null>(null);
  const [rejectText, setRejectText] = useState('');
  const [otherFixable, setOtherFixable] = useState<boolean | null>(null);
  const rejectPreset = rejectKey ? BTOB_REJECTION_REASONS[rejectKey] : null;
  const rejectFixable = rejectPreset ? (rejectPreset.fixable ?? otherFixable) : null;
  const rejectReady = !!rejectKey && rejectFixable !== null
    && (!rejectPreset?.textRequired || rejectText.trim().length > 0);

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then(snap => {
        if (!snap.exists()) { setLoading(false); return; }
        setAccount({ id: snap.id, ...snap.data() } as BusinessAccount);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [uid]);

  const runAction = useCallback(async (
    firestoreUpdates: Record<string, unknown>,
    localUpdates: Partial<BusinessAccount>,
    onSuccess?: () => void,
  ) => {
    if (!uid || actioning) return;
    setActioning(true);
    setActionError(null);
    try {
      await updateDoc(doc(db, 'users', uid), { ...firestoreUpdates, updatedAt: serverTimestamp() });
      setAccount(prev => prev ? { ...prev, ...localUpdates } : prev);
      setConfirmAction(null);
      setStaffName('');
      setRejectKey(null);
      setRejectText('');
      setOtherFixable(null);
      onSuccess?.();
    } catch (err) {
      console.error('[BusinessAccountDetail] action error:', err);
      setActionError('Failed to update. Please try again.');
    } finally {
      setActioning(false);
    }
  }, [uid, actioning]);

  const handleApprove = () => {
    if (!uid) return;
    runAction(
      {
        btobStatus: 'approved',
        customerType: 'business',
        btobReviewedAt: serverTimestamp(),
        btobReviewedBy: staffName.trim(),
      },
      { btobStatus: 'approved', btobReviewedBy: staffName.trim() },
      () => sendNotif(uid, {
        type: 'account',
        icon: 'check',
        iconColor: 'green',
        title: 'Business account approved',
        body: 'Your business account has been approved — you can now use LANCHAI.',
        deepLink: '/',
      }),
    );
  };

  const handleReject = () => {
    if (!uid) return;
    runAction(
      {
        btobStatus: 'rejected',
        btobRejectionReason: rejectKey,
        btobRejectionText: rejectText.trim(),
        btobRejectionFixable: rejectFixable === true,
        btobReviewedAt: serverTimestamp(),
        btobReviewedBy: staffName.trim(),
      },
      {
        btobStatus: 'rejected', btobRejectionReason: rejectKey ?? undefined, btobRejectionText: rejectText.trim(),
        btobRejectionFixable: rejectFixable === true, btobReviewedBy: staffName.trim(),
      },
      () => sendNotif(uid, {
        type: 'account',
        icon: 'x-circle',
        iconColor: 'coral',
        title: 'Business account application not approved',
        body: 'Your business account application was not approved. Tap for details.',
        deepLink: '/btob-rejected',
      }),
    );
  };

  const header = (
    <View style={d.header}>
      <BackButton onPress={() => router.back()} />
      <Text style={d.headerTitle}>Business account</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (loading) {
    return (
      <View style={[d.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        {header}
        <View style={d.centered}><ActivityIndicator color={COLORS.amber} /></View>
      </View>
    );
  }

  if (!account) {
    return (
      <View style={[d.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        {header}
        <View style={d.centered}><Text style={d.notFound}>Account not found.</Text></View>
      </View>
    );
  }

  const badge = account.btobStatus ? BTOB_STATUS_CONFIG[account.btobStatus] : BTOB_STATUS_CONFIG.pending_approval;

  return (
    <View style={[d.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[d.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        <View style={[d.statusBadge, { backgroundColor: badge.bg, alignSelf: 'flex-start' }]}>
          <Text style={[d.statusBadgeText, { color: badge.fg }]}>{badge.label}</Text>
        </View>

        <View style={d.card}>
          <Text style={d.cardLabel}>Company</Text>
          <InfoRow label="Company name" value={account.btobCompanyName} />
          <InfoRow label="License / registration number" value={account.btobLicenseNumber} />
          <InfoRow label="Responsible person" value={account.btobResponsibleName} />
        </View>

        <View style={d.card}>
          <Text style={d.cardLabel}>Account</Text>
          <InfoRow label="Name on file" value={[account.firstName, account.lastName].filter(Boolean).join(' ') || undefined} />
          <InfoRow label="Phone" value={account.phoneNumber} />
          <InfoRow label="Submitted" value={fmtDateTime(account.btobSubmittedAt)} />
          {account.btobReviewedAt && (
            <InfoRow label="Reviewed" value={`${fmtDateTime(account.btobReviewedAt)} by ${account.btobReviewedBy ?? 'staff'}`} />
          )}
          {account.btobStatus === 'rejected' && account.btobRejectionReason && (
            <InfoRow
              label="Rejection reason"
              value={`${isBtobRejectionKey(account.btobRejectionReason) ? BTOB_REJECTION_REASONS[account.btobRejectionReason].adminLabel : account.btobRejectionReason}${account.btobRejectionFixable ? ' (fixable)' : ' (final)'}${account.btobRejectionText ? ` — ${account.btobRejectionText}` : ''}`}
            />
          )}
          {account.btobStatus === 'pending_approval' && account.btobPreviousRejection?.reason && (
            <InfoRow
              label="Resubmitted after"
              value={`${isBtobRejectionKey(account.btobPreviousRejection.reason) ? BTOB_REJECTION_REASONS[account.btobPreviousRejection.reason].adminLabel : account.btobPreviousRejection.reason}${account.btobPreviousRejection.text ? ` — ${account.btobPreviousRejection.text}` : ''}`}
            />
          )}
        </View>

        <View style={d.card}>
          <Text style={d.cardLabel}>Document</Text>
          {account.btobDocumentUrl ? (
            <TouchableOpacity
              style={d.docLinkRow}
              onPress={() => Linking.openURL(account.btobDocumentUrl!)}
              activeOpacity={0.75}
            >
              <Feather name="file-text" size={14} color={COLORS.carbon} />
              <Text style={d.docLinkText}>View submitted document</Text>
              <Feather name="external-link" size={14} color={COLORS.fg3} />
            </TouchableOpacity>
          ) : (
            <Text style={d.noDocText}>No document on file.</Text>
          )}
        </View>

        {/* ── Actions ────────────────────────────────────────────────────── */}
        <View style={d.actionsCard}>
          <Text style={d.cardLabel}>Actions</Text>

          {actionError && (
            <View style={d.errorBanner}>
              <Feather name="alert-circle" size={14} color={COLORS.danger} />
              <Text style={d.errorBannerText}>{actionError}</Text>
            </View>
          )}

          {actioning && (
            <View style={d.actionLoading}><ActivityIndicator color={COLORS.amber} /></View>
          )}

          {!actioning && confirmAction === 'approve' && (
            <ConfirmBox
              text={`Approve this business account? This sets their account type to Business (0% deposit applies) and lets them use the app immediately.`}
              confirmLabel="Approve"
              cancelLabel="Cancel"
              confirmDisabled={staffName.trim().length === 0}
              onCancel={() => setConfirmAction(null)}
              onConfirm={handleApprove}
            >
              <TextInput
                style={d.nameInput}
                placeholder="Staff member name"
                placeholderTextColor={COLORS.fg3}
                value={staffName}
                onChangeText={setStaffName}
              />
            </ConfirmBox>
          )}

          {!actioning && confirmAction === 'reject' && (
            <ConfirmBox
              text={rejectFixable === false
                ? 'Reject this application? This is final — the applicant can’t resubmit from the app.'
                : 'Reject this application? The applicant will be asked to fix it and resubmit.'}
              confirmLabel="Reject"
              cancelLabel="Cancel"
              confirmDisabled={staffName.trim().length === 0 || !rejectReady}
              onCancel={() => setConfirmAction(null)}
              onConfirm={handleReject}
              destructive
            >
              <TextInput
                style={d.nameInput}
                placeholder="Staff member name"
                placeholderTextColor={COLORS.fg3}
                value={staffName}
                onChangeText={setStaffName}
              />
              <View style={d.chipRow}>
                {BTOB_REJECTION_KEYS.map(key => (
                  <TouchableOpacity
                    key={key}
                    style={[d.chip, rejectKey === key && d.chipActive]}
                    onPress={() => { setRejectKey(key); setOtherFixable(null); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[d.chipText, rejectKey === key && d.chipTextActive]}>{BTOB_REJECTION_REASONS[key].adminLabel}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {rejectKey === 'other' && (
                <View style={d.chipRow}>
                  {([true, false] as const).map(f => (
                    <TouchableOpacity
                      key={String(f)}
                      style={[d.chip, otherFixable === f && d.chipActive]}
                      onPress={() => setOtherFixable(f)}
                      activeOpacity={0.8}
                    >
                      <Text style={[d.chipText, otherFixable === f && d.chipTextActive]}>
                        {f ? 'Fixable — can resubmit' : 'Final'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {rejectPreset && (
                <Text style={d.rejectHint}>
                  {rejectFixable ? `Customer is asked for: ${rejectPreset.need ?? 'see your details below'}` : rejectFixable === false ? `Customer sees: ${rejectPreset.reason ?? 'your details below'}` : ''}
                </Text>
              )}
              <TextInput
                style={d.nameInput}
                placeholder={rejectPreset?.textRequired ? 'Details for the applicant (required)' : 'Details for the applicant (optional)'}
                placeholderTextColor={COLORS.fg3}
                value={rejectText}
                onChangeText={setRejectText}
                multiline
              />
            </ConfirmBox>
          )}

          {!actioning && confirmAction === null && (
            <>
              <TouchableOpacity
                style={d.primaryBtn}
                onPress={() => setConfirmAction('approve')}
                activeOpacity={0.85}
              >
                <Text style={d.primaryBtnText}>
                  {account.btobStatus === 'approved' ? 'Re-approve' : 'Approve'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={d.cancelLink}
                onPress={() => {
                  if (account.btobStatus === 'rejected') {
                    const k = isBtobRejectionKey(account.btobRejectionReason) ? account.btobRejectionReason : null;
                    setRejectKey(k);
                    setRejectText(account.btobRejectionText ?? '');
                    setOtherFixable(k === 'other' ? account.btobRejectionFixable === true : null);
                  }
                  setConfirmAction('reject');
                }}
                activeOpacity={0.7}
              >
                <Text style={d.cancelLinkText}>
                  {account.btobStatus === 'rejected' ? 'Update rejection reason' : 'Reject'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value}>{value}</Text>
    </View>
  );
}

const ir = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, gap: 12 },
  label: { fontSize: 13, fontWeight: '500', color: COLORS.fg3, flex: 1 },
  value: { fontSize: 13, fontWeight: '600', color: COLORS.carbon, flex: 1.5, textAlign: 'right' },
});

const d = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 14, fontWeight: '500', color: COLORS.fg3 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },

  scroll: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },

  statusBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  statusBadgeText: { fontSize: 13, fontWeight: '800' },

  card: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16 },
  cardLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.2,
    color: COLORS.fg3, marginBottom: 4,
  },

  docLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  docLinkText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.carbon },
  noDocText: { fontSize: 13, fontWeight: '500', color: COLORS.fg3, paddingVertical: 6 },

  actionsCard: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16, gap: 10 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10,
    backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5',
  },
  errorBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#B91C1C' },

  actionLoading: { paddingVertical: 12, alignItems: 'center' },

  primaryBtn: {
    height: 52, borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.1 },

  cancelLink: { alignItems: 'center', paddingVertical: 8 },
  cancelLinkText: { fontSize: 13, fontWeight: '600', color: COLORS.danger },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: {
    borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  chipActive: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.fg2 },
  chipTextActive: { color: COLORS.white },
  rejectHint: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginBottom: 8, lineHeight: 17 },
  nameInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.carbon, marginBottom: 8,
  },
});
