import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { UI } from '@/components/account/ui';
import { ACCOUNT_COPY } from '@/constants/accountCopy';
import { compactLak, type AccountStats as Stats } from '@/lib/accountStats';

// Three stat cards (validated mockup): round trips · things not in your closet · LAK not
// spent on stuff (carbon card; "+" when some rented products have no replacement value;
// hidden when none has one). New renter → one friendly "first rental" card instead.
export function AccountStats({ stats }: { stats: Stats | null }) {
  const router = useRouter();
  if (!stats) return null;

  if (stats.newRenter) {
    return (
      <View style={[s.card, s.firstCard]}>
        <View style={[s.iconCircle, { backgroundColor: SHADES.amberLight }]}>
          <MaterialCommunityIcons name="tent" size={20} color={SHADES.amberDeep} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.firstTitle}>{ACCOUNT_COPY.firstRentalTitle}</Text>
          <Text style={s.firstSub}>{ACCOUNT_COPY.firstRentalSub}</Text>
        </View>
        <TouchableOpacity style={s.browse} onPress={() => router.push('/explore')} activeOpacity={0.85}>
          <Text style={s.browseText}>{ACCOUNT_COPY.firstRentalCta}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.row}>
      <View style={s.card}>
        <View style={[s.iconCircle, { backgroundColor: SHADES.amberLight }]}>
          <MaterialCommunityIcons name="infinity" size={20} color={SHADES.amberDeep} />
        </View>
        <Text style={s.value}>{stats.roundTrips}</Text>
        <Text style={s.label}>{ACCOUNT_COPY.roundTrips(stats.roundTrips)}</Text>
      </View>
      <View style={s.card}>
        <View style={[s.iconCircle, { backgroundColor: SHADES.carbonLight }]}>
          <Feather name="box" size={18} color={SHADES.carbon} />
        </View>
        <Text style={s.value}>{stats.distinctProducts}</Text>
        <Text style={s.label}>{ACCOUNT_COPY.notInCloset(stats.distinctProducts)}</Text>
      </View>
      {stats.valueLak != null && (
        <View style={[s.card, s.cardDark]}>
          <View style={[s.iconCircle, { backgroundColor: SHADES.carbonSoft }]}>
            <MaterialCommunityIcons name="piggy-bank-outline" size={20} color={SHADES.amber} />
          </View>
          <Text style={[s.value, s.valueLight]} numberOfLines={1} adjustsFontSizeToFit>
            {compactLak(stats.valueLak)}{stats.valuePartial ? '+' : ''}
          </Text>
          <Text style={[s.label, s.labelLight]}>{ACCOUNT_COPY.notSpent}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  card: { ...UI.card, flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 },
  cardDark: { backgroundColor: SHADES.carbon, borderColor: SHADES.carbon },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 26, fontWeight: '800', color: SHADES.carbon, marginTop: 8, letterSpacing: -0.5 },
  valueLight: { color: SHADES.cream },
  label: { fontSize: 12.5, fontWeight: '500', color: SHADES.carbonMuted, textAlign: 'center', lineHeight: 16, marginTop: 2 },
  labelLight: { color: 'rgba(250,250,247,0.75)' },
  firstCard: { flex: 0, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, paddingHorizontal: 14, paddingVertical: 14 },
  firstTitle: { fontSize: 15, fontWeight: '800', color: SHADES.carbon },
  firstSub: { fontSize: 12.5, fontWeight: '500', color: SHADES.carbonMuted, marginTop: 2, lineHeight: 17 },
  browse: { backgroundColor: SHADES.amber, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  browseText: { fontSize: 13, fontWeight: '800', color: SHADES.carbon },
});
