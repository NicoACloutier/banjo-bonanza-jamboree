import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTunedChime } from "../hooks/useTunedChime";

interface Props {
  inTune: boolean;
  outOfTune: boolean;
  targetId: number | null;
}

function setup(initial: Props) {
  const onTuned = vi.fn();
  const hook = renderHook((props: Props) => useTunedChime(props.inTune, props.outOfTune, props.targetId, onTuned, 700), {
    initialProps: initial,
  });
  return { onTuned, rerender: hook.rerender };
}

describe("useTunedChime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("chimes once the string stays in tune long enough", () => {
    const { onTuned } = setup({ inTune: true, outOfTune: false, targetId: 1 });
    vi.advanceTimersByTime(699);
    expect(onTuned).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTuned).toHaveBeenCalledTimes(1);
  });

  it("does not chime if the string leaves the zone too soon", () => {
    const { onTuned, rerender } = setup({ inTune: true, outOfTune: false, targetId: 1 });
    vi.advanceTimersByTime(500);
    rerender({ inTune: false, outOfTune: false, targetId: 1 });
    vi.advanceTimersByTime(1000);
    expect(onTuned).not.toHaveBeenCalled();
  });

  it("does not chime again from hovering at the edge of the zone", () => {
    const { onTuned, rerender } = setup({ inTune: true, outOfTune: false, targetId: 1 });
    vi.advanceTimersByTime(700);
    rerender({ inTune: false, outOfTune: false, targetId: 1 });
    rerender({ inTune: true, outOfTune: false, targetId: 1 });
    vi.advanceTimersByTime(2000);
    expect(onTuned).toHaveBeenCalledTimes(1);
  });

  it("chimes again after clearly drifting out of tune and back", () => {
    const { onTuned, rerender } = setup({ inTune: true, outOfTune: false, targetId: 1 });
    vi.advanceTimersByTime(700);
    rerender({ inTune: false, outOfTune: true, targetId: 1 });
    rerender({ inTune: true, outOfTune: false, targetId: 1 });
    vi.advanceTimersByTime(700);
    expect(onTuned).toHaveBeenCalledTimes(2);
  });

  it("chimes again for a different string", () => {
    const { onTuned, rerender } = setup({ inTune: true, outOfTune: false, targetId: 1 });
    vi.advanceTimersByTime(700);
    rerender({ inTune: true, outOfTune: false, targetId: 2 });
    vi.advanceTimersByTime(700);
    expect(onTuned).toHaveBeenCalledTimes(2);
  });
});
