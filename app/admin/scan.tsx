// Camera scanning is fully reliable in an EAS/development build.
// In Expo Go, barcode scanning may be limited or unavailable — use an EAS build for testing.

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import BackButton from '@/components/BackButton';
import {
  getReservationById,
  getReservationsByOrderId,
  type RentalDoc,
  type ReservationStatus,
} from '@/lib/firestore';
import { STATUS_CONFIG } from '@/app/admin/reservations';
import { StatusBar } from 'expo-status-bar';

// ── Constants ─────────────────────────────────────────────────────────────────

const RETICLE_SIZE = 260;
const CORNER_LEN   = 24;
const CORNER_W     = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanPhase = 'scanning' | 'loading' | 'error' | 'order-result';

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminScanScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();

  const [permission, requestPermission] = useCameraPermissions();
  const [phase,      setPhase]          = useState<ScanPhase>('scanning');
  const [scanError,  setScanError]      = useState<string | null>(null);
  const [orderItems, setOrderItems]     = useState<RentalDoc[]>([]);
  const scannedRef = useRef(false);

  // Derived mask geometry
  const sideW     = (SCREEN_W - RETICLE_SIZE) / 2;
  const reticleTop = Math.round((SCREEN_H - RETICLE_SIZE) / 2);

  // Reset to scanning state each time the screen gains focus
  useFocusEffect(
    useCallback(() => {
      scannedRef.current = false;
      setPhase('scanning');
      setScanError(null);
      setOrderItems([]);
    }, []),
  );

  const handleScan = useCallback(
    async (result: BarcodeScanningResult) => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      setScanError(null);

      const data = result.data;
      const orderMatch = data.match(/^LANCHAI-ORDER:(.+)$/);
      const resMatch   = data.match(/^LANCHAI-RES:(.+)$/);

      const showError = (msg: string) => {
        setScanError(msg);
        setPhase('error');
        setTimeout(() => {
          scannedRef.current = false;
          setScanError(null);
          setPhase('scanning');
        }, 2500);
      };

      if (orderMatch) {
        const orderId = orderMatch[1];
        setPhase('loading');
        try {
          const items = await getReservationsByOrderId(orderId);
          if (items.length === 0) {
            showError('Order not found');
            return;
          }
          if (items.length === 1) {
            router.push(`/admin/reservations/${items[0].id}`);
          } else {
            setOrderItems(items);
            setPhase('order-result');
          }
        } catch {
          showError('Order not found');
        }
      } else if (resMatch) {
        const resId = resMatch[1];
        setPhase('loading');
        try {
          const res = await getReservationById(resId);
          if (!res) {
            showError('Reservation not found');
            return;
          }
          router.push(`/admin/reservations/${resId}`);
        } catch {
          showError('Reservation not found');
        }
      } else {
        showError('Not a LANCHAI code');
      }
    },
    [router],
  );

  // ── Permission — not yet determined (null) ────────────────────────────────

  if (!permission) {
    return (
      <View style={[s.permScreen, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <TouchableOpacity style={s.permBack} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={18} color={COLORS.carbon} />
        </TouchableOpacity>
        <ActivityIndicator color={COLORS.amber} style={{ marginTop: 40 }} />
      </View>
    );
  }

  // ── Permission — not granted ──────────────────────────────────────────────

  if (!permission.granted) {
    const isDenied = permission.status === 'denied';
    return (
      <View style={[s.permScreen, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <TouchableOpacity style={s.permBack} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={18} color={COLORS.carbon} />
        </TouchableOpacity>
        <View style={s.permContent}>
          <View style={s.permIconBox}>
            <Feather name="camera-off" size={32} color={COLORS.fg3} />
          </View>
          <Text style={s.permTitle}>
            {isDenied ? 'Camera access denied' : 'Camera access needed'}
          </Text>
          <Text style={s.permBody}>
            {isDenied
              ? 'Open Settings and allow camera access for LANCHAI to scan QR codes.'
              : 'LANCHAI needs camera access to scan rental QR codes at pickup.'}
          </Text>
          <TouchableOpacity
            style={s.permBtn}
            onPress={isDenied ? () => Linking.openSettings() : requestPermission}
            activeOpacity={0.85}
          >
            <Text style={s.permBtnText}>{isDenied ? 'Open settings' : 'Allow camera'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Camera + overlay ──────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Live camera feed — onBarcodeScanned disabled once a scan is in progress */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={phase === 'scanning' ? handleScan : undefined}
      />

      {/* ── Dim mask — 4 panels around the reticle (non-interactive) ─────── */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <View style={[s.mask, { top: 0, left: 0, right: 0, height: reticleTop }]} />
        <View style={[s.mask, {
          top: reticleTop, height: RETICLE_SIZE,
          left: 0, width: sideW,
        }]} />
        <View style={[s.mask, {
          top: reticleTop, height: RETICLE_SIZE,
          right: 0, width: sideW,
        }]} />
        <View style={[s.mask, {
          top: reticleTop + RETICLE_SIZE, left: 0, right: 0, bottom: 0,
        }]} />

        {/* Corner brackets */}
        <View style={{
          position: 'absolute',
          top: reticleTop, left: sideW,
          width: RETICLE_SIZE, height: RETICLE_SIZE,
        }}>
          <View style={[s.corner, s.cornerTL]} />
          <View style={[s.corner, s.cornerTR]} />
          <View style={[s.corner, s.cornerBL]} />
          <View style={[s.corner, s.cornerBR]} />
        </View>
      </View>

      {/* Instruction text — below reticle */}
      {phase === 'scanning' && (
        <Text style={[s.instruction, { top: reticleTop + RETICLE_SIZE + 20 }]}>
          Scan a LANCHAI QR code
        </Text>
      )}

      {/* Back button */}
      <BackButton
        onPress={() => router.back()}
        variant="bare"
        size={20}
        color={COLORS.white}
        style={[s.backBtn, { top: insets.top + 12 }]}
      />

      {/* Loading overlay */}
      {phase === 'loading' && (
        <View style={s.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={COLORS.amber} size="large" />
        </View>
      )}

      {/* Error banner */}
      {phase === 'error' && scanError && (
        <View style={[s.errorBanner, { bottom: insets.bottom + 32 }]} pointerEvents="none">
          <Feather name="alert-circle" size={14} color={COLORS.white} />
          <Text style={s.errorText}>{scanError}</Text>
        </View>
      )}

      {/* ── Order result overlay (multi-item order) ───────────────────────── */}
      {phase === 'order-result' && (
        <View style={[s.resultOverlay, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.resultCard}>
            <View style={s.resultHeader}>
              <View style={s.resultHeaderLeft}>
                <Text style={s.resultTitle}>Order · {orderItems.length} items</Text>
                {orderItems[0]?.renterName ? (
                  <Text style={s.resultRenter}>{orderItems[0].renterName}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={s.resultCloseBtn}
                onPress={() => {
                  scannedRef.current = false;
                  setPhase('scanning');
                  setOrderItems([]);
                }}
                activeOpacity={0.75}
              >
                <Feather name="x" size={16} color={COLORS.fg3} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={s.resultList}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {orderItems.map((item, i) => {
                const badge = STATUS_CONFIG[item.status as ReservationStatus]
                  ?? STATUS_CONFIG.pending_payment;
                return (
                  <React.Fragment key={item.id}>
                    {i > 0 && <View style={s.resultSep} />}
                    <TouchableOpacity
                      style={s.resultItem}
                      onPress={() => router.push(`/admin/reservations/${item.id}`)}
                      activeOpacity={0.75}
                    >
                      <View style={s.resultItemMain}>
                        <Text style={s.resultItemName} numberOfLines={1}>{item.productName}</Text>
                        <Text style={s.resultItemDates} numberOfLines={1}>
                          {item.pickupLabel} → {item.returnLabel}
                        </Text>
                      </View>
                      <View style={[s.resultStatusChip, { backgroundColor: badge.bg }]}>
                        <Text style={[s.resultStatusText, { color: badge.fg }]}>{badge.label}</Text>
                      </View>
                      <Feather name="chevron-right" size={15} color={COLORS.fg3} />
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={s.scanAgainBtn}
              onPress={() => {
                scannedRef.current = false;
                setPhase('scanning');
                setOrderItems([]);
              }}
              activeOpacity={0.85}
            >
              <Feather name="maximize" size={15} color={COLORS.carbon} />
              <Text style={s.scanAgainText}>Scan another</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.carbon,
  },

  // Dim mask panels (absolutely positioned, non-interactive)
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },

  // Corner bracket components
  corner: {
    position: 'absolute',
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderColor: COLORS.white,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderBottomRightRadius: 4 },

  // Back button (overlaid on camera)
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Instruction text
  instruction: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    letterSpacing: 0.2,
  },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Error banner
  errorBanner: {
    position: 'absolute',
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.carbon,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },

  // ── Order result overlay ──────────────────────────────────────────────────
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  resultCard: {
    backgroundColor: COLORS.porcelain,
    borderRadius: 24,
    overflow: 'hidden',
    maxHeight: '70%',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softGray200,
    gap: 12,
  },
  resultHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.3,
  },
  resultRenter: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  resultCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  resultList: {
    flexShrink: 1,
  },
  resultSep: {
    height: 1,
    backgroundColor: COLORS.softGray200,
    marginLeft: 20,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  resultItemMain: {
    flex: 1,
    gap: 3,
  },
  resultItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.carbon,
    letterSpacing: -0.1,
  },
  resultItemDates: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
  },
  resultStatusChip: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  resultStatusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  scanAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 20,
    height: 48,
    backgroundColor: COLORS.amber,
    borderRadius: 14,
  },
  scanAgainText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.carbon,
  },

  // ── Permission screen ─────────────────────────────────────────────────────
  permScreen: {
    flex: 1,
    backgroundColor: COLORS.porcelain,
  },
  permBack: {
    margin: 16,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.warmBeige,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
    marginBottom: 60,
  },
  permIconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  permTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.carbon,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  permBody: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.fg2,
    lineHeight: 21,
    textAlign: 'center',
  },
  permBtn: {
    height: 52,
    paddingHorizontal: 28,
    backgroundColor: COLORS.amber,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  permBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.carbon,
  },
});
