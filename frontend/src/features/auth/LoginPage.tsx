import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Trophy, LogIn, AlertCircle } from 'lucide-react';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      const requested = location.state?.from;
      const destination = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//') && !requested.includes('\\')
        ? requested : '/dashboard';
      navigate(destination, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = () => {
    setEmail('admin@malabarfc.com');
    setPassword('SecureAuction2026!');
  };

  return (
    <div className="min-h-screen bg-[#090d16] flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-4">
          <Trophy className="w-7 h-7 text-slate-950 stroke-[2.5]" />
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight text-white">
          Sign In to Football Auction
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          Enter your tournament organizer credentials
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#0e1424] py-8 px-4 shadow-2xl border border-slate-800 sm:rounded-2xl sm:px-10 space-y-6">
          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3.5 flex items-start space-x-3 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300">
                Email Address
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="organizer@league.com"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">
                Password
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center space-x-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-slate-950 bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleQuickDemo}
              className="text-amber-400 hover:text-amber-300 font-medium transition-colors"
            >
              Fill Demo Organizer Credentials
            </button>
            <Link
              to="/register"
              className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
