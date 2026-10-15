import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig } from '../config';

export type PowerAction = 'poweroff' | 'reboot';

/**
 * Asks the Empathika box to turn off or restart. Empathika runs in a container and can't do it herself:
 * she leaves a note in the folder she shares with the box (/run/empathika), and the box's empathika-power
 * service carries it out (scripts/pi/empathika-power.sh). Returns false when not on the box.
 */
export function requestPower(cfg: AppConfig, action: PowerAction): boolean {
  if (!cfg.face.onBox) return false;
  try {
    writeFileSync(join(cfg.face.runDir, 'power-request'), action);
    return true;
  } catch {
    return false;
  }
}
