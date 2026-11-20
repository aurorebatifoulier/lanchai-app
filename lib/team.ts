import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { adminErrorMessage } from './adminErrors';

// Admin → Team (owner only) — thin wrappers over functions/src/team.ts. admins/{uid} is
// never written from the app.

export type AdminRole = 'owner' | 'staff';
export interface TeamMember { uid: string; name: string; email: string; role: AdminRole; active: boolean }

export async function listTeam(): Promise<TeamMember[]> {
  try {
    const r = await httpsCallable(functions, 'teamList')({});
    return (r.data as { members: TeamMember[] }).members;
  } catch (err) {
    throw new Error(adminErrorMessage(err, 'Couldn’t load the team'));
  }
}

export async function addTeamMember(email: string, role: AdminRole, name?: string): Promise<void> {
  try {
    await httpsCallable(functions, 'teamAddMember')({ email, role, name });
  } catch (err) {
    throw new Error(adminErrorMessage(err, 'Couldn’t add this person'));
  }
}

export async function updateTeamMember(uid: string, patch: { role?: AdminRole; active?: boolean; name?: string }): Promise<void> {
  try {
    await httpsCallable(functions, 'teamUpdateMember')({ uid, ...patch });
  } catch (err) {
    throw new Error(adminErrorMessage(err, 'Couldn’t update this person'));
  }
}
