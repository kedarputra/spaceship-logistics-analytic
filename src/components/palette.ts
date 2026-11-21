/**
 * Chart marks (ADR 0011 §3): deeper steps of the brand colours, checked with the dataviz validator on
 * white. On time, delayed, exception: lightness inside the band, chroma ≥ 0.10, colour-blind ΔE 14.6,
 * normal-vision ΔE 20.2. Amber marks are under 3:1 on white, so every chart keeps value labels or its
 * data table. The same values are CSS variables in globals.css; Recharts and SVG need them as values.
 */
export const MARKS = {
  /** On time, and any single series. */
  onTime: "#2a8763",
  /** Delayed, and delay rates. */
  delayed: "#e39a2e",
  exception: "#b4533a",
  /** A small sample of an amber series: drawn with a 1 px `delayed` ring and a "small sample" tag. */
  smallAmber: "#f6d3a1",
  /** A small sample of a green series: sage. */
  smallGreen: "#afd0bf",
  /** The forecast line, dashed. */
  forecastLine: "#c27a16",
  /** The forecast's 95% range, drawn at BAND_OPACITY. */
  band: "#f4b266",
} as const;

export const BAND_OPACITY = 0.3;

/**
 * The ABC classes of SKUs (ticket 33) in the three outcome marks, validated together in this order: A on
 * time's green, B delayed's amber, C exception's rust. Each always shows with its letter.
 */
export const ABC_MARKS = { A: MARKS.onTime, B: MARKS.delayed, C: MARKS.exception } as const;

/** An area under a line: the series hue as a wash. */
export const AREA_OPACITY = 0.1;

/**
 * The two statuses that are not delivery outcomes, for a breakdown by status. Validated after the three
 * outcome marks in stack order: every adjacent pair passes (worst colour-blind ΔE 10.5), and the chart
 * keeps its legend and table.
 */
export const STATUS_MARKS = {
  inTransit: "#2f6fae",
  canceled: "#d27bae",
} as const;

export const CHART_INK = {
  grid: "#edf1ec",
  axis: "#c9d1cb",
  label: "#5e6b64",
  /** The card surface: the gap between stacked segments and the ring around points. */
  surface: "#ffffff",
  /** A reference line, dashed: grey-green, as icons are. */
  reference: "#808f87",
  /** Text drawn on a chart that is not a tick: a class's letter. */
  ink: "#17201c",
} as const;
