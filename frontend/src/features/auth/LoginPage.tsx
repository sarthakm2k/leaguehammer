import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, AlertCircle, Mail, LockKeyhole, Eye, EyeOff } from 'lucide-react';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  return <AuthLayout>
    <div className="auth-heading"><span className="league-kicker">WELCOME TO LEAGUEHAMMER</span><h2>Welcome back.</h2><p>Sign in to manage your tournament auction.</p></div>
    {error && <div className="auth-error" role="alert"><AlertCircle size={18} /><span>{error}</span></div>}
    <form onSubmit={handleSubmit} className="auth-form">
      <div><label htmlFor="login-email">Email Address</label><div className="auth-input"><Mail size={20} /><input id="login-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@domain.com" /></div></div>
      <div><label htmlFor="login-password">Password</label><div className="auth-input"><LockKeyhole size={20} /><input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></div>
      <button type="submit" disabled={loading} className="auth-submit"><span>{loading ? 'Authenticating...' : 'Sign In'}</span><ArrowRight size={22} aria-hidden="true" /></button>
    </form>
    <div className="auth-divider"><span>New here?</span></div>
    <p className="auth-account"><Link to="/register">Create Account <ArrowRight size={16} /></Link></p>
    <button type="button" className="auth-demo" onClick={handleQuickDemo}>Fill Demo Organizer Credentials</button>
  </AuthLayout>;
}
