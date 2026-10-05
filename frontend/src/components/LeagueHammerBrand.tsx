export function LeagueHammerBrand({ compact = false }: { compact?: boolean }) {
  return <span className={`league-brand${compact ? ' league-brand-compact' : ''}`}>
    <img src="/brand/leaguehammer.png" alt="LeagueHammer" width="2172" height="724" />
  </span>;
}
