import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Image, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { IdUploadPanel } from '@/components/IdUploadPanel';
import { storage } from '@/lib/firebase';
import { useMyIdentity, ID_DOC_TYPES, deleteMyIdentityDocument } from '@/lib/identity';
import { ConfirmBox } from '@/components/ConfirmBox';

// My ID — the identity document required to rent (passport, ID card or Lao ID card).
// Also reachable from the booking step and Documents. The renter sees their own photos
// (download URLs fetched on demand, never stored).
export default function MyIdScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { identity, loading } = useMyIdentity();
  const [replacing, setReplacing] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  // Retention (functions/src/retention.ts): deleted now only if the rule allows it,
  // otherwise we explain until when it's kept.
  const requestDelete = async () => {
    setDeleting(true);
    setDeleteMsg(null);
    try {
      const r = await deleteMyIdentityDocument();
      setConfirmDelete(false);
      if (r.deleted) setDeleteMsg('Your ID document has been deleted.');
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
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>My ID</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        >
          <Text style={s.intro}>
            An ID document (passport, national ID card or Lao ID card) is needed to rent. We check it with you at your first pick-up.
          </Text>

          {onFile && (
            <View style={s.card}>
              <View style={s.statusRow}>
                <Feather name="check-circle" size={16} color={COLORS.success} />
                <Text style={s.statusText}>{typeLabel} on file</Text>
              </View>
              {thumbs.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbs}>
                  {thumbs.map(u => <Image key={u} source={{ uri: u }} style={s.thumb} />)}
                </ScrollView>
              )}
              <Text style={s.retention}>
                {identity?.purgeDueAt
                  ? `Deleted automatically on ${new Date(identity.purgeDueAt.toMillis()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, unless you rent again.`
                  : 'Kept while you have a rental in progress, then deleted automatically some months after your last rental.'}
              </Text>
              {!replacing && (
                <View style={s.linkRow}>
                  <TouchableOpacity onPress={() => setReplacing(true)} activeOpacity={0.7}>
                    <Text style={s.link}>Replace my ID</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmDelete(true)} activeOpacity={0.7}>
                    <Text style={[s.link, { color: COLORS.danger }]}>Delete my ID</Text>
                  </TouchableOpacity>
                </View>
              )}
              {confirmDelete && (
                <ConfirmBox
                  text="Delete your ID document? You'll need to add it again (or show it at the shop) for your next booking."
                  confirmLabel={deleting ? 'Deleting…' : 'Delete'}
                  cancelLabel="Keep"
                  destructive
                  confirmDisabled={deleting}
                  onCancel={() => setConfirmDelete(false)}
                  onConfirm={requestDelete}
                />
              )}
            </View>
          )}
          {deleteMsg && <Text style={s.deleteMsg}>{deleteMsg}</Text>}

          {rejected && (
            <View style={[s.card, s.cardWarn]}>
              <View style={s.statusRow}>
                <Feather name="alert-circle" size={16} color={COLORS.danger} />
                <Text style={s.statusText}>Your ID was declined</Text>
              </View>
              {!!identity?.rejection?.text && <Text style={s.body}>{identity.rejection.text}</Text>}
              <Text style={s.body}>Please add a new photo — new bookings are paused until then.</Text>
            </View>
          )}

          {(!onFile || replacing) && (
            <IdUploadPanel onDone={() => setReplacing(false)} submitLabel={onFile ? 'Save my new ID' : 'Save my ID'} />
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
  card: {
    backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.softGray200,
    padding: 14, marginBottom: 6,
  },
  cardWarn: { backgroundColor: '#FFF8F8', borderColor: '#FCA5A5' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  body: { fontSize: 13, fontWeight: '500', color: COLORS.fg2, lineHeight: 19, marginTop: 6 },
  thumbs: { gap: 10, paddingTop: 12 },
  thumb: { width: 84, height: 84, borderRadius: 10, backgroundColor: COLORS.softGray200 },
  link: { fontSize: 13, fontWeight: '800', color: COLORS.carbon, marginTop: 12 },
  linkRow: { flexDirection: 'row', gap: 20 },
  retention: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, lineHeight: 17, marginTop: 10 },
  deleteMsg: { fontSize: 13, fontWeight: '500', color: COLORS.fg2, lineHeight: 19, marginBottom: 12 },
});
