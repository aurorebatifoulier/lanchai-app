import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ConfirmBox } from '@/components/ConfirmBox';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import BackButton from '@/components/BackButton';

// ── Types ─────────────────────────────────────────────────────────────────────

type BroadcastType = 'new_item' | 'promo' | 'announcement';

interface BroadcastDoc {
  id:        string;
  type:      BroadcastType;
  title:     string;
  body:      string;
  deepLink?: string;
  createdAt: Timestamp | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: BroadcastType; label: string }[] = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'promo',        label: 'Promo'        },
  { value: 'new_item',     label: 'New item'      },
];

const TYPE_CONFIG: Record<BroadcastType, { icon: string; iconColor: string }> = {
  announcement: { icon: 'radio',   iconColor: 'blue'  },
  promo:        { icon: 'percent', iconColor: 'amber' },
  new_item:     { icon: 'tag',     iconColor: 'green' },
};

function formatDate(ts: Timestamp | null): string {
  if (!ts) return '';
  const d = ts.toDate();
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

// Broadcast deep links must open a real screen (renters tap them in Notifications).
const APP_LINK_RE = /^\/(explore(\?[\w=&%.-]*)?|category\/[\w-]+|product\/[\w-]+|collection\/[\w-]+|profile\/loyalty(\?section=(codes|referral))?|bag|chat|\(tabs\)(\/(reservations|account))?)$/;
const isAppLink = (link: string) => APP_LINK_RE.test(link);

export default function AdminBroadcastScreen() {
  const insets = useSafeAreaInsets();
  const router  = useRouter();

  // ── Compose state ───────────────────────────────────────────────────────────
  const [type,     setType]     = useState<BroadcastType>('announcement');
  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [deepLink, setDeepLink] = useState('');
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [sendErr,  setSendErr]  = useState('');
  const [confirming, setConfirming] = useState(false);
  const [recipients, setRecipients] = useState<number | null>(null);

  // ── List state ──────────────────────────────────────────────────────────────
  const [broadcasts,  setBroadcasts]  = useState<BroadcastDoc[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      snap => {
        setBroadcasts(snap.docs.map(d => {
          const data = d.data();
          return {
            id:        d.id,
            type:      (data.type ?? 'announcement') as BroadcastType,
            title:     data.title    ?? '',
            body:      data.body     ?? '',
            deepLink:  data.deepLink  || undefined,
            createdAt: (data.createdAt as Timestamp) ?? null,
          };
        }));
        setListLoading(false);
      },
      () => setListLoading(false),
    );
  }, []);

  // ── Send ────────────────────────────────────────────────────────────────────
  // Step 1: check the fields, then ask "Send to all renters?" with a preview and the
  // number of accounts (a broadcast shows in EVERY account's notifications — final).
  async function askSend() {
    if (!title.trim() || !body.trim()) {
      setSendErr('Title and message are required.');
      return;
    }
    if (deepLink.trim() && !isAppLink(deepLink.trim())) {
      setSendErr('This link doesn’t open a screen in the app — e.g. /product/abc123, /category/outdoor, /collection/xyz, /explore.');
      return;
    }
    setSendErr('');
    setConfirming(true);
    setRecipients(null);
    getCountFromServer(collection(db, 'users')).then(c => setRecipients(c.data().count)).catch(() => setRecipients(null));
  }

  async function handleSend() {
    setConfirming(false);
    setSending(true);
    setSendErr('');
    try {
      const cfg = TYPE_CONFIG[type];
      await addDoc(collection(db, 'broadcasts'), {
        type,
        title:     title.trim(),
        body:      body.trim(),
        icon:      cfg.icon,
        iconColor: cfg.iconColor,
        deepLink:  deepLink.trim() || '',
        createdAt: serverTimestamp(),
      });
      setSent(true);
      setTitle('');
      setBody('');
      setDeepLink('');
    } catch {
      setSendErr('Failed to send. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    setDeletingId(null);
    try {
      await deleteDoc(doc(db, 'broadcasts', id));
    } catch {
      // onSnapshot reflects the real state — no optimistic rollback needed
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Broadcast</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Compose ────────────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>New broadcast</Text>

        {/* Type selector */}
        <View style={s.typeRow}>
          {TYPE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[s.typeBtn, type === opt.value && s.typeBtnActive]}
              onPress={() => { setType(opt.value); setSent(false); setSendErr(''); }}
              activeOpacity={0.75}
            >
              <Text style={[s.typeBtnText, type === opt.value && s.typeBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Fields */}
        <Text style={s.fieldLabel}>Title</Text>
        <TextInput
          style={s.input}
          value={title}
          onChangeText={t => { setTitle(t); setSent(false); setSendErr(''); }}
          placeholder="e.g. New kayaks available!"
          placeholderTextColor={COLORS.fg3}
          maxLength={80}
          returnKeyType="next"
        />

        <Text style={s.fieldLabel}>Message</Text>
        <TextInput
          style={[s.input, s.inputMulti]}
          value={body}
          onChangeText={t => { setBody(t); setSent(false); setSendErr(''); }}
          placeholder="Write your announcement here…"
          placeholderTextColor={COLORS.fg3}
          maxLength={300}
          multiline
          textAlignVertical="top"
        />

        <Text style={s.fieldLabel}>
          Deep link <Text style={s.fieldLabelOpt}>(optional)</Text>
        </Text>
        <TextInput
          style={s.input}
          value={deepLink}
          onChangeText={t => { setDeepLink(t); setSent(false); }}
          placeholder="e.g. /category/outdoor or /product/abc123"
          placeholderTextColor={COLORS.fg3}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />

        {!!sendErr && (
          <View style={s.errBox}>
            <Feather name="alert-circle" size={13} color={COLORS.danger} />
            <Text style={s.errText}>{sendErr}</Text>
          </View>
        )}

        {sent && (
          <View style={s.successBox}>
            <Feather name="check-circle" size={13} color={COLORS.success} />
            <Text style={s.successText}>
              Broadcast sent — it appears in all users&apos; notifications immediately.
            </Text>
          </View>
        )}

        {confirming && (
          <View style={{ marginTop: 16 }}>
            <ConfirmBox
              text={`Send to all renters?${recipients != null ? ` It will show in the notifications of all ${recipients} accounts.` : ''} This can't be undone.`}
              confirmLabel="Send to all"
              cancelLabel="Keep editing"
              onCancel={() => setConfirming(false)}
              onConfirm={handleSend}
            >
              <View style={s.preview}>
                <Text style={s.previewTitle}>{title.trim()}</Text>
                <Text style={s.previewBody}>{body.trim()}</Text>
                {!!deepLink.trim() && <Text style={s.previewLink}>{`Opens ${deepLink.trim()}`}</Text>}
              </View>
            </ConfirmBox>
          </View>
        )}

        <TouchableOpacity
          style={[s.sendBtn, (sending || confirming) && s.sendBtnDisabled]}
          onPress={askSend}
          activeOpacity={0.8}
          disabled={sending || confirming}
        >
          {sending
            ? <ActivityIndicator size="small" color={COLORS.carbon} />
            : <Text style={s.sendBtnText}>{sent ? 'Send another' : 'Send broadcast'}</Text>
          }
        </TouchableOpacity>

        {/* ── Sent broadcasts ──────────────────────────────────────────────── */}
        <Text style={[s.sectionLabel, { marginTop: 36 }]}>Sent broadcasts</Text>

        {listLoading ? (
          <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 20 }} />
        ) : broadcasts.length === 0 ? (
          <Text style={s.emptyList}>No broadcasts sent yet.</Text>
        ) : (
          broadcasts.map(b => (
            <View key={b.id} style={s.bRow}>
              <View style={s.bLeft}>
                <View style={s.bTypeChip}>
                  <Text style={s.bTypeText}>{b.type.replace('_', ' ')}</Text>
                </View>
                <Text style={s.bTitle} numberOfLines={1}>{b.title}</Text>
                <Text style={s.bBody}  numberOfLines={2}>{b.body}</Text>
                {b.createdAt && (
                  <Text style={s.bDate}>{formatDate(b.createdAt)}</Text>
                )}
              </View>

              {deletingId === b.id ? (
                <View style={s.deleteConfirm}>
                  <Text style={s.deleteConfirmText}>Delete?</Text>
                  <TouchableOpacity
                    style={s.confirmYes}
                    onPress={() => handleDelete(b.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.confirmYesText}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.confirmNo}
                    onPress={() => setDeletingId(null)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.confirmNoText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={s.deleteBtn}
                  onPress={() => setDeletingId(b.id)}
                  activeOpacity={0.75}
                >
                  <Feather name="trash-2" size={15} color={COLORS.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  preview: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: SHADES.cream, borderWidth: 0.5, borderColor: SHADES.border, gap: 4 },
  previewTitle: { fontSize: 15, fontWeight: '800', color: SHADES.carbon },
  previewBody: { fontSize: 14, fontWeight: '500', color: SHADES.carbonMuted, lineHeight: 19 },
  previewLink: { fontSize: 12.5, fontWeight: '600', color: SHADES.amberText },
  root: { flex: 1, backgroundColor: COLORS.porcelain },

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

  content: { paddingHorizontal: 20, paddingTop: 24 },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.4,
    color: COLORS.fg3, marginBottom: 16,
  },

  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeBtn: {
    flex: 1, height: 36, borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1.5, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  typeBtnActive:     { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  typeBtnText:       { fontSize: 12, fontWeight: '700', color: COLORS.fg3 },
  typeBtnTextActive: { color: COLORS.porcelain },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.amberTint,
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  infoText: {
    flex: 1, fontSize: 12, fontWeight: '500', color: COLORS.fg2, lineHeight: 17,
  },

  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.carbon, marginBottom: 6,
  },
  fieldLabelOpt: {
    fontSize: 11, fontWeight: '500', color: COLORS.fg3,
  },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: '500', color: COLORS.carbon,
    marginBottom: 16,
  },
  inputMulti: { height: 90, textAlignVertical: 'top' },

  errBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginBottom: 12,
  },
  errText: {
    flex: 1, fontSize: 12, fontWeight: '500', color: COLORS.danger, lineHeight: 17,
  },
  successBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#D1FAE5', borderRadius: 10, padding: 12, marginBottom: 12,
  },
  successText: {
    flex: 1, fontSize: 12, fontWeight: '500', color: '#065F46', lineHeight: 17,
  },

  sendBtn: {
    height: 50, borderRadius: 14,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.55 },
  sendBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },

  emptyList: {
    fontSize: 13, fontWeight: '500', color: COLORS.fg3,
    textAlign: 'center', paddingVertical: 20,
  },

  bRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.softGray200,
    padding: 14, marginBottom: 10,
  },
  bLeft:  { flex: 1 },
  bTypeChip: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.warmBeige, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2, marginBottom: 6,
  },
  bTypeText:  { fontSize: 10, fontWeight: '700', color: COLORS.fg2 },
  bTitle:     { fontSize: 13, fontWeight: '700', color: COLORS.carbon, marginBottom: 3 },
  bBody:      { fontSize: 12, fontWeight: '400', color: COLORS.fg3, lineHeight: 17 },
  bDate:      { fontSize: 11, fontWeight: '500', color: COLORS.fg3, marginTop: 5 },

  deleteBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  deleteConfirm: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0,
  },
  deleteConfirmText: { fontSize: 11, fontWeight: '600', color: COLORS.fg2 },
  confirmYes: {
    height: 28, paddingHorizontal: 10, borderRadius: 8,
    backgroundColor: COLORS.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmYesText: { fontSize: 11, fontWeight: '700', color: COLORS.white },
  confirmNo: {
    height: 28, paddingHorizontal: 10, borderRadius: 8,
    backgroundColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmNoText: { fontSize: 11, fontWeight: '700', color: COLORS.fg2 },
});
