// Tiny shared flag: true while the sign-up screen is still writing the new account's
// profile (after the guest session was linked). The root layout then leaves the sign-in
// screen alone — the screen navigates away itself once the profile is saved.
let busy = false;
export const authFlow = {
  get busy() { return busy; },
  set busy(v: boolean) { busy = v; },
};
