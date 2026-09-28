/*
 * Builds every visual component once at startup and returns them together.
 * This is the seam between "data/modes" and "pixels": to restyle the face
 * from a new Figma design you change config/ + resources/, not this wiring.
 */
import { createBackground } from "./background";
import { createClockText } from "./clockText";
import { createBattery } from "./battery";
import { createSlots } from "./slots";

export function createFace(slotConfig) {
  return {
    background: createBackground(),
    clockText: createClockText(),
    battery: createBattery(),
    slots: createSlots(slotConfig)
  };
}
