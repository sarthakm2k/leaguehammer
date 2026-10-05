import { Radio, WifiOff } from 'lucide-react';
import type { AuctionConnectionStatus } from './useAuctionSocket';

export function ConnectionIndicator({ status }: { status: AuctionConnectionStatus }) {
  const connected = status === 'connected';
  return <span role="status" className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${connected ? 'border-emerald-400/40 text-emerald-300' : 'border-amber-400/40 text-amber-300'}`}>
    {connected ? <Radio size={14} /> : <WifiOff size={14} />}
    {connected ? 'Live connection' : status === 'syncing' ? 'Syncing auction…' : status === 'connecting' ? 'Connecting…' : 'Connection lost · Reconnecting…'}
  </span>;
}
