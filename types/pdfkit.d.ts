/**
 * The part of pdfkit (0.20) the monthly report's PDF uses (ticket 34). pdfkit ships no types of its own;
 * these are written here rather than adding a second dependency for them.
 */
declare module "pdfkit" {
  interface TextOptions {
    width?: number;
    height?: number;
    align?: "left" | "center" | "right";
    lineBreak?: boolean;
    ellipsis?: boolean | string;
    characterSpacing?: number;
    /** OpenType features, such as "tnum" for tabular figures. */
    features?: string[];
  }

  interface DocumentOptions {
    size?: string | [number, number];
    margin?: number;
    /** The font the document starts with: a file path or the font's bytes. Without it, pdfkit loads Helvetica. */
    font?: string | Uint8Array;
    bufferPages?: boolean;
    autoFirstPage?: boolean;
    info?: { Title?: string; Author?: string; Subject?: string; Creator?: string; Producer?: string; CreationDate?: Date };
  }

  interface Page {
    width: number;
    height: number;
    margins: { top: number; bottom: number; left: number; right: number };
  }

  class PDFDocument {
    constructor(options?: DocumentOptions);
    page: Page;
    x: number;
    y: number;
    on(event: "data", listener: (chunk: Uint8Array) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    end(): void;
    addPage(options?: DocumentOptions): this;
    bufferedPageRange(): { start: number; count: number };
    switchToPage(index: number): this;
    registerFont(name: string, src: string | Uint8Array): this;
    font(name: string): this;
    fontSize(size: number): this;
    fillColor(color: string, opacity?: number): this;
    strokeColor(color: string, opacity?: number): this;
    lineWidth(width: number): this;
    text(text: string, x?: number, y?: number, options?: TextOptions): this;
    widthOfString(text: string, options?: TextOptions): number;
    currentLineHeight(includeGap?: boolean): number;
    /** A PNG or JPEG, from a file path or its bytes, scaled to `width` × `height` points. */
    image(src: string | Uint8Array, x: number, y: number, options?: { width?: number; height?: number }): this;
    rect(x: number, y: number, width: number, height: number): this;
    roundedRect(x: number, y: number, width: number, height: number, radius: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    dash(length: number, options?: { space: number }): this;
    undash(): this;
    fill(color?: string): this;
    stroke(color?: string): this;
    save(): this;
    restore(): this;
  }

  export default PDFDocument;
}
