import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { CHART_INK, PRINT_INK } from "@/components/palette";
import { monthLabel, type ReportSection, type ReportTable, reportSections, reportWeeks } from "@/components/report-sections";
import { niceScale } from "@/components/scale";
import { OUTCOME_SERIES } from "@/components/series";
import { formatCount } from "@/domain/format";
import { formatDate } from "@/domain/periods";
import type { MonthlyReport } from "@/tools/report";

/**
 * The monthly report as a PDF (ticket 34): A4 portrait, one or two pages, drawn on the server with pdfkit
 * from the same sections as the Reports page (components/report-sections), and one vector bar chart of
 * the delivery outcomes per week. Figtree is embedded from the repository's own file (OFL, beside it);
 * nothing is fetched, so nothing in a report leaves this server. Colours are ADR 0011's, from palette.ts.
 */

export const APP_NAME = "Logistics Analytics";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts", "figtree");
let figtree: { regular: Buffer; bold: Buffer } | undefined;

/** The two weights the report uses, read from disk once. */
function fonts(): { regular: Buffer; bold: Buffer } {
  figtree ??= { regular: readFileSync(path.join(FONT_DIR, "Figtree-Regular.ttf")), bold: readFileSync(path.join(FONT_DIR, "Figtree-Bold.ttf")) };
  return figtree;
}

export function reportPdfName(month: string): string {
  return `wms-report-${month}.pdf`;
}

export interface PdfContext {
  /** The dataset's name, as the rail shows it. */
  dataset: string;
  /** When the file was made; shown as the server's local date. */
  generatedAt: Date;
}

const MARGIN = 40;
const FOOTER_ROOM = 18;
const SIZE = { label: 7.5, title: 18, meta: 8.5, section: 11, basis: 8, head: 7.5, cell: 8.5, tag: 6.5, footer: 7.5, chart: 7.5 } as const;
const ROW = 14.5;
const HEAD_ROW = 16;
const PAD = 5;
const SECTION_GAP = 14;
const SECTION_TITLE = 20;
const NUMBERS = { features: ["tnum"] };
const SMALL_SAMPLE = "small sample";

type Doc = InstanceType<typeof PDFDocument>;

function setText(doc: Doc, weight: "regular" | "bold", size: number, color: string): Doc {
  return doc.font(weight).fontSize(size).fillColor(color);
}

/** One line of text at (x, y), never wrapped; right-aligned to `right` when given. */
function line(doc: Doc, text: string, x: number, y: number, { right, numeric = false }: { right?: number; numeric?: boolean } = {}): void {
  const options = { lineBreak: false, ...(numeric ? NUMBERS : {}) };
  doc.text(text, right === undefined ? x : right - doc.widthOfString(text, options), y, options);
}

/** The local date of a moment as YYYY-MM-DD. */
function localDate(moment: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}

function tagWidth(doc: Doc): number {
  setText(doc, "bold", SIZE.tag, PRINT_INK.warnInk);
  return doc.widthOfString(SMALL_SAMPLE) + 6;
}

/** Each column's width: what its widest cell needs, the room left shared out evenly, or all shrunk to fit. */
function columnWidths(doc: Doc, table: ReportTable, width: number): number[] {
  const tag = table.smallSample?.some(Boolean) ? tagWidth(doc) + 4 : 0;
  const needs = table.headers.map((header, column) => {
    setText(doc, "bold", SIZE.head, PRINT_INK.muted);
    let widest = doc.widthOfString(header);
    setText(doc, "regular", SIZE.cell, PRINT_INK.ink);
    for (const row of table.rows) widest = Math.max(widest, doc.widthOfString(row[column] ?? "", NUMBERS) + (column === 0 ? tag : 0));
    setText(doc, "bold", SIZE.cell, PRINT_INK.ink);
    if (table.footer !== undefined) widest = Math.max(widest, doc.widthOfString(table.footer[column] ?? "", NUMBERS));
    return widest + 2 * PAD;
  });
  const total = needs.reduce((sum, each) => sum + each, 0);
  if (total > width) return needs.map((each) => (each * width) / total);
  const extra = (width - total) / needs.length;
  return needs.map((each) => each + extra);
}

function tableHeight(table: ReportTable): number {
  return HEAD_ROW + table.rows.length * ROW + (table.footer === undefined ? 0 : ROW);
}

function drawRow(doc: Doc, cells: readonly string[], widths: readonly number[], table: ReportTable, x: number, y: number, bold: boolean, smallSample = false): void {
  let left = x;
  cells.forEach((cell, column) => {
    const width = widths[column] ?? 0;
    const numeric = column >= table.numericFrom;
    setText(doc, bold ? "bold" : "regular", SIZE.cell, PRINT_INK.ink);
    line(doc, cell, left + PAD, y + 3.5, numeric ? { right: left + width - PAD, numeric: true } : {});
    if (column === 0 && smallSample) {
      const tagLeft = left + PAD + doc.widthOfString(cell) + 4;
      const tag = tagWidth(doc);
      doc.roundedRect(tagLeft, y + 3, tag, 9, 2).fill(PRINT_INK.warnTint);
      setText(doc, "bold", SIZE.tag, PRINT_INK.warnInk);
      line(doc, SMALL_SAMPLE, tagLeft + 3, y + 4.4);
    }
    left += width;
  });
}

/** A table: the headings on the inset ground, a rule under each row, and a totals row. Returns where it ends. */
function drawTable(doc: Doc, table: ReportTable, x: number, y: number, width: number): number {
  const widths = columnWidths(doc, table, width);
  doc.rect(x, y, width, HEAD_ROW).fill(PRINT_INK.inset);
  let left = x;
  table.headers.forEach((header, column) => {
    const cellWidth = widths[column] ?? 0;
    setText(doc, "bold", SIZE.head, PRINT_INK.muted);
    line(doc, header, left + PAD, y + 4.5, column >= table.numericFrom ? { right: left + cellWidth - PAD } : {});
    left += cellWidth;
  });
  let top = y + HEAD_ROW;
  table.rows.forEach((row, index) => {
    drawRow(doc, row, widths, table, x, top, false, table.smallSample?.[index] ?? false);
    top += ROW;
    doc.moveTo(x, top).lineTo(x + width, top).lineWidth(0.5).stroke(PRINT_INK.grid);
  });
  if (table.footer !== undefined) {
    doc.rect(x, top, width, ROW).fill(PRINT_INK.inset);
    drawRow(doc, table.footer, widths, table, x, top, true);
    top += ROW;
  }
  doc.moveTo(x, y).lineTo(x + width, y).lineTo(x + width, top).lineTo(x, top).lineTo(x, y).lineWidth(0.5).stroke(PRINT_INK.line);
  return top;
}

const PLOT_HEIGHT = 92;
const CHART_LABELS = 64;
const CHART_HEIGHT = 12 + PLOT_HEIGHT + 14 + OUTCOME_SERIES.length * 11 + 16;

/**
 * Delivery outcomes per week, stacked bars with each week's total above it. Under the weeks, a row per
 * outcome gives every segment's value, keyed by its colour: the amber marks are under 3:1 on white, so
 * the chart keeps its values (ADR 0011 §3).
 */
function drawWeeks(doc: Doc, report: MonthlyReport, x: number, y: number, width: number): number {
  const { bars, note } = reportWeeks(report);
  const scale = niceScale(Math.max(0, ...bars.map(({ delivered }) => delivered)));
  const plotLeft = x + CHART_LABELS;
  const plotWidth = width - CHART_LABELS;
  const plotTop = y + 12;
  const base = plotTop + PLOT_HEIGHT;
  const yOf = (value: number) => base - (value / scale.max) * PLOT_HEIGHT;

  for (const tick of scale.ticks) {
    doc.moveTo(plotLeft, yOf(tick)).lineTo(plotLeft + plotWidth, yOf(tick)).lineWidth(0.5).stroke(tick === 0 ? CHART_INK.axis : CHART_INK.grid);
    setText(doc, "regular", SIZE.chart, CHART_INK.label);
    line(doc, formatCount(tick), x, yOf(tick) - 3.5, { right: plotLeft - 6, numeric: true });
  }

  const slot = plotWidth / Math.max(1, bars.length);
  const barWidth = Math.min(30, slot * 0.5);
  bars.forEach(({ label, values, delivered }, index) => {
    const center = plotLeft + slot * (index + 0.5);
    let stacked = 0;
    for (const { key, color } of OUTCOME_SERIES) {
      const value = values[key];
      if (value === 0) continue;
      const top = yOf(stacked + value);
      // A 1 pt gap between segments, as the screen's charts leave one.
      doc.rect(center - barWidth / 2, top, barWidth, Math.max(0.5, yOf(stacked) - top - (stacked === 0 ? 0 : 1))).fill(color);
      stacked += value;
    }
    // The week's delivered orders above its bar: a count of its own, not the segments summed (ADR 0011 §3).
    setText(doc, "bold", SIZE.chart, PRINT_INK.ink);
    line(doc, formatCount(delivered), center - doc.widthOfString(formatCount(delivered), NUMBERS) / 2, yOf(delivered) - 10, { numeric: true });
    setText(doc, "regular", SIZE.chart, PRINT_INK.muted);
    line(doc, label, center - doc.widthOfString(label) / 2, base + 4);
  });

  let rowTop = base + 16;
  for (const { key, label, color } of OUTCOME_SERIES) {
    doc.rect(x, rowTop + 1.5, 7, 7).fill(color);
    setText(doc, "regular", SIZE.chart, PRINT_INK.ink);
    line(doc, label, x + 11, rowTop);
    bars.forEach(({ values }, index) => {
      const text = formatCount(values[key]);
      line(doc, text, plotLeft + slot * (index + 0.5) - doc.widthOfString(text, NUMBERS) / 2, rowTop, { numeric: true });
    });
    rowTop += 11;
  }
  setText(doc, "regular", SIZE.chart, PRINT_INK.muted);
  line(doc, note, x, rowTop + 3);
  return rowTop + 14;
}

function sectionHeight(section: ReportSection): number {
  const table = section.table.rows.length === 0 ? ROW : tableHeight(section.table);
  return SECTION_TITLE + table + (section.id === "outcomes" ? 8 + CHART_HEIGHT : 0);
}

function drawSection(doc: Doc, report: MonthlyReport, section: ReportSection, x: number, y: number, width: number): number {
  setText(doc, "bold", SIZE.section, PRINT_INK.ink);
  line(doc, section.title, x, y);
  setText(doc, "regular", SIZE.basis, PRINT_INK.muted);
  line(doc, section.basis, x, y + 2.5, { right: x + width });
  const top = y + SECTION_TITLE;
  if (section.table.rows.length === 0) {
    setText(doc, "regular", SIZE.cell, PRINT_INK.muted);
    line(doc, section.empty, x, top);
    return top + ROW;
  }
  const end = drawTable(doc, section.table, x, top, width);
  return section.id === "outcomes" ? drawWeeks(doc, report, x, end + 8, width) : end;
}

function drawHeader(doc: Doc, report: MonthlyReport, context: PdfContext, x: number, y: number, width: number): number {
  setText(doc, "bold", SIZE.label, PRINT_INK.muted);
  doc.text(APP_NAME.toUpperCase(), x, y, { lineBreak: false, characterSpacing: 0.6 });
  setText(doc, "bold", SIZE.title, PRINT_INK.ink);
  line(doc, `Monthly WMS report · ${monthLabel(report.current.month)}`, x, y + 12);
  setText(doc, "regular", SIZE.meta, PRINT_INK.muted);
  line(doc, `Dataset ${context.dataset} · Data as of ${formatDate(report.anchor)} · Generated ${formatDate(localDate(context.generatedAt))}`, x, y + 37);
  const end = y + 54;
  doc.moveTo(x, end).lineTo(x + width, end).lineWidth(0.75).stroke(PRINT_INK.line);
  return end + 14;
}

/** The page footer: the report's name and "Page 1 of 2", in the bottom margin. */
function drawFooters(doc: Doc, report: MonthlyReport): void {
  const { start, count } = doc.bufferedPageRange();
  for (let index = start; index < start + count; index += 1) {
    doc.switchToPage(index);
    const y = doc.page.height - MARGIN + 6;
    const right = doc.page.width - MARGIN;
    setText(doc, "regular", SIZE.footer, PRINT_INK.muted);
    line(doc, `${APP_NAME} · Monthly WMS report, ${monthLabel(report.current.month)}`, MARGIN, y);
    line(doc, `Page ${index - start + 1} of ${count}`, MARGIN, y, { right });
  }
}

function draw(doc: Doc, report: MonthlyReport, context: PdfContext): void {
  const width = doc.page.width - 2 * MARGIN;
  const bottom = doc.page.height - MARGIN - FOOTER_ROOM;
  let y = drawHeader(doc, report, context, MARGIN, MARGIN, width);
  for (const section of reportSections(report)) {
    if (y + sectionHeight(section) > bottom) {
      doc.addPage();
      y = MARGIN;
    }
    y = drawSection(doc, report, section, MARGIN, y, width) + SECTION_GAP;
  }
  drawFooters(doc, report);
}

/** The PDF's bytes. Pure but for reading the font files: the clock comes in with `context`. */
export function renderReportPdf(report: MonthlyReport, context: PdfContext): Promise<Buffer> {
  const { regular, bold } = fonts();
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    // Figtree from the start, so pdfkit never loads its built-in Helvetica.
    font: regular,
    bufferPages: true,
    info: { Title: `Monthly WMS report, ${monthLabel(report.current.month)}`, Author: APP_NAME, Creator: APP_NAME, CreationDate: context.generatedAt },
  });
  doc.registerFont("regular", regular);
  doc.registerFont("bold", bold);
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc, report, context);
      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
