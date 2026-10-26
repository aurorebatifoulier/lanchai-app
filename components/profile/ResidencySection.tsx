import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI, SectionTitle, StatusBlock, StatusChip, CheckLine } from '@/components/account/ui';
import { ConfirmBox } from '@/components/ConfirmBox';
import { useMyIdentity, pickIdPhoto } from '@/lib/identity';
import {
  useMyResidency, submitResidency, withdrawMyResidency, RESIDENCY_PROOF_TYPES, RESIDENCY_REJECTION_REASONS,
  RESIDENCY_MAX_PAGES, type ResidencyPath, type ResidencyProofType,
} from '@/lib/residency';

// "Residency" card of the ID & residency screen (app/profile/id-residency.tsx) —
// resident vs tourist (the deposit depends on it). Tourist is the default with nothing
// to upload. Lao nationals: the Lao ID card on file (ID document card above) is
// enough. Foreign residents: ID on file + visa / residence permit or lease contract.
// The new deposit applies to bookings made after the decision only.
const fmt = (ts?: { toDate: () => Date } | null) =>
  ts ? ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export function ResidencySection() {
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
    <View>
      <SectionTitle>Residency</SectionTitle>
      <View style={[UI.card, UI.cardPadded]}>
        {loading || idLoading ? (
          <ActivityIndicator color={SHADES.amber} style={{ marginVertical: 16 }} />
        ) : customerType === 'business' ? (
          <Text style={UI.body}>Business accounts don&apos;t need resident status.</Text>
        ) : (
          <View>
            {/* ── Current status (icon rule: amber = action needed, grey = done) ── */}
            {isResident && !legacy && (
              <StatusBlock
                icon={HOME_ICON}
                title={`Resident${validUntil ? ` · valid until ${fmt(validUntil)}` : ''}`}
                chip={<StatusChip label="Verified" tone="success" />}
              >
                <Text style={UI.body}>Your reduced deposit applies to your new bookings.</Text>
              </StatusBlock>
            )}
            {legacy && (
              <StatusBlock icon={HOME_ICON} tone="amber" title="Please verify your resident status">
                <Text style={UI.body}>Send your documents by {fmt(validUntil)} to keep your reduced deposit.</Text>
              </StatusBlock>
            )}
            {status === 'pending' && (
              <StatusBlock icon={{ name: 'clock' }} title="We're reviewing your documents" chip={<StatusChip label="In review" tone="grey" />}>
                <Text style={UI.body}>We&apos;ll let you know as soon as it&apos;s done.</Text>
              </StatusBlock>
            )}
            {rejection && (
              <StatusBlock
                icon={{ name: 'alert-circle' }}
                tone={finalRejection ? 'grey' : 'amber'}
                title={finalRejection ? 'We couldn’t approve your resident status' : 'We need one more thing'}
                chip={finalRejection ? <StatusChip label="Declined" tone="danger" /> : undefined}
              >
                <Text style={UI.body}>
                  {RESIDENCY_REJECTION_REASONS[rejection.reason]?.text}
                  {rejection.text ? `${RESIDENCY_REJECTION_REASONS[rejection.reason]?.text ? ' ' : ''}${rejection.text}` : ''}
                </Text>
                {!finalRejection && !formOpen && (
                  <TouchableOpacity style={[UI.btnPrimary, { marginTop: 14 }]} onPress={() => setFormOpen(true)} activeOpacity={0.85}>
                    <Text style={UI.btnPrimaryText}>Update my documents</Text>
                  </TouchableOpacity>
                )}
                {finalRejection && <Text style={[UI.small, { marginTop: 8 }]}>If you think this is a mistake, please message us.</Text>}
              </StatusBlock>
            )}
            {status === 'expired' && !isResident && (
              <StatusBlock icon={HOME_ICON} tone="amber" title="Your resident status has expired">
                <Text style={UI.body}>Send updated documents to get the reduced deposit again.</Text>
              </StatusBlock>
            )}
            {!isResident && (!status || status === 'withdrawn') && (
              <StatusBlock icon={HOME_ICON} title="Tourist" />
            )}

            <Text style={[UI.body, { marginTop: 12 }]}>
              Living in Laos? Residents pay a reduced deposit. Tourists don&apos;t need to send anything. The new deposit applies to bookings made after we verify your status.
            </Text>

            {/* ── Request form ── */}
            {showForm && !finalRejection && status !== 'pending' && (
              <>
                <View style={UI.divider} />
                {!idOnFile ? (
                  <StatusBlock icon={{ set: 'mci', name: 'card-account-details-outline' }} tone="amber" title="Add your ID first">
                    <Text style={UI.body}>Add your ID document (passport, ID card or Lao ID card) in the card above — we need it before we can check your resident status.</Text>
                  </StatusBlock>
                ) : (
                  <View>
                    <Text style={UI.fieldLabel}>I am…</Text>
                    <View style={s.chips}>
                      {([['lao_national', 'A Lao national'], ['foreign', 'A foreign resident']] as const).map(([k, l]) => (
                        <TouchableOpacity key={k} style={[UI.choice, path === k && UI.choiceOn]} onPress={() => setPath(k)} activeOpacity={0.8}>
                          <Text style={[UI.choiceText, path === k && UI.choiceTextOn]}>{l}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {path === 'lao_national' && (
                      hasLaoId ? (
                        <CheckLine text="Your Lao ID card on file is all we need." />
                      ) : (
                        <Text style={UI.body}>Add your Lao ID card as your ID document in the card above (or replace your current one) — nothing else is needed.</Text>
                      )
                    )}

                    {path === 'foreign' && (
                      <>
                        <Text style={[UI.fieldLabel, { marginTop: 8 }]}>Proof of residence</Text>
                        <View style={s.chips}>
                          {RESIDENCY_PROOF_TYPES.map(t => (
                            <TouchableOpacity key={t.key} style={[UI.choice, proofType === t.key && UI.choiceOn]} onPress={() => setProofType(t.key)} activeOpacity={0.8}>
                              <Text style={[UI.choiceText, proofType === t.key && UI.choiceTextOn]}>{t.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        {proofType && <Text style={[UI.small, { marginBottom: 4 }]}>{RESIDENCY_PROOF_TYPES.find(t => t.key === proofType)?.hint}</Text>}
                        {pages.length > 0 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbs}>
                            {pages.map((u, i) => (
                              <View key={u}>
                                <Image source={{ uri: u }} style={s.thumb} />
                                <TouchableOpacity style={s.remove} onPress={() => setPages(p => p.filter((_, j) => j !== i))} hitSlop={8}>
                                  <Feather name="x" size={12} color={SHADES.white} />
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
                                style={[UI.btnSecondary, { flex: 1 }]}
                                onPress={async () => { const u = await pickIdPhoto(src); if (u) setPages(p => [...p, u]); }}
                                activeOpacity={0.8}
                              >
                                <Feather name={src === 'camera' ? 'camera' : 'image'} size={15} color={SHADES.carbon} />
                                <Text style={UI.btnSecondaryText}>{src === 'camera' ? 'Take a photo' : 'From gallery'}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </>
                    )}

                    {error && <Text style={[UI.errorText, { marginTop: 10 }]}>{error}</Text>}
                    <TouchableOpacity style={[UI.btnPrimary, { marginTop: 16 }, !canSubmit && UI.btnDisabled]} disabled={!canSubmit} onPress={send} activeOpacity={0.85}>
                      {busy ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>Send for review</Text>}
                    </TouchableOpacity>
                    <Text style={[UI.small, { marginTop: 8, textAlign: 'center' }]}>Only you and our staff can see your documents. We never share them or send them by email.</Text>
                  </View>
                )}
              </>
            )}

            {/* ── Withdraw / delete ── */}
            {(status === 'pending' || isResident) && !legacy && (
              confirmWithdraw ? (
                <View style={{ marginTop: 14 }}>
                  <ConfirmBox
                    text={status === 'pending'
                      ? 'Withdraw your request? Your proof of residence is deleted.'
                      : 'Delete your proof of residence and go back to the standard deposit for your next bookings? Your ID document follows its own retention rule (see the card above).'}
                    confirmLabel={busy ? 'Working…' : status === 'pending' ? 'Withdraw' : 'Delete my documents'}
                    cancelLabel="Keep"
                    destructive
                    confirmDisabled={busy}
                    onCancel={() => setConfirmWithdraw(false)}
                    onConfirm={withdraw}
                  />
                </View>
              ) : (
                <TouchableOpacity onPress={() => setConfirmWithdraw(true)} style={{ marginTop: 16, alignSelf: 'flex-start' }} hitSlop={8}>
                  <Text style={UI.dangerText}>{status === 'pending' ? 'Withdraw my request' : 'Delete my documents'}</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const HOME_ICON = { name: 'home' } as const;

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  thumbs: { gap: 10, paddingVertical: 10 },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: SHADES.carbonLight },
  remove: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(30,30,30,0.65)', alignItems: 'center', justifyContent: 'center',
  },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
