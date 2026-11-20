/**
 * Chart colors: the first five categorical slots of the dataviz reference palette, in fixed order,
 * and the lighter step of the blue ramp for small samples. Validated on the white card surface:
 * all checks pass; aqua, yellow and magenta are under 3:1 contrast, so every chart ships a legend
 * or labels and a table.
 */
export const SERIES_COLORS = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
  magenta: "#e87ba4",
} as const;

/** Blue ramp step 250: the lightest step that still clears 2:1 on white. */
export const SMALL_SAMPLE_BLUE = "#86b6ef";

/** The series blue at 15% on white, solid so the legend swatch matches: a forecast's 95% range band. */
export const RANGE_BLUE = "#dfebf9";

export const CHART_INK = {
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  label: "#52514e",
} as const;
