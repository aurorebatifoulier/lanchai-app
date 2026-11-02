import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { ImageSourcePropType } from 'react-native';
import { db, storage } from './firebase';
import { getProducts } from './firestore';
import { cached, HOME_TTL } from './homeCache';
import { getExchangeRate } from './exchangeRate';
import { getMinPrice } from '@/utils/pricing';
import { toLak } from '@/utils/currency';
import { ONBOARDING_DEFAULT_TEXTS, ONBOARDING_PHOTO_SLOTS } from '@/constants/onboardingCopy';

// Onboarding "living cards" (first launch, once per device). Content in config/onboarding
// (version 2, Admin → Onboarding): per slide a title ([brackets] = highlighted words), a
// sub-line, sticker texts and photo slots (2 / 3 / 1, 4:5). Anything empty falls back to
// the defaults (constants/onboardingCopy.ts + bundled royalty-free photos,
// assets/images/onboarding/CREDITS.md). Readable through the config/* rule (guests are an
// anonymous session).

export interface OnboardingPhotoDoc { url?: string | null; path?: string | null }
export interface OnboardingSlideDoc {
  title?: string;
  sub?: string;
  stickers?: Record<string, string>;
  photos?: OnboardingPhotoDoc[];
}
export interface OnboardingSlide {
  title: string;
  sub: string;
  stickers: Record<string, string>;
  photos: ImageSourcePropType[];
}

const BUNDLED: ImageSourcePropType[][] = [
  [require('@/assets/images/onboarding/s1p1.jpg'), require('@/assets/images/onboarding/s1p2.jpg')],
  [require('@/assets/images/onboarding/s2p1.jpg'), require('@/assets/images/onboarding/s2p2.jpg'), require('@/assets/images/onboarding/s2p3.jpg')],
  [require('@/assets/images/onboarding/s3p1.jpg')],
];

export const bundledPhoto = (slide: number, slot: number) => BUNDLED[slide][slot];

const REF = () => doc(db, 'config', 'onboarding');

export async function getOnboardingDocs(): Promise<OnboardingSlideDoc[]> {
  try {
    const data = (await getDoc(REF())).data();
    // Version 1 (the old photo slides) is ignored — different structure.
    if (data?.version !== 2 || !Array.isArray(data.slides)) return [];
    return data.slides.slice(0, 3);
  } catch {
    return [];
  }
}

export function mergeSlides(docs: OnboardingSlideDoc[]): OnboardingSlide[] {
  return ONBOARDING_DEFAULT_TEXTS.map((d, i) => {
    const s = docs[i] ?? {};
    const stickers: Record<string, string> = {};
    for (const k of Object.keys(d.stickers)) stickers[k] = s.stickers?.[k]?.trim() || d.stickers[k];
    return {
      title: s.title?.trim() || d.title,
      sub: s.sub?.trim() || d.sub,
      stickers,
      photos: Array.from({ length: ONBOARDING_PHOTO_SLOTS[i] }, (_, j) => {
        const url = s.photos?.[j]?.url;
        return url ? { uri: url } : BUNDLED[i][j];
      }),
    };
  });
}

/** Admin's content, else the defaults — never empty, never blocks the screen. */
export function useOnboardingSlides(): OnboardingSlide[] {
  const [docs, setDocs] = useState<OnboardingSlideDoc[]>([]);
  useEffect(() => { getOnboardingDocs().then(setDocs); }, []);
  return mergeSlides(docs);
}

/** Lowest daily price of the published catalogue in LAK (slide 1 chip), or null. */
export function useLowestDailyPriceLak(): number | null {
  const [lak, setLak] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([cached('products', HOME_TTL.products, getProducts), getExchangeRate()])
      .then(([products, rate]) => {
        if (!rate) return;
        const mins = products.map(p => getMinPrice(p)).filter((v): v is number => v != null && v > 0);
        if (alive && mins.length) setLak(toLak(Math.min(...mins), rate));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return lak;
}

export async function saveOnboardingSlides(slides: OnboardingSlideDoc[]): Promise<void> {
  const clean = slides.slice(0, 3).map((s, i) => ({
    title: (s.title ?? '').trim().slice(0, 80),
    sub: (s.sub ?? '').trim().slice(0, 140),
    stickers: Object.fromEntries(Object.keys(ONBOARDING_DEFAULT_TEXTS[i].stickers)
      .map(k => [k, (s.stickers?.[k] ?? '').trim().slice(0, 40)])),
    photos: Array.from({ length: ONBOARDING_PHOTO_SLOTS[i] }, (_, j) => ({
      url: s.photos?.[j]?.url ?? null,
      path: s.photos?.[j]?.path ?? null,
    })),
  }));
  await setDoc(REF(), { version: 2, slides: clean, updatedAt: serverTimestamp() });
}

/** 4:5 photo (picker crop), ~1080 px wide, JPEG 0.7 — the Home slides pipeline. */
export async function uploadOnboardingPhoto(slide: number, slot: number, localUri: string): Promise<{ path: string; url: string }> {
  const compressed = await manipulateAsync(localUri, [{ resize: { width: 1080 } }], { compress: 0.7, format: SaveFormat.JPEG });
  const blob: Blob = await (await fetch(compressed.uri)).blob();
  const path = `onboarding/s${slide + 1}p${slot + 1}/${Date.now()}.jpg`;
  const r = storageRef(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return { path, url: await getDownloadURL(r) };
}

export async function deleteOnboardingPhoto(path: string): Promise<void> {
  await deleteObject(storageRef(storage, path)).catch(() => {});
}
