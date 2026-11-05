import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// Camera / photo permissions — one place.
// - PHOTOS: the system picker (launchImageLibraryAsync) needs NO permission on iOS 11+ or
//   Android 13+ (Android ≤ 12 asks for storage by itself), so the app never requests photo
//   library access before picking — asking for it on iOS showed a needless "all photos"
//   prompt and a refusal blocked a picker that would have worked.
// - CAMERA: askCamera() before launchCameraAsync. Once refused for good (iOS never asks
//   twice), <CameraOffHint> shows "Camera access is off · Open settings" by itself.

const listeners = new Set<() => void>();

/** Requests the camera (same shape as ImagePicker's) and refreshes every <CameraOffHint>. */
export async function askCamera(): Promise<ImagePicker.CameraPermissionResponse> {
  const res = await ImagePicker.requestCameraPermissionsAsync();
  listeners.forEach(l => l());
  return res;
}

/** True when the camera was refused and the system won't ask again (→ Settings). */
export function useCameraOff(): boolean {
  const [off, setOff] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => {
      ImagePicker.getCameraPermissionsAsync()
        .then(p => { if (alive) setOff(!p.granted && !p.canAskAgain); })
        .catch(() => {});
    };
    check();
    listeners.add(check);
    const sub = AppState.addEventListener('change', st => { if (st === 'active') check(); }); // back from Settings
    return () => { alive = false; listeners.delete(check); sub.remove(); };
  }, []);
  return off;
}
