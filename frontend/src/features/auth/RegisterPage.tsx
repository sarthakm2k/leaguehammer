import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, AlertCircle, Mail, LockKeyhole, UserRound } from 'lucide-react';
import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    setLoading(true);
    try {
      await register(email, password, fullName);
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return <AuthLayout>
    <div className="auth-heading"><span className="league-kicker">YOUR TOURNAMENT STARTS HERE</span><h2>Make it your league.</h2><p>Create your organizer account and build something great.</p></div>
    {error && <div className="auth-error" role="alert"><AlertCircle size={18} /><span>{error}</span></div>}
    <form onSubmit={handleSubmit} className="auth-form">
      <div><label htmlFor="register-name">Full Name</label><div className="auth-input"><UserRound size={20} /><input id="register-name" type="text" autoComplete="name" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" /></div></div>
      <div><label htmlFor="register-email">Email Address</label><div className="auth-input"><Mail size={20} /><input id="register-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@domain.com" /></div></div>
      <div><label htmlFor="register-password">Password</label><div className="auth-input"><LockKeyhole size={20} /><input id="register-password" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /></div></div>
      <button type="submit" disabled={loading} className="auth-submit"><span>{loading ? 'Creating Account...' : 'Register'}</span><ArrowRight size={22} aria-hidden="true" /></button>
    </form>
    <div className="auth-divider"><span>Already registered?</span></div><p className="auth-account"><Link to="/login">Sign In <ArrowRight size={16} /></Link></p>
  </AuthLayout>;
}
