// My Account header "flight path" (validated sketch) — pure geometry, built from the
// header size and the MEASURED bubble centres, so the loops stay around the right bubbles
// on every screen width:
//   left edge, near the bottom → along the bottom (under the chips and the tent) → one
//   clockwise loop around the bike → up between the tent and the tool → one
//   counter-clockwise loop around the speaker → the amber hexagon (top right).
// A hidden bubble (null) simply has no loop / waypoint.

export interface Pt { x: number; y: number }

export interface FlightPathInput {
  width: number;
  height: number;
  /** Bubble centres in header coordinates, null when hidden. */
  bike: Pt | null;
  tent: Pt | null;
  tool: Pt | null;
  speaker: Pt | null;
  /** Point where the path ends (left side of the hexagon). */
  end: Pt;
  /** Loop radius — bubble radius + clearance (bubbles float ±3px). */
  loopRadius: number;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Pt) => Math.hypot(v.x, v.y);
const unit = (v: Pt): Pt => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; };
const f = (n: number) => (Math.round(n * 10) / 10).toString();
const UP: Pt = { x: 0, y: -1 };
const RIGHT: Pt = { x: 1, y: 0 };

/** Smooth cubic from p (leaving along t1) to q (arriving along t2). */
function curve(p: Pt, t1: Pt, q: Pt, t2: Pt): string {
  const d = len(sub(q, p)) / 3;
  return `C ${f(p.x + t1.x * d)} ${f(p.y + t1.y * d)}, ${f(q.x - t2.x * d)} ${f(q.y - t2.y * d)}, ${f(q.x)} ${f(q.y)}`;
}

/** Returns the SVG path and an upper estimate of its length (drives the draw speed). */
export function buildFlightPath(i: FlightPathInput): { d: string; length: number } {
  const R = i.loopRadius;
  const bottomY = i.height - 12;
  const start: Pt = { x: 0, y: bottomY };
  const parts: string[] = [`M ${f(start.x)} ${f(start.y)}`];
  let length = 0;
  let cur = start;
  let dir = RIGHT;

  const go = (q: Pt, t2: Pt) => {
    parts.push(curve(cur, dir, q, t2));
    length += len(sub(q, cur)) * 1.25;
    cur = q;
    dir = t2;
  };

  // 1–2. Along the bottom, then curve up into the bike's left side.
  const bikeLeft = i.bike ? { x: i.bike.x - R, y: i.bike.y } : null;
  const runEnd: Pt = { x: Math.max(start.x + 20, (bikeLeft?.x ?? i.width * 0.6) - 30), y: bottomY };
  parts.push(`L ${f(runEnd.x)} ${f(runEnd.y)}`);
  length += runEnd.x - start.x;
  cur = runEnd;

  // 3. One clockwise loop around the bike (left → top → right → bottom → left).
  if (i.bike && bikeLeft) {
    go(bikeLeft, UP);
    const right = { x: i.bike.x + R, y: i.bike.y };
    parts.push(`A ${f(R)} ${f(R)} 0 0 1 ${f(right.x)} ${f(right.y)}`, `A ${f(R)} ${f(R)} 0 0 1 ${f(bikeLeft.x)} ${f(bikeLeft.y)}`);
    length += 2 * Math.PI * R;
    dir = UP;
  }

  // 4. Up between the tent and the tool.
  const speakerRight = i.speaker ? { x: i.speaker.x + R, y: i.speaker.y } : null;
  const next = speakerRight ?? i.end;
  const gap = i.tent && i.tool ? { x: (i.tent.x + i.tool.x) / 2, y: (i.tent.y + i.tool.y) / 2 }
    : i.tool ? { x: i.tool.x - R - 6, y: i.tool.y + 10 }
      : i.tent ? { x: i.tent.x + R + 6, y: i.tent.y - 10 }
        : null;
  if (gap) go(gap, unit(sub(next, cur)));

  // 5. One counter-clockwise loop around the speaker (right → top → left → bottom → right).
  if (i.speaker && speakerRight) {
    go(speakerRight, UP);
    const left = { x: i.speaker.x - R, y: i.speaker.y };
    parts.push(`A ${f(R)} ${f(R)} 0 0 0 ${f(left.x)} ${f(left.y)}`, `A ${f(R)} ${f(R)} 0 0 0 ${f(speakerRight.x)} ${f(speakerRight.y)}`);
    length += 2 * Math.PI * R;
    dir = UP;
  }

  // 6. End on the hexagon.
  go(i.end, RIGHT);
  return { d: parts.join(' '), length: Math.ceil(length + 40) };
}
