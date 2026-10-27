import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { PRODUCT_COPY } from '@/constants/productCopy';
import { formatReviewerName } from '@/utils/reviewerName';
import type { ReviewDoc } from '@/lib/firestore';

// One review (product page "Reviews" + the all-reviews screen): name · month, stars,
// text, and LANCHAI's reply in a light amber box when there is one.
export default function ReviewCard({ review, divider }: { review: ReviewDoc; divider?: boolean }) {
  const date = review.createdAt?.toDate
    ? review.createdAt.toDate().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : '';
  return (
    <View style={[s.wrap, divider && s.divider]}>
      <View style={s.head}>
        <Text style={s.name} numberOfLines={1}>
          {formatReviewerName(review.reviewerName)}
          {!!date && <Text style={s.date}>{` · ${date}`}</Text>}
        </Text>
        <View style={s.stars}>
          {[1, 2, 3, 4, 5].map(i => (
            <Feather key={i} name="star" size={12} color={i <= review.rating ? SHADES.amber : SHADES.carbonFaint} />
          ))}
        </View>
      </View>
      <Text style={s.text}>{review.text}</Text>
      {review.adminReply?.text ? (
        <View style={s.reply}>
          <Text style={s.replyLabel}>{PRODUCT_COPY.reviews.replied}</Text>
          <Text style={s.replyText}>{review.adminReply.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 14 },
  divider: { borderTopWidth: 0.5, borderTopColor: SHADES.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: SHADES.carbon },
  date: { fontWeight: '500', color: SHADES.carbonMuted },
  stars: { flexDirection: 'row', gap: 2 },
  text: { fontSize: 14.5, fontWeight: '500', color: SHADES.carbon, lineHeight: 21, marginTop: 6 },
  reply: { backgroundColor: SHADES.amberPale, borderRadius: 12, padding: 12, marginTop: 10 },
  replyLabel: { fontSize: 12.5, fontWeight: '700', color: SHADES.amberDeep },
  replyText: { fontSize: 13.5, fontWeight: '500', color: SHADES.carbon, marginTop: 2 },
});
