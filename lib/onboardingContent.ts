import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { ImageSourcePropType } from 'react-native';
import { db, storage } from './firebase';

// Onboarding slides (first launch): 3 slots in config/onboarding (Admin → Onboarding —
// photo 1080×1920 portrait, title, text), readable through the config/* rule. A missing /
// empty slot falls back to the bundled defaults below (royalty-free placeholder photos,
// assets/images/onboarding/CREDITS.md).

export interface OnboardingSlideDoc { title?: string; text?: string; imageUrl?: string; imagePath?: string }
export interface OnboardingSlide { title: string; text: string; image: ImageSourcePropType; imagePath?: string; custom: boolean }

export const ONBOARDING_DEFAULTS: { title: string; text: string; image: ImageSourcePropType }[] = [
  {
    title: 'Why buy it when you can rent it?',
    text: 'Tents, drills, party speakers, baby gear. Use it, bring it back, keep your closet for clothes.',
    image: require('@/assets/images/onboarding/slide1.jpg'),
  },
  {
    title: 'Book. Pick up. Bring back.',
    text: 'Choose your dates in the app, collect it at our shop in Vientiane. Nothing to pay online.',
    image: require('@/assets/images/onboarding/slide2.jpg'),
  },
  {
    title: 'Checked. Clean. Yours for a while.',
    text: 'Every item is checked between rentals. Your deposit comes back on the spot.',
    image: require('@/assets/images/onboarding/slide3.jpg'),
  },
];

const REF = () => doc(db, 'config', 'onboarding');

export async function getOnboardingDocs(): Promise<OnboardingSlideDoc[]> {
  try {
    const snap = await getDoc(REF());
    const slides = snap.data()?.slides;
    return Array.isArray(slides) ? slides.slice(0, 3) : [];
  } catch {
    return [];
  }
}

export function mergeSlides(docs: OnboardingSlideDoc[]): OnboardingSlide[] {
  return ONBOARDING_DEFAULTS.map((d, i) => {
    const s = docs[i] ?? {};
    return {
      title: s.title?.trim() || d.title,
      text: s.text?.trim() || d.text,
      image: s.imageUrl ? { uri: s.imageUrl } : d.image,
      imagePath: s.imagePath,
      custom: !!s.imageUrl,
    };
  });
}

/** Admin's slides, else the defaults — never empty, never blocks the screen. */
export function useOnboardingSlides(): OnboardingSlide[] {
  const [docs, setDocs] = useState<OnboardingSlideDoc[]>([]);
  useEffect(() => { getOnboardingDocs().then(setDocs); }, []);
  return mergeSlides(docs);
}

export async function saveOnboardingSlides(slides: OnboardingSlideDoc[]): Promise<void> {
  const clean = slides.slice(0, 3).map(s => ({
    title: (s.title ?? '').trim().slice(0, 60),
    text: (s.text ?? '').trim().slice(0, 160),
    imageUrl: s.imageUrl ?? null,
    imagePath: s.imagePath ?? null,
  }));
  await setDoc(REF(), { slides: clean, updatedAt: serverTimestamp() });
}

/** Portrait photo 1080×1920 (picker crop 9:16), JPEG 0.7 — like Home slides. */
export async function uploadOnboardingPhoto(slot: number, localUri: string): Promise<{ imagePath: string; imageUrl: string }> {
  const compressed = await manipulateAsync(localUri, [{ resize: { width: 1080, height: 1920 } }], { compress: 0.7, format: SaveFormat.JPEG });
  const blob: Blob = await (await fetch(compressed.uri)).blob();
  const imagePath = `onboarding/slot${slot + 1}/${Date.now()}.jpg`;
  const r = storageRef(storage, imagePath);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return { imagePath, imageUrl: await getDownloadURL(r) };
}

export async function deleteOnboardingPhoto(imagePath: string): Promise<void> {
  await deleteObject(storageRef(storage, imagePath)).catch(() => {});
}
