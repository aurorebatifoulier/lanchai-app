import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { auth } from '@/lib/auth';
import { storage, functions } from '@/lib/firebase';
import { getUserProfile, saveUserProfile } from '@/lib/firestore';
import { canReplaceBtobDocument } from '@/utils/btob';

export default function BusinessDocumentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Rejected application: fixable → company details + document can be corrected and
  // resubmitted (resubmitBusinessApplication callable → back to pending_approval,
  // admins notified). Final → read-only, no resubmission from the app.
  const [rejection, setRejection] = useState<'fixable' | 'final' | null>(null);
  // false once approved with a document on file (the rules refuse a replacement), so
  // we never upload a file to Storage that can't be saved on the profile.
  const [canReplace, setCanReplace] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const cu = auth.currentUser;
    if (!cu) { setLoading(false); return; }
    getUserProfile(cu.uid)
      .then(profile => {
        setDocumentUrl(profile?.btobDocumentUrl ?? null);
        setCanReplace(canReplaceBtobDocument(profile));
        if (profile?.accountType === 'btob' && profile.btobStatus === 'rejected') {
          setRejection(profile.btobRejectionFixable === true ? 'fixable' : 'final');
          setCompanyName(profile.btobCompanyName ?? '');
          setLicenseNumber(profile.btobLicenseNumber ?? '');
          setResponsibleName(profile.btobResponsibleName ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const canResubmit = !!documentUrl && !uploading && !submitting
    && companyName.trim().length > 0 && licenseNumber.trim().length > 0 && responsibleName.trim().length > 0;

  const handleResubmit = async () => {
    if (!canResubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await httpsCallable(functions, 'resubmitBusinessApplication')({
        companyName: companyName.trim(),
        licenseNumber: licenseNumber.trim(),
        responsibleName: responsibleName.trim(),
      });
      router.replace('/btob-pending');
    } catch (err: any) {
      const code = err?.details?.code;
      setSubmitError(
        code === 'missing-fields' ? 'Please fill in every company field.'
        : code === 'document-required' ? 'Please attach your registration document first.'
        : code === 'final-rejection' || code === 'not-rejected' ? 'This application can’t be resubmitted. Please message us.'
        : 'Could not resubmit. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePick = async () => {
    const cu = auth.currentUser;
    if (!cu || uploading || !canReplace) return;
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
        {rejection === 'final' ? (
          <View style={s.bannerInfo}>
            <Feather name="info" size={16} color={COLORS.fg2} />
            <Text style={s.bannerInfoText}>
              This application can&apos;t be resubmitted. If you think this is a mistake, please message us.
            </Text>
          </View>
        ) : rejection === 'fixable' ? (
          <Text style={s.intro}>
            Check your company details and attach a clear photo of your registration
            document, then resubmit — our team will review it again.
          </Text>
        ) : (
          <Text style={s.intro}>
            Upload a photo of your business license, KBIS, or registration document.
            This is required before you can book, and helps our team verify your
            business account faster.
          </Text>
        )}

        {rejection === 'fixable' && (
          <>
            <Text style={s.fieldLabel}>Company name</Text>
            <TextInput style={s.input} value={companyName} onChangeText={setCompanyName} maxLength={120} placeholder="Company name" placeholderTextColor={COLORS.fg3} />
            <Text style={s.fieldLabel}>Licence / registration number</Text>
            <TextInput style={s.input} value={licenseNumber} onChangeText={setLicenseNumber} maxLength={80} placeholder="Licence number" placeholderTextColor={COLORS.fg3} autoCapitalize="characters" />
            <Text style={s.fieldLabel}>Responsible person</Text>
            <TextInput style={s.input} value={responsibleName} onChangeText={setResponsibleName} maxLength={120} placeholder="Full name" placeholderTextColor={COLORS.fg3} />
          </>
        )}

        <Text style={s.fieldLabel}>Business registration document</Text>
        <TouchableOpacity style={s.docPicker} onPress={handlePick} activeOpacity={0.8} disabled={uploading || rejection === 'final' || !canReplace}>
          {uploading ? (
            <ActivityIndicator size="small" color={COLORS.carbon} />
          ) : documentUrl ? (
            <>
              <Image source={{ uri: documentUrl }} style={s.docThumb} />
              <Text style={s.docPickerText}>{canReplace ? 'Document attached — tap to replace' : 'Document on file'}</Text>
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

        {!canReplace && (
          <Text style={s.lockedNote}>
            Your account is approved — contact us if your registration document changes.
          </Text>
        )}

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

        {rejection === 'fixable' && (
          <>
            {submitError && (
              <View style={s.bannerError}>
                <Feather name="alert-circle" size={16} color="#B91C1C" />
                <Text style={s.bannerErrorText}>{submitError}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[s.submitBtn, !canResubmit && s.submitBtnDisabled]}
              onPress={handleResubmit}
              disabled={!canResubmit}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator size="small" color={COLORS.carbon} />
                : <Text style={s.submitBtnText}>Resubmit application</Text>}
            </TouchableOpacity>
          </>
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
    letterSpacing: 0.2,
    color: COLORS.fg3,
    marginBottom: 8,
  },

  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.carbon,
    marginBottom: 16,
  },
  submitBtn: {
    height: 50,
    borderRadius: 10,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },
  bannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 24,
  },
  bannerInfoText: { flex: 1, fontSize: 13, fontWeight: '500', color: COLORS.fg2, lineHeight: 19 },

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

  lockedNote: {
    fontSize: 12.5,
    fontWeight: '500',
    color: COLORS.fg3,
    lineHeight: 18,
    marginTop: 10,
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
