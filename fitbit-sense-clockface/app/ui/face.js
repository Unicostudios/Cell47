/*
 * Builds every visual component once at startup and returns them together.
 * This is the seam between "data/modes" and "pixels": to restyle the face
 * from a new Figma design you change config/ + resources/, not this wiring.
 */
import { createBackground } from "./background";
import { createFrame } from "./frame";
import { createClockText } from "./clockText";
import { createBattery } from "./battery";
import { createStats } from "./stats";

export function createFace(statConfig) {
  return {
    background: createBackground(),
    frame: createFrame(),
    clockText: createClockText(),
    battery: createBattery(),
    stats: createStats(statConfig)
  };
}
