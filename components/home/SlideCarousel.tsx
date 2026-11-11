import React from 'react';
import InsetCarousel from '@/components/home/InsetCarousel';
import AdminSlideCard from '@/components/home/AdminSlideCard';
import type { HomeSlide } from '@/lib/homeSlides';

// The mid-page banner's admin slides (Admin → Home slides, placement 'banner') in the
// 16px-margin InsetCarousel. Each slide = the shared <AdminSlideCard> (also used by the
// hero carousel). `showDraft` (admin preview) marks unpublished slides.
export default function SlideCarousel({
  slides, height, intervalMs, showDraft,
}: {
  slides: HomeSlide[];
  height: number;
  intervalMs: number;
  showDraft?: boolean;
}) {
  return (
    <InsetCarousel
      height={height}
      intervalMs={intervalMs}
      slides={slides.map(slide => (
        <AdminSlideCard key={slide.id} slide={slide} showDraft={showDraft} style={{ flex: 1 }} />
      ))}
    />
  );
}
