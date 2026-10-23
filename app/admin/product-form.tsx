import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Switch,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import {
  collection,
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { db, storage } from '@/lib/firebase';
import { auth } from '@/lib/auth';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import type { ProductCategory } from '@/lib/mockData';
import { adjustProductStockCondition, type LoyaltyTier } from '@/lib/firestore';
import { CATEGORY_LABELS } from './products';
import CropScreen from '@/components/CropScreen';
import { useExchangeRate } from '@/lib/exchangeRate';
import { formatLak } from '@/utils/currency';
import { TIER_ORDER, TIER_LABELS } from '@/lib/loyalty';
import AdminDateTimePicker from '@/components/AdminDateTimePicker';
import { ConfirmBox } from '@/components/ConfirmBox';

type ProductAccessMode = 'public' | 'earlyAccess' | 'exclusive';

// ── Category picker data ──────────────────────────────────────────────────────

const PRODUCT_CATEGORIES: ReadonlyArray<{ value: ProductCategory; label: string; hint?: string }> = [
  { value: 'fun',     label: 'Fun',     hint: 'Books (kids & novels) and board games'          },
  { value: 'tools',   label: 'Tools',   hint: 'DIY & garden — drills, hedge trimmers, shovels' },
  { value: 'outdoor', label: 'Outdoor', hint: 'Camping, hiking, tents, hammocks, backpacks'    },
  { value: 'sports',  label: 'Sports',  hint: 'Archery, pétanque, trampoline, golf, darts'     },
  { value: 'kids',    label: 'Kids',    hint: 'Strollers, baby beds, playards, kids gear'      },
  { value: 'home',    label: 'Home',    hint: 'Kitchen, appliances, cleaning, bedding'          },
];

// ── Access mode picker data (Loyalty Phase 2) ───────────────────────────────────

const ACCESS_MODES: ReadonlyArray<{ value: ProductAccessMode; label: string; hint?: string }> = [
  { value: 'public',      label: 'Public',       hint: 'Visible and bookable by everyone.' },
  { value: 'earlyAccess', label: 'Early access', hint: 'Priority window for a minimum tier, then opens to everyone automatically at the deadline.' },
  { value: 'exclusive',   label: 'Exclusive',    hint: 'Members-only until an admin changes this — never expires automatically.' },
];

const TIER_OPTIONS: ReadonlyArray<{ value: LoyaltyTier; label: string }> =
  TIER_ORDER.map(t => ({ value: t, label: TIER_LABELS[t] }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function parseQty(s: string): number {
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type UploadItem = {
  key: string;
  uri: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  url?: string;
  errorMsg?: string;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ title, top = false }: { title: string; top?: boolean }) {
  return <Text style={[f.sectionLabel, top && { marginTop: 0 }]}>{title}</Text>;
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={f.fieldWrap}>
      <Text style={f.label}>
        {label}
        {required && <Text style={f.asterisk}> *</Text>}
      </Text>
      {children}
      {error ? <Text style={f.errorText}>{error}</Text> : null}
    </View>
  );
}

function CheckboxRow({ label, hint, value, onToggle }: {
  label: string;
  hint?: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={f.checkRow} onPress={onToggle} activeOpacity={0.75}>
      <View style={[f.checkBox, value && f.checkBoxChecked]}>
        {value && <Feather name="check" size={12} color={COLORS.carbon} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={f.checkLabel}>{label}</Text>
        {hint ? <Text style={f.checkHint}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminProductFormScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const exchangeRate = useExchangeRate();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [name,        setName]        = useState('');
  const [shortDesc,   setShortDesc]   = useState('');
  const [category,    setCategory]    = useState<ProductCategory | ''>('');
  const [description, setDescription] = useState('');
  const [pricePerDay, setPricePerDay] = useState('');
  const [price3to6,   setPrice3to6]   = useState('');
  const [price7to13,  setPrice7to13]  = useState('');
  const [price14to29, setPrice14to29] = useState('');
  const [price30plus, setPrice30plus] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [deposit,     setDeposit]     = useState('');
  const [quantity,    setQuantity]    = useState('1');
  const [status,        setStatus]        = useState<'draft' | 'published' | 'archived'>('draft');
  const [available,     setAvailable]     = useState(true);
  const [isPremium,     setIsPremium]     = useState(false);
  const [showInPopular, setShowInPopular] = useState(false);
  const [showInNew,     setShowInNew]     = useState(false);
  const [accessMode,       setAccessMode]       = useState<ProductAccessMode>('public');
  const [minTierRequired,  setMinTierRequired]  = useState<LoyaltyTier | ''>('');
  const [earlyAccessUntil, setEarlyAccessUntil] = useState<Date | null>(null);

  // ── Stock condition (edit mode only — adjusted directly via adjustProductStockCondition,
  // not part of the main Save payload, so each change is individually audit-logged) ──
  const [inRepairUnits, setInRepairUnits] = useState(0);
  const [lostUnits,     setLostUnits]     = useState(0);
  const [stockConfirmField, setStockConfirmField] = useState<'inRepairUnits' | 'lostUnits' | null>(null);
  const [stockDeltaInput,   setStockDeltaInput]   = useState('');
  const [stockReason,       setStockReason]       = useState('');
  const [stockStaffName,    setStockStaffName]    = useState('');
  const [stockAdjusting,    setStockAdjusting]    = useState(false);
  const [stockAdjustError,  setStockAdjustError]  = useState<string | null>(null);

  // ── Optional content sections ──────────────────────────────────────────────
  const [perfectFor,    setPerfectFor]    = useState<string[]>([]);
  const [keyFeatures,   setKeyFeatures]   = useState<{ icon: string; text: string }[]>([]);
  const [whatsIncluded, setWhatsIncluded] = useState<string[]>([]);
  const [basicInfo,     setBasicInfo]     = useState<{ label: string; value: string }[]>([]);
  const [techSpecs,     setTechSpecs]     = useState<{ label: string; value: string }[]>([]);
  const [goodToKnow,    setGoodToKnow]    = useState<string[]>([]);
  const [usageExamples, setUsageExamples] = useState<string[]>([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isLoading,      setIsLoading]      = useState(isEdit);
  const [saving,         setSaving]         = useState(false);
  const [submitted,      setSubmitted]      = useState(false);
  const [saveMsg,        setSaveMsg]        = useState<{ ok: boolean; text: string } | null>(null);
  const [catPickerOpen,  setCatPickerOpen]  = useState(false);
  const [accessPickerOpen, setAccessPickerOpen] = useState(false);
  const [tierPickerOpen,   setTierPickerOpen]   = useState(false);
  const [deadlinePickerOpen, setDeadlinePickerOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [uploadItems,    setUploadItems]    = useState<UploadItem[]>([]);
  const [imgPermError,   setImgPermError]   = useState(false);
  const [cropQueue,      setCropQueue]      = useState<UploadItem[]>([]);
  const [cropQueueTotal, setCropQueueTotal] = useState(0);
  const [detailsOpen,    setDetailsOpen]    = useState(false);

  // ── Load existing doc (edit mode) ──────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'products', id))
      .then(snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        setName(d.name        ?? '');
        setShortDesc(d.shortDesc   ?? '');
        setCategory(d.category    ?? '');
        setDescription(d.description ?? '');
        setPricePerDay(d.pricePerDay != null ? String(d.pricePerDay) : '');
        setPrice3to6(d.price3to6  != null ? String(d.price3to6)  : '');
        setPrice7to13(d.price7to13 != null ? String(d.price7to13) : '');
        setPrice14to29(d.price14to29 != null ? String(d.price14to29) : '');
        setPrice30plus(d.price30plus != null ? String(d.price30plus) : '');
        setRetailPrice(d.retailPrice != null ? String(d.retailPrice) : '');
        setDeposit(d.deposit    != null ? String(d.deposit)    : '');
        setQuantity(String(d.quantity ?? d.stockLeft ?? 1));
        setInRepairUnits(d.inRepairUnits ?? 0);
        setLostUnits(d.lostUnits ?? 0);
        setStatus(d.status      ?? 'draft');
        setAvailable(d.available ?? true);
        setIsPremium(d.isPremium ?? false);
        setShowInPopular(d.showInPopular ?? false);
        setShowInNew(d.showInNew ?? false);
        setAccessMode(d.accessMode ?? 'public');
        setMinTierRequired(d.minTierRequired ?? '');
        setEarlyAccessUntil(d.earlyAccessUntil ? d.earlyAccessUntil.toDate() : null);
        setPerfectFor(d.perfectFor ?? []);
        setKeyFeatures(d.keyFeatures ?? []);
        setWhatsIncluded(d.whatsIncluded ?? []);
        setBasicInfo(d.basicInfo ?? []);
        setTechSpecs(d.techSpecs ?? []);
        setGoodToKnow(d.goodToKnow ?? []);
        setUsageExamples(d.usageExamples ?? []);
        if (d.perfectFor?.length || d.keyFeatures?.length || d.whatsIncluded?.length || d.basicInfo?.length || d.techSpecs?.length || d.goodToKnow?.length || d.usageExamples?.length) {
          setDetailsOpen(true);
        }
        const existingImages: string[] = Array.isArray(d.images) ? d.images : [];
        setUploadItems(existingImages.map(url => ({
          key: url,
          uri: url,
          status: 'done',
          progress: 100,
          url,
        })));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [id]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const errors = submitted ? (() => {
    const e: Record<string, string> = {};
    if (!name.trim())              e.name        = 'Name is required.';
    if (!category)                 e.category    = 'Category is required.';
    if (parseNum(pricePerDay) <= 0) e.pricePerDay = 'Enter a price greater than 0.';
    if (parseNum(deposit) < 0)     e.deposit     = 'Enter 0 or more.';
    if (parseQty(quantity) < 1)    e.quantity    = 'At least 1 unit required.';
    // Required for new products (used to compute damage/loss charges) — not enforced
    // retroactively on existing products so unrelated edits aren't blocked; those are
    // instead caught with a clear warning at charge-calculation time.
    if (!isEdit && parseNum(retailPrice) <= 0) e.retailPrice = 'Enter the replacement value — required for new products.';
    if (accessMode !== 'public' && !minTierRequired) e.minTierRequired = 'Select a minimum tier.';
    if (accessMode === 'earlyAccess' && (!earlyAccessUntil || earlyAccessUntil <= new Date())) {
      e.earlyAccessUntil = 'Select a deadline in the future.';
    }
    return e;
  })() : {};

  const canSave =
    !saving &&
    name.trim().length > 0 &&
    !!category &&
    parseNum(pricePerDay) > 0 &&
    parseNum(deposit) >= 0 &&
    parseQty(quantity) >= 1 &&
    (isEdit || parseNum(retailPrice) > 0) &&
    (accessMode === 'public' || !!minTierRequired) &&
    (accessMode !== 'earlyAccess' || (!!earlyAccessUntil && earlyAccessUntil > new Date()));

  // ── Image management ───────────────────────────────────────────────────────
  const handleAddImages = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setImgPermError(true); return; }
    setImgPermError(false);
    const limit = Math.max(1, 10 - uploadItems.length);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 1,
      selectionLimit: limit,
    });
    if (result.canceled) return;
    const newItems: UploadItem[] = result.assets.map(a => ({
      key: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      uri: a.uri,
      status: 'pending',
      progress: 0,
    }));
    // Route through crop screen one at a time before adding to upload queue
    setCropQueueTotal(newItems.length);
    setCropQueue(newItems);
  }, [uploadItems.length]);

  const handleCropConfirm = useCallback((croppedUri: string) => {
    setCropQueue(prev => {
      const [current, ...rest] = prev;
      if (current) {
        setUploadItems(items => [...items, { ...current, uri: croppedUri }]);
      }
      return rest;
    });
  }, []);

  const handleCropCancel = useCallback(() => {
    setCropQueue(prev => prev.slice(1));
  }, []);

  const handleRemoveImage = useCallback((key: string) => {
    setUploadItems(prev => prev.filter(i => i.key !== key));
  }, []);

  const handleMoveImage = useCallback((key: string, dir: -1 | 1) => {
    setUploadItems(prev => {
      const idx = prev.findIndex(i => i.key === key);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }, []);

  // ── Stock condition adjustment (own write, independent of the main Save button) ──
  const handleApplyStockAdjustment = useCallback(async () => {
    if (!id || !stockConfirmField || stockAdjusting) return;
    const delta = parseInt(stockDeltaInput, 10);
    if (!delta || stockReason.trim().length === 0 || stockStaffName.trim().length === 0) return;
    setStockAdjusting(true);
    setStockAdjustError(null);
    try {
      await adjustProductStockCondition(id, stockConfirmField, delta, stockReason.trim(), stockStaffName.trim());
      if (stockConfirmField === 'inRepairUnits') setInRepairUnits(v => Math.max(0, v + delta));
      else setLostUnits(v => Math.max(0, v + delta));
      setStockConfirmField(null);
      setStockDeltaInput('');
      setStockReason('');
    } catch {
      setStockAdjustError('Failed to update. Please try again.');
    } finally {
      setStockAdjusting(false);
    }
  }, [id, stockConfirmField, stockDeltaInput, stockReason, stockStaffName, stockAdjusting]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSubmitted(true);
    if (!canSave) return;

    setSaving(true);
    setSaveMsg(null);

    // Upload a single pending image and return its download URL
    async function uploadOne(item: UploadItem, productId: string): Promise<string> {
      const compressed = await manipulateAsync(
        item.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: SaveFormat.JPEG },
      );
      const blob: Blob = await (await fetch(compressed.uri)).blob();
      const sRef = storageRef(storage, `products/${productId}/${item.key}.jpg`);
      setUploadItems(prev => prev.map(i => i.key === item.key ? { ...i, status: 'uploading', progress: 0 } : i));
      return new Promise<string>((resolve, reject) => {
        const task = uploadBytesResumable(sRef, blob);
        task.on(
          'state_changed',
          snap => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setUploadItems(prev => prev.map(i => i.key === item.key ? { ...i, progress: pct } : i));
          },
          err => {
            setUploadItems(prev => prev.map(i => i.key === item.key ? { ...i, status: 'error', errorMsg: err.message } : i));
            reject(err);
          },
          async () => {
            const url = await getDownloadURL(task.snapshot.ref);
            setUploadItems(prev => prev.map(i => i.key === item.key ? { ...i, status: 'done', url, progress: 100 } : i));
            resolve(url);
          },
        );
      });
    }

    // Upload all pending items; preserve order and existing done URLs
    async function uploadAll(productId: string): Promise<string[]> {
      const urls: string[] = [];
      for (const item of uploadItems) {
        if (item.status === 'done' && item.url) {
          urls.push(item.url);
        } else if (item.status === 'pending') {
          urls.push(await uploadOne(item, productId));
        }
      }
      return urls;
    }

    // Defense-in-depth against the "first Storage write of the session" race: Storage's
    // isAdmin() rule cross-checks Firestore, and that first write occasionally fails
    // with storage/unauthorized even with a fresh token, self-resolving on retry.
    // One retry after a short delay absorbs that without surfacing it to the admin.
    async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
      try {
        return await fn();
      } catch (err) {
        console.warn('[AdminProductForm] upload failed, retrying once in 1s:', err);
        await new Promise(res => setTimeout(res, 1000));
        return await fn();
      }
    }

    try {
      // Force a fresh ID token before any Storage call — the very first Storage write
      // of a session can otherwise race ahead of the SDK picking up the current token.
      await auth.currentUser?.getIdToken(true);

      const qty = parseQty(quantity) || 1;
      const basePayload: Record<string, unknown> = {
        name:        name.trim(),
        shortDesc:   shortDesc.trim() || name.trim(),
        description: description.trim(),
        category,
        pricePerDay: parseNum(pricePerDay),
        price3to6:   parseNum(price3to6),
        price7to13:  parseNum(price7to13),
        price14to29: parseNum(price14to29),
        price30plus: parseNum(price30plus),
        retailPrice: retailPrice.trim() ? parseNum(retailPrice) : null,
        deposit:     parseNum(deposit),
        quantity:    qty,
        stockLeft:   qty,
        status,
        available,
        iconName:      'package',
        iconSet:       'Feather',
        cardBg:        'default',
        isPopular:      false,
        isNewThisWeek:  false,
        isMostRented:   false,
        isPremium,
        showInPopular,
        showInNew,
        accessMode,
        minTierRequired: accessMode !== 'public' && minTierRequired ? minTierRequired : null,
        earlyAccessUntil: accessMode === 'earlyAccess' && earlyAccessUntil ? Timestamp.fromDate(earlyAccessUntil) : null,
        perfectFor:    perfectFor.filter(s => s.trim()),
        keyFeatures:   keyFeatures.filter(f => f.text.trim()).slice(0, 4).map(f => ({ icon: f.icon || 'check', text: f.text })),
        whatsIncluded: whatsIncluded.filter(s => s.trim()),
        basicInfo:     basicInfo.filter(r => r.label.trim() && r.value.trim()),
        techSpecs:     techSpecs.filter(r => r.label.trim() && r.value.trim()),
        goodToKnow:    goodToKnow.filter(s => s.trim()),
        usageExamples: usageExamples.filter(s => s.trim()),
        updatedAt: serverTimestamp(),
      };

      if (isEdit && id) {
        const imageUrls = await withRetry(() => uploadAll(id));
        await updateDoc(doc(db, 'products', id), { ...basePayload, images: imageUrls });
      } else {
        // Generate the doc ID client-side (no network call — same mechanism addDoc uses
        // internally) so images can upload to their final products/{id}/... path BEFORE
        // any Firestore write happens. This matches the edit path's upload-then-write
        // order: if the upload fails, nothing has been written and there's no imageless
        // doc left behind, and retrying doesn't create a duplicate since no doc exists yet.
        const newRef = doc(collection(db, 'products'));
        basePayload.createdAt = serverTimestamp();
        basePayload.reviewCount   = 0;
        basePayload.rentalCount   = 0;
        basePayload.bookingsCount = 0;
        const imageUrls = await withRetry(() => uploadAll(newRef.id));
        await setDoc(newRef, { ...basePayload, images: imageUrls });
      }

      setSaveMsg({ ok: true, text: 'Product saved.' });
      setTimeout(() => router.back(), 1400);
    } catch (err) {
      console.error('[AdminProductForm] save error:', err);
      setSaveMsg({ ok: false, text: 'Failed to save. Please try again.' });
      setSaving(false);
    }
  }, [
    canSave, saving, isEdit, id,
    name, shortDesc, description, category,
    pricePerDay, price3to6, price7to13, price14to29, price30plus,
    retailPrice, deposit, quantity, status, available, router,
    uploadItems,
    isPremium, showInPopular, showInNew,
    accessMode, minTierRequired, earlyAccessUntil,
    perfectFor, keyFeatures, whatsIncluded, basicInfo, techSpecs, goodToKnow, usageExamples,
  ]);

  // ── Archive / Restore / Duplicate ─────────────────────────────────────────
  const handleArchiveConfirm = useCallback(async () => {
    if (!id) return;
    console.log('[AdminProductForm] archive start', id);
    setArchiveConfirm(false);
    try {
      await updateDoc(doc(db, 'products', id), {
        status: 'archived',
        updatedAt: serverTimestamp(),
      });
      console.log('[AdminProductForm] archive success');
      router.back();
    } catch (err: any) {
      console.error('[AdminProductForm] archive error:', err?.code, err?.message);
      setSaveMsg({ ok: false, text: 'Failed to archive. Please try again.' });
    }
  }, [id, router]);

  const handleRestore = useCallback(async () => {
    if (!id) return;
    console.log('[AdminProductForm] restore start', id);
    try {
      await updateDoc(doc(db, 'products', id), {
        status: 'draft',
        updatedAt: serverTimestamp(),
      });
      console.log('[AdminProductForm] restore success');
      router.back();
    } catch (err: any) {
      console.error('[AdminProductForm] restore error:', err?.code, err?.message);
      setSaveMsg({ ok: false, text: 'Failed to restore. Please try again.' });
    }
  }, [id, router]);

  const handleDuplicate = useCallback(async () => {
    if (!id) return;
    try {
      const snap = await getDoc(doc(db, 'products', id));
      if (!snap.exists()) return;
      const src = snap.data();
      const newRef = await addDoc(collection(db, 'products'), {
        ...src,
        name: `${src.name ?? ''} (copy)`,
        status: 'draft',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      router.replace(`/admin/product-form?id=${newRef.id}`);
    } catch (err) {
      console.error('[AdminProductForm] duplicate error:', err);
      setSaveMsg({ ok: false, text: 'Failed to duplicate. Please try again.' });
    }
  }, [id, router]);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[f.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={f.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={f.headerTitle}>Edit product</Text>
        </View>
        <View style={f.centered}>
          <ActivityIndicator color={COLORS.amber} />
        </View>
      </View>
    );
  }

  const numInputProps = {
    keyboardType:    'decimal-pad' as const,
    returnKeyType:   'next' as const,
    autoCorrect:     false,
    autoCapitalize:  'none' as const,
  };

  return (
    <View style={[f.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={f.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={f.headerTitle}>{isEdit ? 'Edit product' : 'Add product'}</Text>
      </View>

      {/* ── Save result banner ────────────────────────────────────────── */}
      {saveMsg && (
        <View style={[f.banner, saveMsg.ok ? f.bannerOk : f.bannerErr]}>
          <Feather
            name={saveMsg.ok ? 'check-circle' : 'alert-circle'}
            size={15}
            color={saveMsg.ok ? '#065F46' : COLORS.danger}
          />
          <Text style={[f.bannerText, saveMsg.ok ? f.bannerTextOk : f.bannerTextErr]}>
            {saveMsg.text}
          </Text>
        </View>
      )}

      {/* ── Form ──────────────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[f.scroll, { paddingBottom: insets.bottom + 40 }]}
        >
          {/* ── Archived banner ───────────────────────────────────────── */}
          {status === 'archived' && (
            <View style={f.archivedBanner}>
              <Feather name="archive" size={14} color={COLORS.fg3} />
              <Text style={f.archivedBannerText}>
                This product is archived — not visible in the catalogue.
              </Text>
            </View>
          )}

          {/* ── BASIC INFO ────────────────────────────────────────────── */}
          <SectionLabel title="Basic info" top />

          <Field label="Name" required error={errors.name}>
            <TextInput
              style={[f.input, errors.name && f.inputErr]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Pressure washer"
              placeholderTextColor={COLORS.fg3}
              autoCapitalize="sentences"
              returnKeyType="next"
            />
          </Field>

          <Field label="Short description">
            <TextInput
              style={f.input}
              value={shortDesc}
              onChangeText={setShortDesc}
              placeholder="Brief subtitle shown on catalogue card"
              placeholderTextColor={COLORS.fg3}
              autoCapitalize="sentences"
              returnKeyType="next"
            />
          </Field>

          {/* Category picker trigger */}
          <Field label="Category" required error={errors.category}>
            <TouchableOpacity
              style={[f.input, f.pickerRow, errors.category && f.inputErr]}
              onPress={() => setCatPickerOpen(true)}
              activeOpacity={0.75}
            >
              <Text style={[f.pickerText, !category && f.pickerPlaceholder]}>
                {category ? CATEGORY_LABELS[category] : 'Select a category…'}
              </Text>
              <Feather name="chevron-down" size={16} color={COLORS.fg3} />
            </TouchableOpacity>
          </Field>

          <Field label="Description">
            <TextInput
              style={[f.input, f.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Full description shown on the product page"
              placeholderTextColor={COLORS.fg3}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoCapitalize="sentences"
            />
          </Field>

          {/* ── PRICING ───────────────────────────────────────────────── */}
          <SectionLabel title="Pricing (USD)" />

          <Field label="Base price / day — 1–2 days" required error={errors.pricePerDay}>
            <View style={f.numRow}>
              <TextInput
                style={[f.input, f.numInput, errors.pricePerDay && f.inputErr]}
                value={pricePerDay}
                onChangeText={setPricePerDay}
                placeholder="e.g. 3.50"
                placeholderTextColor={COLORS.fg3}
                {...numInputProps}
              />
              <Text style={f.unit}>USD</Text>
            </View>
            {parseNum(pricePerDay) > 0 && exchangeRate != null && (
              <Text style={f.preview}>{formatLak(parseNum(pricePerDay), exchangeRate)}</Text>
            )}
          </Field>

          {(
            [
              ['3–6 days',   price3to6,   setPrice3to6],
              ['7–13 days',  price7to13,  setPrice7to13],
              ['14–29 days', price14to29, setPrice14to29],
              ['30+ days',   price30plus, setPrice30plus],
            ] as [string, string, React.Dispatch<React.SetStateAction<string>>][]
          ).map(([lbl, val, setter]) => (
            <Field key={lbl} label={lbl}>
              <View style={f.numRow}>
                <TextInput
                  style={[f.input, f.numInput]}
                  value={val}
                  onChangeText={setter}
                  placeholder="0"
                  placeholderTextColor={COLORS.fg3}
                  {...numInputProps}
                />
                <Text style={f.unit}>USD</Text>
              </View>
              {parseNum(val) > 0 && exchangeRate != null && (
                <Text style={f.preview}>{formatLak(parseNum(val), exchangeRate)}</Text>
              )}
            </Field>
          ))}

          <Field
            label="Retail / replacement value"
            required={!isEdit}
            error={errors.retailPrice}
          >
            <View style={f.numRow}>
              <TextInput
                style={[f.input, f.numInput, errors.retailPrice && f.inputErr]}
                value={retailPrice}
                onChangeText={setRetailPrice}
                placeholder="0"
                placeholderTextColor={COLORS.fg3}
                {...numInputProps}
              />
              <Text style={f.unit}>USD</Text>
            </View>
            {parseNum(retailPrice) > 0 && exchangeRate != null && (
              <Text style={f.preview}>{formatLak(parseNum(retailPrice), exchangeRate)}</Text>
            )}
            <Text style={f.hint}>
              Used to calculate damage/loss charges on the return checklist — required
              for new products.
            </Text>
          </Field>

          {/* ── INVENTORY ─────────────────────────────────────────────── */}
          <SectionLabel title="Inventory" />

          <Field label="Security deposit" required error={errors.deposit}>
            <View style={f.numRow}>
              <TextInput
                style={[f.input, f.numInput, errors.deposit && f.inputErr]}
                value={deposit}
                onChangeText={setDeposit}
                placeholder="0"
                placeholderTextColor={COLORS.fg3}
                {...numInputProps}
              />
              <Text style={f.unit}>USD</Text>
            </View>
            {parseNum(deposit) > 0 && exchangeRate != null && (
              <Text style={f.preview}>{formatLak(parseNum(deposit), exchangeRate)}</Text>
            )}
          </Field>

          <Field label="Quantity in stock" required error={errors.quantity}>
            <View style={f.numRow}>
              <TextInput
                style={[f.input, f.numInput, errors.quantity && f.inputErr]}
                value={quantity}
                onChangeText={setQuantity}
                placeholder="1"
                placeholderTextColor={COLORS.fg3}
                keyboardType="number-pad"
                returnKeyType="next"
                autoCorrect={false}
              />
              <Text style={f.unit}>units</Text>
            </View>
          </Field>

          {/* ── PHOTOS ────────────────────────────────────────────────── */}
          <SectionLabel title="Photos" />

          <TouchableOpacity
            style={[f.addPhotoBtn, uploadItems.length >= 10 && f.addPhotoBtnDisabled]}
            onPress={handleAddImages}
            disabled={uploadItems.length >= 10}
            activeOpacity={0.8}
          >
            <Feather name="camera" size={16} color={uploadItems.length >= 10 ? COLORS.fg3 : COLORS.carbon} />
            <Text style={[f.addPhotoBtnText, uploadItems.length >= 10 && f.addPhotoBtnTextDisabled]}>
              {uploadItems.length === 0 ? 'Add photos' : 'Add more photos'}
            </Text>
          </TouchableOpacity>

          {imgPermError && (
            <Text style={f.imgPermError}>
              Photo library access denied. Enable it in your device settings.
            </Text>
          )}

          {uploadItems.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={f.thumbsRow}
            >
              {uploadItems.map((item, idx) => (
                <View key={item.key} style={f.thumbCell}>
                  <View style={f.thumbFrame}>
                    <Image source={{ uri: item.uri }} style={f.thumb} resizeMode="cover" />

                    {/* Uploading overlay */}
                    {item.status === 'uploading' && (
                      <View style={f.thumbOverlay}>
                        <Text style={f.thumbOverlayPct}>{item.progress}%</Text>
                      </View>
                    )}

                    {/* Error overlay */}
                    {item.status === 'error' && (
                      <View style={[f.thumbOverlay, f.thumbOverlayErr]}>
                        <Feather name="alert-circle" size={18} color="#fff" />
                      </View>
                    )}

                    {/* Primary badge */}
                    {idx === 0 && (
                      <View style={f.primaryBadge}>
                        <Text style={f.primaryBadgeText}>Main</Text>
                      </View>
                    )}

                    {/* Remove button */}
                    <TouchableOpacity
                      style={f.thumbRemove}
                      onPress={() => handleRemoveImage(item.key)}
                      hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
                    >
                      <Feather name="x" size={11} color={COLORS.white} />
                    </TouchableOpacity>
                  </View>

                  {/* Reorder arrows */}
                  {uploadItems.length > 1 && (
                    <View style={f.thumbArrows}>
                      <TouchableOpacity
                        onPress={() => handleMoveImage(item.key, -1)}
                        disabled={idx === 0}
                        style={[f.thumbArrow, idx === 0 && f.thumbArrowDisabled]}
                      >
                        <Feather name="chevron-left" size={13} color={COLORS.carbon} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleMoveImage(item.key, 1)}
                        disabled={idx === uploadItems.length - 1}
                        style={[f.thumbArrow, idx === uploadItems.length - 1 && f.thumbArrowDisabled]}
                      >
                        <Feather name="chevron-right" size={13} color={COLORS.carbon} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Upload error message */}
                  {item.status === 'error' && (
                    <Text style={f.thumbErrText} numberOfLines={1}>Upload failed</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}

          <Text style={f.mediaNote}>
            {uploadItems.length > 0
              ? `${uploadItems.length}/10 photo${uploadItems.length > 1 ? 's' : ''} — first photo is the main listing image.`
              : 'First photo will be the main listing image. Max 10 photos.'}
          </Text>

          {/* ── HOME VISIBILITY ───────────────────────────────────── */}
          <SectionLabel title="Home visibility" />
          <Text style={f.hintBlock}>
            Controls which Home sections this item appears in.{'\n'}
            &quot;Most rented&quot; is automatic and cannot be set here.
          </Text>
          <CheckboxRow
            label="Popular near you"
            hint='Appears in the "Popular near you" section on the Home screen.'
            value={showInPopular}
            onToggle={() => setShowInPopular(v => !v)}
          />
          <CheckboxRow
            label="New arrivals"
            hint='Appears in the "New arrivals" section on the Home screen.'
            value={showInNew}
            onToggle={() => setShowInNew(v => !v)}
          />

          {/* ── PREMIUM ────────────────────────────────────────────── */}
          <SectionLabel title="Premium" />
          <CheckboxRow
            label="Premium equipment"
            hint='Marks this item as premium: shows a Premium badge on the card and detail page and adds it to the Home Premium section. (A stricter cancellation rule only applies if advance payments are ever introduced.)'
            value={isPremium}
            onToggle={() => setIsPremium(v => !v)}
          />

          {/* ── ACCESS (Loyalty Phase 2) ──────────────────────────── */}
          <SectionLabel title="Access" />
          <Text style={f.hintBlock}>
            Products are never hidden — a non-public mode only badges the item and
            disables booking for renters below the minimum tier.
          </Text>

          <Field label="Access mode">
            <TouchableOpacity
              style={[f.input, f.pickerRow]}
              onPress={() => setAccessPickerOpen(true)}
              activeOpacity={0.75}
            >
              <Text style={f.pickerText}>
                {ACCESS_MODES.find(m => m.value === accessMode)?.label}
              </Text>
              <Feather name="chevron-down" size={16} color={COLORS.fg3} />
            </TouchableOpacity>
          </Field>

          {accessMode !== 'public' && (
            <Field label="Minimum tier required" required error={errors.minTierRequired}>
              <TouchableOpacity
                style={[f.input, f.pickerRow, errors.minTierRequired && f.inputErr]}
                onPress={() => setTierPickerOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={[f.pickerText, !minTierRequired && f.pickerPlaceholder]}>
                  {minTierRequired ? TIER_LABELS[minTierRequired] : 'Select a tier…'}
                </Text>
                <Feather name="chevron-down" size={16} color={COLORS.fg3} />
              </TouchableOpacity>
            </Field>
          )}

          {accessMode === 'earlyAccess' && (
            <Field label="Early access ends" required error={errors.earlyAccessUntil}>
              <TouchableOpacity
                style={[f.input, f.pickerRow, errors.earlyAccessUntil && f.inputErr]}
                onPress={() => setDeadlinePickerOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={[f.pickerText, !earlyAccessUntil && f.pickerPlaceholder]}>
                  {earlyAccessUntil
                    ? earlyAccessUntil.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'Select a date and time…'}
                </Text>
                <Feather name="chevron-down" size={16} color={COLORS.fg3} />
              </TouchableOpacity>
              <Text style={[f.hintBlock, { marginTop: 6, marginBottom: 0 }]}>
                Automatically switches to public for everyone at this time.
              </Text>
            </Field>
          )}

          {/* ── PRODUCT DETAILS (optional) ───────────────────────── */}
          {(() => {
            const hasContent =
              perfectFor.some(s => s.trim()) ||
              keyFeatures.some(f => f.text.trim()) ||
              whatsIncluded.some(s => s.trim()) ||
              basicInfo.some(r => r.label.trim() && r.value.trim()) ||
              techSpecs.some(r => r.label.trim() && r.value.trim()) ||
              goodToKnow.some(s => s.trim()) ||
              usageExamples.some(s => s.trim());
            const ICON_PRESET = ['zap','battery','maximize-2','feather','shield','droplet','clock','users','package','award','book','tool'] as const;
            return (
              <>
                <TouchableOpacity
                  style={f.detailsToggle}
                  onPress={() => setDetailsOpen(v => !v)}
                  activeOpacity={0.75}
                >
                  <View style={f.detailsToggleLeft}>
                    {hasContent && <View style={f.detailsDot} />}
                    <Text style={f.detailsToggleTitle}>Product details</Text>
                    <Text style={f.detailsToggleHint}> — optional sections</Text>
                  </View>
                  <Feather name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.fg3} />
                </TouchableOpacity>

                {detailsOpen && (
                  <View style={f.detailsBody}>

                    {/* Perfect for */}
                    <Text style={f.detailsSub}>Perfect for</Text>
                    {perfectFor.map((item, i) => (
                      <View key={i} style={f.listRow}>
                        <TextInput
                          style={[f.input, f.listInput]}
                          value={item}
                          onChangeText={v => setPerfectFor(prev => prev.map((s, j) => j === i ? v : s))}
                          placeholder="e.g. weekend trips"
                          placeholderTextColor={COLORS.fg3}
                          autoCapitalize="sentences"
                          returnKeyType="next"
                        />
                        <TouchableOpacity onPress={() => setPerfectFor(prev => prev.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Feather name="x" size={16} color={COLORS.fg3} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={f.addRowBtn} onPress={() => setPerfectFor(prev => [...prev, ''])} activeOpacity={0.75}>
                      <Feather name="plus" size={14} color={COLORS.carbon} />
                      <Text style={f.addRowBtnText}>Add item</Text>
                    </TouchableOpacity>

                    {/* Key features */}
                    <Text style={[f.detailsSub, { marginTop: 18 }]}>Key features (max 4)</Text>
                    {keyFeatures.map((feat, i) => (
                      <View key={i} style={f.featRow}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={f.iconPresetScroll} contentContainerStyle={f.iconPresetContent}>
                          {ICON_PRESET.map(ic => (
                            <TouchableOpacity
                              key={ic}
                              style={[f.iconPresetBtn, feat.icon === ic && f.iconPresetBtnActive]}
                              onPress={() => setKeyFeatures(prev => prev.map((f2, j) => j === i ? { ...f2, icon: ic } : f2))}
                              activeOpacity={0.75}
                            >
                              <Feather name={ic as never} size={14} color={feat.icon === ic ? COLORS.carbon : COLORS.fg3} />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <View style={f.featInputRow}>
                          <TextInput
                            style={[f.input, f.listInput]}
                            value={feat.text}
                            onChangeText={v => setKeyFeatures(prev => prev.map((f2, j) => j === i ? { ...f2, text: v } : f2))}
                            placeholder="e.g. Waterproof up to 30m"
                            placeholderTextColor={COLORS.fg3}
                            autoCapitalize="sentences"
                            returnKeyType="next"
                          />
                          <TouchableOpacity onPress={() => setKeyFeatures(prev => prev.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Feather name="x" size={16} color={COLORS.fg3} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                    {keyFeatures.length < 4 && (
                      <TouchableOpacity style={f.addRowBtn} onPress={() => setKeyFeatures(prev => [...prev, { icon: 'check', text: '' }])} activeOpacity={0.75}>
                        <Feather name="plus" size={14} color={COLORS.carbon} />
                        <Text style={f.addRowBtnText}>Add feature</Text>
                      </TouchableOpacity>
                    )}

                    {/* What's included */}
                    <Text style={[f.detailsSub, { marginTop: 18 }]}>What&apos;s included</Text>
                    {whatsIncluded.map((item, i) => (
                      <View key={i} style={f.listRow}>
                        <TextInput
                          style={[f.input, f.listInput]}
                          value={item}
                          onChangeText={v => setWhatsIncluded(prev => prev.map((s, j) => j === i ? v : s))}
                          placeholder="e.g. Carrying bag"
                          placeholderTextColor={COLORS.fg3}
                          autoCapitalize="sentences"
                          returnKeyType="next"
                        />
                        <TouchableOpacity onPress={() => setWhatsIncluded(prev => prev.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Feather name="x" size={16} color={COLORS.fg3} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={f.addRowBtn} onPress={() => setWhatsIncluded(prev => [...prev, ''])} activeOpacity={0.75}>
                      <Feather name="plus" size={14} color={COLORS.carbon} />
                      <Text style={f.addRowBtnText}>Add item</Text>
                    </TouchableOpacity>

                    {/* Basic information */}
                    <Text style={[f.detailsSub, { marginTop: 18 }]}>Basic information</Text>
                    {basicInfo.map((row, i) => (
                      <View key={i} style={f.kvRow}>
                        <TextInput
                          style={[f.input, f.kvLabel]}
                          value={row.label}
                          onChangeText={v => setBasicInfo(prev => prev.map((r, j) => j === i ? { ...r, label: v } : r))}
                          placeholder="Label"
                          placeholderTextColor={COLORS.fg3}
                          autoCapitalize="sentences"
                          returnKeyType="next"
                        />
                        <TextInput
                          style={[f.input, f.kvValue]}
                          value={row.value}
                          onChangeText={v => setBasicInfo(prev => prev.map((r, j) => j === i ? { ...r, value: v } : r))}
                          placeholder="Value"
                          placeholderTextColor={COLORS.fg3}
                          autoCapitalize="sentences"
                          returnKeyType="next"
                        />
                        <TouchableOpacity onPress={() => setBasicInfo(prev => prev.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Feather name="x" size={16} color={COLORS.fg3} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={f.addRowBtn} onPress={() => setBasicInfo(prev => [...prev, { label: '', value: '' }])} activeOpacity={0.75}>
                      <Feather name="plus" size={14} color={COLORS.carbon} />
                      <Text style={f.addRowBtnText}>Add row</Text>
                    </TouchableOpacity>

                    {/* Technical specifications */}
                    <Text style={[f.detailsSub, { marginTop: 18 }]}>Technical specifications</Text>
                    {techSpecs.map((row, i) => (
                      <View key={i} style={f.kvRow}>
                        <TextInput
                          style={[f.input, f.kvLabel]}
                          value={row.label}
                          onChangeText={v => setTechSpecs(prev => prev.map((r, j) => j === i ? { ...r, label: v } : r))}
                          placeholder="Label"
                          placeholderTextColor={COLORS.fg3}
                          autoCapitalize="sentences"
                          returnKeyType="next"
                        />
                        <TextInput
                          style={[f.input, f.kvValue]}
                          value={row.value}
                          onChangeText={v => setTechSpecs(prev => prev.map((r, j) => j === i ? { ...r, value: v } : r))}
                          placeholder="Value"
                          placeholderTextColor={COLORS.fg3}
                          autoCapitalize="sentences"
                          returnKeyType="next"
                        />
                        <TouchableOpacity onPress={() => setTechSpecs(prev => prev.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Feather name="x" size={16} color={COLORS.fg3} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={f.addRowBtn} onPress={() => setTechSpecs(prev => [...prev, { label: '', value: '' }])} activeOpacity={0.75}>
                      <Feather name="plus" size={14} color={COLORS.carbon} />
                      <Text style={f.addRowBtnText}>Add row</Text>
                    </TouchableOpacity>

                    {/* Good to know */}
                    <Text style={[f.detailsSub, { marginTop: 18 }]}>Good to know</Text>
                    {goodToKnow.map((item, i) => (
                      <View key={i} style={f.listRow}>
                        <TextInput
                          style={[f.input, f.listInput]}
                          value={item}
                          onChangeText={v => setGoodToKnow(prev => prev.map((s, j) => j === i ? v : s))}
                          placeholder="e.g. Not suitable for saltwater"
                          placeholderTextColor={COLORS.fg3}
                          autoCapitalize="sentences"
                          returnKeyType="next"
                        />
                        <TouchableOpacity onPress={() => setGoodToKnow(prev => prev.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Feather name="x" size={16} color={COLORS.fg3} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={f.addRowBtn} onPress={() => setGoodToKnow(prev => [...prev, ''])} activeOpacity={0.75}>
                      <Feather name="plus" size={14} color={COLORS.carbon} />
                      <Text style={f.addRowBtnText}>Add item</Text>
                    </TouchableOpacity>

                    {/* Usage examples */}
                    <Text style={[f.detailsSub, { marginTop: 18 }]}>Usage examples</Text>
                    {usageExamples.map((item, i) => (
                      <View key={i} style={f.listRow}>
                        <TextInput
                          style={[f.input, f.listInput]}
                          value={item}
                          onChangeText={v => setUsageExamples(prev => prev.map((s, j) => j === i ? v : s))}
                          placeholder="e.g. Beach camping trip"
                          placeholderTextColor={COLORS.fg3}
                          autoCapitalize="sentences"
                          returnKeyType="next"
                        />
                        <TouchableOpacity onPress={() => setUsageExamples(prev => prev.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Feather name="x" size={16} color={COLORS.fg3} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={f.addRowBtn} onPress={() => setUsageExamples(prev => [...prev, ''])} activeOpacity={0.75}>
                      <Feather name="plus" size={14} color={COLORS.carbon} />
                      <Text style={f.addRowBtnText}>Add item</Text>
                    </TouchableOpacity>

                  </View>
                )}
              </>
            );
          })()}

          {/* ── STATUS ────────────────────────────────────────────────── */}
          <SectionLabel title="Status" />

          <View style={f.fieldWrap}>
            <Text style={f.label}>Listing status</Text>
            <View style={f.seg}>
              <TouchableOpacity
                style={[f.segBtn, status === 'draft' && f.segBtnDraft]}
                onPress={() => setStatus('draft')}
                activeOpacity={0.8}
              >
                <Text style={[f.segText, status === 'draft' && f.segTextDraft]}>Draft</Text>
              </TouchableOpacity>
              <View style={f.segDivider} />
              <TouchableOpacity
                style={[f.segBtn, status === 'published' && f.segBtnPublished]}
                onPress={() => setStatus('published')}
                activeOpacity={0.8}
              >
                <Text style={[f.segText, status === 'published' && f.segTextPublished]}>
                  Published
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={f.hint}>
              {status === 'archived'
                ? 'Archived — restore this product to change its status.'
                : status === 'draft'
                ? 'Draft — not visible to renters yet.'
                : 'Published — visible in the catalogue.'}
            </Text>
          </View>

          <View style={f.fieldWrap}>
            <View style={f.toggleRow}>
              <View style={f.toggleLabelCol}>
                <Text style={f.label}>Available for rent</Text>
                <Text style={f.hint}>Turn off when all units are rented out.</Text>
              </View>
              <Switch
                value={available}
                onValueChange={setAvailable}
                trackColor={{ false: COLORS.softGray, true: COLORS.amber }}
                thumbColor={COLORS.white}
              />
            </View>
          </View>

          {/* ── STOCK CONDITION (edit mode only — a new product has nothing
              to adjust yet) ──────────────────────────────────────────── */}
          {isEdit && (
            <>
              <SectionLabel title="Stock condition" />

              <View style={f.fieldWrap}>
                <View style={f.toggleRow}>
                  <View style={f.toggleLabelCol}>
                    <Text style={f.label}>In repair</Text>
                    <Text style={f.hint}>
                      {inRepairUnits} unit{inRepairUnits !== 1 ? 's' : ''} currently out for repair
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={f.adjustBtn}
                    onPress={() => {
                      setStockConfirmField('inRepairUnits');
                      setStockDeltaInput('');
                      setStockReason('');
                      setStockAdjustError(null);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={f.adjustBtnText}>Adjust</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={f.fieldWrap}>
                <View style={f.toggleRow}>
                  <View style={f.toggleLabelCol}>
                    <Text style={f.label}>Lost / stolen</Text>
                    <Text style={f.hint}>
                      {lostUnits} unit{lostUnits !== 1 ? 's' : ''} permanently lost
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={f.adjustBtn}
                    onPress={() => {
                      setStockConfirmField('lostUnits');
                      setStockDeltaInput('');
                      setStockReason('');
                      setStockAdjustError(null);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={f.adjustBtnText}>Adjust</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {stockConfirmField && (
                <ConfirmBox
                  text={`Adjust "${stockConfirmField === 'inRepairUnits' ? 'In repair' : 'Lost / stolen'}" by how many units? Positive adds, negative restores (e.g. a repaired unit returning to service).`}
                  confirmLabel="Apply"
                  confirmDisabled={
                    !parseInt(stockDeltaInput, 10) ||
                    stockReason.trim().length === 0 ||
                    stockStaffName.trim().length === 0
                  }
                  onCancel={() => setStockConfirmField(null)}
                  onConfirm={handleApplyStockAdjustment}
                >
                  <TextInput
                    style={f.input}
                    keyboardType="numbers-and-punctuation"
                    value={stockDeltaInput}
                    onChangeText={setStockDeltaInput}
                    placeholder="e.g. 1 or -1"
                    placeholderTextColor={COLORS.fg3}
                  />
                  <TextInput
                    style={f.input}
                    value={stockReason}
                    onChangeText={setStockReason}
                    placeholder="Reason (e.g. cracked frame found on inspection)"
                    placeholderTextColor={COLORS.fg3}
                  />
                  <TextInput
                    style={f.input}
                    value={stockStaffName}
                    onChangeText={setStockStaffName}
                    placeholder="Staff member name"
                    placeholderTextColor={COLORS.fg3}
                  />
                  {stockAdjustError && <Text style={f.errorText}>{stockAdjustError}</Text>}
                </ConfirmBox>
              )}
            </>
          )}

          {/* ── Save button ───────────────────────────────────────────── */}
          <TouchableOpacity
            style={[f.saveBtn, (!canSave || saving) && f.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.carbon} />
            ) : (
              <Text style={f.saveBtnText}>
                {isEdit ? 'Save changes' : 'Add product'}
              </Text>
            )}
          </TouchableOpacity>

          {/* ── Management actions (edit mode only) ───────────────────── */}
          {isEdit && (
            <View style={f.mgmtSection}>
              <TouchableOpacity
                style={f.dupBtn}
                onPress={handleDuplicate}
                activeOpacity={0.8}
              >
                <Feather name="copy" size={15} color={COLORS.carbon} />
                <Text style={f.dupBtnText}>Duplicate product</Text>
              </TouchableOpacity>

              {status === 'archived' ? (
                <TouchableOpacity
                  style={f.restoreBtn}
                  onPress={handleRestore}
                  activeOpacity={0.8}
                >
                  <Text style={f.restoreBtnText}>Restore product</Text>
                </TouchableOpacity>
              ) : archiveConfirm ? (
                <View style={f.archiveConfirmBox}>
                  <Text style={f.archiveConfirmText}>
                    Archive this product? It will be hidden from the catalogue.
                    You can restore it later.
                  </Text>
                  <View style={f.archiveConfirmRow}>
                    <TouchableOpacity
                      style={f.archiveCancelBtn}
                      onPress={() => setArchiveConfirm(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={f.archiveCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={f.archiveConfirmBtn}
                      onPress={handleArchiveConfirm}
                      activeOpacity={0.8}
                    >
                      <Text style={f.archiveConfirmBtnText}>Confirm archive</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={f.archiveLink}
                  onPress={() => setArchiveConfirm(true)}
                  activeOpacity={0.7}
                >
                  <Text style={f.archiveLinkText}>Archive product</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Crop screen modal ────────────────────────────────────────── */}
      <Modal
        visible={cropQueue.length > 0}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={handleCropCancel}
      >
        {cropQueue.length > 0 && (
          <CropScreen
            key={cropQueue[0].key}
            imageUri={cropQueue[0].uri}
            queueIndex={cropQueueTotal - cropQueue.length}
            queueTotal={cropQueueTotal}
            onConfirm={handleCropConfirm}
            onCancel={handleCropCancel}
          />
        )}
      </Modal>

      {/* ── Category picker modal ─────────────────────────────────────── */}
      <Modal
        visible={catPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCatPickerOpen(false)}
        statusBarTranslucent
      >
        <View style={f.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setCatPickerOpen(false)} />
          <View style={[f.catSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={f.catHandle} />
            <Text style={f.catSheetTitle}>Select category</Text>
            {PRODUCT_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.value}
                style={f.catOption}
                onPress={() => { setCategory(cat.value); setCatPickerOpen(false); }}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[f.catOptionText, category === cat.value && f.catOptionSelected]}>
                    {cat.label}
                  </Text>
                  {cat.hint && (
                    <Text style={f.catOptionHint}>{cat.hint}</Text>
                  )}
                </View>
                {category === cat.value && (
                  <Feather name="check" size={16} color={COLORS.amber} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Access mode picker modal ──────────────────────────────────── */}
      <Modal
        visible={accessPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAccessPickerOpen(false)}
        statusBarTranslucent
      >
        <View style={f.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setAccessPickerOpen(false)} />
          <View style={[f.catSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={f.catHandle} />
            <Text style={f.catSheetTitle}>Select access mode</Text>
            {ACCESS_MODES.map(mode => (
              <TouchableOpacity
                key={mode.value}
                style={f.catOption}
                onPress={() => {
                  setAccessMode(mode.value);
                  setAccessPickerOpen(false);
                }}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[f.catOptionText, accessMode === mode.value && f.catOptionSelected]}>
                    {mode.label}
                  </Text>
                  {mode.hint && <Text style={f.catOptionHint}>{mode.hint}</Text>}
                </View>
                {accessMode === mode.value && (
                  <Feather name="check" size={16} color={COLORS.amber} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Minimum tier picker modal ─────────────────────────────────── */}
      <Modal
        visible={tierPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTierPickerOpen(false)}
        statusBarTranslucent
      >
        <View style={f.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setTierPickerOpen(false)} />
          <View style={[f.catSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={f.catHandle} />
            <Text style={f.catSheetTitle}>Select minimum tier</Text>
            {TIER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={f.catOption}
                onPress={() => {
                  setMinTierRequired(opt.value);
                  setTierPickerOpen(false);
                }}
                activeOpacity={0.75}
              >
                <Text style={[f.catOptionText, minTierRequired === opt.value && f.catOptionSelected]}>
                  {opt.label}
                </Text>
                {minTierRequired === opt.value && (
                  <Feather name="check" size={16} color={COLORS.amber} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Early access deadline picker ──────────────────────────────── */}
      <AdminDateTimePicker
        visible={deadlinePickerOpen}
        initialValue={earlyAccessUntil}
        onClose={() => setDeadlinePickerOpen(false)}
        onConfirm={value => { setEarlyAccessUntil(value); setDeadlinePickerOpen(false); }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const f = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0,
    textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },

  // Save banner
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 10,
    padding: 12, borderRadius: 10,
  },
  bannerOk:      { backgroundColor: '#D1FAE5' },
  bannerErr:     { backgroundColor: '#FEE2E2' },
  bannerText:    { flex: 1, fontSize: 13, fontWeight: '600' },
  bannerTextOk:  { color: '#065F46' },
  bannerTextErr: { color: '#B91C1C' },

  // Scroll form
  scroll: { paddingHorizontal: 20, paddingTop: 24 },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5,
    color: COLORS.fg3, marginBottom: 14, marginTop: 28,
  },

  // Field wrapper
  fieldWrap:  { marginBottom: 16 },
  label:      { fontSize: 12, fontWeight: '700', color: COLORS.fg2, marginBottom: 7, letterSpacing: 0.1 },
  asterisk:   { color: COLORS.danger },
  errorText:  { fontSize: 11, fontWeight: '600', color: COLORS.danger, marginTop: 5 },
  hint:       { fontSize: 11, fontWeight: '500', color: COLORS.fg3, marginTop: 5 },
  preview:    { fontSize: 12, fontWeight: '600', color: COLORS.amber, marginTop: 5 },

  // Input
  input: {
    height: 48, borderRadius: 10,
    borderWidth: 1.5, borderColor: COLORS.softGray,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    fontSize: 14, fontWeight: '500', color: COLORS.carbon,
  },
  inputErr: { borderColor: COLORS.danger },
  multiline: {
    height: 96, paddingTop: 12, paddingBottom: 12,
    textAlignVertical: 'top',
  },

  // Numeric input row
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numInput: { flex: 1 },
  unit: { fontSize: 13, fontWeight: '600', color: COLORS.fg3, minWidth: 40 },

  // Category picker trigger
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  pickerText:        { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.carbon },
  pickerPlaceholder: { color: COLORS.fg3 },

  // Segmented status control
  seg: {
    flexDirection: 'row',
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1.5, borderColor: COLORS.softGray200,
    height: 48,
  },
  segBtn:          { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  segBtnDraft:     { backgroundColor: '#1E1E1E' },
  segBtnPublished: { backgroundColor: '#D1FAE5' },
  segDivider:      { width: 1.5, backgroundColor: COLORS.softGray200 },
  segText:         { fontSize: 14, fontWeight: '700', color: COLORS.fg3 },
  segTextDraft:    { color: COLORS.amber },
  segTextPublished:{ color: '#065F46' },

  // Available toggle row
  toggleRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabelCol: { flex: 1, marginRight: 16 },

  // Stock condition "Adjust" trigger
  adjustBtn: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.softGray200,
    backgroundColor: COLORS.warmBeige,
  },
  adjustBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.carbon },

  // Checkbox rows (Home visibility + Premium)
  hintBlock: {
    fontSize: 12,
    color: COLORS.fg3,
    lineHeight: 17,
    marginBottom: 4,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: COLORS.softGray,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkBoxChecked: {
    backgroundColor: COLORS.amber,
    borderColor: COLORS.amber,
  },
  checkLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.carbon,
    lineHeight: 18,
  },
  checkHint: {
    fontSize: 11,
    color: COLORS.fg3,
    marginTop: 3,
    lineHeight: 15,
  },

  // Photos section
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.softGray200,
    borderStyle: 'dashed',
    backgroundColor: COLORS.white,
  },
  addPhotoBtnDisabled: { opacity: 0.4 },
  addPhotoBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.carbon },
  addPhotoBtnTextDisabled: { color: COLORS.fg3 },
  imgPermError: {
    fontSize: 12, fontWeight: '500', color: COLORS.danger,
    marginTop: 6, lineHeight: 16,
  },
  thumbsRow: { paddingTop: 12, paddingBottom: 4, gap: 10 },
  thumbCell: { width: 88, alignItems: 'center', gap: 6 },
  thumbFrame: {
    width: 88, height: 88, borderRadius: 10, overflow: 'hidden',
    backgroundColor: COLORS.softGray200,
  },
  thumb: { width: 88, height: 88 },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30,30,30,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  thumbOverlayErr: { backgroundColor: 'rgba(185,28,28,0.7)' },
  thumbOverlayPct: { fontSize: 14, fontWeight: '800', color: '#fff' },
  primaryBadge: {
    position: 'absolute', bottom: 5, left: 5,
    backgroundColor: COLORS.amber,
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2,
  },
  primaryBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.carbon },
  thumbRemove: {
    position: 'absolute', top: 5, right: 5,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(30,30,30,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  thumbArrows: { flexDirection: 'row', gap: 4 },
  thumbArrow: {
    width: 28, height: 22, borderRadius: 6,
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbArrowDisabled: { opacity: 0.3 },
  thumbErrText: {
    fontSize: 9, fontWeight: '600', color: COLORS.danger,
    textAlign: 'center',
  },
  mediaNote: {
    fontSize: 11, fontWeight: '500', color: COLORS.fg3,
    lineHeight: 16, marginTop: 8, marginBottom: 4,
  },

  // Archived product banner
  archivedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.softGray200,
    borderRadius: 10, padding: 12, marginBottom: 20,
  },
  archivedBannerText: {
    flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.fg3,
  },

  // Management actions (edit mode)
  mgmtSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    gap: 12,
  },
  dupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: 10,
    borderWidth: 1.5, borderColor: COLORS.softGray200,
    backgroundColor: COLORS.white,
  },
  dupBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  restoreBtn: {
    height: 48, borderRadius: 10,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center', justifyContent: 'center',
  },
  restoreBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  archiveLink: { alignItems: 'center', paddingVertical: 10 },
  archiveLinkText: { fontSize: 13, fontWeight: '600', color: COLORS.danger },

  archiveConfirmBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    gap: 12,
  },
  archiveConfirmText: {
    fontSize: 13, fontWeight: '500', color: COLORS.carbon, lineHeight: 18,
  },
  archiveConfirmRow: { flexDirection: 'row', gap: 10 },
  archiveCancelBtn: {
    flex: 1, height: 40, borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  archiveCancelText: { fontSize: 13, fontWeight: '700', color: COLORS.fg2 },
  archiveConfirmBtn: {
    flex: 1, height: 40, borderRadius: 8,
    backgroundColor: COLORS.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  archiveConfirmBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.white },

  // Save button
  saveBtn: {
    marginTop: 10,
    height: 54,
    borderRadius: 12,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: COLORS.softGray },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },

  // Category picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(30,30,30,0.50)',
    justifyContent: 'flex-end',
  },
  catSheet: {
    backgroundColor: COLORS.porcelain,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  catHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.softGray,
    alignSelf: 'center', marginBottom: 16,
  },
  catSheetTitle: {
    fontSize: 17, fontWeight: '800', color: COLORS.carbon,
    letterSpacing: -0.3, marginBottom: 12,
  },
  catOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  catOptionText:     { fontSize: 15, fontWeight: '600', color: COLORS.carbon },
  catOptionSelected: { color: COLORS.amber },
  catOptionHint:     { fontSize: 11, fontWeight: '400', color: COLORS.fg3, marginTop: 1 },

  // ── Product details section ───────────────────────────────────────────────
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  detailsToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.amber,
  },
  detailsToggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  detailsToggleHint: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.fg3,
  },
  detailsBody: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  detailsSub: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.fg3,
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  listInput: {
    flex: 1,
    height: 40,
    fontSize: 13,
  },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  addRowBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.carbon,
  },
  featRow: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    borderRadius: 10,
    overflow: 'hidden',
  },
  iconPresetScroll: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
  },
  iconPresetContent: {
    flexDirection: 'row',
    gap: 4,
    padding: 8,
  },
  iconPresetBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPresetBtnActive: {
    backgroundColor: COLORS.amber,
    borderColor: COLORS.amber,
  },
  featInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  kvLabel: {
    flex: 2,
    height: 40,
    fontSize: 13,
  },
  kvValue: {
    flex: 3,
    height: 40,
    fontSize: 13,
  },
});
