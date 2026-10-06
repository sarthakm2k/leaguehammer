import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PublicAuctionLotDto } from './auctionTypes';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const subscribeMotion = (notify: () => void) => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change',notify);
  return () => media.removeEventListener('change',notify);
};

/** Only live reveal events start the sequence. Loading/rejoining fetches never do. */
export function usePlayerReveal(lot: PublicAuctionLotDto | null | undefined, status?: string, enabled = true) {
  const reduced = useSyncExternalStore(subscribeMotion,reducedMotion,() => true);
  const seen = useRef(new Set<string>());
  const [target, setTarget] = useState<string | null>(null);
  const onEvent = useCallback((event: string, args: unknown[]) => {
    if(event === 'PlayerRevealed') {
      const revealed = args[0] as PublicAuctionLotDto | undefined;
      if(!revealed?.lotId || seen.current.has(revealed.lotId)) return;
      seen.current.add(revealed.lotId);
      setTarget(enabled && !reducedMotion() ? revealed.lotId : null);
    } else if(['BidUpdated','PlayerSold','PlayerUnsold','ResultCorrected','SetCompleted'].includes(event)) {
      setTarget(null);
    }
  },[enabled]);
  const revealing = enabled && !reduced && target != null && target === lot?.lotId && lot.status === 'ON_AUCTION' && lot.currentBid == null && status === 'LIVE';
  useEffect(() => {
    if(!revealing) return;
    const timer=window.setTimeout(() => setTarget(null),4000);
    return () => window.clearTimeout(timer);
  },[revealing,target]);
  useEffect(() => {
    if(target && (!enabled || reduced || (lot?.lotId === target && (status !== 'LIVE' || lot.status !== 'ON_AUCTION' || lot.currentBid != null)))) setTarget(null);
  },[enabled,reduced,lot?.lotId,lot?.status,lot?.currentBid,status,target]);
  return { revealing, onEvent };
}
