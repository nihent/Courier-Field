/**
 * Zero-GC mutable touch input state shared between the Mobile Touch Deck (GameHud)
 * and the 60fps simulation loop (GameCanvas).
 * Supports simultaneous multi-touch (e.g. left-thumb steering rocker + right-thumb gas/brake/boost/toss)
 * without triggering React re-renders.
 */
export interface TouchControlState {
  steerLeft: boolean;
  steerRight: boolean;
  steerAnalog: number; // -1 (full left) .. +1 (full right), 0 when inactive
  steerTouchActive: boolean;
  gas: boolean;
  brake: boolean;
  boostPulse: boolean;
  deliverPulse: boolean;
  hornPulse: boolean;
  demoTogglePulse: boolean;
}

export const touchControls: TouchControlState = {
  steerLeft: false,
  steerRight: false,
  steerAnalog: 0,
  steerTouchActive: false,
  gas: false,
  brake: false,
  boostPulse: false,
  deliverPulse: false,
  hornPulse: false,
  demoTogglePulse: false,
};

export function resetTouchControls(): void {
  touchControls.steerLeft = false;
  touchControls.steerRight = false;
  touchControls.steerAnalog = 0;
  touchControls.steerTouchActive = false;
  touchControls.gas = false;
  touchControls.brake = false;
  touchControls.boostPulse = false;
  touchControls.deliverPulse = false;
  touchControls.hornPulse = false;
}
