import { describe, expect, it } from 'vitest';
import { BALANCED_ZONE, readBottleneck } from './bottleneck';

describe('readBottleneck', () => {
  it('calls a pair on equal footing balanced, and points at neither part', () => {
    const reading = readBottleneck(100, 100);

    expect(reading.band).toBe('equilibre');
    expect(reading.limiting).toBeNull();
    expect(reading.marked).toBe(false);
    expect(reading.position).toBe(50);
  });

  it('names the processor when it sits far below the card', () => {
    const reading = readBottleneck(45, 175);

    expect(reading.band).toBe('cpu-limitant');
    expect(reading.limiting).toBe('cpu');
    expect(reading.marked).toBe(true);
  });

  it('names the card when it sits far below the processor', () => {
    const reading = readBottleneck(175, 45);

    expect(reading.band).toBe('gpu-limitant');
    expect(reading.limiting).toBe('gpu');
    expect(reading.marked).toBe(true);
  });

  it('separates an écart worth naming from one worth an alert', () => {
    // 0.7 and 1.5: outside the balanced band, inside what the rule tolerates.
    expect(readBottleneck(70, 100)).toMatchObject({ band: 'cpu-juste', marked: false });
    expect(readBottleneck(150, 100)).toMatchObject({ band: 'gpu-juste', marked: false });
  });

  it('keeps the whole balanced band on the same verdict', () => {
    expect(readBottleneck(85, 100).band).toBe('equilibre');
    expect(readBottleneck(120, 100).band).toBe('equilibre');
  });

  it('places the needle on a log scale, so a gap and its inverse mirror', () => {
    const cpuSide = readBottleneck(50, 100);
    const gpuSide = readBottleneck(100, 50);

    expect(cpuSide.position).toBeLessThan(50);
    expect(gpuSide.position).toBeGreaterThan(50);
    expect(cpuSide.position + gpuSide.position).toBe(100);
  });

  it('pins the needle to the ends rather than running off the track', () => {
    expect(readBottleneck(1, 1000).position).toBe(0);
    expect(readBottleneck(1000, 1).position).toBe(100);
  });

  it('shades a balanced zone that brackets the middle of the track', () => {
    expect(BALANCED_ZONE.from).toBeLessThan(50);
    expect(BALANCED_ZONE.to).toBeGreaterThan(50);
  });

  it('falls back to a balanced reading on an unusable index rather than NaN', () => {
    expect(readBottleneck(100, 0)).toMatchObject({ band: 'equilibre', position: 50 });
  });
});
