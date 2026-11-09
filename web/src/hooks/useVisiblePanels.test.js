import { act, render } from '@testing-library/react';
import useVisiblePanels from './useVisiblePanels';

function Harness({ scope = 'student', panels, loaders }) {
  useVisiblePanels(scope, panels, loaders);
  return null;
}

async function flush() {
  await act(() => Promise.resolve());
}

describe('visible panel request scheduling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('loads only visible panels, retains fresh data on revisit, and refreshes stale data', async () => {
    const loaders = { home: jest.fn().mockResolvedValue(), library: jest.fn().mockResolvedValue() };
    const { rerender } = render(<Harness panels={['home']} loaders={loaders} />);
    await flush();
    expect(loaders.home).toHaveBeenCalledTimes(1);
    expect(loaders.library).not.toHaveBeenCalled();
    rerender(<Harness panels={['library']} loaders={loaders} />);
    await flush();
    expect(loaders.library).toHaveBeenCalledTimes(1);
    rerender(<Harness panels={['home']} loaders={loaders} />);
    await flush();
    expect(loaders.home).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(20000));
    await flush();
    expect(loaders.home).toHaveBeenCalledTimes(2);
    expect(loaders.library).toHaveBeenCalledTimes(1);
  });

  test('pauses hidden tabs, refreshes on return and stops after unmount', async () => {
    const loaders = { home: jest.fn().mockResolvedValue() };
    const { unmount } = render(<Harness panels={['home']} loaders={loaders} />);
    await flush();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => jest.advanceTimersByTime(60000));
    await flush();
    expect(loaders.home).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(loaders.home).toHaveBeenCalledTimes(2);
    unmount();
    act(() => jest.advanceTimersByTime(60000));
    await flush();
    expect(loaders.home).toHaveBeenCalledTimes(2);
  });

  test('coalesces slow requests and starts fresh for another student', async () => {
    let finish;
    const loaders = { home: jest.fn(() => new Promise((resolve) => { finish = resolve; })) };
    const { rerender } = render(<Harness panels={['home']} loaders={loaders} />);
    await flush();
    act(() => jest.advanceTimersByTime(60000));
    await flush();
    expect(loaders.home).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    rerender(<Harness scope="another-student" panels={['home']} loaders={loaders} />);
    await flush();
    expect(loaders.home).toHaveBeenCalledTimes(2);
    await act(async () => finish());
  });
});
