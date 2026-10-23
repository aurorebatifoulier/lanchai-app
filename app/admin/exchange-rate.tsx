import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import { DEFAULT_VAT_PERCENT, type PricingConfig } from '@/lib/exchangeRate';

// Shared read-display/edit-toggle for a single "1 X = ? LAK" rate — used for both the
// USD "configured" state and the THB section, so the two behave identically.
function RateEditor({
  displayLabel,
  placeholder,
  rate,
  unit = 'lak',
  updatedAt,
  rateInput,
  onChangeRateInput,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  saving,
  saveError,
  saved,
  successMessage,
}: {
  displayLabel: string;
  placeholder: string;
  rate: number | undefined;
  unit?: 'lak' | 'percent';
  updatedAt: Timestamp | undefined;
  rateInput: string;
  onChangeRateInput: (t: string) => void;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  saving: boolean;
  saveError: string | null;
  saved: boolean;
  successMessage: string;
}) {
  // No rate set yet — skip straight to the input, same as USD's first-run state does,
  // but without a migration step: nothing else depends on this rate.
  const showInput = editing || rate == null;

  return (
    <>
      <Text style={s.fieldLabel}>Current rate</Text>
      {!showInput ? (
        <>
          <Text style={s.rateDisplay}>
            {unit === 'percent' ? `${displayLabel}: ${rate}%` : `${displayLabel} = ${rate!.toLocaleString('en-US')} LAK`}
          </Text>
          <Text style={s.updatedNote}>Updated {fmtDate(updatedAt)}</Text>

          {saved && (
            <View style={s.successBox}>
              <Feather name="check-circle" size={13} color={COLORS.success} />
              <Text style={s.successText}>{successMessage}</Text>
            </View>
          )}

          <TouchableOpacity style={s.primaryBtn} onPress={onStartEdit} activeOpacity={0.8}>
            <Text style={s.primaryBtnText}>Update rate</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            style={s.input}
            value={rateInput}
            onChangeText={onChangeRateInput}
            placeholder={placeholder}
            placeholderTextColor={COLORS.fg3}
            keyboardType="decimal-pad"
            editable={!saving}
            autoFocus={editing}
          />
          {!!saveError && (
            <View style={s.errBox}>
              <Feather name="alert-circle" size={13} color={COLORS.danger} />
              <Text style={s.errText}>{saveError}</Text>
            </View>
          )}
          <View style={s.confirmBtnRow}>
            {rate != null && (
              <TouchableOpacity
                style={s.keepBtn}
                onPress={onCancelEdit}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={s.keepBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.saveBtn}
              onPress={onSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator size="small" color={COLORS.carbon} />
                : <Text style={s.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </>
  );
}

function fmtDate(ts: Timestamp | undefined): string {
  if (!ts) return '—';
  const d = ts.toDate();
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// Converts every product's LAK price fields to USD in place, using initialRate as the
// one-time conversion factor. config/pricing is written only after all product batches
// commit successfully, so doc-existence itself is the "migration done" flag — a failure
// partway through simply leaves config/pricing absent, and this screen's "not configured"
// state (and the migrate button) reappears on next load. Safe to retry.
async function migrateProductsToUsd(initialRate: number): Promise<void> {
  const snap = await getDocs(collection(db, 'products'));
  const docs = snap.docs;
  const toUsd = (lak: number) => Math.round((lak / initialRate) * 100) / 100;

  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 400)) {
      const p = d.data();
      batch.update(d.ref, {
        pricePerDay: toUsd(p.pricePerDay ?? 0),
        price3to6:   toUsd(p.price3to6 ?? 0),
        price7to13:  toUsd(p.price7to13 ?? 0),
        price14to29: toUsd(p.price14to29 ?? 0),
        price30plus: toUsd(p.price30plus ?? 0),
        retailPrice: p.retailPrice != null ? toUsd(p.retailPrice) : null,
        deposit:     toUsd(p.deposit ?? 0),
      });
    }
    await batch.commit();
  }

  // merge: true — config/pricing also holds thbToLakRate (independent of this USD
  // migration); a non-merging write here would silently wipe it out.
  await setDoc(doc(db, 'config', 'pricing'), {
    exchangeRate: initialRate,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export default function AdminExchangeRateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [config,  setConfig]  = useState<PricingConfig | null>(null);

  const [rateInput, setRateInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  // Migration (first run only)
  const [confirmingMigration, setConfirmingMigration] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateError, setMigrateError] = useState<string | null>(null);

  // Update rate (ongoing)
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // THB rate — independent of the USD migration/update flow above
  const [thbRateInput, setThbRateInput] = useState('');
  const [thbEditing, setThbEditing] = useState(false);
  const [thbSaving, setThbSaving] = useState(false);
  const [thbSaveError, setThbSaveError] = useState<string | null>(null);
  const [thbSaved, setThbSaved] = useState(false);

  // VAT % (BtoB HT/VAT display) — independent of exchange rates, same config/pricing doc
  const [vatRateInput, setVatRateInput] = useState('');
  const [vatEditing, setVatEditing] = useState(false);
  const [vatSaving, setVatSaving] = useState(false);
  const [vatSaveError, setVatSaveError] = useState<string | null>(null);
  const [vatSaved, setVatSaved] = useState(false);
  // Show VAT on prices and receipts — default OFF (not VAT-registered yet). Read by the
  // shared vatDisplayPercent() everywhere (app + emails).
  const [showVatSaving, setShowVatSaving] = useState(false);
  const [showVatError, setShowVatError] = useState<string | null>(null);
  const toggleShowVat = useCallback(async (value: boolean) => {
    setShowVatSaving(true);
    setShowVatError(null);
    try {
      await setDoc(doc(db, 'config', 'pricing'), { showVat: value }, { merge: true });
      setConfig(prev => ({ ...(prev ?? ({} as PricingConfig)), showVat: value }));
    } catch {
      setShowVatError('Could not update. Please try again.');
    } finally {
      setShowVatSaving(false);
    }
  }, []);

  useEffect(() => {
    getDoc(doc(db, 'config', 'pricing'))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data() as PricingConfig;
          setConfig(data);
          if (data.exchangeRate != null) setRateInput(String(data.exchangeRate));
          if (data.thbToLakRate != null) setThbRateInput(String(data.thbToLakRate));
          if (data.vatPercent != null) setVatRateInput(String(data.vatPercent));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const parsedRate = parseFloat(rateInput);
  const rateValid = !isNaN(parsedRate) && parsedRate > 0;

  const handleMigratePress = useCallback(() => {
    setInputError(null);
    if (!rateValid) {
      setInputError('Enter a valid exchange rate greater than 0.');
      return;
    }
    setConfirmingMigration(true);
  }, [rateValid]);

  const handleConfirmMigrate = useCallback(async () => {
    setMigrating(true);
    setMigrateError(null);
    try {
      await migrateProductsToUsd(parsedRate);
      setConfig({ exchangeRate: parsedRate });
      setConfirmingMigration(false);
    } catch (err) {
      console.error('[ExchangeRate] migration failed:', err);
      setMigrateError('Migration failed. Please check your connection and try again.');
    } finally {
      setMigrating(false);
    }
  }, [parsedRate]);

  const handleSaveRate = useCallback(async () => {
    setSaveError(null);
    if (!rateValid) {
      setSaveError('Enter a valid exchange rate greater than 0.');
      return;
    }
    setSaving(true);
    try {
      // merge: true — see note on migrateProductsToUsd's setDoc above; avoids wiping
      // out thbToLakRate when only the USD rate is being updated.
      await setDoc(doc(db, 'config', 'pricing'), {
        exchangeRate: parsedRate,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setConfig(prev => ({ ...prev, exchangeRate: parsedRate }));
      setEditing(false);
      setSaved(true);
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [rateValid, parsedRate]);

  const parsedThbRate = parseFloat(thbRateInput);
  const thbRateValid = !isNaN(parsedThbRate) && parsedThbRate > 0;

  const handleSaveThbRate = useCallback(async () => {
    setThbSaveError(null);
    if (!thbRateValid) {
      setThbSaveError('Enter a valid exchange rate greater than 0.');
      return;
    }
    setThbSaving(true);
    try {
      // merge: true — avoids wiping out exchangeRate (USD) when only the THB rate is
      // being updated; this field is independent of the USD migration/update flow above.
      await setDoc(doc(db, 'config', 'pricing'), {
        thbToLakRate: parsedThbRate,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      // prev may be null (USD never configured yet) — still reflect the THB rate
      // locally so RateEditor flips to its read-only display immediately.
      setConfig(prev => ({ ...(prev ?? {}), thbToLakRate: parsedThbRate } as PricingConfig));
      setThbEditing(false);
      setThbSaved(true);
    } catch {
      setThbSaveError('Failed to save. Please try again.');
    } finally {
      setThbSaving(false);
    }
  }, [thbRateValid, parsedThbRate]);

  const parsedVatRate = parseFloat(vatRateInput);
  const vatRateValid = !isNaN(parsedVatRate) && parsedVatRate >= 0;

  const handleSaveVatRate = useCallback(async () => {
    setVatSaveError(null);
    if (!vatRateValid) {
      setVatSaveError('Enter a valid VAT percentage (0 or greater).');
      return;
    }
    setVatSaving(true);
    try {
      // merge: true — same reasoning as the THB save above: avoids wiping out the
      // other independent rates on this shared config/pricing doc.
      await setDoc(doc(db, 'config', 'pricing'), {
        vatPercent: parsedVatRate,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setConfig(prev => ({ ...(prev ?? {}), vatPercent: parsedVatRate } as PricingConfig));
      setVatEditing(false);
      setVatSaved(true);
    } catch {
      setVatSaveError('Failed to save. Please try again.');
    } finally {
      setVatSaving(false);
    }
  }, [vatRateValid, parsedVatRate]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.headerTitle}>Exchange rate</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <ActivityIndicator color={COLORS.amber} style={{ marginTop: 40 }} />
        ) : !config?.exchangeRate ? (
          // ── Not configured — first-run migration ──────────────────────────
          // (checks exchangeRate specifically, not just doc-existence: the doc may
          // already exist with only thbToLakRate set, if that was saved first)
          <>
            <View style={s.infoBox}>
              <Feather name="info" size={13} color={COLORS.amber} />
              <Text style={s.infoText}>
                Product prices are currently stored in LAK. Setting up USD pricing will
                convert every product&apos;s prices to USD using the rate you enter below, and
                LAK will be computed live everywhere renters see a price from then on.
              </Text>
            </View>

            <Text style={s.fieldLabel}>Initial exchange rate (1 USD = ? LAK)</Text>
            <TextInput
              style={s.input}
              value={rateInput}
              onChangeText={t => { setRateInput(t); setInputError(null); }}
              placeholder="e.g. 21000"
              placeholderTextColor={COLORS.fg3}
              keyboardType="decimal-pad"
              editable={!confirmingMigration && !migrating}
            />
            {!!inputError && (
              <View style={s.errBox}>
                <Feather name="alert-circle" size={13} color={COLORS.danger} />
                <Text style={s.errText}>{inputError}</Text>
              </View>
            )}

            {!confirmingMigration ? (
              <TouchableOpacity style={s.primaryBtn} onPress={handleMigratePress} activeOpacity={0.8}>
                <Text style={s.primaryBtnText}>Migrate & activate</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.confirmBox}>
                <Text style={s.confirmText}>
                  This converts ALL existing product prices from LAK to USD using a rate of{' '}
                  {parsedRate.toLocaleString('en-US')} LAK per USD. This cannot be undone.
                  Are you sure?
                </Text>
                {!!migrateError && (
                  <View style={s.errBox}>
                    <Feather name="alert-circle" size={13} color={COLORS.danger} />
                    <Text style={s.errText}>{migrateError}</Text>
                  </View>
                )}
                {migrating ? (
                  <ActivityIndicator color={COLORS.amber} style={{ marginTop: 8 }} />
                ) : (
                  <View style={s.confirmBtnRow}>
                    <TouchableOpacity
                      style={s.keepBtn}
                      onPress={() => setConfirmingMigration(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.keepBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.confirmBtn}
                      onPress={handleConfirmMigrate}
                      activeOpacity={0.8}
                    >
                      <Text style={s.confirmBtnText}>Yes, migrate prices</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </>
        ) : (
          // ── Configured — ongoing rate display / update ────────────────────
          <RateEditor
            displayLabel="1 USD"
            placeholder="e.g. 21000"
            rate={config.exchangeRate}
            updatedAt={config.updatedAt}
            rateInput={rateInput}
            onChangeRateInput={t => { setRateInput(t); setSaveError(null); }}
            editing={editing}
            onStartEdit={() => { setEditing(true); setSaved(false); setRateInput(String(config.exchangeRate)); }}
            onCancelEdit={() => { setEditing(false); setSaveError(null); }}
            onSave={handleSaveRate}
            saving={saving}
            saveError={saveError}
            saved={saved}
            successMessage="Exchange rate updated."
          />
        )}

        {!loading && (
          <View style={s.thbSection}>
            <RateEditor
              displayLabel="1 THB"
              placeholder="e.g. 620"
              rate={config?.thbToLakRate}
              updatedAt={config?.updatedAt}
              rateInput={thbRateInput}
              onChangeRateInput={t => { setThbRateInput(t); setThbSaveError(null); }}
              editing={thbEditing}
              onStartEdit={() => { setThbEditing(true); setThbSaved(false); setThbRateInput(String(config?.thbToLakRate ?? '')); }}
              onCancelEdit={() => { setThbEditing(false); setThbSaveError(null); }}
              onSave={handleSaveThbRate}
              saving={thbSaving}
              saveError={thbSaveError}
              saved={thbSaved}
              successMessage="THB rate updated."
            />
          </View>
        )}

        {!loading && (
          <View style={s.thbSection}>
            <Text style={s.sectionLabel}>VAT</Text>
            <View style={s.vatToggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.vatToggleTitle}>Show VAT on prices and receipts</Text>
                <Text style={s.updatedNote}>
                  Off: plain totals everywhere (booking, receipts, PDF, emails). On: {config?.vatPercent ?? DEFAULT_VAT_PERCENT}% VAT breakdown.
                </Text>
              </View>
              <Switch
                value={config?.showVat === true}
                onValueChange={toggleShowVat}
                disabled={showVatSaving}
                trackColor={{ false: COLORS.softGray200, true: COLORS.amber }}
                thumbColor={COLORS.white}
              />
            </View>
            {showVatError && <Text style={s.vatToggleError}>{showVatError}</Text>}
            <RateEditor
              displayLabel="VAT rate"
              placeholder="e.g. 10"
              rate={config?.vatPercent}
              unit="percent"
              updatedAt={config?.updatedAt}
              rateInput={vatRateInput}
              onChangeRateInput={t => { setVatRateInput(t); setVatSaveError(null); }}
              editing={vatEditing}
              onStartEdit={() => { setVatEditing(true); setVatSaved(false); setVatRateInput(String(config?.vatPercent ?? DEFAULT_VAT_PERCENT)); }}
              onCancelEdit={() => { setVatEditing(false); setVatSaveError(null); }}
              onSave={handleSaveVatRate}
              saving={vatSaving}
              saveError={vatSaveError}
              saved={vatSaved}
              successMessage="VAT rate updated."
            />
            {config?.vatPercent == null && (
              <Text style={s.updatedNote}>
                Not set yet — a {DEFAULT_VAT_PERCENT}% placeholder is used when VAT is shown.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.porcelain },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.softGray200,
  },
  headerTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.3,
  },

  content: { paddingHorizontal: 20, paddingTop: 24 },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.amberTint,
    borderRadius: 10, padding: 12, marginBottom: 20,
  },
  infoText: { flex: 1, fontSize: 12, fontWeight: '500', color: COLORS.fg2, lineHeight: 17 },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.4,
    color: COLORS.fg3, marginBottom: 8,
  },
  thbSection: {
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
  },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.carbon, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: '500', color: COLORS.carbon,
    marginBottom: 12,
  },

  errBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginBottom: 12,
  },
  errText: { flex: 1, fontSize: 12, fontWeight: '500', color: COLORS.danger, lineHeight: 17 },

  successBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#D1FAE5', borderRadius: 10, padding: 12, marginTop: 16, marginBottom: 4,
  },
  successText: { flex: 1, fontSize: 12, fontWeight: '500', color: '#065F46', lineHeight: 17 },

  primaryBtn: {
    height: 50, borderRadius: 14,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.carbon },

  rateDisplay: { fontSize: 22, fontWeight: '800', color: COLORS.carbon, letterSpacing: -0.4 },
  updatedNote: { fontSize: 12, fontWeight: '500', color: COLORS.fg3, marginTop: 4 },
  vatToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.softGray200,
    borderRadius: 12, padding: 14, marginBottom: 12,
  },
  vatToggleTitle: { fontSize: 14, fontWeight: '700', color: COLORS.carbon },
  vatToggleError: { fontSize: 12, fontWeight: '500', color: COLORS.danger, marginBottom: 8 },

  confirmBox: {
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14, gap: 12,
    borderWidth: 1, borderColor: '#FCA5A5', marginTop: 4,
  },
  confirmText: { fontSize: 13, fontWeight: '500', color: COLORS.carbon, lineHeight: 18 },
  confirmBtnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  keepBtn: {
    flex: 1, height: 42, borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.softGray200,
    alignItems: 'center', justifyContent: 'center',
  },
  keepBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.fg2 },
  confirmBtn: {
    flex: 1, height: 42, borderRadius: 8,
    backgroundColor: COLORS.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  saveBtn: {
    flex: 1, height: 42, borderRadius: 8,
    backgroundColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.carbon },
});
