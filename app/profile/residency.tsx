import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { ConfirmBox } from '@/components/ConfirmBox';
import { useMyIdentity, pickIdPhoto } from '@/lib/identity';
import {
  useMyResidency, submitResidency, withdrawMyResidency, RESIDENCY_PROOF_TYPES, RESIDENCY_REJECTION_REASONS,
  RESIDENCY_MAX_PAGES, type ResidencyPath, type ResidencyProofType,
} from '@/lib/residency';

// "Verify my status" — resident vs tourist (the deposit depends on it). Tourist is the
// default with nothing to upload. Lao nationals: the Lao ID card on file (My ID) is
// enough. Foreign residents: ID on file + visa / residence permit or lease contract.
// The new deposit applies to bookings made after the decision only.
const fmt = (ts?: { toDate: () => Date } | null) =>
  ts ? ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function ResidencyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { identity, loading: idLoading } = useMyIdentity();
  const { loading, request, customerType, validUntil, basis } = useMyResidency();

  const [formOpen, setFormOpen] = useState(false);
  const [path, setPath] = useState<ResidencyPath | null>(null);
  const [proofType, setProofType] = useState<ResidencyProofType | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const isResident = customerType === 'resident';
  const legacy = isResident && basis === 'legacy';
  const status = request?.status;
  const rejection = status === 'rejected' ? request?.rejection : undefined;
  const finalRejection = rejection?.fixable === false;
  const idOnFile = identity?.status === 'on_file';
  const hasLaoId = idOnFile && identity?.docType === 'lao_id';

  const canSubmit = !!path && !busy && (path === 'lao_national' ? hasLaoId : !!proofType && pages.length > 0);

  const send = async () => {
    if (!canSubmit || !path) return;
    setBusy(true);
    setError(null);
    try {
      await submitResidency(path, path === 'foreign' ? proofType : null, pages);
      setFormOpen(false);
      setPages([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await withdrawMyResidency();
      setConfirmWithdraw(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const showForm = formOpen || ((!status || ['withdrawn', 'expired'].includes(status)) && !isResident) || legacy;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Verify my status</Text>
      </View>

      {loading || idLoading ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      ) : customerType === 'business' ? (
        <Text style={[s.body, { padding: 20 }]}>Business accounts don&apos;t need resident status.</Text>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        >
          <Text style={s.intro}>
            Living in Laos? Residents pay a reduced deposit. Tourists don&apos;t need to send anything. The new deposit applies to bookings made after we verify your status.
          </Text>

          {/* ── Current status ── */}
          {isResident && !legacy && (
            <View style={[s.card, s.cardOk]}>
              <View style={s.row}>
                <Feather name="check-circle" size={16} color={COLORS.success} />
                <Text style={s.cardTitle}>Resident{validUntil ? ` · valid until ${fmt(validUntil)}` : ''}</Text>
              </View>
              <Text style={s.body}>Your reduced deposit applies to your new bookings.</Text>
            </View>
          )}
          {legacy && (
            <View style={[s.card, s.cardWarn]}>
              <Text style={s.cardTitle}>Please verify your resident status</Text>
              <Text style={s.body}>Send your documents by {fmt(validUntil)} to keep your reduced deposit.</Text>
            </View>
          )}
          {status === 'pending' && (
            <View style={s.card}>
              <View style={s.row}>
                <Feather name="clock" size={16} color={COLORS.fg2} />
                <Text style={s.cardTitle}>We&apos;re reviewing your documents</Text>
              </View>
              <Text style={s.body}>We&apos;ll let you know as soon as it&apos;s done.</Text>
            </View>
          )}
          {rejection && (
            <View style={[s.card, s.cardWarn]}>
              <Text style={s.cardTitle}>{finalRejection ? 'We couldn’t approve your resident status' : 'We need one more thing'}</Text>
              <Text style={s.body}>
                {RESIDENCY_REJECTION_REASONS[rejection.reason]?.text}
                {rejection.text ? `${RESIDENCY_REJECTION_REASONS[rejection.reason]?.text ? ' ' : ''}${rejection.text}` : ''}
              </Text>
              {!finalRejection && !formOpen && (
                <TouchableOpacity style={s.primary} onPress={() => setFormOpen(true)} activeOpacity={0.85}>
                  <Text style={s.primaryText}>Update my documents</Text>
                </TouchableOpacity>
              )}
              {finalRejection && <Text style={s.small}>If you think this is a mistake, please message us.</Text>}
            </View>
          )}
          {status === 'expired' && !isResident && (
            <View style={[s.card, s.cardWarn]}>
              <Text style={s.cardTitle}>Your resident status has expired</Text>
              <Text style={s.body}>Send updated documents to get the reduced deposit again.</Text>
            </View>
          )}

          {/* ── Request form ── */}
          {showForm && !finalRejection && status !== 'pending' && (
            !idOnFile ? (
              <View style={s.card}>
                <Text style={s.cardTitle}>Add your ID first</Text>
                <Text style={s.body}>Your ID document (passport, ID card or Lao ID card) is needed before we can check your resident status.</Text>
                <TouchableOpacity style={s.primary} onPress={() => router.push('/profile/identity')} activeOpacity={0.85}>
                  <Text style={s.primaryText}>Go to My ID</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={s.label}>I am…</Text>
                <View style={s.chips}>
                  {([['lao_national', 'A Lao national'], ['foreign', 'A foreign resident']] as const).map(([k, l]) => (
                    <TouchableOpacity key={k} style={[s.chip, path === k && s.chipOn]} onPress={() => setPath(k)} activeOpacity={0.8}>
                      <Text style={[s.chipText, path === k && s.chipTextOn]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {path === 'lao_national' && (
                  hasLaoId ? (
                    <Text style={s.body}>Your Lao ID card on file is all we need.</Text>
                  ) : (
                    <View style={s.card}>
                      <Text style={s.body}>Add your Lao ID card as your ID document (My ID) — nothing else is needed.</Text>
                      <TouchableOpacity onPress={() => router.push('/profile/identity')}>
                        <Text style={s.link}>Go to My ID</Text>
                      </TouchableOpacity>
                    </View>
                  )
                )}

                {path === 'foreign' && (
                  <>
                    <Text style={s.label}>Proof of residence</Text>
                    <View style={s.chips}>
                      {RESIDENCY_PROOF_TYPES.map(t => (
                        <TouchableOpacity key={t.key} style={[s.chip, proofType === t.key && s.chipOn]} onPress={() => setProofType(t.key)} activeOpacity={0.8}>
                          <Text style={[s.chipText, proofType === t.key && s.chipTextOn]}>{t.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {proofType && <Text style={s.small}>{RESIDENCY_PROOF_TYPES.find(t => t.key === proofType)?.hint}</Text>}
                    {pages.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbs}>
                        {pages.map((u, i) => (
                          <View key={u}>
                            <Image source={{ uri: u }} style={s.thumb} />
                            <TouchableOpacity style={s.remove} onPress={() => setPages(p => p.filter((_, j) => j !== i))} hitSlop={8}>
                              <Feather name="x" size={12} color={COLORS.white} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </ScrollView>
                    )}
                    {pages.length < RESIDENCY_MAX_PAGES && (
                      <View style={s.addRow}>
                        {(['camera', 'gallery'] as const).map(src => (
                          <TouchableOpacity
                            key={src}
                            style={s.addBtn}
                            onPress={async () => { const u = await pickIdPhoto(src); if (u) setPages(p => [...p, u]); }}
                            activeOpacity={0.8}
                          >
                            <Feather name={src === 'camera' ? 'camera' : 'image'} size={15} color={COLORS.carbon} />
                            <Text style={s.addText}>{src === 'camera' ? 'Take a photo' : 'From gallery'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                )}

                {error && <Text style={s.error}>{error}</Text>}
                <TouchableOpacity style={[s.primary, !canSubmit && s.disabled]} disabled={!canSubmit} onPress={send} activeOpacity={0.85}>
                  {busy ? <ActivityIndicator color={COLORS.carbon} /> : <Text style={s.primaryText}>Send for review</Text>}
                </TouchableOpacity>
                <Text style={s.small}>Only you and our staff can see your documents. We never share them or send them by email.</Text>
              </View>
            )
          )}

          {/* ── Withdraw / delete ── */}
          {(status === 'pending' || isResident) && !legacy && (
            confirmWithdraw ? (
              <ConfirmBox
                text={status === 'pending'
                  ? 'Withdraw your request? Your proof of residence is deleted.'
                  : 'Delete your proof of residence and go back to the standard deposit for your next bookings? Your ID document follows its own retention rule (see My ID).'}
                confirmLabel={busy ? 'Working…' : status === 'pending' ? 'Withdraw' : 'Delete my documents'}
                cancelLabel="Keep"
                destructive
                confirmDisabled={busy}
                onCancel={() => setConfirmWithdraw(false)}
                onConfirm={withdraw}
              />
            ) : (
              <TouchableOpacity onPress={() => setConfirmWithdraw(true)} style={{ marginTop: 18 }}>
                <Text style={s.danger}>{status === 'pending' ? 'Withdraw my request' : 'Delete my documents'}</Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  intro: { fontSize: 13, fontWeight: '500', color: COLORS.fg2, lineHeight: 19, marginBottom: 14 },
  card: { backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.softGray200, padding: 14, marginBottom: 12 },
  cardOk: { backgroundColor: '#F2FAF6', borderColor: '#BFE3CD' },
  cardWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  body: { fontSize: 13, fontWeight: '500', color: COLORS.fg2, lineHeight: 19, marginTop: 6 },
  small: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, lineHeight: 17, marginTop: 8 },
  label: { fontSize: 13, fontWeight: '800', color: COLORS.carbon, marginTop: 14, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { borderRadius: 10, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.carbon },
  chipTextOn: { color: COLORS.white },
  thumbs: { gap: 10, paddingVertical: 10 },
  thumb: { width: 84, height: 84, borderRadius: 10, backgroundColor: COLORS.softGray200 },
  remove: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  addBtn: {
    flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.carbon,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  addText: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },
  primary: { height: 48, borderRadius: 12, backgroundColor: COLORS.amber, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  disabled: { opacity: 0.45 },
  link: { fontSize: 13, fontWeight: '800', color: COLORS.carbon, marginTop: 8 },
  danger: { fontSize: 13, fontWeight: '700', color: COLORS.danger },
  error: { fontSize: 12, fontWeight: '500', color: COLORS.danger, marginTop: 10 },
});
