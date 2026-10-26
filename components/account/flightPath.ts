// My Account header "flight path" — the validated hand-drawn bee flight (mockup v2), pure
// geometry; stays in the BACKGROUND (very light dotted style, see AccountHeader). The reference path below is defined on a 400×230 box: it is scaled to the
// real header (x by width, y by height), then ONLY the two loop sections are nudged so
// they wrap the actual bike and speaker bubbles (and the tail lands on the hexagon). The
// nudge fades out with distance from each loop, so the curve stays smooth.
//   left edge (soft wave) → under the chips and the tent → loop around the bike → S-curve
//   up between the tent and the tool → loop around the speaker → amber hexagon.
// Smooth cubic Béziers only; the loops pass partly under the bubbles (drawn on top). A
// hidden bubble (null) skips its loop with a tangent-matched curve.

export interface Pt { x: number; y: number }

export interface FlightPathInput {
  width: number;
  height: number;
  /** Bubble centres in header coordinates, null when hidden. */
  bike: Pt | null;
  speaker: Pt | null;
  /** Hexagon centre in header coordinates (the path ends next to it). */
  hexagon: Pt;
  /** Target radius of the speaker loop (bubble radius + 10–12px). */
  speakerLoopRadius: number;
}

const REF_W = 400;
const REF_H = 230;
const REF_START: Pt = { x: 0, y: 200 };
/** Reference cubic segments [c1, c2, end] (validated mockup v2). */
const REF: [Pt, Pt, Pt][] = ([
  [30, 212, 62, 192, 96, 199],
  [132, 206, 160, 190, 196, 195],
  [232, 200, 268, 196, 296, 186],
  [314, 180, 326, 160, 346, 156], // 3 — into the (tight) bike loop
  [368, 152, 376, 182, 362, 194], // 4
  [348, 206, 326, 198, 330, 182], // 5 — out of the bike loop
  [334, 166, 346, 140, 322, 118], // 6 — S-curve up between tent and tool
  [302, 100, 274, 104, 266, 88],
  [260, 74, 272, 54, 264, 34], // 8 — speaker loop: up the right side
  [256, 12, 220, 6, 204, 24], // 9 — over the top, down the left
  [190, 40, 194, 68, 214, 78], // 10 — under the bottom
  [234, 86, 258, 74, 266, 56], // 11 — crosses itself
  [274, 40, 298, 44, 316, 40], // 12 — leaves toward the hexagon
  [334, 36, 346, 30, 358, 24],
] as const).map(([a, b, c, d, e, g]) => [{ x: a, y: b }, { x: c, y: d }, { x: e, y: g }]);

const REF_BIKE: Pt = { x: 346, y: 178 };
const REF_SPEAKER: Pt = { x: 234, y: 44 };
const REF_HEXAGON: Pt = { x: 362, y: 20 };
/** Segments replaced when a bubble is hidden: [first, last] inclusive. */
const BIKE_LOOP: [number, number] = [3, 5];
const SPEAKER_LOOP: [number, number] = [8, 11];
/** Anchor where the fade-in reaches full strength (just before the bike loop). */
const FADE_END_ANCHOR = 2;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** 1 near the anchor, fading to 0 between `inner` and `outer` (reference units). */
function weight(p: Pt, anchor: Pt, inner: number, outer: number): number {
  const d = dist(p, anchor);
  if (d <= inner) return 1;
  if (d >= outer) return 0;
  const t = (d - inner) / (outer - inner);
  return 1 - t * t * (3 - 2 * t); // smoothstep
}

function cubicLength(p0: Pt, c1: Pt, c2: Pt, p1: Pt): number {
  let l = 0;
  let prev = p0;
  for (let i = 1; i <= 12; i++) {
    const t = i / 12, u = 1 - t;
    const q = {
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
    };
    l += dist(prev, q);
    prev = q;
  }
  return l;
}

/**
 * Returns the SVG path, its (sampled) length — drives the draw-on-mount — and the x where
 * the left-edge fade-in reaches full strength (just before the bike loop).
 */
export function buildFlightPath(i: FlightPathInput): { d: string; length: number; fadeEndX: number } {
  const sx = i.width / REF_W;
  const sy = i.height / REF_H;
  const scale = (p: Pt): Pt => ({ x: p.x * sx, y: p.y * sy });
  const offset = (actual: Pt | null, ref: Pt) => {
    if (!actual) return { x: 0, y: 0 };
    const r = scale(ref);
    return { x: actual.x - r.x, y: actual.y - r.y };
  };
  const bikeOff = offset(i.bike, REF_BIKE);
  const speakerOff = offset(i.speaker, REF_SPEAKER);
  // The tail keeps its reference position relative to the hexagon.
  const hexOff = offset(i.hexagon, REF_HEXAGON);

  // Nudge of an ANCHOR (segment end point), toward the real loops / hexagon. Its two
  // neighbouring control points get the SAME nudge, so tangents stay continuous.
  const nudge = (anchor: Pt): Pt => {
    const wb = i.bike ? weight(anchor, REF_BIKE, 50, 95) : 0;
    const ws = i.speaker ? weight(anchor, REF_SPEAKER, 50, 90) : 0;
    const wh = weight(anchor, REF_HEXAGON, 12, 70);
    return {
      x: wb * bikeOff.x + ws * speakerOff.x + wh * hexOff.x,
      y: wb * bikeOff.y + ws * speakerOff.y + wh * hexOff.y,
    };
  };
  const translate = (p: Pt, anchor: Pt): Pt => { const q = scale(p), o = nudge(anchor); return { x: q.x + o.x, y: q.y + o.y }; };

  // Speaker loop resized to the target radius: a uniform scale about the bubble centre,
  // blended by the anchor's speaker weight (same transform for an anchor and its control
  // points → tangent directions kept). k from the mean distance of the loop anchors.
  const sp = i.speaker;
  let k = 1;
  if (sp) {
    const loopAnchors = REF.slice(SPEAKER_LOOP[0], SPEAKER_LOOP[1] + 1).map(([, , e]) => translate(e, e));
    const mean = loopAnchors.reduce((a, q) => a + dist(q, sp), 0) / loopAnchors.length;
    if (mean > 0) k = i.speakerLoopRadius / mean;
  }
  const move = (p: Pt, anchor: Pt): Pt => {
    const q = translate(p, anchor);
    if (!sp) return q;
    const m = 1 + weight(anchor, REF_SPEAKER, 50, 90) * (k - 1);
    return { x: sp.x + (q.x - sp.x) * m, y: sp.y + (q.y - sp.y) * m };
  };
  const map = (p: Pt) => move(p, p);

  // Hidden bubble → drop its loop and bridge with a curve that keeps both tangents.
  let segs: [Pt, Pt, Pt][] = REF.map(([c1, c2, end], idx) => {
    const startAnchor = idx === 0 ? REF_START : REF[idx - 1][2];
    return [move(c1, startAnchor), move(c2, end), map(end)];
  });
  const fadeEndX = segs[FADE_END_ANCHOR][2].x;
  const bridge = ([from, to]: [number, number]) => {
    const p = from === 0 ? map(REF_START) : segs[from - 1][2];
    const pc = from === 0 ? p : segs[from - 1][1];
    const q = segs[to][2];
    const qc = segs[to + 1]?.[0] ?? q;
    const h = dist(p, q) / 3;
    const unit = (a: Pt, b: Pt) => { const l = dist(a, b) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
    const t1 = unit(pc, p), t2 = unit(q, qc);
    const seg: [Pt, Pt, Pt] = [{ x: p.x + t1.x * h, y: p.y + t1.y * h }, { x: q.x - t2.x * h, y: q.y - t2.y * h }, q];
    return [from, to - from + 1, seg] as const;
  };
  // Replace the later loop first so earlier indices stay valid.
  const drops = [!i.speaker && bridge(SPEAKER_LOOP), !i.bike && bridge(BIKE_LOOP)].filter(Boolean) as ReturnType<typeof bridge>[];
  for (const [from, count, seg] of drops) segs = [...segs.slice(0, from), seg, ...segs.slice(from + count)];

  const start = map(REF_START);
  let length = 0;
  let cur = start;
  const parts = [`M ${f(start.x)} ${f(start.y)}`];
  for (const [c1, c2, end] of segs) {
    parts.push(`C ${f(c1.x)} ${f(c1.y)}, ${f(c2.x)} ${f(c2.y)}, ${f(end.x)} ${f(end.y)}`);
    length += cubicLength(cur, c1, c2, end);
    cur = end;
  }
  return { d: parts.join(' '), length: Math.ceil(length + 8), fadeEndX };
}
