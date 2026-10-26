// My Account header "flight path" — the validated hand-drawn bee flight (mockup), pure
// geometry. The reference path below is defined on a 400×230 box: it is scaled to the
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
}

const REF_W = 400;
const REF_H = 230;
const REF_START: Pt = { x: 0, y: 200 };
/** Reference cubic segments [c1, c2, end] (validated mockup). */
const REF: [Pt, Pt, Pt][] = ([
  [30, 214, 62, 190, 96, 199],
  [132, 208, 160, 188, 196, 195],
  [232, 202, 266, 198, 292, 184],
  [312, 172, 322, 148, 350, 150], // 3 — into the bike loop
  [384, 152, 392, 190, 368, 201], // 4
  [344, 212, 312, 200, 320, 182], // 5 — out of the bike loop
  [328, 164, 344, 140, 320, 116], // 6 — S-curve up between tent and tool
  [300, 98, 272, 104, 262, 86],
  [254, 72, 232, 76, 214, 64], // 8 — into the speaker loop
  [194, 50, 204, 22, 228, 22], // 9
  [256, 22, 272, 44, 260, 60], // 10
  [252, 72, 270, 76, 290, 64], // 11 — out of the speaker loop
  [318, 48, 336, 56, 356, 36],
  [364, 28, 370, 23, 378, 20],
] as const).map(([a, b, c, d, e, g]) => [{ x: a, y: b }, { x: c, y: d }, { x: e, y: g }]);

const REF_BIKE: Pt = { x: 346, y: 178 };
const REF_SPEAKER: Pt = { x: 236, y: 44 };
const REF_HEXAGON: Pt = { x: 382, y: 18 };
/** Segments replaced when a bubble is hidden: [first, last] inclusive. */
const BIKE_LOOP: [number, number] = [3, 5];
const SPEAKER_LOOP: [number, number] = [8, 11];

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

/** Returns the SVG path and its (sampled) length — drives the draw-on-mount. */
export function buildFlightPath(i: FlightPathInput): { d: string; length: number } {
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
  const hexOff = offset({ x: i.hexagon.x - 6 * sx, y: i.hexagon.y + 2 * sy }, REF_HEXAGON);

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
  const move = (p: Pt, o: Pt): Pt => { const q = scale(p); return { x: q.x + o.x, y: q.y + o.y }; };
  const map = (p: Pt) => move(p, nudge(p));

  // Hidden bubble → drop its loop and bridge with a curve that keeps both tangents.
  let segs: [Pt, Pt, Pt][] = REF.map(([c1, c2, end], k) => {
    const startAnchor = k === 0 ? REF_START : REF[k - 1][2];
    return [move(c1, nudge(startAnchor)), move(c2, nudge(end)), map(end)];
  });
  const bridge = ([from, to]: [number, number]) => {
    const p = from === 0 ? map(REF_START) : segs[from - 1][2];
    const pc = from === 0 ? p : segs[from - 1][1];
    const q = segs[to][2];
    const qc = segs[to + 1]?.[0] ?? q;
    const k = dist(p, q) / 3;
    const unit = (a: Pt, b: Pt) => { const l = dist(a, b) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
    const t1 = unit(pc, p), t2 = unit(q, qc);
    const seg: [Pt, Pt, Pt] = [{ x: p.x + t1.x * k, y: p.y + t1.y * k }, { x: q.x - t2.x * k, y: q.y - t2.y * k }, q];
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
  return { d: parts.join(' '), length: Math.ceil(length + 8) };
}
