import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// Admin → Team (owner only) — thin wrappers over functions/src/team.ts. admins/{uid} is
// never written from the app.

export type AdminRole = 'owner' | 'staff';
export interface TeamMember { uid: string; name: string; email: string; role: AdminRole; active: boolean }

const message = (err: unknown, fallback: string) => {
  const e = err as { message?: string; details?: { code?: string } };
  // HttpsError messages from our callables are written for staff; anything else → fallback.
  return e?.details?.code && e.message ? e.message : fallback;
};

export async function listTeam(): Promise<TeamMember[]> {
  try {
    const r = await httpsCallable(functions, 'teamList')({});
    return (r.data as { members: TeamMember[] }).members;
  } catch (err) {
    throw new Error(message(err, 'Couldn’t load the team. Please try again.'));
  }
}

export async function addTeamMember(email: string, role: AdminRole, name?: string): Promise<void> {
  try {
    await httpsCallable(functions, 'teamAddMember')({ email, role, name });
  } catch (err) {
    throw new Error(message(err, 'Couldn’t add this person. Please try again.'));
  }
}

export async function updateTeamMember(uid: string, patch: { role?: AdminRole; active?: boolean; name?: string }): Promise<void> {
  try {
    await httpsCallable(functions, 'teamUpdateMember')({ uid, ...patch });
  } catch (err) {
    throw new Error(message(err, 'Couldn’t update this person. Please try again.'));
  }
}
