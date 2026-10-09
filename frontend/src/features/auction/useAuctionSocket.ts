import { useEffect, useRef, useState } from 'react';
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';

export type AuctionConnectionStatus = 'connecting' | 'syncing' | 'connected' | 'reconnecting';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const events = ['PlayerRevealed', 'BidUpdated', 'PlayerSold', 'PlayerUnsold', 'SetCompleted', 'ResultCorrected'];

export function useAuctionSocket(
  tournamentId: string | undefined,
  token: string | null,
  syncState: () => Promise<unknown>,
  onEvent?: (event: string, args: unknown[]) => void,
  onSynchronized?: (recovered: boolean) => void,
) {
  const [status, setStatus] = useState<AuctionConnectionStatus>('connecting');
  const callbacks = useRef({ syncState, onEvent, onSynchronized });
  useEffect(() => { callbacks.current = { syncState, onEvent, onSynchronized }; }, [syncState, onEvent, onSynchronized]);

  useEffect(() => {
    if (!tournamentId) return;
    setStatus('connecting');
    let disposed = false;
    let joined = false;
    let syncing = false;
    let dirty = false;
    let generation = 0;
    let recovering = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const connection = new HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/auction`, { accessTokenFactory: () => token || '' })
      .withAutomaticReconnect({ nextRetryDelayInMilliseconds: context => Math.min(1000 * 2 ** Math.min(context.previousRetryCount, 4), 15000) })
      .configureLogging(LogLevel.Error)
      .build();

    // Coalesce bursts, and fetch again if an event arrived during the preceding fetch.
    const sync = async () => {
      dirty = true;
      if (syncing || !joined || disposed) return;
      syncing = true;
      const syncGeneration = generation;
      clearTimeout(retryTimer);
      setStatus('syncing');
      try {
        while (dirty && !disposed && joined) {
          dirty = false;
          await callbacks.current.syncState();
          if (disposed || !joined || syncGeneration !== generation) return;
        }
        if (!disposed && joined && navigator.onLine && syncGeneration === generation) {
          callbacks.current.onSynchronized?.(recovering);
          recovering = false;
          setStatus('connected');
        }
      } catch {
        if (!disposed && syncGeneration === generation) {
          recovering = true;
          setStatus(navigator.onLine ? 'syncing' : 'reconnecting');
          retryTimer = setTimeout(() => { void sync(); }, 2000);
        }
      } finally {
        syncing = false;
        if (dirty && joined && !disposed) void sync();
      }
    };

    const joinAndSync = async () => {
      if (disposed) return;
      const joinGeneration = ++generation;
      recovering = true;
      setStatus('syncing');
      await connection.invoke('JoinAuction', tournamentId);
      if (disposed || joinGeneration !== generation || !navigator.onLine || connection.state !== HubConnectionState.Connected) return;
      joined = true;
      await sync();
    };
    const start = async () => {
      if (disposed || !navigator.onLine || connection.state !== HubConnectionState.Disconnected) return;
      try {
        await connection.start();
        await joinAndSync();
      } catch {
        joined = false;
        if (!disposed) {
          setStatus('reconnecting');
          await connection.stop();
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => { void start(); }, 3000);
        }
      }
    };

    events.forEach(event => connection.on(event, (...args: unknown[]) => {
      if (!disposed) callbacks.current.onEvent?.(event, args);
    }));
    connection.on('AuctionStateChanged', () => { void sync(); });
    connection.on('TeamUpdated', () => { void sync(); });
    connection.onreconnecting(() => { generation++; recovering = true; joined = false; if (!disposed) setStatus('reconnecting'); });
    connection.onreconnected(() => {
      void joinAndSync().catch(() => { joined = false; void connection.stop(); });
    });
    connection.onclose(() => {
      generation++; recovering = true;
      joined = false;
      if (!disposed) {
        setStatus('reconnecting');
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => { void start(); }, 3000);
      }
    });
    const resync = () => {
      if (connection.state === HubConnectionState.Connected) void sync();
      else if (connection.state === HubConnectionState.Disconnected) void start();
    };
    const onOffline = () => {
      if (disposed) return;
      generation++; recovering = true;
      joined = false;
      setStatus('reconnecting');
      // Browsers can report offline while keeping a WebSocket open. Close it so recovery must rejoin and sync.
      void connection.stop();
    };
    window.addEventListener('online', resync);
    window.addEventListener('offline', onOffline);
    const onVisible = () => { if (document.visibilityState === 'visible') resync(); };
    document.addEventListener('visibilitychange', onVisible);
    void start();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      window.removeEventListener('online', resync);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      // Stopping also removes all group memberships. StrictMode cleanup may happen during start().
      void connection.stop();
    };
  }, [tournamentId, token]);

  return status;
}
