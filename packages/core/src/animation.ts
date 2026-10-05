import type { SpriteDocument, Tag } from './document';

/**
 * Frame order of a tag, expanding its direction:
 * forward 0,1,2 · reverse 2,1,0 · pingpong 0,1,2,1 (ends are not repeated,
 * so looping it is seamless). Godot's SpriteFrames only plays forward, so the
 * exporter uses this same expansion.
 */
export function tagFrameSequence(tag: Pick<Tag, 'from' | 'to' | 'direction'>): number[] {
  const forward: number[] = [];
  for (let i = tag.from; i <= tag.to; i++) forward.push(i);
  switch (tag.direction) {
    case 'reverse':
      return forward.reverse();
    case 'pingpong':
      return forward.length > 2 ? [...forward, ...forward.slice(1, -1).reverse()] : forward;
    default:
      return forward;
  }
}

export interface Playback {
  /** Frame index shown at each step. */
  sequence: number[];
  /** Duration (ms) of each step. */
  durations: number[];
  /** Sum of durations. */
  total: number;
  loop: boolean;
}

/** Playback of a tag, or of every frame (forward, looping) when no tag is given. */
export function playbackFor(doc: SpriteDocument, tag?: Tag | null): Playback {
  const sequence = tag ? tagFrameSequence(tag) : doc.frames.map((_, i) => i);
  const durations = sequence.map((i) => doc.frames[i]?.duration ?? 100);
  return {
    sequence,
    durations,
    total: durations.reduce((a, b) => a + b, 0),
    loop: tag ? tag.loop : true,
  };
}

export interface PlaybackPosition {
  step: number;
  frameIndex: number;
  /** True once a non-looping animation reached its end. */
  done: boolean;
}

export function frameAtTime(pb: Playback, timeMs: number): PlaybackPosition {
  const last = pb.sequence.length - 1;
  if (pb.total <= 0 || last < 0) return { step: 0, frameIndex: pb.sequence[0] ?? 0, done: true };
  if (!pb.loop && timeMs >= pb.total) return { step: last, frameIndex: pb.sequence[last], done: true };
  let t = ((timeMs % pb.total) + pb.total) % pb.total;
  for (let step = 0; step <= last; step++) {
    if (t < pb.durations[step]) return { step, frameIndex: pb.sequence[step], done: false };
    t -= pb.durations[step];
  }
  return { step: last, frameIndex: pb.sequence[last], done: false };
}

/** Tags whose range contains the frame. */
export function tagsAtFrame(doc: SpriteDocument, frameIndex: number): Tag[] {
  return doc.tags.filter((t) => frameIndex >= t.from && frameIndex <= t.to);
}

/** Frames per second equivalent of a tag (average), handy for engines with a single speed value. */
export function averageFps(pb: Playback): number {
  return pb.total > 0 ? (pb.sequence.length * 1000) / pb.total : 0;
}
