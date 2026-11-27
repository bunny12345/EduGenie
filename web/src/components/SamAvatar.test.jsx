import React from 'react';
import { act, render } from '@testing-library/react';
import SamAvatar from './SamAvatar';

test('the thinking trail shows three bubbles and a cloud, then hides them when Sam stops thinking', () => {
  jest.useFakeTimers();
  try {
    const { container, rerender, unmount } = render(<SamAvatar mode="thinking" />);
    const trail = container.querySelector('.eg-sam-thought-trail');
    expect(trail.querySelectorAll('circle')).toHaveLength(3);
    const cloud = trail.querySelector('path');
    act(() => jest.advanceTimersByTime(40));
    for (const shape of [...trail.querySelectorAll('circle'), cloud]) {
      expect(Number(shape.style.opacity)).toBeGreaterThan(0.5);
    }
    rerender(<SamAvatar mode="idle" />);
    act(() => jest.advanceTimersByTime(40));
    expect(cloud.style.opacity).toBe('0');
    unmount();
  } finally {
    jest.useRealTimers();
  }
});
