import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Image, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { SHADES } from '@/constants/brandShades';
import { UI, SectionTitle, StatusBlock, StatusChip, CheckLine } from '@/components/account/ui';
import { IdUploadPanel } from '@/components/IdUploadPanel';
import { storage } from '@/lib/firebase';
import { useMyIdentity, ID_DOC_TYPES, deleteMyIdentityDocument } from '@/lib/identity';
import { ConfirmBox } from '@/components/ConfirmBox';

// "ID document" card of the ID & residency screen (app/profile/id-residency.tsx): the
// identity document required to rent (passport, ID card or Lao ID card). The renter sees
// their own photos (download URLs fetched on demand, never stored).
export function IdentitySection() {
  const { identity, loading } = useMyIdentity();
  const [replacing, setReplacing] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false); // shown as a check line, not a banner

  // Retention (functions/src/retention.ts): deleted now only if the rule allows it,
  // otherwise we explain until when it's kept.
  const requestDelete = async () => {
    setDeleting(true);
    setDeleteMsg(null);
    setDeleted(false);
    try {
      const r = await deleteMyIdentityDocument();
      setConfirmDelete(false);
      if (r.deleted) { setDeleted(true); setDeleteMsg('Your ID document has been deleted.'); }
      else if (r.reason === 'blocked') setDeleteMsg('We can\u2019t delete it while a rental, a balance or a claim is still open — it will be deleted automatically once resolved.');
      else if (r.reason === 'rental_in_progress') setDeleteMsg(`We keep it while you have a rental in progress, then ${r.months} months after your last rental, for the security of rentals.`);
      else setDeleteMsg(`For the security of rentals, it\u2019s kept until ${r.keptUntilMs ? new Date(r.keptUntilMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'the end of the retention period'} — ${r.months} months after your last rental — then deleted automatically.`);
    } catch (e) {
      setDeleteMsg((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const files = identity?.status === 'on_file' ? identity.files ?? [] : [];
  const filesKey = files.join('|');
  useEffect(() => {
    let alive = true;
    Promise.all(files.map(p => getDownloadURL(storageRef(storage, p)).catch(() => null)))
      .then(urls => { if (alive) setThumbs(urls.filter((u): u is string => !!u)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey]);

  const typeLabel = ID_DOC_TYPES.find(t => t.key === identity?.docType)?.label ?? 'ID document';
  const onFile = identity?.status === 'on_file';
  const rejected = identity?.status === 'rejected';

  return (
    <View>
      <SectionTitle style={{ marginTop: 16 }}>ID document</SectionTitle>
      <View style={[UI.card, UI.cardPadded]}>
        {loading ? (
          <ActivityIndicator color={SHADES.amber} style={{ marginVertical: 16 }} />
        ) : (
          <View>
            {/* Icon rule: amber = action needed (no ID / declined), grey = done (on file). */}
            {onFile ? (
              <StatusBlock icon={ID_ICON} title={typeLabel} chip={<StatusChip label="On file" tone="success" />} />
            ) : rejected ? (
              <StatusBlock icon={{ name: 'alert-circle' }} tone="amber" title="Your ID was declined" chip={<StatusChip label="Declined" tone="danger" />}>
                {!!identity?.rejection?.text && <Text style={UI.body}>{identity.rejection.text}</Text>}
                <Text style={UI.body}>Please add a new photo — new bookings are paused until then.</Text>
              </StatusBlock>
            ) : (
              <StatusBlock icon={ID_ICON} tone="amber" title="Add your ID document" />
            )}

            <Text style={[UI.body, { marginTop: 12 }]}>
              An ID document (passport, national ID card or Lao ID card) is needed to rent. We check it with you at your first pick-up.
            </Text>

            {onFile && (
              <>
                {thumbs.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbs}>
                    {thumbs.map(u => <Image key={u} source={{ uri: u }} style={s.thumb} />)}
                  </ScrollView>
                )}
                <Text style={[UI.small, { marginTop: 10 }]}>
                  {identity?.purgeDueAt
                    ? `Deleted automatically on ${new Date(identity.purgeDueAt.toMillis()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, unless you rent again.`
                    : 'Kept while you have a rental in progress, then deleted automatically some months after your last rental.'}
                </Text>
                {!replacing && !confirmDelete && (
                  <View style={s.actions}>
                    <TouchableOpacity style={UI.btnSecondary} onPress={() => setReplacing(true)} activeOpacity={0.7}>
                      <Feather name="refresh-cw" size={14} color={SHADES.carbon} />
                      <Text style={UI.btnSecondaryText}>Replace my ID</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setConfirmDelete(true)} activeOpacity={0.7} hitSlop={8}>
                      <Text style={UI.dangerText}>Delete my ID</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {confirmDelete && (
                  <View style={{ marginTop: 14 }}>
                    <ConfirmBox
                      text="Delete your ID document? You'll need to add it again (or show it at the shop) for your next booking."
                      confirmLabel={deleting ? 'Deleting…' : 'Delete'}
                      cancelLabel="Keep"
                      destructive
                      confirmDisabled={deleting}
                      onCancel={() => setConfirmDelete(false)}
                      onConfirm={requestDelete}
                    />
                  </View>
                )}
              </>
            )}
            {deleteMsg && (
              <View style={{ marginTop: 12 }}>
                {deleted ? <CheckLine text={deleteMsg} /> : <Text style={UI.body}>{deleteMsg}</Text>}
              </View>
            )}

            {(!onFile || replacing) && (
              <>
                <View style={UI.divider} />
                <IdUploadPanel onDone={() => setReplacing(false)} submitLabel={onFile ? 'Save my new ID' : 'Save my ID'} />
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const ID_ICON = { set: 'mci', name: 'card-account-details-outline' } as const;

const s = StyleSheet.create({
  thumbs: { gap: 10, paddingTop: 12 },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: SHADES.carbonLight },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 14 },
});
