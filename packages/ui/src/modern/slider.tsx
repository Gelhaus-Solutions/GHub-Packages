"use client";

import { useId, type CSSProperties } from "react";
import { cn } from "../cn.js";

export interface SliderProps {
  /** The visible label, which is also the control's name: "Zoom". */
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  /**
   * The value in words, shown at the end and announced: "140%". Without it the
   * number is shown and announced as it is.
   */
  format?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

/**
 * One value along a line (GPlatform Identity, sheet 34: C4's zoom).
 *
 * **A native range input, styled, and nothing hand-rolled.** The browser's own
 * control already does what a slider owes a keyboard and a screen reader:
 * arrows and Page keys step it, Home and End go to the ends, and it is
 * announced as a slider with its value. A `div` with `role="slider"` would have
 * to rebuild all of it, and the version that forgets Page Up is the one that
 * ships. `aria-valuetext` carries the formatted words, so "140%" is read rather
 * than "1.4".
 *
 * The filled part of the track is the accent and the rest the inset, so the
 * value can be read at a glance; the thumb is the ink, a 20px target on a 4px
 * track. The words at the end are hidden from assistive technology, which
 * already reads them as the value.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  format,
  disabled = false,
  className,
}: SliderProps) {
  const id = useId();
  const words = format === undefined ? String(value) : format(value);
  const share = max === min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className={cn("flex items-center gap-3.5", className)}>
      <label htmlFor={id} className="shrink-0 text-m-label font-medium text-m-ink">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={words}
        onChange={(event) => {
          onValueChange(Number(event.target.value));
        }}
        style={{ "--slider-fill": `${String(share)}%` } as CSSProperties}
        className={cn(
          "h-5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-transparent",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-m-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // The track: the accent up to the value, the inset after it.
          "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full",
          "[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-m-accent)_var(--slider-fill),var(--color-m-inset)_var(--slider-fill))]",
          "[&::-webkit-slider-runnable-track]:shadow-[inset_0_0_0_1px_var(--color-m-control)]",
          "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-m-inset",
          "[&::-moz-range-track]:shadow-[inset_0_0_0_1px_var(--color-m-control)]",
          "[&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-m-accent",
          // The thumb: 20px of ink, centred on the 4px track.
          "[&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none",
          "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-m-ink",
          "[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0",
          "[&::-moz-range-thumb]:bg-m-ink",
        )}
      />
      <span aria-hidden="true" className="shrink-0 font-mono text-m-meta tabular-nums text-m-ink-3">
        {words}
      </span>
    </div>
  );
}
