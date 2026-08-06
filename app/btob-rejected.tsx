import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, type UserProfile } from '@/lib/firestore';

export default function BtobRejectedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.iconBox}>
          <Feather name="x-circle" size={26} color={COLORS.danger} />
        </View>
        <Text style={s.title}>Your application was not approved</Text>
        <Text style={s.msg}>
          We couldn't approve your business account. If you think this is a mistake or
          you can provide more information, please contact us.
        </Text>

        {loading ? (
          <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 20 }} />
        ) : (
          profile?.btobRejectionReason && (
            <View style={s.reasonBox}>
              <Text style={s.reasonBoxLabel}>REASON</Text>
              <Text style={s.reasonText}>{profile.btobRejectionReason}</Text>
            </View>
          )
        )}

        <TouchableOpacity
          style={s.browseBtn}
          onPress={() => router.push('/')}
          activeOpacity={0.85}
        >
          <Feather name="grid" size={16} color={COLORS.carbon} />
          <Text style={s.browseBtnText}>Browse catalogue</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.chatBtn} onPress={() => router.push('/chat')} activeOpacity={0.85}>
          <Feather name="message-circle" size={16} color={COLORS.carbon} />
          <Text style={s.chatBtnText}>Contact us</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => signOut()} activeOpacity={0.7} style={s.signOutBtn}>
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  content: { paddingHorizontal: 24, paddingTop: 40, alignItems: 'center' },
  iconBox: {
    width: 60, height: 60, borderRadius: 16,
    backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20, fontWeight: '800', color: COLORS.carbon,
    letterSpacing: -0.3, textAlign: 'center', marginBottom: 10,
  },
  msg: {
    fontSize: 14, fontWeight: '400', color: COLORS.fg2,
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  reasonBox: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderRadius: 14, borderWidth: 1, borderColor: '#FECACA',
    padding: 16, marginBottom: 24,
  },
  reasonBoxLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
    color: '#991B1B', textTransform: 'uppercase', marginBottom: 8,
  },
  reasonText: { fontSize: 14, fontWeight: '500', color: '#991B1B', lineHeight: 20 },
  browseBtn: {
    width: '100%', height: 50,
    backgroundColor: COLORS.white, borderRadius: 10,
    borderWidth: 1.5, borderColor: COLORS.carbon,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 12,
  },
  browseBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  chatBtn: {
    width: '100%', height: 50,
    backgroundColor: COLORS.amber, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 16,
  },
  chatBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  signOutBtn: { paddingVertical: 8 },
  signOutText: { fontSize: 13, fontWeight: '600', color: COLORS.fg3 },
});
