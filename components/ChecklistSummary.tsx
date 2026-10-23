import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Timestamp } from 'firebase/firestore';
import { COLORS } from '@/constants/Colors';
import { CHECKLIST_CATEGORIES, type ChecklistData, type ChecklistRating } from '@/lib/firestore';

export const RATING_LABELS: Record<ChecklistRating, string> = {
  good:     'Good',
  fair:     'Fair',
  damaged:  'Damaged',
  unusable: 'Unusable',
};

// Existing COLORS tokens — success (green), amber, danger (red), carbon (near-black, for
// the most severe "Unusable" tier — distinct from the other three, reuses the app's own
// brand-dark color rather than introducing a new one). Amber/carbon get dark-on-light or
// white text for contrast as appropriate; success/danger get white text.
// Shared between this read-only summary and the interactive checklist.tsx pill selector.
export const RATING_STYLE: Record<ChecklistRating, { bg: string; text: string }> = {
  good:     { bg: COLORS.success, text: COLORS.white },
  fair:     { bg: COLORS.amber,   text: COLORS.carbon },
  damaged:  { bg: COLORS.danger,  text: COLORS.white },
  unusable: { bg: COLORS.carbon,  text: COLORS.white },
};

function fmtDateTime(ts: Timestamp | undefined): string {
  if (!ts) return '—';
  try {
    return ts.toDate().toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function ChecklistSummary({
  checklist,
  title,
  showStaffName,
  audience = 'staff',
  defaultOpen = false,
}: {
  checklist: ChecklistData;
  title: string;
  showStaffName?: boolean;
  /** 'renter': never shows a name (staff or the free-typed client name) — the client
   *  confirmation reads "Confirmed by you on {date}". */
  audience?: 'staff' | 'renter';
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const renter = audience === 'renter';

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={() => setOpen(v => !v)} activeOpacity={0.75}>
        <Text style={s.title}>{title}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.fg2} />
      </TouchableOpacity>

      {open && (
        <View style={s.body}>
          {CHECKLIST_CATEGORIES.map(cat => {
            const entry = checklist.categories[cat.id];
            if (!entry) return null;
            const ratingStyle = RATING_STYLE[entry.rating];
            return (
              <View key={cat.id} style={s.categoryRow}>
                <View style={s.categoryHeader}>
                  <Text style={s.categoryLabel}>{cat.label}</Text>
                  <View style={[s.pill, { backgroundColor: ratingStyle.bg }]}>
                    <Text style={[s.pillText, { color: ratingStyle.text }]}>
                      {RATING_LABELS[entry.rating]}
                    </Text>
                  </View>
                </View>
                {!!entry.note && <Text style={s.noteText}>{entry.note}</Text>}
              </View>
            );
          })}

          {checklist.photos.length > 0 && (
            <View style={s.photoRow}>
              {checklist.photos.map(url => (
                <Image key={url} source={{ uri: url }} style={s.photoThumb} />
              ))}
            </View>
          )}

          <View style={s.confirmBlock}>
            {checklist.depositAmount != null && (
              <View style={s.confirmRow}>
                <Feather name="credit-card" size={13} color={COLORS.fg3} />
                <Text style={s.confirmText}>
                  Deposit: {checklist.depositAmount.toLocaleString('en-US')} {checklist.depositCurrency}
                </Text>
              </View>
            )}
            {showStaffName && !renter && (
              <View style={s.confirmRow}>
                <Feather name="user" size={13} color={COLORS.fg3} />
                <Text style={s.confirmText}>Confirmed by {checklist.confirmedByName}</Text>
              </View>
            )}
            {!renter && (
              <View style={s.confirmRow}>
                <Feather name="clock" size={13} color={COLORS.fg3} />
                <Text style={s.confirmText}>{fmtDateTime(checklist.confirmedAt)}</Text>
              </View>
            )}
            <View style={s.confirmRow}>
              <Feather
                name={checklist.clientConfirmed ? 'check-circle' : 'x-circle'}
                size={13}
                color={checklist.clientConfirmed ? COLORS.success : COLORS.fg3}
              />
              <Text style={s.confirmText}>
                {renter
                  ? (checklist.clientConfirmed
                    ? `Confirmed by you on ${fmtDateTime(checklist.confirmedAt)}`
                    : `Recorded on ${fmtDateTime(checklist.confirmedAt)}`)
                  : checklist.clientConfirmed
                    ? `Confirmed by client — ${checklist.clientConfirmedByName}`
                    : 'Not confirmed by client'}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.softGray200,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: {
    marginTop: 12,
    gap: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.carbon,
  },
  categoryRow: {
    gap: 4,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.carbon,
    flex: 1,
  },
  pill: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  noteText: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.fg3,
    lineHeight: 17,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: COLORS.softGray200,
  },
  confirmBlock: {
    borderTopWidth: 1,
    borderTopColor: COLORS.softGray200,
    paddingTop: 10,
    marginTop: 4,
    gap: 6,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.fg3,
  },
});
