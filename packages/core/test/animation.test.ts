import { describe, expect, it } from 'vitest';
import {
  addFrame, addTag, averageFps, createDocument, frameAtTime, playbackFor, setFrameDuration,
  tagFrameSequence, tagsAtFrame,
} from '../src';

function fourFrames() {
  let d = createDocument({ width: 2, height: 2 });
  for (let i = 0; i < 3; i++) d = addFrame(d).doc;
  return d;
}

describe('animation', () => {
  it('expands tag directions', () => {
    expect(tagFrameSequence({ from: 1, to: 3, direction: 'forward' })).toEqual([1, 2, 3]);
    expect(tagFrameSequence({ from: 1, to: 3, direction: 'reverse' })).toEqual([3, 2, 1]);
    expect(tagFrameSequence({ from: 0, to: 3, direction: 'pingpong' })).toEqual([0, 1, 2, 3, 2, 1]);
    expect(tagFrameSequence({ from: 0, to: 1, direction: 'pingpong' })).toEqual([0, 1]);
    expect(tagFrameSequence({ from: 2, to: 2, direction: 'pingpong' })).toEqual([2]);
  });

  it('maps time to frames using per-frame durations', () => {
    let d = fourFrames();
    d = setFrameDuration(d, d.frames[1].id, 300);
    const pb = playbackFor(d);
    expect(pb.total).toBe(600);
    expect(frameAtTime(pb, 0).frameIndex).toBe(0);
    expect(frameAtTime(pb, 99).frameIndex).toBe(0);
    expect(frameAtTime(pb, 100).frameIndex).toBe(1);
    expect(frameAtTime(pb, 399).frameIndex).toBe(1);
    expect(frameAtTime(pb, 400).frameIndex).toBe(2);
    expect(frameAtTime(pb, 650).frameIndex).toBe(0); // loops
    expect(averageFps(pb)).toBeCloseTo(4000 / 600);
  });

  it('stops at the last step of non-looping tags', () => {
    let d = fourFrames();
    const { doc, tag } = addTag(d, { name: 'die', from: 1, to: 2, loop: false });
    d = doc;
    const pb = playbackFor(d, tag);
    expect(frameAtTime(pb, 150)).toEqual({ step: 1, frameIndex: 2, done: false });
    expect(frameAtTime(pb, 5000)).toEqual({ step: 1, frameIndex: 2, done: true });
    expect(tagsAtFrame(d, 2).map((t) => t.name)).toEqual(['die']);
    expect(tagsAtFrame(d, 0)).toEqual([]);
  });
});
