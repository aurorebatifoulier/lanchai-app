import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { COLORS } from '@/constants/Colors';
import LanchaiMark from '@/components/LanchaiMark';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/auth';
import { getUserProfile, getMyReservations, getProducts, saveUserProfile, UserProfile } from '@/lib/firestore';
import { getCustomerTypeConfig } from '@/utils/customerType';
import { useShopInfo } from '@/lib/shop';
import WhatsAppButton from '@/components/WhatsAppButton';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import CropScreen from '@/components/CropScreen';
import { useExchangeRate } from '@/lib/exchangeRate';
import { toLak } from '@/utils/currency';
import { TIER_LABELS } from '@/lib/loyalty';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLAK(amount: number): string {
  return `${amount.toLocaleString('en-US')} LAK`;
}

function formatMemberSince(isoString: string | undefined): string | null {
  if (!isoString) return null;
  try {
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

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

interface ProfileRowProps {
  icon: string;
  title: string;
  sub?: string;
  meta?: string;
  iconBg?: string;
  iconColor?: string;
  onPress?: () => void;
  comingSoon?: boolean;
}

function ProfileRow({ icon, title, sub, meta, iconBg, iconColor, onPress, comingSoon }: ProfileRowProps) {
  if (comingSoon) {
    return (
      <View style={[styles.prow, styles.prowDisabled]}>
        <View style={[styles.prowIcon, iconBg ? { backgroundColor: iconBg } : undefined]}>
          <Feather name={icon as never} size={18} color={COLORS.fg3} />
        </View>
        <View style={styles.prowText}>
          <Text style={[styles.prowTitle, { color: COLORS.fg3 }]}>{title}</Text>
          {sub && <Text style={styles.prowSub}>{sub}</Text>}
        </View>
        <View style={styles.soonBadge}>
          <Text style={styles.soonBadgeText}>Soon</Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.prow} activeOpacity={0.7} onPress={onPress}>
      <View style={[styles.prowIcon, iconBg ? { backgroundColor: iconBg } : undefined]}>
        <Feather name={icon as never} size={18} color={iconColor ?? COLORS.carbon} />
      </View>
      <View style={styles.prowText}>
        <Text style={styles.prowTitle}>{title}</Text>
        {sub && <Text style={styles.prowSub}>{sub}</Text>}
      </View>
      <View style={styles.prowMeta}>
        {meta && <Text style={styles.prowMetaText}>{meta}</Text>}
        <Feather name="chevron-right" size={16} color={COLORS.fg3} />
      </View>
    </TouchableOpacity>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.rowGroup}>{children}</View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AccountScreen() {
  const router = useRouter();
  const { user, signOut, isAdmin } = useAuth();
  const exchangeRate = useExchangeRate();

  const displayName = user?.displayName || user?.email || 'Account';

  const memberSince = formatMemberSince(auth.currentUser?.metadata?.creationTime);

  const [profile,     setProfile]     = useState<UserProfile | null>(null);
  const [rentalCount, setRentalCount] = useState<number | null>(null);
  const [savedAmount, setSavedAmount] = useState<number | null>(null);

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
      const productMap = new Map(products.map(p => [p.id, p]));
      let savedTotal = 0;
      for (const rental of rentals) {
        const product = productMap.get(rental.productId);
        // product.retailPrice is USD; rental.subtotal is a frozen LAK reservation amount —
        // convert before comparing.
        if (product?.retailPrice && exchangeRate != null) {
          const retailPriceLak = toLak(product.retailPrice, exchangeRate);
          savedTotal += Math.max(0, retailPriceLak - rental.subtotal);
        }
      }
      setSavedAmount(savedTotal > 0 ? savedTotal : null);
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
  // Business accounts are excluded from the loyalty program entirely — no tier
  // badge, no points, no coupons/loyalty section, anywhere on this screen.
  const isBusinessAccount = profile?.customerType === 'business';

  // BtoB accounts don't have first/last name — btobCompanyName (not the generic
  // displayName mirror set at signup) is the authoritative header name. Falls back to
  // the Auth-derived `displayName` until the Firestore profile has loaded.
  const isBtob = profile?.accountType === 'btob';
  const headerName = isBtob ? (profile?.btobCompanyName || displayName) : displayName;
  const headerInitial = headerName.charAt(0).toUpperCase();
  const btobBadge = isBtob
    ? (profile?.btobStatus ? BTOB_STATUS_BADGE[profile.btobStatus] : undefined) ?? BTOB_STATUS_BADGE.unverified
    : null;

  return (
    <SafeAreaView style={styles.container}>

      {/* ── Profile card ── */}
      <View style={styles.profileCard}>
        <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.85} style={styles.avatarWrap}>
          {uploading ? (
            <View style={styles.avatar}>
              <ActivityIndicator size="small" color={COLORS.carbon} />
            </View>
          ) : avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarPhoto} contentFit="cover" />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{headerInitial}</Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Feather name="camera" size={9} color={COLORS.carbon} />
          </View>
        </TouchableOpacity>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName} numberOfLines={1} adjustsFontSizeToFit>{headerName}</Text>

          {/* Account type badge — BtoB shows verification status instead */}
          {btobBadge ? (
            <View style={[styles.btobStatusBadge, { backgroundColor: btobBadge.bg, borderColor: btobBadge.border }]}>
              <Feather name={btobBadge.icon} size={11} color={btobBadge.text} />
              <Text style={[styles.typeBadgeText, { color: btobBadge.text }]}>
                {btobBadge.label}
              </Text>
            </View>
          ) : (
            <View style={[styles.typeBadge, { backgroundColor: ctConfig.badgeBg }]}>
              <Text style={[styles.typeBadgeText, { color: ctConfig.badgeText }]}>
                {ctConfig.label}
              </Text>
            </View>
          )}

          {/* Location / member since */}
          <View style={styles.profileMeta}>
            <Feather name="map-pin" size={12} color="rgba(250,250,247,0.6)" />
            <Text style={styles.profileMetaSub}>
              {'Vientiane'}
              {memberSince ? ` · member since ${memberSince}` : ''}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* ── Stats ── */}
        <View style={styles.statsWrap}>
          <View style={styles.statsRow}>
            {/* RENTALS — real count */}
            <View style={[styles.statCard, { flex: 1 }]}>
              <Text style={styles.statEye}>RENTALS</Text>
              <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit>
                {rentalCount === null ? '—' : String(rentalCount)}
              </Text>
              <Text style={styles.statSub}>
                no clutter added
              </Text>
            </View>

            {/* TIER — loyalty status; BtoB accounts don't participate, regardless of
                approval status (isBusinessAccount only becomes true once approved) */}
            {!isBtob && (
              <View style={[styles.statCard, { flex: 1 }]}>
                <Text style={styles.statEye}>TIER</Text>
                <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit>
                  {TIER_LABELS[profile?.loyaltyTier ?? 'bronze']}
                </Text>
                <Text style={styles.statSub}>
                  {profile?.loyaltyPoints ? `${profile.loyaltyPoints} pts` : 'Rent to earn points'}
                </Text>
              </View>
            )}
          </View>

          {/* SAVED — computed from rentals vs. retail price; full-width row of its own
              since it can display large LAK figures (e.g. "171,367,040 LAK") */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, styles.statCardAmber, { flex: 1 }]}>
              <Text style={[styles.statEye, { color: 'rgba(30,30,30,0.55)' }]}>SAVED</Text>
              <Text style={[styles.statVal, { color: COLORS.carbon }]} numberOfLines={1} adjustsFontSizeToFit>
                {savedAmount ? formatLAK(savedAmount) : '—'}
              </Text>
              <Text style={[styles.statSub, { color: 'rgba(30,30,30,0.55)' }]}>
                {savedAmount ? 'not collecting dust' : 'Rent to start saving'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Loyalty section — hidden entirely for BtoB accounts ── */}
        {!isBtob && (
          <ProfileSection title="Loyalty">
            <ProfileRow
              icon="award"
              title={`${TIER_LABELS[profile?.loyaltyTier ?? 'bronze']} tier`}
              sub={profile?.loyaltyPoints ? `${profile.loyaltyPoints} points` : 'Rent to start earning'}
              iconBg={COLORS.amber}
              iconColor={COLORS.carbon}
              onPress={() => router.push('/profile/loyalty')}
            />
          </ProfileSection>
        )}

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
              iconBg={profile?.btobDocumentUrl ? undefined : COLORS.amber}
              iconColor={profile?.btobDocumentUrl ? undefined : COLORS.carbon}
              onPress={() => router.push('/profile/business-document')}
            />
          )}
          <ProfileRow
            icon="map-pin"
            title="Pick-up location"
            sub={`${shop.addressLine}, ${shop.city}`}
            onPress={() => router.push('/profile/pickup-location')}
          />
          <ProfileRow
            icon="credit-card"
            title="Payment methods"
            sub="Cards, mobile money"
            comingSoon
          />
          <ProfileRow
            icon="file-text"
            title="Documents"
            sub="ID, contracts, invoices"
            comingSoon
          />
        </ProfileSection>

        {/* ── Preferences section ── */}
        <ProfileSection title="Preferences">
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
          <ProfileRow
            icon="bell"
            title="Notifications"
            sub="Returns, deals, support"
            comingSoon
          />
        </ProfileSection>

        {/* ── Support section ── */}
        <ProfileSection title="Support">
          <ProfileRow
            icon="message-circle"
            title="Chat with us"
            sub="We usually reply within a few hours"
            iconBg={COLORS.amber}
            iconColor={COLORS.carbon}
            onPress={() => router.push('/chat')}
          />
          <WhatsAppButton
            message="Hi LANCHAI, I have a question."
            style={styles.whatsappInset}
          />
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
              iconBg={COLORS.carbon}
              iconColor={COLORS.amber}
              onPress={() => router.push('/admin')}
            />
          </ProfileSection>
        )}

        {/* ── Legal section ── */}
        <ProfileSection title="Legal">
          <ProfileRow
            icon="file-text"
            title="Terms of Service"
            onPress={() => router.push('/legal/terms')}
          />
          <ProfileRow
            icon="shield"
            title="Privacy Policy"
            onPress={() => router.push('/legal/privacy')}
          />
          <ProfileRow
            icon="x-circle"
            title="Cancellation Policy"
            onPress={() => router.push('/legal/cancellation')}
          />
        </ProfileSection>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} disabled={loggingOut}>
          <Text style={styles.logoutText}>{loggingOut ? 'Signing out…' : 'Log out'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={() => router.push('/profile/delete-account')}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteAccountText}>Delete account</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <LanchaiMark size={18} color={COLORS.fg3} hexColor={COLORS.fg3} />
          <Text style={styles.footerText}>
            {appVersion ? `v${appVersion} · ` : ''}Made with care in Vientiane
          </Text>
        </View>
      </ScrollView>

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
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },

  // Profile card
  profileCard: {
    backgroundColor: COLORS.carbon,
    borderRadius: 24,
    margin: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.2,
  },
  profileInfo: {
    flex: 1,
    gap: 5,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.porcelain,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  btobStatusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  profileMetaSub: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(250,250,247,0.6)',
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // Stats
  statsWrap: {
    gap: 10,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
  },
  statCardDark: {
    backgroundColor: COLORS.carbon,
    borderColor: COLORS.carbon,
  },
  statCardAmber: {
    backgroundColor: COLORS.amber,
    borderColor: COLORS.amber,
  },
  statEye: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: COLORS.fg3,
    textTransform: 'uppercase',
  },
  statVal: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.carbon,
    marginTop: 6,
    marginBottom: 2,
  },
  statSub: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.fg3,
  },

  // Sections
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLORS.fg3,
    marginBottom: 10,
    marginLeft: 4,
  },
  rowGroup: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    overflow: 'hidden',
  },

  // Rows
  prow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  prowDisabled: {
    opacity: 0.45,
  },
  prowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  prowText: {
    flex: 1,
  },
  prowTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: COLORS.carbon,
  },
  prowSub: {
    fontSize: 11.5,
    fontWeight: '500',
    color: COLORS.fg3,
    marginTop: 2,
  },
  prowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  prowMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.fg3,
  },
  whatsappInset: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  soonBadge: {
    backgroundColor: COLORS.softGray200,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  soonBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.fg3,
    letterSpacing: 0.2,
  },

  // Logout
  logoutBtn: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.fg1,
  },

  // Delete account
  deleteAccountBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  deleteAccountText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.danger,
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

  // Avatar with photo
  avatarWrap: {
    position: 'relative',
    width: 62,
    height: 62,
    flexShrink: 0,
  },
  avatarPhoto: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.carbon,
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
