import React, { useCallback, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput } from '@/components/AppText';
import BackButton from '@/components/BackButton';
import { ConfirmBox } from '@/components/ConfirmBox';
import KeyboardScreen from '@/components/KeyboardScreen';
import { UI, SectionTitle, StatusChip, useScreenInsets } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';
import { COLORS } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { listTeam, addTeamMember, updateTeamMember, type AdminRole, type TeamMember } from '@/lib/team';

// Admin → Team (owner only, app/admin/_layout.tsx + the callables): every admin with
// role and status, "Add by email" (the person must already have an account), change the
// role, deactivate / reactivate. Deactivation applies instantly server-side (rules +
// callables read `active` on every request). The server refuses removing the last
// active owner and changing your own owner access.

const ROLE_LABEL: Record<AdminRole, string> = { owner: 'Owner', staff: 'Staff' };
const ROLE_HINT: Record<AdminRole, string> = {
  owner: 'Everything, including prices, fees, settlements, settings and the team.',
  staff: 'Counter work: pick-ups, returns, checklists, ID check, chat, stock. No fee changes, no totals.',
};

function RoleChoice({ value, onChange, disabled }: { value: AdminRole; onChange: (r: AdminRole) => void; disabled?: boolean }) {
  return (
    <View style={s.choiceRow}>
      {(['staff', 'owner'] as AdminRole[]).map(r => (
        <TouchableOpacity key={r} disabled={disabled} onPress={() => onChange(r)} activeOpacity={0.8}
          accessibilityRole="radio" accessibilityState={{ selected: value === r }}
          style={[UI.choice, value === r && UI.choiceOn]}>
          <Text style={[UI.choiceText, value === r && UI.choiceTextOn]}>{ROLE_LABEL[r]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AdminTeamScreen() {
  const router = useRouter();
  const screen = useScreenInsets();
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('staff');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ uid: string; text: string } | null>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    listTeam().then(setMembers).catch(e => setLoadError(e.message));
  }, []);
  useFocusEffect(load);

  const add = async () => {
    setAddError(null);
    setAdding(true);
    try {
      await addTeamMember(email.trim(), role, name.trim() || undefined);
      setEmail(''); setName(''); setRole('staff');
      load();
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const update = async (m: TeamMember, patch: { role?: AdminRole; active?: boolean }) => {
    setRowError(null);
    setBusyUid(m.uid);
    try {
      await updateTeamMember(m.uid, patch);
      setMembers(prev => prev?.map(x => (x.uid === m.uid ? { ...x, ...patch } : x)) ?? prev);
    } catch (e) {
      setRowError({ uid: m.uid, text: (e as Error).message });
    } finally {
      setBusyUid(null);
      setConfirmOff(null);
    }
  };

  return (
    <KeyboardScreen style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.title} pointerEvents="none">Team</Text>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[UI.screenContent, { paddingBottom: screen.contentBottom }]} keyboardShouldPersistTaps="handled">
        <SectionTitle>Add someone</SectionTitle>
        <View style={[UI.card, UI.cardPadded, { gap: 10 }]}>
          <Text style={UI.small}>They need an account first: ask them to sign up in the app, then add their email here.</Text>
          <TextInput style={UI.input} value={email} onChangeText={t => { setEmail(t); setAddError(null); }}
            placeholder="Email" placeholderTextColor={SHADES.carbonPlaceholder}
            autoCapitalize="none" keyboardType="email-address" autoCorrect={false} editable={!adding} />
          <TextInput style={UI.input} value={name} onChangeText={setName}
            placeholder="Name shown in the history (optional)" placeholderTextColor={SHADES.carbonPlaceholder} editable={!adding} />
          <RoleChoice value={role} onChange={setRole} disabled={adding} />
          <Text style={UI.small}>{ROLE_HINT[role]}</Text>
          {!!addError && <Text style={UI.errorText}>{addError}</Text>}
          <TouchableOpacity style={[UI.btnPrimary, (adding || !email.trim()) && UI.btnDisabled]} disabled={adding || !email.trim()}
            onPress={add} activeOpacity={0.85}>
            {adding ? <ActivityIndicator color={SHADES.carbon} /> : <Text style={UI.btnPrimaryText}>Add to team</Text>}
          </TouchableOpacity>
        </View>

        <SectionTitle>Members</SectionTitle>
        {loadError ? <Text style={UI.errorText}>{loadError}</Text>
          : !members ? <ActivityIndicator color={SHADES.amber} style={{ marginTop: 16 }} />
          : members.map(m => {
            const me = m.uid === user?.uid;
            const busy = busyUid === m.uid;
            return (
              <View key={m.uid} style={[UI.card, UI.cardPadded, s.member, !m.active && s.memberOff]}>
                <View style={s.memberTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={UI.title}>{m.name}{me ? ' (you)' : ''}</Text>
                    {!!m.email && <Text style={UI.subtitle}>{m.email}</Text>}
                  </View>
                  <StatusChip label={m.active ? ROLE_LABEL[m.role] : 'Deactivated'} tone={m.active ? (m.role === 'owner' ? 'amber' : 'grey') : 'danger'} />
                </View>
                {!me && m.active && (
                  <RoleChoice value={m.role} onChange={r => r !== m.role && update(m, { role: r })} disabled={busy} />
                )}
                {rowError?.uid === m.uid && <Text style={UI.errorText}>{rowError.text}</Text>}
                {!me && (confirmOff === m.uid ? (
                  <ConfirmBox
                    text={`Deactivate ${m.name}? They lose admin access immediately. You can reactivate them later.`}
                    confirmLabel="Deactivate" destructive
                    onCancel={() => setConfirmOff(null)}
                    onConfirm={() => update(m, { active: false })}
                  />
                ) : (
                  <TouchableOpacity disabled={busy} activeOpacity={0.85}
                    style={[UI.btnSecondary, UI.btnCard, busy && UI.btnDisabled]}
                    onPress={() => (m.active ? setConfirmOff(m.uid) : update(m, { active: true }))}>
                    {busy ? <ActivityIndicator color={SHADES.carbon} />
                      : <Text style={[m.active ? UI.dangerText : UI.btnSecondaryText, UI.btnCardText]}>{m.active ? 'Deactivate' : 'Reactivate'}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
      </ScrollView>
    </KeyboardScreen>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  title: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '800', color: SHADES.carbon, letterSpacing: -0.3 },
  choiceRow: { flexDirection: 'row', gap: 8 },
  member: { gap: 10, marginBottom: 10 },
  memberOff: { opacity: 0.7 },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
