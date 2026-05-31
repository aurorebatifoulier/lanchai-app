import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import LanchaiMark from '@/components/LanchaiMark';

interface ProfileRowProps {
  icon: string;
  title: string;
  sub?: string;
  meta?: string;
  iconBg?: string;
  iconColor?: string;
}

function ProfileRow({ icon, title, sub, meta, iconBg, iconColor }: ProfileRowProps) {
  return (
    <TouchableOpacity style={styles.prow} activeOpacity={0.7}>
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

export default function AccountScreen() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>A</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>Alex Tremblay</Text>
          <View style={styles.profileMeta}>
            <Feather name="shield" size={12} color={COLORS.amber} />
            <Text style={styles.profileMetaText}>Verified · French passport</Text>
          </View>
          <View style={styles.profileMeta}>
            <Feather name="map-pin" size={12} color="rgba(250,250,247,0.7)" />
            <Text style={[styles.profileMetaText, { color: 'rgba(250,250,247,0.7)' }]}>Vientiane · since Jan 2026</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.settingsBtn}>
          <Feather name="settings" size={18} color={COLORS.porcelain} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statEye}>RENTALS</Text>
            <Text style={styles.statVal}>14</Text>
            <Text style={styles.statSub}>since Jan 2026</Text>
          </View>
          <View style={[styles.statCard, styles.statCardDark]}>
            <Text style={[styles.statEye, { color: 'rgba(250,250,247,0.6)' }]}>SAVED</Text>
            <Text style={[styles.statVal, { color: COLORS.porcelain }]}>3.2M LAK</Text>
            <Text style={[styles.statSub, { color: 'rgba(250,250,247,0.6)' }]}>vs. buying outright</Text>
          </View>
        </View>

        <ProfileSection title="Account">
          <ProfileRow icon="user" title="Personal info" sub="Name, email, phone" />
          <ProfileRow icon="map-pin" title="Addresses" sub="1 saved · Vientiane" />
          <ProfileRow icon="credit-card" title="Payment methods" sub="Visa •• 4242 · OnePay" meta="2" />
          <ProfileRow icon="file-text" title="Documents" sub="ID, contracts, invoices" />
        </ProfileSection>

        <ProfileSection title="Preferences">
          <ProfileRow icon="globe" title="Language" sub="System default" meta="English" />
          <ProfileRow icon="moon" title="Appearance" sub="Follow system" meta="Auto" />
          <ProfileRow icon="bell" title="Notifications" sub="Returns, deals, support" />
        </ProfileSection>

        <ProfileSection title="Support">
          <ProfileRow
            icon="message-circle"
            title="Chat with us"
            sub="Replies in < 5 min · WhatsApp"
            iconBg={COLORS.amber}
            iconColor={COLORS.carbon}
          />
          <ProfileRow icon="help-circle" title="FAQ" sub="How returns, deposits & cancellations work" />
          <ProfileRow icon="lock" title="Security" sub="2FA, sessions, login alerts" />
        </ProfileSection>

        <TouchableOpacity style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <LanchaiMark size={18} color={COLORS.fg3} hexColor={COLORS.fg3} />
          <Text style={styles.footerText}>v2.1.4 · Made with care in Vientiane</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
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
    gap: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: COLORS.porcelain,
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  profileMetaText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.amber,
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(250,250,247,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
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
  statEye: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: COLORS.fg3,
    textTransform: 'uppercase',
  },
  statVal: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
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
  prow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
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
  // Logout
  logoutBtn: {
    height: 48,
    borderRadius: 999,
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
});
