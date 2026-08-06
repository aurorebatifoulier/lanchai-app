import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { auth } from '@/lib/auth';
import { storage } from '@/lib/firebase';
import { getUserProfile, saveUserProfile } from '@/lib/firestore';

export default function BusinessDocumentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  useEffect(() => {
    const cu = auth.currentUser;
    if (!cu) { setLoading(false); return; }
    getUserProfile(cu.uid)
      .then(profile => setDocumentUrl(profile?.btobDocumentUrl ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handlePick = async () => {
    const cu = auth.currentUser;
    if (!cu || uploading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    setUploadError(false);
    setUploadSuccess(false);
    try {
      const compressed = await manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: SaveFormat.JPEG },
      );
      const blob: Blob = await (await fetch(compressed.uri)).blob();
      const sRef = storageRef(storage, `businessDocs/${cu.uid}/${Date.now()}.jpg`);
      await uploadBytes(sRef, blob);
      const url = await getDownloadURL(sRef);
      await saveUserProfile(cu.uid, { btobDocumentUrl: url });
      setDocumentUrl(url);
      setUploadSuccess(true);
    } catch {
      setUploadError(true);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} />
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 48 }} />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <Text style={s.intro}>
          Upload a photo of your business license, KBIS, or registration document.
          This is required before you can book, and helps our team verify your
          business account faster.
        </Text>

        <Text style={s.fieldLabel}>Business registration document</Text>
        <TouchableOpacity style={s.docPicker} onPress={handlePick} activeOpacity={0.8} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color={COLORS.carbon} />
          ) : documentUrl ? (
            <>
              <Image source={{ uri: documentUrl }} style={s.docThumb} />
              <Text style={s.docPickerText}>Document attached — tap to replace</Text>
            </>
          ) : (
            <>
              <Feather name="upload" size={18} color={COLORS.fg3} />
              <Text style={s.docPickerText}>
                Tap to attach a photo of your registration document
              </Text>
            </>
          )}
        </TouchableOpacity>

        {uploadSuccess && (
          <View style={s.bannerSuccess}>
            <Feather name="check-circle" size={16} color="#0F6E56" />
            <Text style={s.bannerSuccessText}>Document uploaded successfully.</Text>
          </View>
        )}
        {uploadError && (
          <View style={s.bannerError}>
            <Feather name="alert-circle" size={16} color="#B91C1C" />
            <Text style={s.bannerErrorText}>Could not upload. Please try again.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.header}>
      <BackButton onPress={onBack} />
      <Text style={s.headerTitle}>Business document</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },

  intro: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 19,
    marginBottom: 24,
  },

  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: COLORS.fg3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  docPicker: {
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    borderStyle: 'dashed',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  docThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.softGray200,
  },
  docPickerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500',
    color: COLORS.fg3,
    lineHeight: 17,
  },

  bannerSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E1F5EE',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  bannerSuccessText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F6E56',
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  bannerErrorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#B91C1C',
  },
});
