export const REGISTRATION_API = import.meta.env.VITE_API_BASE_URL || '';

export interface RegistrationForm {
  tournamentId: string; tournamentName: string; slug: string; timeZone: string;
  enabled: boolean; opensAtUtc: string | null; closesAtUtc: string | null;
  closedManually: boolean; finalizedAtUtc: string | null; instructions: string | null;
  status: 'OPEN' | 'SCHEDULED' | 'CLOSED' | 'FINALIZED'; serverTimeUtc: string; photoUploadAvailable: boolean;
}
export interface PlayerDetails {
  name: string; phone: string; email: string; age: string; position: string; preferredFoot: string;
  jerseyNumber: string; previousTeam: string; shortBio: string;
}
export const blankPlayer: PlayerDetails = { name: '', phone: '', email: '', age: '', position: 'Forward', preferredFoot: '', jerseyNumber: '', previousTeam: '', shortBio: '' };
export interface RegistrationEntry extends Omit<PlayerDetails, 'age' | 'jerseyNumber' | 'email' | 'preferredFoot' | 'previousTeam' | 'shortBio'> {
  id: string; age: number | null; jerseyNumber: number | null; email: string | null;
  preferredFoot: string | null; previousTeam: string | null; shortBio: string | null;
  photoUrl: string | null; status: string; reviewReason: string | null; playerId: string | null;
  submittedAtUtc: string; reviewedAtUtc: string | null; possibleDuplicate: boolean;
  hasPhoto: boolean;
}
export interface Receipt { submissionId: string; reference: string; submittedAtUtc: string }
export async function registrationRequest<T>(path: string, init: RequestInit = {}, timeout = 15000): Promise<T> {
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
  const response = await fetch(`${REGISTRATION_API}${path}`, { ...init, signal });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Object.assign(new Error(error.detail || Object.values(error.errors || {}).flat().join(' ') || (response.status === 429 ? 'Too many requests. Wait a minute and retry.' : `Request failed (${response.status}).`)), { status: response.status });
  }
  return response.json();
}
