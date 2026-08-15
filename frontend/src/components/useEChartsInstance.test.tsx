import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { Payload } from "echarts/core";
import { useEChartsInstance } from "./useEChartsInstance";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return {
    ...actual,
    use: vi.fn(),
    init: vi.fn(),
  };
});

function TestChart({ onEvents }: { onEvents?: Record<string, (params: unknown) => void> }) {
  const containerRef = useEChartsInstance(() => ({}), [], onEvents);
  return <div ref={containerRef} data-testid="test-chart" />;
}

describe("useEChartsInstance", () => {
  const fakeChart = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    dispatchAction: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(fakeChart.setOption).mockClear();
    vi.mocked(fakeChart.resize).mockClear();
    vi.mocked(fakeChart.dispose).mockClear();
    vi.mocked(fakeChart.on).mockClear();
    vi.mocked(fakeChart.off).mockClear();
    vi.mocked(fakeChart.dispatchAction).mockClear();
    vi.mocked(echarts.init).mockClear();
    vi.mocked(echarts.init).mockReturnValue(fakeChart as unknown as echarts.ECharts);
  });

  afterEach(() => {
    cleanup();
  });

  it("registers onEvents handlers against the real chart instance on init", () => {
    const handler = vi.fn();
    render(<TestChart onEvents={{ updateAxisPointer: handler }} />);

    expect(fakeChart.on).toHaveBeenCalledWith("updateAxisPointer", expect.any(Function));
  });

  it("forwards the registered event to the latest handler when the chart fires it", () => {
    const handler = vi.fn();
    render(<TestChart onEvents={{ updateAxisPointer: handler }} />);

    const registeredHandler = vi.mocked(fakeChart.on).mock.calls[0][1] as (p: unknown) => void;
    registeredHandler({ axesInfo: [] });

    expect(handler).toHaveBeenCalledWith({ axesInfo: [] });
  });

  it("deregisters events on unmount", () => {
    const handler = vi.fn();
    const { unmount } = render(<TestChart onEvents={{ updateAxisPointer: handler }} />);
    unmount();

    expect(fakeChart.off).toHaveBeenCalledWith("updateAxisPointer", expect.any(Function));
  });

  it("does not register or fail when onEvents is omitted (every pre-M14 call site)", () => {
    expect(() => render(<TestChart />)).not.toThrow();
    expect(fakeChart.on).not.toHaveBeenCalled();
  });

  it("dispatch forwards to chart.dispatchAction", () => {
    let dispatch: ((action: Payload) => void) | undefined;
    function Capture() {
      const chart = useEChartsInstance(() => ({}), []);
      dispatch = chart.dispatch;
      return <div ref={chart} />;
    }
    render(<Capture />);

    dispatch?.({ type: "hideTip" });

    expect(fakeChart.dispatchAction).toHaveBeenCalledWith({ type: "hideTip" });
  });
});
