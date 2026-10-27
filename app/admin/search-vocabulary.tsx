import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { SHADES } from '@/constants/brandShades';
import BackButton from '@/components/BackButton';
import { ConfirmBox } from '@/components/ConfirmBox';
import PressScale from '@/components/PressScale';
import { UI, CheckLine, useScreenInsets } from '@/components/account/ui';
import { cleanKeyword } from '@/components/admin/KeywordsInput';
import { getSearchGroups, saveSearchGroups } from '@/lib/searchConfig';
import { DEFAULT_SEARCH_GROUPS, SEARCH_LIMITS, type SearchGroup } from '@/lib/searchVocabulary';

// Admin → Search vocabulary (config/search): groups of related terms. Searching any term
// of a group also finds products matching the others (lower weight than a direct match).
// Terms can be English, Lao or French in the same group. One Save for the whole list.
export default function SearchVocabularyScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [confirm, setConfirm] = useState<{ kind: 'reset' } | { kind: 'delete'; id: string } | null>(null);

  useEffect(() => {
    getSearchGroups(true).then(g => setGroups(g.map(x => ({ ...x, terms: [...x.terms] })))).finally(() => setLoading(false));
  }, []);

  const edit = (fn: (g: SearchGroup[]) => SearchGroup[]) => { setGroups(fn); setStatus('idle'); };
  const addTerms = (id: string) => {
    const raw = (drafts[id] ?? '').split(',').map(cleanKeyword).filter(Boolean);
    if (raw.length === 0) return;
    edit(gs => gs.map(g => g.id !== id ? g : {
      ...g, terms: [...new Set([...g.terms, ...raw])].slice(0, SEARCH_LIMITS.termsPerGroup),
    }));
    setDrafts(d => ({ ...d, [id]: '' }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveSearchGroups(groups.filter(g => g.terms.length > 0));
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[s.root, screen.root]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Search vocabulary</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={[UI.screenContent, { paddingTop: 16, paddingBottom: screen.contentBottom }]} keyboardShouldPersistTaps="handled">
          <Text style={UI.body}>
            Each group links related words. Searching one of them also finds products that match the others, a little lower in the results. Add Lao or French words to the same groups.
          </Text>

          {groups.map(g => (
            <View key={g.id} style={[UI.card, s.group]}>
              <View style={s.groupHead}>
                <TextInput
                  style={s.label}
                  value={g.label}
                  onChangeText={t => edit(gs => gs.map(x => (x.id === g.id ? { ...x, label: t } : x)))}
                  placeholder="Group name"
                  placeholderTextColor={SHADES.carbonFaint}
                />
                <TouchableOpacity onPress={() => setConfirm({ kind: 'delete', id: g.id })} hitSlop={8}>
                  <Feather name="trash-2" size={16} color={SHADES.carbonMuted} />
                </TouchableOpacity>
              </View>
              {confirm?.kind === 'delete' && confirm.id === g.id && (
                <View style={{ marginBottom: 10 }}>
                  <ConfirmBox
                    text={`Delete the group "${g.label || 'untitled'}"?`}
                    confirmLabel="Delete"
                    destructive
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => { setConfirm(null); edit(gs => gs.filter(x => x.id !== g.id)); }}
                  />
                </View>
              )}
              <View style={s.chips}>
                {g.terms.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={s.chip}
                    onPress={() => edit(gs => gs.map(x => (x.id === g.id ? { ...x, terms: x.terms.filter(y => y !== t) } : x)))}
                    activeOpacity={0.7}
                  >
                    <Text style={s.chipText}>{t}</Text>
                    <Feather name="x" size={12} color={SHADES.carbonMuted} />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={s.input}
                value={drafts[g.id] ?? ''}
                onChangeText={t => setDrafts(d => ({ ...d, [g.id]: t }))}
                onSubmitEditing={() => addTerms(g.id)}
                blurOnSubmit={false}
                placeholder="Add words (comma-separated), then Enter"
                placeholderTextColor={SHADES.carbonFaint}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ))}

          {groups.length < SEARCH_LIMITS.groups && (
            <PressScale
              style={[UI.btnSecondary, { marginTop: 16 }]}
              onPress={() => edit(gs => [...gs, { id: `g${Date.now()}`, label: '', terms: [] }])}
            >
              <Feather name="plus" size={16} color={SHADES.carbon} />
              <Text style={UI.btnSecondaryText}>New group</Text>
            </PressScale>
          )}

          {status === 'saved' && <View style={{ marginTop: 14 }}><CheckLine text="Search vocabulary saved." /></View>}
          {status === 'error' && <Text style={[UI.errorText, { marginTop: 14 }]}>Couldn&apos;t save. Please try again.</Text>}

          <PressScale style={[UI.btnPrimary, { marginTop: 16 }, saving && UI.btnDisabled]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>Save vocabulary</Text>}
          </PressScale>

          {confirm?.kind === 'reset' ? (
            <View style={{ marginTop: 12 }}>
              <ConfirmBox
                text="Replace every group with the built-in defaults? Unsaved until you tap Save."
                confirmLabel="Reset"
                destructive
                onCancel={() => setConfirm(null)}
                onConfirm={() => { setConfirm(null); edit(() => DEFAULT_SEARCH_GROUPS.map(x => ({ ...x, terms: [...x.terms] }))); }}
              />
            </View>
          ) : (
            <TouchableOpacity style={[UI.btnDestructive, { marginTop: 12 }]} onPress={() => setConfirm({ kind: 'reset' })} activeOpacity={0.8}>
              <Text style={UI.dangerText}>Reset to defaults</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: SHADES.border },
  headerTitle: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '800', color: SHADES.carbon },
  group: { padding: 14, marginTop: 14 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  label: { flex: 1, fontSize: 15, fontWeight: '700', color: SHADES.carbon, paddingVertical: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: SHADES.carbonLight, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '600', color: SHADES.carbon },
  input: {
    marginTop: 10, height: 42, borderRadius: 12, borderWidth: 1, borderColor: SHADES.border, backgroundColor: SHADES.cream,
    paddingHorizontal: 12, fontSize: 14, color: SHADES.carbon,
  },
});
