import { registrationRequest } from '../registrations/registrationApi';

export interface FanMember { name: string; photoUrl: string | null; position: string | null; role: string | null }
export interface FanOption {
  id: string; name: string; photoUrl: string | null; subtitle: string; price: number | null;
  squad: FanMember[] | null; votes: number | null; percentage: number | null;
}
export interface FanPoll {
  id: string; category: string; title: string; description: string; isOpen: boolean;
  selectedOptionId: string | null; totalVotes: number | null; options: FanOption[];
}
export interface FanPage { tournamentId: string; tournamentName: string; slug: string; logoUrl: string | null; currencyCode: string; polls: FanPoll[] }
export interface FanAdminPoll { category: string; title: string; enabled: boolean; isOpen: boolean; optionCount: number; voteCount: number; resultsPublished?: boolean }
export interface FanAdmin { auctionCompleted: boolean; publicLiveViewEnabled: boolean; polls: FanAdminPoll[] }
export const fanRoot = (slug: string) => `/api/public/tournaments/${encodeURIComponent(slug)}/fan-choice`;
export const fanRequest = registrationRequest;
const identityKey = (slug: string) => `leaguehammer:fan-choice:v1:${slug}`;

export function readFanIdentity(slug: string): string | null {
  try { const token = localStorage.getItem(identityKey(slug)); return token && /^[a-f0-9]{64}$/.test(token) ? token : null; }
  catch { return null; }
}

export async function ensureFanIdentity(slug: string): Promise<string> {
  const create = () => {
    const existing = readFanIdentity(slug);
    if (existing) return existing;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    try {
      localStorage.setItem(identityKey(slug), token);
      if (localStorage.getItem(identityKey(slug)) !== token) throw new Error('Storage unavailable');
    } catch { throw new Error('Enable browser storage before voting so this browser can remember your permanent votes.'); }
    return token;
  };
  // Concurrent tabs in the same browser share one identity rather than creating competing identities.
  return navigator.locks ? navigator.locks.request(identityKey(slug), create) : create();
}

export const fanHeaders = (token: string | null) => token ? { 'X-Fan-Voter': token } : undefined;
