import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { getProduct, getFavorites, addFavorite, removeFavorite, getProductReviews, ReviewDoc, getUserProfile, type UserProfile } from '@/lib/firestore';
import { Product } from '@/lib/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { addToBag, listenBagItems } from '@/lib/bag';
import { useShopInfo, buildMapsUrl } from '@/lib/shop';
import { useExchangeRate, useVatPercent } from '@/lib/exchangeRate';
import { formatLak, toLak } from '@/utils/currency';
import { useLoyaltyTier } from '@/lib/loyalty';
import { getProductAccessState } from '@/utils/productAccess';
import { needsBtobDocument } from '@/utils/btob';
import { formatReviewerName } from '@/utils/reviewerName';
import { PriceLak } from '@/components/PriceLak';
const HERO_H = 340;

type PriceTier = 't12' | 't36' | 't713' | 't1429' | 't30plus';
const TIER_KEYS: PriceTier[] = ['t12', 't36', 't713', 't1429', 't30plus'];

// Badge definitions — icon + label, keyed by flag (excludes isPremium, covered by sectionBadge)
const BADGE_DEFS = [
  { flag: 'isPopular'     as const, icon: 'zap'         as const, label: 'Popular'       },
  { flag: 'isNewThisWeek' as const, icon: 'sun'         as const, label: 'New this week' },
  { flag: 'isMostRented'  as const, icon: 'trending-up' as const, label: 'Most rented'  },
];

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width: SCREEN_W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const exchangeRate = useExchangeRate();
  const vatPercent = useVatPercent();
  const { user } = useAuth();
  const userTier = useLoyaltyTier();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const shop = useShopInfo();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PriceTier>('t12');
  const [isFav, setIsFav] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSlide, setLightboxSlide] = useState(0);
  const lightboxRef = useRef<ScrollView>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);

  // Bag state
  const [inBag, setInBag] = useState(false);
  const [addBagBusy, setAddBagBusy] = useState(false);
  const [addBagSuccess, setAddBagSuccess] = useState(false);
  const [addBagError, setAddBagError] = useState(false);
  const [docRequiredNotice, setDocRequiredNotice] = useState(false);

  useEffect(() => {
    if (id) {
      getProduct(id)
        .then(p => {
          setProduct(p);
          setLoading(false);
        })
        .catch(() => {
          setLoadError(true);
          setLoading(false);
        });
    }
  }, [id]);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile).catch(() => {});
  }, [user]);

  // Load reviews from subcollection once product is available
  useEffect(() => {
    if (!id) return;
    getProductReviews(id).then(setReviews).catch(() => {});
  }, [id]);

  // Load initial favourite state from Firestore
  useEffect(() => {
    if (!user || !id) return;
    getFavorites(user.uid).then(ids => setIsFav(ids.includes(id)));
  }, [user, id]);

  const handleToggleFav = useCallback(() => {
    if (!user || !id) return;
    const next = !isFav;
    setIsFav(next);
    if (next) {
      addFavorite(user.uid, id).catch(() => setIsFav(false));
    } else {
      removeFavorite(user.uid, id).catch(() => setIsFav(true));
    }
  }, [user, id, isFav]);

  // Track whether this product is already in the bag
  useEffect(() => {
    if (!user || !id) return;
    return listenBagItems(user.uid, items => {
      setInBag(items.some(i => i.productId === id));
    });
  }, [user, id]);

  const handleAddToBag = useCallback(async () => {
    if (!user || !product) return;
    if (inBag) {
      router.push('/bag');
      return;
    }
    if (needsBtobDocument(profile)) {
      setDocRequiredNotice(true);
      return;
    }
    if (addBagBusy) return;
    setAddBagBusy(true);
    setAddBagError(false);
    try {
      await addToBag(user.uid, product);
      setAddBagSuccess(true);
      setTimeout(() => setAddBagSuccess(false), 3000);
    } catch {
      setAddBagError(true);
    } finally {
      setAddBagBusy(false);
    }
  }, [user, product, inBag, addBagBusy, router, profile]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.amber} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Couldn't load this item</Text>
          <Text style={styles.notFoundSub}>Check your connection and try again.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Product not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const heroBg =
    ({ amber: COLORS.amber, dark: COLORS.carbon, beige: COLORS.warmBeige, default: COLORS.warmBeige } as Record<string, string>)[product.cardBg] ??
    COLORS.warmBeige;
  const carouselImages = product.images ?? [];

  // Badges: collect whichever flags are set on the product
  const badges = BADGE_DEFS.filter(b => product[b.flag]);

  // Loyalty Phase 2 — tier-gated access state for the current viewer
  const accessState = getProductAccessState(product, userTier ?? null);

  // All applicable section badges — shown together on the detail screen (cards stay single-priority)
  const sectionBadges: { key: string; label: string; icon?: string; bg: string; text: string }[] = [
    ...(accessState.badgeLabel ? [{
      key: 'access',
      label: accessState.badgeLabel,
      bg:   accessState.badgeTone === 'unlocked' ? COLORS.amber : COLORS.carbon,
      text: accessState.badgeTone === 'unlocked' ? COLORS.carbon : COLORS.white,
    }] : []),
    ...(product.isPremium     ? [{ key: 'premium', label: 'Premium', icon: 'award', bg: COLORS.amber,   text: COLORS.carbon }] : []),
    ...(product.showInNew     ? [{ key: 'new',     label: 'New',                    bg: COLORS.success, text: COLORS.white  }] : []),
    ...(product.showInPopular ? [{ key: 'popular', label: 'Popular',                bg: COLORS.carbon,  text: COLORS.white  }] : []),
  ];

  // Pricing — skip tiers with price 0; guard disc() against zero base rate
  const disc = (p: number) => {
    if (product.pricePerDay <= 0 || p <= 0) return undefined;
    return `−${Math.round((1 - p / product.pricePerDay) * 100)}%`;
  };
  const tiers: Record<PriceTier, { label: string; price: number; discount?: string }> = {
    t12:     { label: '1–2 days',   price: product.pricePerDay },
    t36:     { label: '3–6 days',   price: product.price3to6,   discount: disc(product.price3to6) },
    t713:    { label: '7–13 days',  price: product.price7to13,  discount: disc(product.price7to13) },
    t1429:   { label: '14–29 days', price: product.price14to29, discount: disc(product.price14to29) },
    t30plus: { label: '30+ days',   price: product.price30plus, discount: disc(product.price30plus) },
  };
  const validTierKeys = TIER_KEYS.filter(k => tiers[k].price > 0);
  const hasValidPricing = validTierKeys.length > 0;
  const effectiveTier = validTierKeys.includes(selectedTier) ? selectedTier : (validTierKeys[0] ?? 't12');
  const displayPrice = hasValidPricing ? tiers[effectiveTier].price : null;
  const bookable = hasValidPricing && !accessState.locked;

  // Sticky bar height for scroll padding
  const stickyBarH = 14 + 52 + Math.max(insets.bottom, 16);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Hero carousel ──────────────────────────────────────────────────── */}
      <View style={[styles.hero, { backgroundColor: heroBg }]}>

        {/* Paginated image scroll */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={StyleSheet.absoluteFillObject}
          onMomentumScrollEnd={e =>
            setActiveSlide(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
          }
          scrollEventThrottle={16}
        >
          {carouselImages.map((uri, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.92}
              onPress={() => { setLightboxSlide(i); setLightboxOpen(true); }}
            >
              <Image
                source={{ uri }}
                style={{ width: SCREEN_W, height: HERO_H }}
                contentFit="cover"
                transition={200}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Back button — overlaid */}
        <TouchableOpacity style={styles.heroBack} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={COLORS.carbon} />
        </TouchableOpacity>

        {/* Favourite button — overlaid */}
        <TouchableOpacity style={styles.heroFav} onPress={handleToggleFav}>
          <Feather name="heart" size={20} color={isFav ? COLORS.danger : COLORS.carbon} />
        </TouchableOpacity>

        {/* Pagination dots */}
        {carouselImages.length > 1 && (
          <View style={styles.imgDots}>
            {carouselImages.map((_, i) => (
              <View key={i} style={[styles.imgDot, i === activeSlide && styles.imgDotActive]} />
            ))}
          </View>
        )}
      </View>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.bodyContent}
      >
        {/* Badges + availability row */}
        <View style={styles.tagsRow}>
          {sectionBadges.map(b => (
            <View key={b.key} style={[styles.chipBadge, { backgroundColor: b.bg }]}>
              {b.icon && (
                <Feather name={b.icon as never} size={10} color={b.text} />
              )}
              <Text style={[styles.chipBadgeText, { color: b.text }]}>{b.label}</Text>
            </View>
          ))}
          {badges.map(b => (
            <View key={b.flag} style={styles.chipBadge}>
              <Feather name={b.icon} size={10} color={COLORS.carbon} />
              <Text style={styles.chipBadgeText}>{b.label}</Text>
            </View>
          ))}
          <View style={[styles.chipStatus, product.available ? styles.chipStatusGreen : styles.chipStatusRed]}>
            <View style={[styles.statusDot, product.available ? styles.statusDotGreen : styles.statusDotRed]} />
            <Text style={[styles.chipStatusText, product.available ? styles.chipStatusTextGreen : styles.chipStatusTextRed]}>
              {product.available ? 'Available now' : 'Not available'}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{product.name}</Text>

        {/* Rating row */}
        {product.averageRating != null && (
          <View style={styles.ratingRow}>
            <Feather name="star" size={14} color={COLORS.amber} />
            <Text style={styles.ratingText}>
              {product.averageRating.toFixed(1)} · {product.reviewCount} reviews ·{' '}
              <Text style={{ opacity: 0.6 }}>Rented {product.rentalCount} times</Text>
            </Text>
          </View>
        )}

        {/* Description */}
        <Text style={styles.description}>{product.description}</Text>

        {/* ── Perfect for ── */}
        {(product.perfectFor ?? []).length > 0 && (
          <>
            <Text style={styles.sectionLabel}>PERFECT FOR</Text>
            <View style={styles.chipRow}>
              {product.perfectFor!.map((item, i) => (
                <View key={i} style={styles.perfectChip}>
                  <Text style={styles.perfectChipText}>{item}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Key features ── */}
        {(product.keyFeatures ?? []).length > 0 && (
          <>
            <Text style={styles.sectionLabel}>KEY FEATURES</Text>
            <View style={styles.featuresGrid}>
              {product.keyFeatures!.reduce<{ icon: string; text: string }[][]>((rows, feat, i) => {
                if (i % 2 === 0) rows.push([feat]);
                else rows[rows.length - 1].push(feat);
                return rows;
              }, []).map((row, ri) => (
                <View key={ri} style={styles.featuresRow}>
                  {row.map((feat, i) => (
                    <View key={i} style={styles.featureCard}>
                      <Feather name={(feat.icon || 'check') as never} size={18} color="#BA7517" style={styles.featureIcon} />
                      <Text style={styles.featureText}>{feat.text}</Text>
                    </View>
                  ))}
                  {row.length === 1 && <View style={styles.featureCardPlaceholder} />}
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Pricing tiers ── */}
        <Text style={styles.sectionLabel}>DAILY RATE — AUTO-DISCOUNT</Text>
        {hasValidPricing ? (
          <View style={styles.tierList}>
            {validTierKeys.map(key => {
              const t = tiers[key];
              const isOn = effectiveTier === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.tierRow, isOn && styles.tierRowActive]}
                  onPress={() => setSelectedTier(key)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.tierRadio, isOn && styles.tierRadioActive]}>
                    {isOn && <View style={styles.tierRadioDot} />}
                  </View>
                  <Text style={[styles.tierLabel, isOn && styles.tierLabelActive]}>{t.label}</Text>
                  <View style={styles.tierRight}>
                    {t.discount && (
                      <View style={styles.tierDiscountBadge}>
                        <Text style={styles.tierDiscountText}>{t.discount}</Text>
                      </View>
                    )}
                    <Text style={[styles.tierPrice, isOn && styles.tierPriceActive]}>{formatLak(t.price, exchangeRate)}</Text>
                    <Text style={styles.tierUnit}>/ day</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.noPricingBanner}>
            <Feather name="clock" size={16} color={COLORS.fg3} />
            <Text style={styles.noPricingText}>Pricing for this item hasn't been set yet. Check back soon.</Text>
          </View>
        )}

        {/* ── Optional accordions ── */}
        {(product.whatsIncluded ?? []).length + (product.basicInfo ?? []).length + (product.techSpecs ?? []).length + (product.goodToKnow ?? []).length + (product.usageExamples ?? []).length > 0 && (
          <View style={{ marginBottom: 22 }}>
        {(
          [
            { key: 'whatsIncluded', title: "What's included",         items: product.whatsIncluded ?? [], type: 'check'  as const },
            { key: 'basicInfo',     title: 'Basic information',        items: product.basicInfo     ?? [], type: 'kv'     as const },
            { key: 'techSpecs',     title: 'Technical specifications', items: product.techSpecs     ?? [], type: 'kv'     as const },
            { key: 'goodToKnow',    title: 'Good to know',             items: product.goodToKnow    ?? [], type: 'bullet' as const },
            { key: 'usageExamples', title: 'Usage examples',           items: product.usageExamples ?? [], type: 'bullet' as const },
          ] as { key: string; title: string; items: unknown[]; type: 'check' | 'kv' | 'bullet' }[]
        ).filter(s => s.items.length > 0).map(s => {
          const open = openSections.has(s.key);
          return (
            <View key={s.key} style={styles.accordion}>
              <TouchableOpacity
                style={styles.accordionRow}
                onPress={() =>
                  setOpenSections(prev => {
                    const next = new Set(prev);
                    next.has(s.key) ? next.delete(s.key) : next.add(s.key);
                    return next;
                  })
                }
                activeOpacity={0.75}
              >
                <Text style={styles.accordionTitle}>{s.title}</Text>
                <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.fg3} />
              </TouchableOpacity>
              {open && (
                <View style={styles.accordionBody}>
                  {s.type === 'check' && (s.items as string[]).map((item, i) => (
                    <View key={i} style={styles.checkItem}>
                      <Feather name="check" size={14} color={COLORS.success} style={styles.checkItemIcon} />
                      <Text style={styles.checkItemText}>{item}</Text>
                    </View>
                  ))}
                  {s.type === 'kv' && (s.items as { label: string; value: string }[]).map((item, i) => (
                    <View key={i} style={styles.kvRow}>
                      <Text style={styles.kvLabel}>{item.label}</Text>
                      <Text style={styles.kvValue}>{item.value}</Text>
                    </View>
                  ))}
                  {s.type === 'bullet' && (s.items as string[]).map((item, i) => (
                    <View key={i} style={styles.bulletItem}>
                      <Text style={styles.bulletDot}>·</Text>
                      <Text style={styles.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
          </View>
        )}

        {/* ── Deposit & Trust ── */}
        <Text style={styles.sectionLabel}>DEPOSIT & TRUST</Text>
        <View style={styles.infoCard}>
          <View style={[styles.infoIcon, { backgroundColor: COLORS.carbon }]}>
            <Feather name="shield" size={18} color={COLORS.amber} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>{formatLak(product.deposit, exchangeRate)} refundable deposit</Text>
            <Text style={styles.infoSub}>Held, not charged. Refunded within 48h after return.</Text>
            <TouchableOpacity onPress={() => router.push('/profile/faq')} activeOpacity={0.7}>
              <Text style={styles.infoLink}>How it works →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Pick-up & Return ── */}
        <Text style={styles.sectionLabel}>PICK-UP & RETURN</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Feather name="map-pin" size={18} color={COLORS.carbon} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>{shop.name}</Text>
            <Text style={styles.infoSub}>{shop.addressLine}, {shop.city}</Text>
            <Text style={styles.infoSub}>{shop.hours}</Text>
            <Text style={styles.infoSub}>Ready in 90 sec. Bring your booking QR.</Text>
            <TouchableOpacity onPress={() => Linking.openURL(buildMapsUrl(shop))} activeOpacity={0.7}>
              <Text style={styles.infoLink}>Get directions →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Reviews ── */}
        {product.averageRating != null && (
          <>
            <Text style={styles.sectionLabel}>REVIEWS</Text>

            {/* Rating breakdown — computed from loaded reviews */}
            {reviews.length > 0 && (
              <View style={styles.reviewsStat}>
                <Text style={styles.reviewsScore}>{product.averageRating.toFixed(1)}</Text>
                <View style={styles.reviewsBars}>
                  {[5, 4, 3, 2, 1]
                    .map(stars => ({ stars, count: reviews.filter(r => r.rating === stars).length }))
                    .filter(r => r.count > 0)
                    .map(r => (
                      <View key={r.stars} style={styles.rBar}>
                        <Text style={styles.rBarLabel}>{r.stars}</Text>
                        <View style={styles.rBarTrack}>
                          <View style={[styles.rBarFill, { width: `${(r.count / reviews.length) * 100}%` }]} />
                        </View>
                        <Text style={styles.rBarCount}>{r.count}</Text>
                      </View>
                    ))}
                </View>
              </View>
            )}

            {/* Individual review cards */}
            {reviews.length > 0 && (
              <View style={styles.reviewsList}>
                {reviews.map((review, i) => (
                  <ReviewCard key={i} review={review} />
                ))}
              </View>
            )}
          </>
        )}

        {/* Bottom spacer — clears the sticky bar + safe area */}
        <View style={{ height: stickyBarH }} />
      </ScrollView>

      {/* ── Add to Bag banners ───────────────────────────────────────────────── */}
      {addBagSuccess && (
        <View style={styles.bagBanner}>
          <Feather name="check-circle" size={14} color={COLORS.success} />
          <Text style={styles.bagBannerText}>Added to your bag!</Text>
        </View>
      )}
      {addBagError && (
        <View style={styles.bagBannerError}>
          <Text style={styles.bagBannerErrorText}>Couldn't add to bag. Try again.</Text>
          <TouchableOpacity onPress={() => setAddBagError(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={14} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Sticky CTA — lifted above system nav ────────────────────────────── */}
      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {docRequiredNotice && (
          <View style={styles.docRequiredBanner}>
            <Feather name="alert-circle" size={14} color={COLORS.danger} />
            <Text style={styles.docRequiredText}>
              Please upload your business registration document before booking. You
              can do this in your account settings.
            </Text>
            <TouchableOpacity
              onPress={() => { setDocRequiredNotice(false); router.push('/profile/business-document'); }}
              activeOpacity={0.7}
            >
              <Text style={styles.docRequiredLink}>Go to settings</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.stickyRow}>
        <View style={styles.stickyPrice}>
          {bookable && displayPrice != null ? (
            <>
              {exchangeRate != null ? (
                <PriceLak lak={toLak(displayPrice, exchangeRate)} customerType={profile?.customerType} vatPercent={vatPercent} textStyle={styles.stickyPriceValue} />
              ) : (
                <Text style={styles.stickyPriceValue}>—</Text>
              )}
              <Text style={styles.stickyPriceSub}>/ day · {tiers[effectiveTier].label}</Text>
            </>
          ) : hasValidPricing && accessState.locked ? (
            <Text style={[styles.stickyPriceSub, { color: COLORS.fg3 }]} numberOfLines={2}>
              {accessState.message}
            </Text>
          ) : (
            <Text style={[styles.stickyPriceSub, { color: COLORS.fg3 }]}>Not available for rent yet</Text>
          )}
        </View>
        <View style={styles.stickyCTAs}>
          {bookable && (
            <TouchableOpacity
              style={[styles.bagBtn, inBag && styles.bagBtnInBag]}
              onPress={handleAddToBag}
              activeOpacity={0.85}
              disabled={addBagBusy}
            >
              {addBagBusy ? (
                <ActivityIndicator size="small" color={COLORS.carbon} />
              ) : inBag ? (
                <Feather name="check" size={18} color={COLORS.success} />
              ) : (
                <Feather name="shopping-bag" size={18} color={COLORS.carbon} />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.rentBtn, !bookable && styles.rentBtnDisabled]}
            onPress={bookable ? () => {
              if (needsBtobDocument(profile)) {
                setDocRequiredNotice(true);
                return;
              }
              router.push({ pathname: '/booking/new', params: { productId: product.id } });
            } : undefined}
            activeOpacity={bookable ? 0.85 : 1}
          >
            <Text style={[styles.rentBtnText, !bookable && styles.rentBtnTextDisabled]}>
              {bookable ? 'Rent this item' : hasValidPricing && accessState.locked ? 'Access restricted' : 'Coming soon'}
            </Text>
            {bookable && <Feather name="arrow-right" size={16} color={COLORS.carbon} />}
          </TouchableOpacity>
        </View>
        </View>
      </View>

      {/* ── Lightbox ───────────────────────────────────────────────────────── */}
      <Modal
        visible={lightboxOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLightboxOpen(false)}
      >
        <View style={styles.lightbox}>
          <ScrollView
            ref={lightboxRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            onMomentumScrollEnd={e =>
              setLightboxSlide(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
            }
            onLayout={() => {
              if (lightboxSlide > 0) {
                lightboxRef.current?.scrollTo({ x: lightboxSlide * SCREEN_W, animated: false });
              }
            }}
          >
            {carouselImages.map((uri, i) => (
              <View key={i} style={{ width: SCREEN_W, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Image
                  source={{ uri }}
                  style={{ width: SCREEN_W, height: SCREEN_W }}
                  contentFit="contain"
                  transition={150}
                />
              </View>
            ))}
          </ScrollView>

          {/* Counter */}
          {carouselImages.length > 1 && (
            <View style={styles.lightboxCounter}>
              <Text style={styles.lightboxCounterText}>
                {lightboxSlide + 1} / {carouselImages.length}
              </Text>
            </View>
          )}

          {/* Close button */}
          <TouchableOpacity
            style={styles.lightboxClose}
            onPress={() => setLightboxOpen(false)}
            activeOpacity={0.85}
          >
            <Feather name="x" size={20} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: ReviewDoc }) {
  const initials = review.reviewerName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const dateStr = review.createdAt?.toDate
    ? review.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewAvatar}>
          <Text style={styles.reviewAvatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.reviewName}>{formatReviewerName(review.reviewerName)}</Text>
          <Text style={styles.reviewDate}>{dateStr}</Text>
        </View>
        <View style={styles.reviewStars}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Feather
              key={i}
              name="star"
              size={11}
              color={i < review.rating ? COLORS.amber : COLORS.softGray}
            />
          ))}
        </View>
      </View>
      <Text style={styles.reviewComment}>{review.text}</Text>
      {review.adminReply && (
        <View style={styles.adminReply}>
          <Text style={styles.adminReplyLabel}>Response from LANCHAI</Text>
          <Text style={styles.adminReplyText}>{review.adminReply.text}</Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  notFoundText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.fg2,
  },
  notFoundSub: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg3,
    textAlign: 'center',
  },
  backBtn: {
    height: 44,
    paddingHorizontal: 20,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontWeight: '800',
    color: COLORS.carbon,
  },

  // ── Hero / carousel ───────────────────────────────────────────────────────
  hero: {
    height: HERO_H,
    overflow: 'hidden',
    position: 'relative',
  },
  heroBack: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 40,
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: COLORS.carbon,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  heroFav: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 40,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: COLORS.carbon,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  imgDots: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  imgDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  imgDotActive: {
    width: 22,
    borderRadius: 8,
    backgroundColor: COLORS.white,
  },

  // ── Body ──────────────────────────────────────────────────────────────────
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },

  // Badges + status row
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  chipBadge: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: COLORS.amber,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: 0.3,
  },
  chipStatus: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
  },
  chipStatusGreen: {
    backgroundColor: 'rgba(46,139,87,0.1)',
    borderColor: 'rgba(46,139,87,0.3)',
  },
  chipStatusRed: {
    backgroundColor: 'rgba(200,65,44,0.1)',
    borderColor: 'rgba(200,65,44,0.3)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotGreen: {
    backgroundColor: COLORS.success,
  },
  statusDotRed: {
    backgroundColor: COLORS.danger,
  },
  chipStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chipStatusTextGreen: {
    color: COLORS.success,
  },
  chipStatusTextRed: {
    color: COLORS.danger,
  },

  // Title & rating
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: COLORS.carbon,
    lineHeight: 30,
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  description: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22,
    color: COLORS.fg2,
    marginBottom: 22,
  },

  // Section label
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    color: COLORS.fg3,
    marginBottom: 10,
  },

  // ── Pricing tiers ─────────────────────────────────────────────────────────
  tierList: {
    gap: 8,
    marginBottom: 22,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: COLORS.white,
  },
  tierRowActive: {
    borderColor: COLORS.carbon,
    backgroundColor: COLORS.warmBeige,
  },
  tierRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tierRadioActive: {
    borderColor: COLORS.carbon,
  },
  tierRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.carbon,
  },
  tierLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.fg2,
  },
  tierLabelActive: {
    color: COLORS.carbon,
    fontWeight: '700',
  },
  tierRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierDiscountBadge: {
    backgroundColor: COLORS.amber,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tierDiscountText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.carbon,
  },
  tierPrice: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.carbon,
  },
  tierPriceActive: {
    color: COLORS.carbon,
  },
  tierUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  noPricingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.warmBeige,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 22,
  },
  noPricingText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg3,
    lineHeight: 18,
  },

  // ── Perfect for chips ─────────────────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 22,
  },
  perfectChip: {
    backgroundColor: COLORS.warmBeige,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  perfectChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.carbon,
  },

  // ── Key features grid ─────────────────────────────────────────────────────
  featuresGrid: {
    gap: 8,
    marginBottom: 22,
  },
  featuresRow: {
    flexDirection: 'row',
    gap: 8,
  },
  featureCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.amber,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureCardPlaceholder: {
    flex: 1,
  },
  featureIcon: {
    flexShrink: 0,
  },
  featureText: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.carbon,
    lineHeight: 18,
    flex: 1,
  },

  // ── Accordions ────────────────────────────────────────────────────────────
  accordion: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    marginBottom: 0,
  },
  accordionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  accordionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  accordionBody: {
    paddingBottom: 14,
    gap: 8,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkItemIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  checkItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg2,
    lineHeight: 19,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  kvLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg3,
    flex: 1,
  },
  kvValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.carbon,
    flex: 1,
    textAlign: 'right',
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    fontSize: 16,
    color: COLORS.fg3,
    lineHeight: 20,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg2,
    lineHeight: 19,
  },

  // ── Info cards ────────────────────────────────────────────────────────────
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: COLORS.carbon,
  },
  infoSub: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
    lineHeight: 17,
  },
  infoLink: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.carbon,
    marginTop: 6,
    textDecorationLine: 'underline',
  },

  // ── Reviews — breakdown ───────────────────────────────────────────────────
  reviewsStat: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
    backgroundColor: COLORS.warmBeige,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  reviewsScore: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: COLORS.carbon,
  },
  reviewsBars: {
    flex: 1,
    gap: 4,
  },
  rBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg3,
    width: 10,
  },
  rBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.softGray200,
    overflow: 'hidden',
  },
  rBarFill: {
    height: '100%',
    backgroundColor: COLORS.amber,
    borderRadius: 2,
  },
  rBarCount: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.fg3,
    width: 22,
    textAlign: 'right',
  },

  // ── Reviews — individual cards ─────────────────────────────────────────────
  reviewsList: {
    gap: 10,
    marginBottom: 8,
  },
  reviewCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    gap: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reviewAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  reviewName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  reviewDate: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 1,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 2,
    alignSelf: 'flex-start',
  },
  reviewComment: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 19,
  },
  adminReply: {
    marginTop: 8,
    backgroundColor: COLORS.warmBeige,
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.amber,
  },
  adminReplyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.amber,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  adminReplyText: {
    fontSize: 13,
    color: COLORS.fg2,
    lineHeight: 18,
  },

  // ── Bag banners ───────────────────────────────────────────────────────────
  bagBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DFF3E5',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(46,139,87,0.25)',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  bagBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.success,
  },
  bagBannerError: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  bagBannerErrorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
  },

  // ── Sticky CTA ────────────────────────────────────────────────────────────
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.porcelain,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    paddingHorizontal: 20,
    paddingTop: 14,
    // paddingBottom set dynamically via insets.bottom in JSX
    gap: 10,
  },
  stickyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  docRequiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  docRequiredText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.danger,
    lineHeight: 16,
  },
  docRequiredLink: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.carbon,
    textDecorationLine: 'underline',
  },
  stickyPrice: {
    flexShrink: 1,
    maxWidth: '58%',
  },
  stickyPriceValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.carbon,
  },
  stickyPriceSub: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: -2,
  },
  stickyCTAs: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  bagBtn: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bagBtnInBag: {
    borderColor: COLORS.success,
    backgroundColor: '#DFF3E5',
  },
  rentBtn: {
    flex: 1,
    height: 52,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 4,
    shadowColor: COLORS.amber,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  rentBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
    textAlign: 'center',
  },
  rentBtnDisabled: {
    backgroundColor: COLORS.softGray200,
    elevation: 0,
    shadowOpacity: 0,
  },
  rentBtnTextDisabled: {
    color: COLORS.fg3,
  },

  // ── Lightbox ──────────────────────────────────────────────────────────────
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.93)',
    justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 44,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCounter: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  lightboxCounterText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.5,
  },
});
