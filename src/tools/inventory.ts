import {
  ABC_CLASSES,
  type AbcClass,
  abcClasses,
  cents,
  type GroupFigures,
  groupFigures,
  ordersBy,
  type Ratio,
  ratio,
  shareOfValue,
  type SkuValue,
} from "@/domain/definitions";
import type { Order } from "@/domain/orders";

/**
 * Inventory (ticket 33): the SKUs by value in their ABC classes, and the product categories. The
 * definitions are domain/definitions'; this only groups, counts and sorts. Pure: no clock, no network.
 */

/** One ABC class: its SKUs as a share of all SKUs, and its gross value as a share of all value. */
export interface AbcClassFigures {
  abcClass: AbcClass;
  skus: Ratio;
  value: Ratio;
}

/** A product category's figures and its share of all gross value. */
export interface CategoryRow {
  category: string;
  figures: GroupFigures;
  share: Ratio;
}

/**
 * How the value spreads over the catalogue. In the Pareto rule's 80/20, a fifth of the SKUs make 80% of
 * the value: concentrated. When class A needs more than that, the catalogue is flat.
 */
export type CatalogueShape = "flat" | "concentrated";

/** The share of SKUs class A may hold for the catalogue to count as concentrated: the Pareto rule's 20%. */
export const PARETO_SKU_SHARE = 0.2;

export interface Inventory {
  /** Every SKU, ranked by gross value with its class. */
  skus: SkuValue[];
  /** Every order, as one group, and its share of value: all of it. */
  total: Omit<CategoryRow, "category">;
  /** A, B and C, in that order, empty ones included. */
  classes: AbcClassFigures[];
  shape: CatalogueShape;
  /** By gross value, highest first, ties by name. */
  categories: CategoryRow[];
}

function classFigures(skus: readonly SkuValue[], totalValue: number): AbcClassFigures[] {
  return ABC_CLASSES.map((abcClass) => {
    const members = skus.filter((sku) => sku.abcClass === abcClass);
    return {
      abcClass,
      skus: ratio(members.length, skus.length),
      // Summed in cents, as the classes were drawn, so a class's share sits exactly where its SKUs put it.
      value: ratio(members.reduce((sum, sku) => sum + cents(sku.grossValue), 0) / 100, totalValue),
    };
  });
}

function categoryRows(orders: readonly Order[]): CategoryRow[] {
  return [...ordersBy(orders, (order) => order.product_category)]
    .map(([category, categoryOrders]) => ({ category, figures: groupFigures(categoryOrders), share: shareOfValue(categoryOrders, orders) }))
    // To the cent, so floating point never breaks a tie.
    .sort((a, b) => cents(b.figures.grossValue) - cents(a.figures.grossValue) || a.category.localeCompare(b.category, "en"));
}

/** The Inventory page's figures over a set of orders. */
export function inventory(orders: readonly Order[]): Inventory {
  const skus = abcClasses(orders);
  const total = { figures: groupFigures(orders), share: shareOfValue(orders, orders) };
  const classes = classFigures(skus, total.figures.grossValue);
  const shareInA = classes.find(({ abcClass }) => abcClass === "A")?.skus.value ?? 0;
  return {
    skus,
    total,
    classes,
    shape: shareInA > PARETO_SKU_SHARE ? "flat" : "concentrated",
    categories: categoryRows(orders),
  };
}
