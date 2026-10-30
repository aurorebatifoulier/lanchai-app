import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { COLORS } from '@/constants/Colors';
import { ConfirmBox } from '@/components/ConfirmBox';
import { functions } from '@/lib/firebase';
import { GiveCodeBox } from '@/components/admin/GiveCodeBox';
import { PROMO_COPY } from '@/constants/promoCopy';

// Admin: the account's name, big, next to the ID photos (pick-up ID check, reservation
// detail ID card) so staff compare it with the document — plus phone and email in grey
// (email comes from Auth via the adminRenterProfile callable). "Edit name" fixes
// first/last name with an inline confirmation (nameEditedAt/By recorded server-side).
interface Contact {
  firstName: string; lastName: string; displayName: string; phone: string; email: string;
  referredByName?: string | null; referralCount?: number;
}

export function RenterNameBlock({ renterId, onNameChanged }: { renterId: string; onNameChanged?: () => void }) {
  // "Give a code": a promo code in this renter's wallet (adminGrantPromo).
  const [giving, setGiving] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const res = await httpsCallable<unknown, Contact>(functions, 'adminRenterProfile')({ renterId, ...payload });
    setContact(res.data);
    return res.data;
  }, [renterId]);

  useEffect(() => { call({ action: 'get' }).catch(() => setError('Could not load the account.')); }, [call]);

  const startEdit = () => {
    setFirst(contact?.firstName ?? '');
    setLast(contact?.lastName ?? '');
    setEditing(true);
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await call({ action: 'setName', firstName: first, lastName: last });
      setEditing(false);
      setConfirming(false);
      onNameChanged?.();
    } catch (err) {
      setError((err as { message?: string })?.message || 'Could not update the name.');
    } finally {
      setBusy(false);
    }
  };

  if (!contact) {
    return error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 6 }} />;
  }
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.displayName || '—';

  return (
    <View style={s.wrap}>
      <Text style={s.caption}>Name on the account</Text>
      {!editing ? (
        <View style={s.nameRow}>
          <Text style={s.name} selectable>{name}</Text>
          <TouchableOpacity onPress={startEdit} hitSlop={8}>
            <Text style={s.edit}>Edit name</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <TextInput style={s.input} value={first} onChangeText={setFirst} placeholder="First name" placeholderTextColor={COLORS.fg3} />
          <TextInput style={s.input} value={last} onChangeText={setLast} placeholder="Last name" placeholderTextColor={COLORS.fg3} />
          {!confirming ? (
            <View style={s.row}>
              <TouchableOpacity style={s.btn} onPress={() => setEditing(false)}><Text style={s.btnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity
                style={[s.btn, s.btnPrimary, (!first.trim() || !last.trim()) && { opacity: 0.45 }]}
                disabled={!first.trim() || !last.trim()}
                onPress={() => setConfirming(true)}
              >
                <Text style={s.btnText}>Save name</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ConfirmBox
              text={`Change the account name to "${first.trim()} ${last.trim()}"? Make sure it matches the ID document.`}
              confirmLabel={busy ? 'Saving…' : 'Change name'}
              cancelLabel="Keep"
              confirmDisabled={busy}
              onCancel={() => setConfirming(false)}
              onConfirm={save}
            />
          )}
        </View>
      )}
      {(!!contact.phone || !!contact.email) && (
        <Text style={s.contact} selectable>{[contact.phone, contact.email].filter(Boolean).join(' · ')}</Text>
      )}
      {(!!contact.referredByName || !!contact.referralCount) && (
        <Text style={s.contact}>
          {[contact.referredByName ? `Referred by ${contact.referredByName}` : null,
            contact.referralCount ? `${contact.referralCount} referral${contact.referralCount > 1 ? 's' : ''}` : null]
            .filter(Boolean).join(' · ')}
        </Text>
      )}
      {giving ? (
        <GiveCodeBox renterId={renterId} onClose={() => setGiving(false)} />
      ) : (
        <TouchableOpacity onPress={() => setGiving(true)} hitSlop={8} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
          <Text style={s.edit}>{PROMO_COPY.admin.giveCodeTitle}</Text>
        </TouchableOpacity>
      )}
      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4 },
  caption: { fontSize: 11, fontWeight: '700', color: COLORS.fg3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  name: { flex: 1, fontSize: 20, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3 },
  edit: { fontSize: 13, fontWeight: '800', color: COLORS.carbon, textDecorationLine: 'underline' },
  contact: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginTop: 2 },
  input: {
    height: 42, borderRadius: 8, borderWidth: 1, borderColor: COLORS.softGray200, backgroundColor: COLORS.white,
    paddingHorizontal: 12, fontSize: 14, color: COLORS.carbon, marginTop: 6,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: { borderWidth: 1.5, borderColor: COLORS.softGray200, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btnPrimary: { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
  btnText: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },
  error: { fontSize: 12, fontWeight: '500', color: COLORS.danger, marginTop: 4 },
});
