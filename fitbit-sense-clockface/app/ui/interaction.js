/*
 * Touch: tapping a metric slot cycles it to the next metric in its list.
 */
import { vibration } from "haptics";
import { INTERACTION } from "../config/settings";

/**
 * @param slots        object returned by createSlots()
 * @param slotConfig   settings.SLOTS
 * @param selection    mutable array of selected indices (one per slot)
 * @param onChange     called with the slot index after a change
 */
export function bindSlotTaps(slots, slotConfig, selection, onChange) {
  if (!INTERACTION.tapToCycle) return;

  for (let i = 0; i < slots.count; i++) {
    if (slotConfig[i].length < 2) continue; // nothing to cycle to
    (function (index) {
      slots.hitElement(index).addEventListener("click", function () {
        selection[index] = (selection[index] + 1) % slotConfig[index].length;
        if (INTERACTION.haptics) vibration.start("bump");
        onChange(index);
      });
    })(i);
  }
}
