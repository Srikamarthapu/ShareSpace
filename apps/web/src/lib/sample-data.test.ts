import { describe, expect, it } from 'vitest';
import { initialSample, parseSampleState, resolveSample } from './sample-data';
describe('sample state isolation', () => {
  it('recovers invalid or old browser state safely', () => {
    expect(parseSampleState('{broken')).toEqual(initialSample);
    expect(parseSampleState('{"version":99}')).toEqual(initialSample);
  });
  it('changes only the requesting builder, without claiming work started or context delivered', () => {
    const changed = resolveSample(initialSample, 'coordinate', 'Build the UI only.');
    expect(changed.tasks[0]).toEqual(initialSample.tasks[0]);
    expect(changed.tasks[1]?.state).toBe('proposed');
    expect(changed.tasks[1]?.scope).toBe('Build the UI only.');
    expect(initialSample.resolution).toBeNull();
  });
});
