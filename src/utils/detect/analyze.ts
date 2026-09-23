// One pass over the sheet that everything downstream reads from: which pixels
// are sprite, and which structure each sprite pixel belongs to.
//
// Structures are truly connected pixel runs — no dilation. Two sprites a few
// pixels apart stay two structures no matter how close they sit; grouping
// fragments of one sprite happens later, in findSprites, where size and
// containment can be weighed instead of raw distance.

import { findComponents } from '@/utils/mask';
import { contentMask, type Background } from './background';
import { splitNecks } from './necks';

export interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Number of content pixels, not bbox area. */
  area: number;
}

export interface Analysis {
  /** Bumped on every run; caches key on it. */
  version: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  background: Background;
  /** 1 = sprite pixel, 0 = background. */
  content: Uint8Array;
  /** Component index for content pixels, -1 for background. */
  labels: Int32Array;
  components: Component[];
  /** Width of a crack a broken anti-aliased outline leaves, in px. */
  crackGap: number;
}

export interface AnalyzeOptions {
  background: Background;
  tolerance: number;
  fillHoles: boolean;
  /** Split structures that are two sprites joined by a thin neck. */
  splitTouching: boolean;
}

let versionSeq = 0;

/** Fully-sprite pixels. On a transparent sheet a faint glow is content but
 *  not solid; a keyed colour background has no such gradation. */
function solidMask(
  px: Uint8ClampedArray,
  content: Uint8Array,
  bg: Background
): Uint8Array {
  if (bg.kind !== 'transparent') return content;
  const solid = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) solid[i] = px[i * 4 + 3] >= 128 ? 1 : 0;
  return solid;
}

export function analyze(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  opts: AnalyzeOptions
): Analysis {
  const content = contentMask(
    pixels,
    width,
    height,
    opts.background,
    opts.tolerance,
    opts.fillHoles
  );

  const found = findComponents(content, width, height);
  const labels = found.labels;
  let numLabels = found.numLabels;

  // Sprites that do touch — tip to tip, or through a faint glow — are one
  // structure; cut those apart at the neck.
  if (opts.splitTouching) {
    numLabels = splitNecks(
      labels,
      numLabels,
      solidMask(pixels, content, opts.background),
      width,
      height
    );
  }

  const components: Component[] = Array.from({ length: numLabels }, () => ({
    minX: width,
    minY: height,
    maxX: -1,
    maxY: -1,
    area: 0,
  }));
  for (let i = 0, n = width * height; i < n; i++) {
    const l = labels[i];
    if (l < 0) continue;
    const c = components[l];
    const x = i % width;
    const y = (i / width) | 0;
    if (x < c.minX) c.minX = x;
    if (x > c.maxX) c.maxX = x;
    if (y < c.minY) c.minY = y;
    if (y > c.maxY) c.maxY = y;
    c.area++;
  }

  return {
    version: ++versionSeq,
    width,
    height,
    pixels,
    background: opts.background,
    content,
    labels,
    components,
    crackGap: Math.max(2, Math.round(Math.min(width, height) / 1024)),
  };
}
