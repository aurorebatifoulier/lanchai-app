import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Timestamp, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ReviewDoc, updateReviewReply } from '@/lib/firestore';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { useAuth } from '@/contexts/AuthContext';
import { formatReviewerName } from '@/utils/reviewerName';
import Stars from '@/components/Stars';

type FilterOption = 'all' | 'unanswered' | '5' | '4' | '3' | '2' | '1';
type SortOption = 'newest' | 'oldest' | 'highest' | 'lowest';

const FILTER_CHIPS: { id: FilterOption; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unanswered', label: 'Unanswered' },
  { id: '5', label: '5★' },
  { id: '4', label: '4★' },
  { id: '3', label: '3★' },
  { id: '2', label: '2★' },
  { id: '1', label: '1★' },
];

const SORT_CHIPS: { id: SortOption; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'highest', label: 'Highest' },
  { id: 'lowest', label: 'Lowest' },
];

export default function AdminReviewsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loading: authLoading, adminLoading, isAdmin } = useAuth();

  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [sort, setSort] = useState<SortOption>('newest');

  // Inline reply state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    // collectionGroup('reviews') is broken for this project (permission-denied
    // on every attempt despite valid auth and correct rules). Workaround: fetch
    // all product IDs first, then fetch each product's reviews subcollection
    // individually using the known-working direct collection path.
    const productsSnap = await getDocs(collection(db, 'products'));
    const perProduct = await Promise.all(
      productsSnap.docs.map(async productDoc => {
        try {
          const revSnap = await getDocs(
            collection(db, 'reviews', productDoc.id, 'reviews'),
          );
          return revSnap.docs.map(d => d.data() as ReviewDoc);
        } catch (err) {
          console.error(`Reviews fetch error for product ${productDoc.id}:`, err);
          return [];
        }
      }),
    );
    setReviews(perProduct.flat());
  }, []);

  // Initial load — gated on auth + admin check being fully settled.
  useEffect(() => {
    if (authLoading || adminLoading || !isAdmin) return;
    setFetchError(false);
    setLoading(true);
    fetchReviews()
      .catch(err => { console.error('Reviews initial fetch failed:', err); setFetchError(true); })
      .finally(() => setLoading(false));
  }, [authLoading, adminLoading, isAdmin, fetchReviews]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchReviews(); } catch { /* leave existing data */ }
    setRefreshing(false);
  }, [fetchReviews]);

  const getSeconds = (r: ReviewDoc) => r.createdAt?.seconds ?? 0;

  const displayed = useMemo(() => {
    let list = [...reviews];
    if (filter === 'unanswered') list = list.filter(r => !r.adminReply);
    else if (['5', '4', '3', '2', '1'].includes(filter)) {
      list = list.filter(r => r.rating === Number(filter));
    }
    if (sort === 'newest') list.sort((a, b) => getSeconds(b) - getSeconds(a));
    else if (sort === 'oldest') list.sort((a, b) => getSeconds(a) - getSeconds(b));
    else if (sort === 'highest') list.sort((a, b) => b.rating - a.rating);
    else if (sort === 'lowest') list.sort((a, b) => a.rating - b.rating);
    return list;
  }, [reviews, filter, sort]);

  const handleExpand = useCallback((r: ReviewDoc) => {
    const id = r.reservationId;
    if (expandedId === id) {
      setExpandedId(null);
      setEditingId(null);
      setReplyText('');
      setReplyError(null);
    } else {
      setExpandedId(id);
      setEditingId(r.adminReply ? null : id);
      setReplyText(r.adminReply ? '' : '');
      setReplyError(null);
    }
  }, [expandedId]);

  const handleStartEdit = useCallback((r: ReviewDoc) => {
    setEditingId(r.reservationId);
    setReplyText(r.adminReply?.text ?? '');
    setReplyError(null);
  }, []);

  const handleCancelEdit = useCallback((r: ReviewDoc) => {
    setEditingId(null);
    setReplyText('');
    setReplyError(null);
  }, []);

  const handleSubmitReply = useCallback(async (r: ReviewDoc) => {
    const trimmed = replyText.trim();
    if (!trimmed) { setReplyError('Reply cannot be empty.'); return; }
    setReplying(true);
    setReplyError(null);
    try {
      await updateReviewReply(r.productId, r.reservationId, trimmed);
      // Optimistic update for instant UI feedback.
      setReviews(prev => prev.map(rev =>
        rev.reservationId === r.reservationId
          ? { ...rev, adminReply: { text: trimmed, repliedAt: Timestamp.now() } }
          : rev,
      ));
      setEditingId(null);
      setReplyText('');
      setExpandedId(null);
      // Re-fetch in background to sync server state (no live listener).
      fetchReviews().catch(() => {});
    } catch {
      setReplyError("Couldn't save the reply. Check your connection and try again.");
    } finally {
      setReplying(false);
    }
  }, [replyText, fetchReviews]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* Fixed top elements — single flex sibling to avoid Fabric/Android layout bug */}
      <View style={{ flexShrink: 0 }}>
        {/* Header */}
        <View style={s.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={s.headerTitle}>Reviews</Text>
        </View>

        {/* Filter + sort chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipScroll}
          style={s.chipBar}
        >
          {FILTER_CHIPS.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[s.chip, filter === c.id && s.chipActive]}
              onPress={() => setFilter(c.id)}
            >
              <Text style={[s.chipText, filter === c.id && s.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={s.chipDivider} />
          {SORT_CHIPS.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[s.chip, sort === c.id && s.chipActive]}
              onPress={() => setSort(c.id)}
            >
              <Text style={[s.chipText, sort === c.id && s.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={COLORS.amber} size="large" />
        </View>
      ) : fetchError ? (
        <View style={s.center}>
          <Feather name="alert-circle" size={32} color={COLORS.fg3} />
          <Text style={s.emptyTitle}>Couldn&apos;t load reviews</Text>
          <Text style={s.emptySub}>Check your connection and pull to refresh.</Text>
        </View>
      ) : displayed.length === 0 ? (
        <View style={s.center}>
          <Feather name="star" size={32} color={COLORS.fg3} />
          <Text style={s.emptyTitle}>No reviews yet</Text>
          <Text style={s.emptySub}>
            {filter === 'unanswered'
              ? 'All reviews have been answered.'
              : 'Reviews will appear here once renters submit them.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.amber}
              colors={[COLORS.amber]}
            />
          }
        >
          {displayed.map(r => {
            const isExpanded = expandedId === r.reservationId;
            const isEditing = editingId === r.reservationId;
            const dateStr = r.createdAt?.toDate
              ? r.createdAt.toDate().toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : '';
            return (
              <View key={r.reservationId} style={s.row}>
                {/* Tappable header section */}
                <TouchableOpacity onPress={() => handleExpand(r)} activeOpacity={0.85}>
                  {/* Stars + product name */}
                  <View style={s.rowTop}>
                    <View style={s.rowStars}>
                      <Stars rating={r.rating} size={12} gap={1} />
                    </View>
                    <Text style={s.rowProduct} numberOfLines={1}>{r.productName}</Text>
                  </View>

                  {/* Reviewer + date */}
                  <View style={s.rowMeta}>
                    <Text style={s.rowName}>{formatReviewerName(r.reviewerName)}</Text>
                    <Text style={s.rowDate}>{dateStr}</Text>
                  </View>

                  {/* Review text */}
                  <Text style={s.rowText} numberOfLines={isExpanded ? undefined : 3}>
                    {r.text}
                  </Text>

                  {/* Status chip + chevron */}
                  <View style={s.rowFooter}>
                    {r.adminReply ? (
                      <View style={s.chipReplied}>
                        <Text style={s.chipRepliedText}>Replied ✓</Text>
                      </View>
                    ) : (
                      <View style={s.chipUnanswered}>
                        <Text style={s.chipUnansweredText}>Unanswered</Text>
                      </View>
                    )}
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={COLORS.fg3}
                    />
                  </View>
                </TouchableOpacity>

                {/* Inline reply panel — plain View, not touchable */}
                {isExpanded && (
                  <View style={s.expandPanel}>
                    <View style={s.expandDivider} />

                    {/* Existing reply — show + edit link */}
                    {r.adminReply && !isEditing && (
                      <View>
                        <Text style={s.replyLabel}>Response from LANCHAI</Text>
                        <Text style={s.replyExistingText}>{r.adminReply.text}</Text>
                        <TouchableOpacity style={s.editLink} onPress={() => handleStartEdit(r)}>
                          <Text style={s.editLinkText}>Edit reply</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* New reply or edit form */}
                    {(!r.adminReply || isEditing) && (
                      <View>
                        <TextInput
                          style={s.replyInput}
                          multiline
                          placeholder="Your response to this review…"
                          placeholderTextColor={COLORS.fg3}
                          value={replyText}
                          onChangeText={t => { setReplyText(t); setReplyError(null); }}
                          textAlignVertical="top"
                          maxLength={600}
                        />
                        <Text style={s.charHint}>{replyText.trim().length}/600</Text>
                        {replyError && (
                          <View style={s.errorBanner}>
                            <Feather name="alert-circle" size={13} color={COLORS.danger} />
                            <Text style={s.errorText}>{replyError}</Text>
                            <TouchableOpacity
                              onPress={() => setReplyError(null)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Feather name="x" size={13} color={COLORS.danger} />
                            </TouchableOpacity>
                          </View>
                        )}
                        <TouchableOpacity
                          style={[s.submitBtn, replying && { opacity: 0.65 }]}
                          onPress={() => handleSubmitReply(r)}
                          disabled={replying}
                          activeOpacity={0.8}
                        >
                          {replying
                            ? <ActivityIndicator size="small" color={COLORS.carbon} />
                            : <Text style={s.submitBtnText}>{isEditing ? 'Save reply' : 'Submit reply'}</Text>}
                        </TouchableOpacity>
                        {isEditing && (
                          <TouchableOpacity
                            style={s.cancelLink}
                            onPress={() => handleCancelEdit(r)}
                          >
                            <Text style={s.cancelLinkText}>Cancel</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },
  chipBar: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    backgroundColor: COLORS.porcelain,
  },
  chipScroll: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.softGray,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  chipTextActive: {
    color: COLORS.porcelain,
  },
  chipDivider: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.softGray200,
    marginHorizontal: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.carbon,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.fg3,
    textAlign: 'center',
    lineHeight: 18,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  row: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 14,
    overflow: 'hidden',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  rowStars: {
    flexDirection: 'row',
    gap: 2,
  },
  rowProduct: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg3,
    textAlign: 'right',
  },
  rowMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  rowName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  rowDate: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  rowText: {
    fontSize: 13,
    color: COLORS.fg2,
    lineHeight: 19,
    marginBottom: 8,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipReplied: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#DFF3E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRepliedText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
  },
  chipUnanswered: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(244,180,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipUnansweredText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B38500',
  },
  expandPanel: {
    marginTop: 10,
  },
  expandDivider: {
    height: 1,
    backgroundColor: COLORS.softGray200,
    marginBottom: 12,
  },
  replyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.amber,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  replyExistingText: {
    fontSize: 13,
    color: COLORS.fg2,
    lineHeight: 18,
  },
  editLink: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  editLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.carbon,
    textDecorationLine: 'underline',
  },
  replyInput: {
    backgroundColor: COLORS.porcelain,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 13,
    color: COLORS.carbon,
    minHeight: 90,
    lineHeight: 18,
    marginTop: 4,
  },
  charHint: {
    fontSize: 11,
    color: COLORS.fg3,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: '500',
  },
  submitBtn: {
    height: 44,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  cancelLink: {
    marginTop: 8,
    alignSelf: 'center',
  },
  cancelLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg3,
  },
});
