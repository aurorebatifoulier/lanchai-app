import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import { CHAT_COPY as c } from '@/constants/chatCopy';
import BackButton from '@/components/BackButton';
import PressScale from '@/components/PressScale';
import { ConfirmBox } from '@/components/ConfirmBox';
import { UI, useScreenInsets } from '@/components/account/ui';
import { useSavedReplies, addSavedReply, updateSavedReply, deleteSavedReply } from '@/lib/savedReplies';

// Admin → Saved replies: create / edit / delete the texts staff insert in one tap in
// the admin chat (chips above the input).
export default function SavedRepliesScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const replies = useSavedReplies();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch { setError(c.savedError); }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={[s.root, screen.root]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>{c.savedReplies}</Text>
      </View>
      <ScrollView contentContainerStyle={[UI.screenContent, { paddingTop: 16, paddingBottom: screen.contentBottom, gap: 10 }]} keyboardShouldPersistTaps="handled">
        <Text style={UI.body}>{c.savedRepliesSub}</Text>
        <View style={[UI.card, UI.cardPadded, { gap: 10 }]}>
          <TextInput style={[UI.input, s.multi]} value={draft} onChangeText={setDraft} placeholder={c.savedPlaceholder} placeholderTextColor={SHADES.carbonFaint} multiline maxLength={1000} />
          <PressScale style={[UI.btnPrimary, (!draft.trim() || busy) && UI.btnDisabled]} disabled={!draft.trim() || busy}
            onPress={() => run(async () => { await addSavedReply(draft); setDraft(''); })}>
            {busy ? <ActivityIndicator size="small" color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>{c.savedNew}</Text>}
          </PressScale>
        </View>
        {!!error && <Text style={UI.errorText}>{error}</Text>}
        {replies == null ? <ActivityIndicator color={SHADES.amber} /> : replies.length === 0 ? (
          <Text style={[UI.body, { textAlign: 'center' }]}>{c.savedEmpty}</Text>
        ) : replies.map(r => (
          <View key={r.id} style={[UI.card, UI.cardPadded, { gap: 8 }]}>
            {editing?.id === r.id ? (
              <>
                <TextInput style={[UI.input, s.multi]} value={editing.text} onChangeText={t => setEditing({ id: r.id, text: t })} multiline maxLength={1000} />
                <View style={s.row}>
                  <PressScale style={[UI.btnSecondary, { flex: 1 }]} onPress={() => setEditing(null)}><Text style={UI.btnSecondaryText}>Cancel</Text></PressScale>
                  <PressScale style={[UI.btnPrimary, { flex: 1 }, !editing.text.trim() && UI.btnDisabled]} disabled={!editing.text.trim() || busy}
                    onPress={() => run(async () => { await updateSavedReply(r.id, editing.text); setEditing(null); })}>
                    <Text style={UI.btnPrimaryText}>{c.savedSave}</Text>
                  </PressScale>
                </View>
              </>
            ) : (
              <>
                <Text style={UI.title}>{r.text}</Text>
                <View style={s.row}>
                  <TouchableOpacity onPress={() => setEditing({ id: r.id, text: r.text })} hitSlop={8}><Text style={UI.link}>Edit</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setDeleting(r.id)} hitSlop={8}><Text style={UI.dangerText}>Delete</Text></TouchableOpacity>
                </View>
                {deleting === r.id && (
                  <ConfirmBox text={c.savedDeleteAsk} confirmLabel="Delete" destructive onCancel={() => setDeleting(null)}
                    onConfirm={() => run(async () => { await deleteSavedReply(r.id); setDeleting(null); })} />
                )}
              </>
            )}
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: SHADES.white, borderBottomWidth: 0.5, borderBottomColor: SHADES.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: SHADES.carbon },
  multi: { minHeight: 70, textAlignVertical: 'top', paddingTop: 10 },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center' },
});
