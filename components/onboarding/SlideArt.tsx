import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  useSharedValue, withRepeat, withTiming, Easing, ReduceMotion, cancelAnimation, type SharedValue,
} from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SHADES } from '@/constants/brandShades';
import { ONBOARDING_COPY as c } from '@/constants/onboardingCopy';
import CountUpText from '@/components/CountUpText';
import type { OnboardingSlide } from '@/lib/onboardingContent';
import {
  PhotoCard, Sticker, SpotSticker, Chip, Heartbeat, Sparkle, chipTextStyle, useRunning, useEntryGate, LAYER,
} from '@/components/onboarding/Parts';

// The animated middle of each onboarding slide, laid out on the visual area (w × h, ~16%
// → 58% of the screen, set by the screen). Each slide computes its group's real bounding
// box (cards + stickers) from the card width, picks the biggest card width that fits the
// height (within its width rule) and CENTRES the group vertically and horizontally.

/** Breathing room kept above and below the group inside the visual area. */
const BOTTOM_GAP = 8;
/** Top of a group of height `g` centred in an `h` box. */
const groupTop = (h: number, g: number) => Math.max(0, (h - g) / 2);

interface ArtProps {
  slide: OnboardingSlide;
  active: boolean;
  w: number;
  h: number;
  scrollX: SharedValue<number>;
  page: number;
  pageW: number;
}

/** Half-extents of a cw × ch frame rotated by `deg` (its rotated bounding box). */
function rotatedHalf(cw: number, ch: number, deg: number) {
  const r = (Math.abs(deg) * Math.PI) / 180;
  return { hw: (cw * Math.cos(r) + ch * Math.sin(r)) / 2, hh: (cw * Math.sin(r) + ch * Math.cos(r)) / 2 };
}

const CHIP_H = 32;   // a chip's height (text 13, padding 7 × 12)
/** Extra room so two stacked chips never touch while animating: bob 3 px + pop 1.1× (~2 px each side). */
const CHIP_MOTION = 3 + 4;
const CLEAR = 10;    // clearance under a rotated frame

/**
 * Slide 1 layout from the ROTATED bounding boxes (unchanged card positions): price chip
 * under the speaker card, right-aligned with it; "Used twice a year?" under the tent card,
 * left-aligned with it and a bit lower (staggered, never on one line). Both ≥ 10 px below
 * the frames. The card width is the biggest that fits the whole group in the visual area.
 */
function slide1Layout(w: number, h: number, hasPrice: boolean) {
  const HEART = 22;
  const geo = (cw: number) => {
    const ch = cw * 1.32;
    const tent = rotatedHalf(cw, ch, 8);
    const spk = rotatedHalf(cw, ch, 6);
    const top = HEART;                                  // right card top, group-relative
    const tentLeft = w * 0.5 - cw * 1.02; const tentTop = top + cw * 0.08;
    const spkLeft = w * 0.5 + cw * 0.02;
    const tentCx = tentLeft + cw / 2; const tentCy = tentTop + ch / 2;
    const spkCx = spkLeft + cw / 2; const spkCy = top + ch / 2;
    const priceTop = spkCy + spk.hh + CLEAR;
    // Fully BELOW the price chip (8 px + animation room), never on the same line.
    const amberTop = Math.max(tentCy + tent.hh + CLEAR, hasPrice ? priceTop + CHIP_H + 8 + CHIP_MOTION : 0);
    return {
      ch, tentLeft, tentTop, spkLeft, top,
      priceTop, priceRight: w - (spkCx + spk.hw),
      amberTop, amberLeft: Math.max(0, tentCx - tent.hw),
      bottom: amberTop + CHIP_H,
    };
  };
  // Group height is linear in cw: solve for the biggest cw that fits (within 44% of w).
  const g100 = geo(100).bottom; const g200 = geo(200).bottom;
  const slope = (g200 - g100) / 100; const base = g100 - slope * 100;
  const cw = Math.max(70, Math.min(w * 0.44, (h - base) / slope));
  const L = geo(cw);
  const dy = Math.max(0, (h - L.bottom) / 2); // centred (the heart sits above the cards, so their float has room)
  return { cw, ...L, dy };
}

export function Slide1Art({ slide, active, w, h, scrollX, page, pageW, priceLak }: ArtProps & { priceLak: number | null }) {
  const L = slide1Layout(w, h, priceLak != null);
  const { cw } = L;
  const top = L.top + L.dy;
  const par = { scrollX, page, pageW };
  // Count-up restarts each time the slide becomes active (new id = new count).
  const [run, setRun] = useState(0);
  useEffect(() => { if (active) setRun(n => n + 1); }, [active]);
  return (
    <View style={{ width: w, height: h }}>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-8} active={active} from="left" {...par}
        style={{ left: L.tentLeft, top: L.tentTop + L.dy }} />
      <PhotoCard source={slide.photos[1]} width={cw} rotate={6} delay={600} active={active} from="right" {...par}
        style={{ left: L.spkLeft, top }} />
      <Sticker active={active} delay={0} hold={3400} wait={1600} style={{ left: Math.max(0, w * 0.5 - cw * 1.12), top: top - 22 }}>
        <Heartbeat active={active}>
          <View style={s.heart}><MaterialCommunityIcons name="heart" size={22} color={SHADES.amber} /></View>
        </Heartbeat>
      </Sticker>
      {priceLak != null && (
        <Sticker active={active} delay={400} hold={3000} wait={1200} style={{ right: L.priceRight, top: L.priceTop + L.dy }}>
          <Chip tone="carbon" text={
            <CountUpText
              id={`onb-price-${run}`}
              value={priceLak}
              format={v => c.priceChip((Math.round(v / 1000) * 1000).toLocaleString('en-US'))}
              style={chipTextStyle('carbon')}
            />
          } />
        </Sticker>
      )}
      <Sticker active={active} delay={1000} hold={2600} wait={1800} style={{ left: L.amberLeft, top: L.amberTop + L.dy }}>
        <Chip tone="light" text={slide.stickers.chip} />
      </Sticker>
    </View>
  );
}

/**
 * Slide 2 — step-by-step story (validated mockup): three LARGE cards (~29% of the screen
 * width each) close together (gap ~2.5%), Book top-left (−7°), Pick up in the centre a
 * little lower (+30% of a card height, +2°), Bring back top-right (+7°). No trajectory, no
 * hexagon: a spotlight loop (6 s) tells the story — exactly ONE card fully opaque at any
 * time (cross-fades sum to 1): focused 1.06 in front, others 0.96 at ~55%. One caption
 * chip (slide 1 chip size) at ONE centred spot under Pick up, one at a time, after the
 * cards' entry. Reduce motion: no loop, cards normal, only the QR caption.
 */
const CYCLE_MS = 6000;
const B1 = 1 / 3; const B2 = 2 / 3; const XR = 0.025; // ~150 ms either side of a hand-over
// Card focus: cross-fades that always sum to 1 (one card fully lit at any time).
const FOCUS = [
  { inputs: [0, B1 - XR, B1 + XR, 1 - XR, 1], outputs: [1, 1, 0, 0, 1] },
  { inputs: [0, B1 - XR, B1 + XR, B2 - XR, B2 + XR, 1], outputs: [0, 0, 1, 1, 0, 0] },
  { inputs: [0, B2 - XR, B2 + XR, 1 - XR, 1], outputs: [0, 0, 1, 1, 0] },
];
// Captions: one pops out (~240 ms) before the next pops in — never two at once.
const CAPTION = [
  { inputs: [0, 0.03, 0.07, B1 - 0.05, B1 - 0.01, 1], outputs: [0, 0, 1, 1, 0, 0] },
  { inputs: [0, B1 + 0.01, B1 + 0.05, B2 - 0.05, B2 - 0.01, 1], outputs: [0, 0, 1, 1, 0, 0] },
  { inputs: [0, B2 + 0.01, B2 + 0.05, 1 - 0.05, 1 - 0.01, 1], outputs: [0, 0, 1, 1, 0, 0] },
];

/** Slide 2 geometry: the biggest card width (≤ 29% of the screen) whose group fits h. */
function slide2Layout(h: number, pageW: number) {
  const LABEL_H = 30; const BADGE = 10; const DROP = 0.3; const FOCUSED = 1.06;
  const geo = (cwx: number) => {
    const chx = cwx * 1.32 + LABEL_H;
    const side = rotatedHalf(cwx, chx, 7).hh * FOCUSED;       // Book / Bring back half-height
    const mid = rotatedHalf(cwx, chx, 2).hh * FOCUSED;        // Pick up half-height
    const topSide = BADGE + Math.max(0, side - chx / 2);      // room for badge + tilt
    const pickTop = topSide + chx * DROP;
    const captionTop = pickTop + chx / 2 + mid + CLEAR;
    return { chx, topSide, pickTop, captionTop, bottom: captionTop + CHIP_H + CHIP_MOTION };
  };
  const g100 = geo(100).bottom; const g200 = geo(200).bottom;
  const slope = (g200 - g100) / 100; const base = g100 - slope * 100;
  const cw = Math.max(70, Math.min(pageW * 0.29, (h - base) / slope));
  const G = geo(cw);
  const dy = Math.max(0, (h - G.bottom) / 2);
  return { cw, G, dy };
}

export function Slide2Art({ slide, active, w, h, scrollX, page, pageW }: ArtProps) {
  const { running, reduce } = useRunning(active);
  const gate = useEntryGate(active);
  const { cw, G, dy } = slide2Layout(h, pageW);
  const gap = pageW * 0.025;
  const x0 = (w - (3 * cw + 2 * gap)) / 2; // may reach slightly into the side padding
  const cards = [
    { x: x0, y: G.topSide + dy, rot: -7 },
    { x: x0 + cw + gap, y: G.pickTop + dy, rot: 2 },
    { x: x0 + 2 * (cw + gap), y: G.topSide + dy, rot: 7 },
  ];
  const captionTop = G.captionTop + dy;

  const t = useSharedValue(0);
  useEffect(() => {
    if (!running) { cancelAnimation(t); t.value = 0; return; }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false);
  }, [running, t]);
  const par = { scrollX, page, pageW };
  const spot = (i: number) => (reduce ? undefined : { t, ...FOCUS[i] });
  const label = (x: string) => x.replace(/^\d+\s*·\s*/, ''); // old "1 · Book" texts
  const qrChip = (
    <Chip tone="light" text={slide.stickers.place} icon={<MaterialCommunityIcons name="qrcode-scan" size={14} color={SHADES.amberDeep} />} />
  );
  const captions = [
    <Chip key="1" tone="carbon" text={slide.stickers.booked} icon={<MaterialCommunityIcons name="calendar-check" size={14} color={SHADES.amber} />} />,
    <React.Fragment key="2">{qrChip}</React.Fragment>,
    <Chip key="3" tone="amber" text={slide.stickers.points} icon={<MaterialCommunityIcons name="star" size={14} color={SHADES.carbon} />} />,
  ];

  return (
    <View style={{ width: w, height: h }}>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={cards[0].rot} badge={1} label={label(slide.stickers.step1)} active={active} from="left" spot={spot(0)} {...par}
        style={[s.soft, { left: cards[0].x, top: cards[0].y }]} />
      <PhotoCard source={slide.photos[2]} width={cw} rotate={cards[2].rot} delay={800} badge={3} label={label(slide.stickers.step3)} active={active} from="right" spot={spot(2)} {...par}
        style={[s.soft, { left: cards[2].x, top: cards[2].y }]} />
      <PhotoCard source={slide.photos[1]} width={cw} rotate={cards[1].rot} delay={400} dark badge={2} label={label(slide.stickers.step2)} active={active} from="left" spot={spot(1)} {...par}
        style={[s.soft, { left: cards[1].x, top: cards[1].y }]} />
      {reduce ? (
        active ? <View style={[s.stickerRow, { top: captionTop }]} pointerEvents="none">{qrChip}</View> : null
      ) : (
        captions.map((chip, i) => (
          <SpotSticker key={i} t={t} gate={gate} {...CAPTION[i]} style={[s.stickerRow, { top: captionTop }]}>
            {chip}
          </SpotSticker>
        ))
      )}
    </View>
  );
}

/** Slide 3 geometry: card + the deposit chip overhanging its bottom (OVER), centred. */
const OVER = 26;
function slide3Layout(w: number, h: number) {
  const cw = Math.max(90, Math.min(w * 0.52, (h - 2 * BOTTOM_GAP - OVER) / 1.32));
  const ch = cw * 1.32;
  return { cw, ch, top: groupTop(h, ch + OVER) };
}

/**
 * Lowest point of slide `i`'s visual group inside its h-high area (card or sticker,
 * animation room included) — the screen spaces the text from it. Slide 1 always reserves
 * the price chip (it arrives asynchronously) so the title never jumps.
 */
export function artGroupBottom(i: number, w: number, h: number, pageW: number): number {
  if (i === 0) { const L = slide1Layout(w, h, true); return L.bottom + L.dy; }
  if (i === 1) { const { G, dy } = slide2Layout(h, pageW); return G.bottom + dy; }
  const L = slide3Layout(w, h);
  return L.top + L.ch + OVER;
}

export function Slide3Art({ slide, active, w, h, scrollX, page, pageW }: ArtProps) {
  const { cw, ch, top } = slide3Layout(w, h);
  const left = (w - cw) / 2;
  return (
    <View style={{ width: w, height: h }}>
      <PhotoCard source={slide.photos[0]} width={cw} rotate={-2} active={active} from="right" scrollX={scrollX} page={page} pageW={pageW}
        style={{ left, top }} />
      <Sparkle active={active} delay={200} style={{ left: left - 24, top: top + ch * 0.35 }} />
      <Sparkle active={active} delay={900} size={12} style={{ left: left + cw + 8, top: top + 6 }} />
      <Sparkle active={active} delay={1500} size={18} style={{ left: left + cw + 14, top: top + ch * 0.74 }} />
      <Sparkle active={active} delay={2200} size={11} style={{ left: left + cw * 0.15, top: top - 16 }} />
      <Sticker active={active} delay={200} hold={3400} wait={1300} style={{ left: Math.max(0, left - cw * 0.28), top: top + ch * 0.12 }}>
        <Chip tone="amber" text={slide.stickers.checked} icon={<Feather name="check" size={16} color={SHADES.carbon} />} />
      </Sticker>
      <Sticker active={active} delay={1000} hold={2800} wait={1700} style={{ right: Math.max(0, w - left - cw - cw * 0.3), top: top + ch * 0.5 }}>
        <Chip tone="dark" text={slide.stickers.clean} icon={<MaterialCommunityIcons name="creation" size={16} color={SHADES.amber} />} />
      </Sticker>
      <Sticker active={active} delay={1700} hold={3000} wait={1500} style={{ left: 0, right: 0, top: top + ch - 16, alignItems: 'center' }}>
        <Chip tone="light" text={slide.stickers.deposit} />
      </Sticker>
    </View>
  );
}

const s = StyleSheet.create({
  heart: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: SHADES.white, alignItems: 'center', justifyContent: 'center',
    shadowColor: SHADES.carbon, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  stickerRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', ...LAYER.sticker },
  // Softer shadow on the step cards.
  soft: { shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
});
