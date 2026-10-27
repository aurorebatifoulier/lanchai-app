import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SHADES } from '@/constants/brandShades';
import { SectionTitle, UI, useScreenInsets, CategoryBadge } from '@/components/account/ui';
import { ACCOUNT_COPY } from '@/constants/accountCopy';
import { CATEGORIES } from '@/lib/mockData';
import type { StickerUnlock } from '@/lib/accountStats';

// "Your stickers" (validated mockup): one round sticker per category with a RETURNED
// rental, slightly rotated, in its category's shades, then ONE locked sticker
// for the next category not rented yet. Hidden for renters with no returned rental.
// Copy lives in constants/accountCopy.ts.
const ROTATIONS = ['-6deg', '4deg', '-3deg', '6deg', '-5deg', '3deg'];

// Same look as the Home categories and the header bubbles (constants/categoryStyle.ts).
function StickerBadge({ cat, index, size = 70 }: { cat: string; index: number; size?: number }) {
  return <CategoryBadge cat={cat} size={size} rotate={ROTATIONS[index % ROTATIONS.length]} />;
}

const categoryName = (cat: string) => CATEGORIES.find(c => c.id === cat)?.name ?? cat;
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Tap a sticker: unlocked → bottom sheet (sticker, name, "Unlocked with {product},
// {date}", amber "Browse {category}"); locked → that category page directly.
export function AccountStickers({ stickers, next, unlocks }: { stickers: string[]; next: string | null; unlocks: Record<string, StickerUnlock> }) {
  const router = useRouter();
  const screen = useScreenInsets();
  const [open, setOpen] = useState<string | null>(null);
  if (stickers.length === 0) return null;
  const nextName = next ? categoryName(next) : null;
  const openIndex = open ? stickers.indexOf(open) : -1;
  const unlock = open ? unlocks[open] : undefined;
  const browse = (cat: string) => { setOpen(null); router.push(`/category/${cat}`); };

  return (
    <View>
      <SectionTitle>{ACCOUNT_COPY.stickersTitle}</SectionTitle>
      <View style={s.grid}>
        {stickers.map((cat, i) => (
          <TouchableOpacity key={cat} style={s.item} onPress={() => setOpen(cat)} activeOpacity={0.75}>
            <StickerBadge cat={cat} index={i} />
            <Text style={s.label}>{ACCOUNT_COPY.stickerNames[cat] ?? cat}</Text>
          </TouchableOpacity>
        ))}
        {next && nextName && (
          <TouchableOpacity style={s.item} onPress={() => router.push(`/category/${next}`)} activeOpacity={0.75}>
            <View style={[s.sticker, s.locked]}><Text style={s.q}>?</Text></View>
            <Text style={[s.label, s.lockedLabel]}>{ACCOUNT_COPY.stickerLocked(nextName)}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)} statusBarTranslucent>
        <Pressable style={s.overlay} onPress={() => setOpen(null)}>
          {open && (
            <Pressable style={[s.sheet, { paddingBottom: screen.bottom + 20 }]} onPress={() => {}}>
              <View style={s.handle} />
              <StickerBadge cat={open} index={Math.max(0, openIndex)} size={96} />
              <Text style={s.sheetTitle}>{ACCOUNT_COPY.stickerNames[open] ?? open}</Text>
              {unlock && (
                <Text style={[UI.body, s.sheetSub]}>{ACCOUNT_COPY.stickerUnlockedWith(unlock.productName, fmtDate(unlock.atMs))}</Text>
              )}
              <TouchableOpacity style={[UI.btnPrimary, s.sheetBtn]} onPress={() => browse(open)} activeOpacity={0.85}>
                <Text style={UI.btnPrimaryText}>{ACCOUNT_COPY.stickerBrowse(categoryName(open))}</Text>
              </TouchableOpacity>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  item: { width: '25%', alignItems: 'center' },
  sticker: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  locked: { borderWidth: 2, borderStyle: 'dashed', borderColor: SHADES.carbonFaint, backgroundColor: 'transparent' },
  q: { fontSize: 24, fontWeight: '600', color: SHADES.carbonFaint },
  label: { fontSize: 12.5, fontWeight: '600', color: SHADES.carbon, textAlign: 'center', marginTop: 8, paddingHorizontal: 2, lineHeight: 16 },
  lockedLabel: { color: SHADES.carbonMuted, fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: SHADES.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10, alignItems: 'center',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: SHADES.border, marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: SHADES.carbon, marginTop: 16, textAlign: 'center' },
  sheetSub: { textAlign: 'center', marginTop: 6 },
  sheetBtn: { alignSelf: 'stretch', marginTop: 20 },
});
