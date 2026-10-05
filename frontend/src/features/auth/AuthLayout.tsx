import type { ReactNode } from 'react';
import { Gavel, Users, Wallet, ShieldCheck } from 'lucide-react';
import { LeagueHammerBrand } from '../../components/LeagueHammerBrand';

export function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="league-auth">
    <section className="auth-story" aria-label="LeagueHammer football auctions">
      <div className="auth-story-top"><LeagueHammerBrand /><span className="auth-control-label"><i />Tournament control center</span></div>
      <div className="auth-story-copy"><span className="league-kicker">THE NEXT GREAT SQUAD STARTS HERE</span><h1>Build your squad.<br /><em>Own the auction.</em></h1><p>Every player. Every bid. Your tournament, under control.</p></div>
      <div className="auth-features"><span><Users />Manage<br />teams</span><span><Gavel />Run live<br />auctions</span><span><Wallet />Track players<br />& budgets</span></div>
      <span className="auth-image-credit">YOUR LEAGUE. YOUR MOMENT.</span>
    </section>
    <section className="auth-panel"><div className="auth-mobile-brand"><LeagueHammerBrand /></div><div className="auth-form-shell">{children}<div className="auth-security"><ShieldCheck /><div><strong>Secure tournament access</strong><p>Sign in to your account to manage your tournaments and live auctions.</p></div></div></div><p className="auth-footer">LeagueHammer · Built for the beautiful game.</p></section>
  </main>;
}
