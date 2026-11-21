import { METRICS } from "@/domain/definitions";
import { lowered } from "@/tools/words";

/** What every value heading says in its info popover (ticket 33): the file's order value is gross (docs/data.md trap 6). */
export const GROSS_VALUE_NOTE = `Value is gross: ${lowered(METRICS.gross_order_value.definition)}`;
