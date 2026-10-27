import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { UI, SectionTitle } from '@/components/account/ui';
import { HOME_COPY } from '@/constants/homeCopy';

/** Home section title with an optional dark-amber "See all" link. */
export function RailHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <View style={s.head}>
      <SectionTitle style={s.title}>{title}</SectionTitle>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} hitSlop={8} activeOpacity={0.7}>
          <Text style={UI.link}>{HOME_COPY.seeAll}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  title: { marginTop: 0, marginBottom: 0 },
});
