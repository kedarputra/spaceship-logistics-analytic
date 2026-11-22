import mark from "../../assets/wms-mark.png";

/**
 * The product's mark, the WMS logo (assets/wms-mark.png, made by scripts/brand-assets.mts). Imported,
 * so the build serves it from /_next/static, which the sign-in page can load before anyone signs in.
 * It only decorates: the product's name always sits beside it.
 */
export function BrandMark({ size = 34 }: { size?: number }) {
  // A plain img: the file is already small and square, so the image optimizer would add nothing.
  return <img src={mark.src} width={size} height={size} alt="" aria-hidden="true" className="shrink-0" />;
}
