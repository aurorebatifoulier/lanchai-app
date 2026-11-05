import * as Updates from 'expo-updates';
import { vteWhen } from './vteTime';

// EAS Update (over-the-air JS updates). Config: app.json `updates` (checked ON_LOAD with a
// 0 ms timeout — the app never waits: a new update downloads in the background and runs on
// the NEXT cold start) + `runtimeVersion.policy: fingerprint` (an update only reaches builds
// with the exact same native code). Channels = the EAS build profile (development /
// preview / production, eas.json). Publish ONLY through `npm run update:publish`.

export interface UpdateInfo {
  enabled: boolean;
  channel: string;
  runtime: string;
  /** "Built-in" = the JS shipped inside the store build; else the OTA update's date. */
  source: string;
}

export function updateInfo(): UpdateInfo {
  const enabled = Updates.isEnabled;
  const created = Updates.createdAt?.getTime();
  return {
    enabled,
    channel: Updates.channel || '—',
    runtime: (Updates.runtimeVersion ?? '—').slice(0, 10),
    source: !enabled ? 'Expo Go / development'
      : Updates.isEmbeddedLaunch || !created ? 'Built-in'
      : `Update of ${vteWhen(created)}`,
  };
}

/** Admin "Check for update": 'none' | 'off', or downloads it and restarts the app. */
export async function checkAndApplyUpdate(): Promise<'none' | 'off'> {
  if (!Updates.isEnabled) return 'off';
  const res = await Updates.checkForUpdateAsync();
  if (!res.isAvailable) return 'none';
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
  return 'none'; // not reached — the app restarts
}
