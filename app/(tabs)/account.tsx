import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Linking,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { COLORS } from '@/constants/Colors';
import LanchaiMark from '@/components/LanchaiMark';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, getMyReservations, getProducts, saveUserProfile, UserProfile } from '@/lib/firestore';
import { getCustomerTypeConfig } from '@/utils/customerType';
import { useShopInfo, buildWhatsappUrl, normalizeWhatsappNumber, isValidWhatsappNumber } from '@/lib/shop';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import CropScreen from '@/components/CropScreen';
import { useExchangeRate } from '@/lib/exchangeRate';
import { ResidentPromoCard } from '@/components/ResidentPromo';
import { LoyaltyCard } from '@/components/LoyaltyCard';
import { AccountHeader, AccountCompactBar } from '@/components/account/AccountHeader';
import { AccountStats } from '@/components/account/AccountStats';
import { AccountStickers } from '@/components/account/AccountStickers';
import { computeAccountStats, type AccountStats as AccountStatsData } from '@/lib/accountStats';
import { TIER_LABELS, isLoyaltyExcluded } from '@/lib/loyalty';
import { ACCOUNT_COPY } from '@/constants/accountCopy';
import { Row, RowGroup, SectionTitle, type IconTone, type AnyIcon } from '@/components/account/ui';
import { SHADES } from '@/constants/brandShades';

// ── Helpers ───────────────────────────────────────────────────────────────────



// BtoB accounts show a verification-status badge in place of the customerType badge —
// keyed by btobStatus, with an 'unverified' fallback for missing/unrecognized status.
const BTOB_STATUS_BADGE: Record<string, {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string; bg: string; border: string; text: string;
}> = {
  approved:         { icon: 'check-circle', label: 'Verified',       bg: '#D1FAE5', border: '#A7F3D0', text: '#065F46' },
  pending_approval: { icon: 'clock',        label: 'Pending review', bg: COLORS.amberTint, border: COLORS.amberTintBorder, text: COLORS.amberTintText },
  rejected:         { icon: 'x-circle',     label: 'Not approved',   bg: '#FEE2E2', border: '#FECACA', text: '#991B1B' },
  unverified:       { icon: 'help-circle',  label: 'Unverified',     bg: COLORS.softGray200, border: COLORS.softGray200, text: COLORS.fg3 },
};

// ── Components ────────────────────────────────────────────────────────────────

// Rows and sections use the shared My Account design (components/account/ui.tsx):
// white card groups, round icon circles (amber = contact / action needed, grey = the
// rest, carbon = staff), "Soon" as the same grey chip as "Tourist ›".
function ProfileRow(p: {
  icon: React.ComponentProps<typeof Feather>['name'] | AnyIcon;
  title: string;
  sub?: string;
  subLines?: number;
  tone?: IconTone;
  onPress?: () => void;
  comingSoon?: boolean;
}) {
  const icon: AnyIcon = typeof p.icon === 'string' ? { name: p.icon } : p.icon;
  return <Row icon={icon} tone={p.tone} title={p.title} sub={p.sub} subLines={p.subLines} onPress={p.onPress} soon={p.comingSoon} />;
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <SectionTitle>{title}</SectionTitle>
      <RowGroup>{children}</RowGroup>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

// "Language" / "Appearance" rows (not built yet) — hidden for the beta, flip to show
// them again as "Soon". Nothing is paid online, so there is no "Payment methods" row.
const SHOW_SOON_PREFERENCES = false;

export default function AccountScreen() {
  const router = useRouter();
  const { user, signOut, isAdmin } = useAuth();
  const exchangeRate = useExchangeRate();

  const displayName = user?.displayName || user?.email || 'Account';

  const insets = useSafeAreaInsets();
  // Collapsing header: the compact bar fades in once the full header has scrolled away.
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(200);

  const [profile,     setProfile]     = useState<UserProfile | null>(null);
  const [rentalCount, setRentalCount] = useState<number | null>(null);
  const [stats,       setStats]       = useState<AccountStatsData | null>(null);

  const [avatarUri,          setAvatarUri]          = useState<string | null>(null);
  const [uploading,          setUploading]          = useState(false);
  const [uploadError,        setUploadError]        = useState(false);
  const [loggingOut,         setLoggingOut]         = useState(false);
  const [logoutErr,          setLogoutErr]          = useState(false);
  const [cropImageUri,       setCropImageUri]       = useState<string | null>(null);
  const [photoActionVisible, setPhotoActionVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    Promise.all([
      getUserProfile(uid).catch(() => null),
      getMyReservations(uid).catch(() => []),
      getProducts().catch(() => []),
    ]).then(([prof, rentals, products]) => {
      setProfile(prof);
      setAvatarUri(prof?.photoURL ?? null);
      setRentalCount(rentals.length);
      setStats(computeAccountStats(rentals, products, exchangeRate));
    });
  }, [user, exchangeRate]);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutErr(false);
    try {
      await signOut();
      // Root layout's onAuthStateChanged → router.replace('/login') handles navigation.
    } catch {
      setLoggingOut(false);
      setLogoutErr(true);
    }
  }, [signOut, loggingOut]);

  const handlePickPhoto = async () => {
    setPhotoActionVisible(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setCropImageUri(result.assets[0].uri);
  };

  const handleAvatarPress = () => {
    if (avatarUri) {
      setPhotoActionVisible(true);
    } else {
      handlePickPhoto();
    }
  };

  const handleCropConfirm = async (croppedUri: string) => {
    setCropImageUri(null);
    if (!user) return;
    setUploading(true);
    setUploadError(false);
    try {
      const blob: Blob = await (await fetch(croppedUri)).blob();
      const sRef = storageRef(storage, `profile-photos/${user.uid}/${Date.now()}.jpg`);
      const task = uploadBytesResumable(sRef, blob);
      await new Promise<void>((res, rej) => {
        task.on('state_changed', null, rej, () => res());
      });
      const url = await getDownloadURL(task.snapshot.ref);
      await saveUserProfile(user.uid, { photoURL: url });
      setAvatarUri(url);
    } catch {
      setUploadError(true);
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoActionVisible(false);
    if (!user) return;
    setUploading(true);
    try {
      await saveUserProfile(user.uid, { photoURL: null });
      setAvatarUri(null);
    } catch {
      setUploadError(true);
    } finally {
      setUploading(false);
    }
  };

  const ctConfig  = getCustomerTypeConfig(profile?.customerType);
  const shop      = useShopInfo();
  const nameSub   = profile?.displayName ?? user?.displayName;
  const appVersion = Constants.expoConfig?.version;
  // WhatsApp row (brand palette — replaces the green WhatsApp button); hidden without a
  // valid number in Shop settings, like everywhere else.
  const waNumber = normalizeWhatsappNumber(shop.whatsappNumber ?? '');
  const waUrl = isValidWhatsappNumber(waNumber) ? buildWhatsappUrl(waNumber, 'Hi LANCHAI, I have a question.') : null;

  // BtoB accounts don't have first/last name — btobCompanyName (not the generic
  // displayName mirror set at signup) is the authoritative header name. Falls back to
  // the Auth-derived `displayName` until the Firestore profile has loaded.
  const isBtob = profile?.accountType === 'btob';
  const headerName = isBtob ? (profile?.btobCompanyName || displayName) : displayName;
  const headerInitial = headerName.charAt(0).toUpperCase();
  const headerFirstName = isBtob
    ? (profile?.btobCompanyName || headerName)
    : (profile?.firstName || headerName.split(' ')[0] || headerName);
  // Status chip: business → "Business" (or the BtoB review status), else Tourist/Resident.
  const isBusinessStatus = isBtob || profile?.customerType === 'business';
  const btobBadge = isBtob
    ? (profile?.btobStatus ? BTOB_STATUS_BADGE[profile.btobStatus] : undefined) ?? BTOB_STATUS_BADGE.unverified
    : null;
  const statusLabel = isBusinessStatus
    ? (!isBtob || profile?.btobStatus === 'approved' ? ACCOUNT_COPY.businessChip : btobBadge?.label ?? ACCOUNT_COPY.businessChip)
    : ctConfig.label;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>

      <Animated.ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        {/* ── Header (validated mockup) — scrolls with the page; the top inset is
            applied inside it so the white band reaches the status bar ── */}
        <View style={{ paddingTop: insets.top, backgroundColor: '#FFFFFF', marginHorizontal: -16 }}>
          <View style={{ marginHorizontal: 16 }}>
            <AccountHeader
              firstName={headerFirstName}
              initial={headerInitial}
              avatarUri={avatarUri}
              uploading={uploading}
              onAvatarPress={handleAvatarPress}
              tierLabel={isLoyaltyExcluded(profile ?? {}) ? null : TIER_LABELS[profile?.loyaltyTier ?? 'bronze']}
              statusLabel={statusLabel}
              onStatusPress={() => router.push(isBusinessStatus ? '/profile/business-document' : '/profile/id-residency')}
              onHeight={setHeaderHeight}
            />
          </View>
        </View>

        {/* ── Stats (round trips · not in your closet · LAK not spent) ── */}
        <AccountStats stats={stats} />

        {/* ── Loyalty card (replaces the old Tier tile + Loyalty row) — hidden for
            excluded / business accounts inside the component ── */}
        <LoyaltyCard />

        {/* ── Stickers (one per category rented and returned) ── */}
        {stats && <AccountStickers stickers={stats.stickers} next={stats.nextSticker} unlocks={stats.stickerUnlocks} />}

        {/* ── Resident promo (unverified tourists, dismissible) ── */}
        <ResidentPromoCard style={{ marginTop: 24 }} />

        {/* ── Account section ── */}
        <ProfileSection title="Account">
          <ProfileRow
            icon="user"
            title="Personal info"
            sub={nameSub ?? 'Name, email, phone'}
            onPress={() => router.push('/profile/personal-info')}
          />
          {profile?.accountType === 'btob' && (
            <ProfileRow
              icon="file-text"
              title="Business document"
              sub={profile?.btobDocumentUrl ? 'Uploaded' : 'Required before booking'}
              tone={profile?.btobDocumentUrl ? 'grey' : 'amber'}
              onPress={() => router.push('/profile/business-document')}
            />
          )}
          {/* Invite code — new renters only: no booking yet, no referrer, not business */}
          {!isBtob && profile?.customerType !== 'business' && rentalCount === 0 && !profile?.referredBy && (
            <ProfileRow
              icon="users"
              title="Have an invite code?"
              sub="Enter a friend's code before your first booking"
              tone="amber"
              onPress={() => router.push('/profile/invite-code')}
            />
          )}
          <ProfileRow
            icon={{ set: 'mci', name: 'card-account-details-outline' }}
            title="ID & residency"
            sub={[
              profile?.idOnFile ? 'ID on file' : 'ID needed to rent',
              profile?.customerType === 'business' ? null : profile?.customerType === 'resident' ? 'Resident' : 'Tourist',
            ].filter(Boolean).join(' · ')}
            tone={profile?.idOnFile ? 'grey' : 'amber'}
            onPress={() => router.push('/profile/id-residency')}
          />
          <ProfileRow
            icon="map-pin"
            title="Pick-up location"
            sub={`${shop.addressLine}, ${shop.city}`}
            subLines={1}
            onPress={() => router.push('/profile/pickup-location')}
          />
          <ProfileRow
            icon="file-text"
            title="Receipts & reports"
            sub="Receipts and pick-up / return reports"
            onPress={() => router.push('/profile/documents')}
          />
        </ProfileSection>

        {/* ── Preferences section ── */}
        <ProfileSection title="Preferences">
          {SHOW_SOON_PREFERENCES && (
            <>
              <ProfileRow
                icon="globe"
                title="Language"
                sub="Display language"
                comingSoon
              />
              <ProfileRow
                icon="moon"
                title="Appearance"
                sub="Light / dark / system"
                comingSoon
              />
            </>
          )}
          <ProfileRow
            icon="bell"
            title="Notifications"
            sub="Email reminders, news and offers"
            onPress={() => router.push('/profile/notifications')}
          />
        </ProfileSection>

        {/* ── Support section ── */}
        <ProfileSection title="Support">
          <ProfileRow
            icon="message-circle"
            title="Chat with us"
            sub="We usually reply within a few hours"
            tone="amber"
            onPress={() => router.push('/chat')}
          />
          {waUrl && (
            <Row
              icon={{ set: 'mci', name: 'whatsapp' }}
              tone="amber"
              title="WhatsApp"
              sub="Message us — quick questions welcome"
              onPress={() => Linking.openURL(waUrl).catch(() => {})}
            />
          )}
          <ProfileRow
            icon="help-circle"
            title="FAQ"
            sub="Returns, deposits, cancellations"
            onPress={() => router.push('/profile/faq')}
          />
          <ProfileRow
            icon="lock"
            title="Password"
            sub="Change your password"
            onPress={() => router.push('/profile/security')}
          />
        </ProfileSection>

        {/* ── Admin section — visible only to admins ── */}
        {isAdmin && (
          <ProfileSection title="Admin">
            <ProfileRow
              icon="settings"
              title="Lanchai admin dashboard"
              sub="Products, bookings & more"
              tone="carbon"
              onPress={() => router.push('/admin')}
            />
          </ProfileSection>
        )}

        {/* ── Legal section ── */}
        <ProfileSection title="Legal">
          <ProfileRow
            icon="file-text"
            title="Terms of service"
            onPress={() => router.push('/legal/terms')}
          />
          <ProfileRow
            icon="shield"
            title="Privacy policy"
            onPress={() => router.push('/legal/privacy')}
          />
          <ProfileRow
            icon="rotate-ccw"
            title="Cancellation policy"
            onPress={() => router.push('/legal/cancellation')}
          />
        </ProfileSection>

        {/* ── Log out / delete — same card rows; red only for the destructive one ── */}
        <View style={{ marginTop: 24 }}>
          <RowGroup>
            <Row
              icon={{ name: 'log-out' }}
              title={loggingOut ? 'Signing out…' : 'Log out'}
              onPress={loggingOut ? undefined : handleLogout}
            />
            <Row
              icon={{ name: 'trash-2' }}
              title="Delete account"
              danger
              onPress={() => router.push('/profile/delete-account')}
            />
          </RowGroup>
        </View>

        <View style={styles.footer}>
          <LanchaiMark size={18} color={SHADES.carbonFaint} hexColor={SHADES.carbonFaint} />
          <Text style={styles.footerText}>
            {appVersion ? `v${appVersion} · ` : ''}Made with care in Vientiane
          </Text>
        </View>
      </Animated.ScrollView>

      {/* Fixed status-bar background (white, like the header) — content scrolls cleanly
          under it instead of under the clock / battery. */}
      <View pointerEvents="none" style={[styles.statusBarBg, { height: insets.top }]} />
      {/* Compact sticky bar, pinned below the safe area once the header is gone. */}
      <AccountCompactBar
        scrollY={scrollY}
        threshold={headerHeight - 52}
        top={insets.top}
        firstName={headerFirstName}
        initial={headerInitial}
        avatarUri={avatarUri}
        tierLabel={isLoyaltyExcluded(profile ?? {}) ? null : TIER_LABELS[profile?.loyaltyTier ?? 'bronze']}
      />

      {/* Logout error */}
      {logoutErr && (
        <View style={styles.uploadErrorBanner}>
          <Feather name="alert-circle" size={14} color={COLORS.danger} />
          <Text style={styles.uploadErrorText}>Sign-out failed. Check your connection and try again.</Text>
          <TouchableOpacity
            onPress={() => setLogoutErr(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={14} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Upload error */}
      {uploadError && (
        <View style={styles.uploadErrorBanner}>
          <Feather name="alert-circle" size={14} color={COLORS.danger} />
          <Text style={styles.uploadErrorText}>Photo update failed. Try again.</Text>
          <TouchableOpacity
            onPress={() => setUploadError(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={14} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Photo action sheet */}
      <Modal
        visible={photoActionVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoActionVisible(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => setPhotoActionVisible(false)}
        >
          <View style={styles.actionSheet}>
            <TouchableOpacity style={styles.actionOption} onPress={handlePickPhoto} activeOpacity={0.7}>
              <Feather name="camera" size={18} color={COLORS.carbon} />
              <Text style={styles.actionOptionText}>Change photo</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.actionOption} onPress={handleRemovePhoto} activeOpacity={0.7}>
              <Feather name="trash-2" size={18} color={COLORS.danger} />
              <Text style={[styles.actionOptionText, { color: COLORS.danger }]}>Remove photo</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Crop screen */}
      <Modal
        visible={!!cropImageUri}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setCropImageUri(null)}
      >
        {cropImageUri && (
          <CropScreen
            imageUri={cropImageUri}
            queueIndex={0}
            queueTotal={1}
            onConfirm={handleCropConfirm}
            onCancel={() => setCropImageUri(null)}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  statusBarBg: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#FFFFFF' },
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },


  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },






  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
  },


  // Upload error banner
  uploadErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  uploadErrorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.danger,
  },

  // Photo action sheet (bottom modal)
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
  },
  actionOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  actionDivider: {
    height: 1,
    backgroundColor: COLORS.softGray200,
  },
});
