import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, TextInput, ActivityIndicator, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { ConfirmBox } from '@/components/ConfirmBox';
import { RenterIdCard } from '@/components/admin/RenterIdCard';
import { db, storage, functions } from '@/lib/firebase';
import {
  RESIDENCY_PROOF_TYPES, RESIDENCY_REJECTION_REASONS, RESIDENCY_REJECTION_KEYS, validUntilRequired,
  type ResidencyRequestDoc, type ResidencyRejectionKey,
} from '@/lib/residency';

// Admin → Verifications → Residency → one request: identity (name, ID photos — via
// RenterIdCard) + proof of residence full-screen, then approve ("Valid until" mandatory
// for foreigners, optional for Lao nationals) or reject with the shared presets. All
// decisions go through the reviewResidency callable. Documents are shown only here.
const fmt = (ts?: { toDate: () => Date } | null) =>
  ts ? ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function AdminResidencyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const [req, setReq] = useState<ResidencyRequestDoc | null | undefined>(undefined);
  const [urls, setUrls] = useState<string[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [validUntil, setValidUntil] = useState('');
  const [reason, setReason] = useState<ResidencyRejectionKey | null>(null);
  const [text, setText] = useState('');
  const [otherFixable, setOtherFixable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'residencyRequests', uid), s => setReq(s.exists() ? (s.data() as ResidencyRequestDoc) : null), () => setReq(null));
  }, [uid]);

  const filesKey = (req?.proofFiles ?? []).join('|');
  useEffect(() => {
    let alive = true;
    const files = filesKey ? filesKey.split('|') : [];
    Promise.all(files.map(p => getDownloadURL(storageRef(storage, p)).catch(() => null)))
      .then(u => { if (alive) setUrls(u.filter((x): x is string => !!x)); });
    return () => { alive = false; };
  }, [filesKey]);

  const preset = reason ? RESIDENCY_REJECTION_REASONS[reason] : null;
  const fixable = preset ? (preset.fixable ?? otherFixable) : null;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(validUntil.trim());
  const approveReady = req && (dateOk || (!validUntil.trim() && !validUntilRequired(req.path)));
  const rejectReady = !!reason && fixable !== null && (!preset?.textRequired || text.trim().length > 0);

  const decide = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await httpsCallable(functions, 'reviewResidency')({ uid, ...payload });
      setMode('idle');
    } catch (e) {
      setError((e as { message?: string })?.message || 'Failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Residency</Text>
        <View style={{ width: 40 }} />
      </View>

      {req === undefined ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      ) : !req || !uid ? (
        <Text style={s.empty}>No request.</Text>
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{req.path === 'lao_national' ? 'Lao national' : 'Foreign resident'}</Text>
          <Text style={s.meta}>
            {req.status === 'pending' ? 'Waiting for a decision' : `Status: ${req.status}`} · sent {fmt(req.resubmittedAt ?? req.submittedAt)}
            {req.resubmittedAt ? ' (resubmitted)' : ''}
          </Text>

          <RenterIdCard renterId={uid} />

          {req.path === 'foreign' && (
            <View style={s.card}>
              <Text style={s.label}>Proof of residence · {RESIDENCY_PROOF_TYPES.find(t => t.key === req.proofType)?.label ?? '—'}</Text>
              {urls.length === 0 ? (
                <Text style={s.meta}>{req.status === 'pending' ? 'Loading…' : 'Files deleted (retention).'}</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos}>
                  {urls.map(u => (
                    <TouchableOpacity key={u} onPress={() => setZoom(u)} activeOpacity={0.85}>
                      <Image source={{ uri: u }} style={s.photo} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {req.status === 'approved' && req.record && (
            <View style={s.card}>
              <Text style={s.label}>Verification record</Text>
              <Text style={s.body}>
                {`Basis: ${req.record.basis} · valid until ${req.record.validUntil ? fmt(req.record.validUntil) : 'no end date'}\nVerified ${fmt(req.record.verifiedAt)} by ${req.record.verifiedBy}`}
              </Text>
            </View>
          )}
          {req.status === 'rejected' && req.rejection && (
            <View style={s.card}>
              <Text style={s.label}>Rejected ({req.rejection.fixable ? 'fixable' : 'final'})</Text>
              <Text style={s.body}>{RESIDENCY_REJECTION_REASONS[req.rejection.reason]?.adminLabel}{req.rejection.text ? ` — ${req.rejection.text}` : ''}</Text>
            </View>
          )}

          {req.status === 'pending' && mode === 'idle' && (
            <View style={s.actions}>
              <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => setMode('approve')}><Text style={s.btnText}>Approve</Text></TouchableOpacity>
              <TouchableOpacity style={s.btn} onPress={() => setMode('reject')}><Text style={[s.btnText, { color: COLORS.danger }]}>Reject</Text></TouchableOpacity>
            </View>
          )}

          {mode === 'approve' && (
            <ConfirmBox
              text={`Approve resident status? Their next bookings get the resident deposit.${validUntilRequired(req.path) ? ' Enter the visa / permit / lease end date.' : ' Optional: the Lao ID card expiry date.'}`}
              confirmLabel={busy ? 'Saving…' : 'Approve'}
              cancelLabel="Cancel"
              confirmDisabled={!approveReady || busy}
              onCancel={() => setMode('idle')}
              onConfirm={() => decide({ decision: 'approve', validUntil: validUntil.trim() || undefined })}
            >
              <TextInput
                style={s.input}
                value={validUntil}
                onChangeText={setValidUntil}
                placeholder={validUntilRequired(req.path) ? 'Valid until (YYYY-MM-DD)' : 'Valid until (optional, YYYY-MM-DD)'}
                placeholderTextColor={COLORS.fg3}
                keyboardType="numbers-and-punctuation"
              />
            </ConfirmBox>
          )}

          {mode === 'reject' && (
            <ConfirmBox
              text={fixable === false ? 'Reject — final: they can’t send this request again.' : 'Reject — they’ll be asked to update their documents.'}
              confirmLabel={busy ? 'Saving…' : 'Reject'}
              cancelLabel="Cancel"
              destructive
              confirmDisabled={!rejectReady || busy}
              onCancel={() => setMode('idle')}
              onConfirm={() => decide({ decision: 'reject', reason, text: text.trim(), fixable: otherFixable === true })}
            >
              <View style={s.chips}>
                {RESIDENCY_REJECTION_KEYS.map(k => (
                  <TouchableOpacity key={k} style={[s.chip, reason === k && s.chipOn]} onPress={() => { setReason(k); setOtherFixable(null); }}>
                    <Text style={[s.chipText, reason === k && s.chipTextOn]}>{RESIDENCY_REJECTION_REASONS[k].adminLabel}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {reason === 'other' && (
                <View style={s.chips}>
                  {([true, false] as const).map(f => (
                    <TouchableOpacity key={String(f)} style={[s.chip, otherFixable === f && s.chipOn]} onPress={() => setOtherFixable(f)}>
                      <Text style={[s.chipText, otherFixable === f && s.chipTextOn]}>{f ? 'Fixable — can resubmit' : 'Final'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TextInput
                style={s.input}
                value={text}
                onChangeText={setText}
                placeholder={preset?.textRequired ? 'Details for the renter (required)' : 'Details for the renter (optional)'}
                placeholderTextColor={COLORS.fg3}
                multiline
              />
            </ConfirmBox>
          )}
          {error && <Text style={s.error}>{error}</Text>}
        </ScrollView>
      )}

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <TouchableOpacity style={s.zoomBackdrop} activeOpacity={1} onPress={() => setZoom(null)}>
          {zoom && <Image source={{ uri: zoom }} style={s.zoomImage} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },
  content: { padding: 20 },
  empty: { fontSize: 14, color: COLORS.fg3, textAlign: 'center', marginTop: 40 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.carbon },
  meta: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginTop: 2, marginBottom: 12 },
  card: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '800', color: COLORS.fg3, marginBottom: 6 },
  body: { fontSize: 13, fontWeight: '500', color: COLORS.carbon, lineHeight: 19 },
  photos: { gap: 10, paddingVertical: 6 },
  photo: { width: 180, height: 130, borderRadius: 8, backgroundColor: COLORS.softGray200 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, height: 46, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.softGray200, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  btnPrimary: { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
  btnText: { fontSize: 14, fontWeight: '800', color: COLORS.carbon },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderRadius: 8, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.carbon },
  chipTextOn: { color: COLORS.white },
  input: {
    minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: COLORS.carbon, marginTop: 8,
  },
  error: { fontSize: 12, fontWeight: '500', color: COLORS.danger, marginTop: 8 },
  zoomBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  zoomImage: { width: '100%', height: '85%' },
});
