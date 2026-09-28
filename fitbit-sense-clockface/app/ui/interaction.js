/*
 * Touch: tapping a stat row cycles it to the next metric in its list.
 */
import { vibration } from "haptics";
import { INTERACTION } from "../config/settings";

/**
 * @param stats       object returned by createStats()
 * @param rowConfig   settings.STATS
 * @param selection   mutable array of selected indices (one per row)
 * @param onChange    called with the row index after a change
 */
export function bindRowTaps(stats, rowConfig, selection, onChange) {
  if (!INTERACTION.tapToCycle) return;

  for (let i = 0; i < stats.count; i++) {
    if (rowConfig[i].length < 2) continue; // nothing to cycle to
    (function (index) {
      stats.hitElement(index).addEventListener("click", function () {
        selection[index] = (selection[index] + 1) % rowConfig[index].length;
        if (INTERACTION.haptics) vibration.start("bump");
        onChange(index);
      });
    })(i);
  }
}
