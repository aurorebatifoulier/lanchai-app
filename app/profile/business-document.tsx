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
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { SHADES } from '@/constants/brandShades';
import {
  UI, SectionTitle, RowGroup, Row, IconCircle, StatusBlock, StatusChip, CheckLine, useScreenInsets,
} from '@/components/account/ui';
import { auth } from '@/lib/auth';
import { storage, functions } from '@/lib/firebase';
import { getUserProfile, saveUserProfile } from '@/lib/firestore';
import { canReplaceBtobDocument } from '@/utils/btob';
import { useMyIdentity, ID_DOC_TYPES } from '@/lib/identity';

export default function BusinessDocumentScreen() {
  const screen = useScreenInsets();
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
  // Responsible person's ID (ID & residency) — required before approval / resubmission.
  const { identity } = useMyIdentity();
  const idOnFile = identity?.status === 'on_file';

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
        : code === 'id-required' ? 'Please add the responsible person\u2019s ID first (Account › ID & residency).'
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
      <View style={[s.root, screen.root]}>
        <StatusBar style="dark" />
        <Header onBack={() => router.back()} />
        <ActivityIndicator color={SHADES.amber} style={{ marginTop: 48 }} />
      </View>
    );
  }

  return (
    <View style={[s.root, screen.root]}>
      <StatusBar style="dark" />
      <Header onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[UI.screenContent, { paddingTop: 16, paddingBottom: screen.contentBottom }]}
      >
        <View style={[UI.card, UI.cardPadded]}>
          {rejection === 'final' ? (
            <StatusBlock icon={{ name: 'info' }} title="Application closed" chip={<StatusChip label="Declined" tone="danger" />}>
              <Text style={UI.body}>
                This application can&apos;t be resubmitted. If you think this is a mistake, please message us.
              </Text>
            </StatusBlock>
          ) : rejection === 'fixable' ? (
            <Text style={UI.body}>
              Check your company details and attach a clear photo of your registration
              document, then resubmit — our team will review it again.
            </Text>
          ) : (
            <Text style={UI.body}>
              Upload a photo of your business license, KBIS, or registration document.
              This is required before you can book, and helps our team verify your
              business account faster.
            </Text>
          )}
        </View>

        {rejection === 'fixable' && (
          <>
            <SectionTitle>Company details</SectionTitle>
            <View style={[UI.card, UI.cardPadded]}>
              <Text style={UI.fieldLabel}>Company name</Text>
              <TextInput style={UI.input} value={companyName} onChangeText={setCompanyName} maxLength={120} placeholder="Company name" placeholderTextColor={SHADES.carbonFaint} />
              <Text style={[UI.fieldLabel, s.nextField]}>Licence / registration number</Text>
              <TextInput style={UI.input} value={licenseNumber} onChangeText={setLicenseNumber} maxLength={80} placeholder="Licence number" placeholderTextColor={SHADES.carbonFaint} autoCapitalize="characters" />
              <Text style={[UI.fieldLabel, s.nextField]}>Responsible person</Text>
              <TextInput style={UI.input} value={responsibleName} onChangeText={setResponsibleName} maxLength={120} placeholder="Full name" placeholderTextColor={SHADES.carbonFaint} />
            </View>
          </>
        )}

        {/* Icon rule: amber = still needed, grey = on file. */}
        <SectionTitle>Documents</SectionTitle>
        <RowGroup>
          <Row
            icon={{ set: 'mci', name: 'card-account-details-outline' }}
            tone={idOnFile ? 'grey' : 'amber'}
            title="Responsible person's ID"
            sub={idOnFile
              ? `${ID_DOC_TYPES.find(t => t.key === identity?.docType)?.label ?? 'ID'} on file — tap to see or replace`
              : 'Required before approval — tap to add a passport or ID card'}
            onPress={() => router.push('/profile/id-residency')}
          />
          <TouchableOpacity style={s.docRow} onPress={handlePick} activeOpacity={0.7} disabled={uploading || rejection === 'final' || !canReplace}>
            {uploading ? (
              <View style={s.docIcon}><ActivityIndicator size="small" color={SHADES.carbon} /></View>
            ) : documentUrl ? (
              <Image source={{ uri: documentUrl }} style={s.docThumb} />
            ) : (
              <IconCircle icon={{ name: 'upload' }} tone="amber" />
            )}
            <View style={{ flex: 1 }}>
              <Text style={UI.title}>Business registration document</Text>
              <Text style={UI.subtitle}>
                {documentUrl
                  ? (canReplace ? 'Document attached — tap to replace' : 'Document on file')
                  : 'Tap to attach a photo of your registration document'}
              </Text>
            </View>
            {!(uploading || rejection === 'final' || !canReplace) && <Feather name="chevron-right" size={16} color={SHADES.carbonFaint} />}
          </TouchableOpacity>
        </RowGroup>

        {!canReplace && (
          <Text style={[UI.small, { marginTop: 10 }]}>
            Your account is approved — contact us if your registration document changes.
          </Text>
        )}

        {uploadSuccess && <View style={s.feedback}><CheckLine text="Document uploaded successfully." /></View>}
        {uploadError && <Text style={[UI.errorText, s.feedback]}>Could not upload. Please try again.</Text>}

        {rejection === 'fixable' && (
          <>
            {submitError && <Text style={[UI.errorText, s.feedback]}>{submitError}</Text>}
            <TouchableOpacity
              style={[UI.btnPrimary, { marginTop: 20 }, !canResubmit && UI.btnDisabled]}
              onPress={handleResubmit}
              disabled={!canResubmit}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator size="small" color={SHADES.carbon} />
                : <Text style={UI.btnPrimaryText}>Resubmit application</Text>}
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

  nextField: { marginTop: 14 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  docIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  docThumb: { width: 36, height: 36, borderRadius: 10, backgroundColor: SHADES.carbonLight },
  feedback: { marginTop: 12 },
});
