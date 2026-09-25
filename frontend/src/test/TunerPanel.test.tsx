import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TunerPanel } from "../components/TunerPanel";
import { FALLBACK_TUNINGS } from "../lib/tunings";

// Pretend the mic is on and hearing a slightly sharp D4 (Standard G's 1st string).
vi.mock("../hooks/useTuner", () => ({
  useTuner: () => ({
    listening: true,
    frequency: 295,
    hearing: true,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    ignoreInputFor: vi.fn(),
  }),
}));

describe("TunerPanel string picker", () => {
  it("shows Auto plus one option per string, with Auto selected by default", () => {
    render(<TunerPanel tunings={FALLBACK_TUNINGS} />);
    const options = screen.getAllByRole("radio");
    expect(options.map((o) => o.textContent)).toEqual([
      "Auto",
      "String 1: D4",
      "String 2: B3",
      "String 3: G3",
      "String 4: D3",
      "String 5: G4",
    ]);
    expect(screen.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/Closest string/)).toHaveTextContent("String 1");
  });

  it("compares against the picked string instead of the nearest one", async () => {
    const user = userEvent.setup();
    render(<TunerPanel tunings={FALLBACK_TUNINGS} />);

    await user.click(screen.getByRole("radio", { name: "String 3: G3" }));

    expect(screen.getByRole("radio", { name: "String 3: G3" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Tuning:/)).toHaveTextContent("String 3");
    expect(screen.getByText(/Tuning:/)).toHaveTextContent("sharp");
  });
});
