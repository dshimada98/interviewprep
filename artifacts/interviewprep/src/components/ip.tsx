import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { Menu, X, LogOut, AlertCircle, Loader2, ListChecks, Star, LayoutDashboard, BookOpen } from 'lucide-react';
import { useAuth, messages } from '@/auth';

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Mark() {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold tracking-tight">
      <span aria-hidden className="flex items-end gap-[3px] h-5">
        <span className="w-[5px] h-2 rounded-sm" style={{ background: 'var(--score-1)' }} />
        <span className="w-[5px] h-3.5 rounded-sm" style={{ background: 'var(--score-3)' }} />
        <span className="w-[5px] h-5 rounded-sm" style={{ background: 'var(--score-5)' }} />
      </span>
      InterviewPrep
    </span>
  );
}

function Inline({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-2 text-sm font-medium" style={{ color: 'var(--score-1)' }}>
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  );
}

function Splash() {
  return (
    <div className="min-h-[100dvh] grid place-items-center px-6" aria-busy="true" aria-live="polite">
      <div className="w-full max-w-sm space-y-3">
        <span className="sr-only">Checking your session</span>
        <div className="ip-skel h-6 w-40 rounded" />
        <div className="ip-skel h-24 w-full rounded-lg" />
        <div className="ip-skel h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}

function SessionError() {
  const { error, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <div className="min-h-[100dvh] grid place-items-center px-5">
      <div className="ip-rise w-full max-w-md rounded-xl p-6 sm:p-8 space-y-5" style={{ background: 'var(--panel)' }}>
        <Mark />
        <Inline>{error}</Inline>
        <button
          className="ip-focus min-h-11 w-full rounded-lg font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--navy)' }}
          disabled={busy}
          onClick={async () => { setBusy(true); await refresh(); setBusy(false); }}
        >
          {busy ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    </div>
  );
}

export function Protected({ children }: { children: ReactNode }) {
  const { user, loading, error } = useAuth();
  if (loading) return <Splash />;
  if (error) return <SessionError />;
  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading, error } = useAuth();
  if (loading) return <Splash />;
  if (error) return <SessionError />;
  if (user) return <Redirect to="/dashboard" />;
  return <>{children}</>;
}

function Field({ id, label, type, value, onChange, error, auto, hint }: {
  id: string; label: string; type: string; value: string; onChange: (v: string) => void;
  error?: string; auto: string; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <input
        id={id} type={type} value={value} autoComplete={auto}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className="ip-focus block w-full min-h-11 rounded-lg border bg-white px-3.5 text-base transition-colors hover:border-[color:var(--navy)]"
        style={{ borderColor: error ? 'var(--score-1)' : undefined }}
      />
      {error ? <Inline id={`${id}-err`}>{error}</Inline> : hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { authenticate } = useAuth();
  const [, nav] = useLocation();
  const signup = mode === 'signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formErr, setFormErr] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = signup ? 'Create account | InterviewPrep' : 'Log in | InterviewPrep'; }, [signup]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormErr(''); setEmailErr(''); setPwErr('');
    const em = email.trim();
    if (!em || !password.trim() || (signup && !confirm.trim())) return setFormErr(messages.blank);
    if (!emailRe.test(em)) return setEmailErr(messages.email);
    if (signup && password.length < 8) return setPwErr(messages.short);
    if (signup && new TextEncoder().encode(password).length > 72) return setFormErr('Password must be no more than 72 bytes.');
    if (signup && !/[\p{P}\p{S}]/u.test(password)) return setPwErr(messages.special);
    if (signup && password !== confirm) return setPwErr(messages.mismatch);
    setBusy(true);
    try {
      await authenticate(mode, signup ? { email: em, password, confirmPassword: confirm } : { email: em, password });
      nav('/dashboard');
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="px-5 sm:px-10 h-16 flex items-center border-b" style={{ color: 'var(--navy)' }}>
        <Mark />
      </header>
      <main className="flex-1 grid lg:grid-cols-[1fr_minmax(0,520px)] gap-10 px-5 sm:px-10 py-10 lg:py-16 max-w-6xl w-full mx-auto">
        <section className="ip-rise hidden lg:flex flex-col justify-center" style={{ color: 'var(--navy)' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--green-text)' }}>Your preparation workspace</p>
          <h2 className="mt-4 text-4xl font-bold leading-tight tracking-tight max-w-md">
            Structure the problem. Then structure your preparation.
          </h2>
          <div className="mt-8 h-1 w-16 rounded" style={{ background: 'var(--green)' }} />
          <p className="mt-6 max-w-md text-muted-foreground leading-relaxed">
            A private, focused place to begin getting ready for case and fit interviews.
          </p>
        </section>
        <section className="ip-rise w-full max-w-md mx-auto lg:mx-0 lg:ml-auto self-center" style={{ animationDelay: '80ms' }}>
          <div className="rounded-xl p-6 sm:p-8" style={{ background: 'var(--panel)', color: 'var(--navy)' }}>
            <h1 className="text-2xl font-bold tracking-tight">{signup ? 'Create your account' : 'Log in'}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {signup ? 'Set up your workspace with an email and password.' : 'Welcome back. Pick up where you left off.'}
            </p>
            <form noValidate onSubmit={submit} className="mt-6 space-y-4">
              {formErr && <div className="rounded-lg bg-white border-l-4 p-3" style={{ borderColor: 'var(--score-1)' }}><Inline>{formErr}</Inline></div>}
              <Field id="email" label="Email" type="email" auto="email" value={email} onChange={setEmail} error={emailErr} />
              <Field id="password" label="Password" type="password" auto={signup ? 'new-password' : 'current-password'}
                value={password} onChange={setPassword} error={signup && pwErr && pwErr !== messages.mismatch ? pwErr : undefined}
                hint={signup ? 'At least 8 characters, including a special character (e.g. !, @, #).' : undefined} />
              {signup && <Field id="confirmPassword" label="Confirm password" type="password" auto="new-password"
                value={confirm} onChange={setConfirm} error={pwErr === messages.mismatch ? pwErr : undefined} />}
              <button type="submit" disabled={busy}
                className="ip-focus min-h-11 w-full rounded-lg font-semibold text-white inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.99] disabled:opacity-70"
                style={{ background: 'var(--navy)', borderBottom: '3px solid var(--green)' }}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {busy ? (signup ? 'Creating account...' : 'Logging in...') : signup ? 'Create account' : 'Log in'}
              </button>
            </form>
          </div>
          <p className="mt-5 text-sm text-center" style={{ color: 'var(--navy)' }}>
            {signup ? 'Already have an account? ' : 'New to InterviewPrep? '}
            <Link href={signup ? '/login' : '/signup'} className="ip-focus inline-flex min-h-11 items-center font-semibold underline underline-offset-4 decoration-2" style={{ textDecorationColor: 'var(--green)' }}>
              {signup ? 'Log in' : 'Create an account'}
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}

export function AppHeader() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function out() {
    setBusy(true); setErr('');
    try { await logout(); } catch (e) { setErr(e instanceof Error ? e.message : 'Unable to log out. Please try again.'); }
    finally { setBusy(false); }
  }
  const btn = (
    <button onClick={out} disabled={busy}
      className="ip-focus min-h-11 px-4 rounded-lg inline-flex items-center gap-2 whitespace-nowrap font-semibold border border-white/30 hover:bg-white/10 disabled:opacity-60">
      <LogOut className="h-4 w-4" aria-hidden /> {busy ? 'Logging out...' : 'Log out'}
    </button>
  );
  return (
    <header className="text-white" style={{ background: 'var(--navy)' }}>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link href="/dashboard" className="ip-focus min-h-11 inline-flex items-center rounded"><Mark /></Link>
        <div className="hidden lg:flex items-center gap-1 xl:gap-2">
          <Link href="/dashboard" data-testid="link-nav-dashboard" className="ip-focus min-h-11 px-3 rounded-lg inline-flex items-center gap-2 font-semibold hover:bg-white/10"><LayoutDashboard className="h-4 w-4" aria-hidden />Dashboard</Link>
          <Link href="/sessions" data-testid="link-nav-sessions" className="ip-focus min-h-11 px-3 rounded-lg inline-flex items-center gap-2 font-semibold hover:bg-white/10"><ListChecks className="h-4 w-4" aria-hidden />Sessions</Link>
          <Link href="/starred" data-testid="link-nav-starred" className="ip-focus min-h-11 px-3 rounded-lg inline-flex items-center gap-2 font-semibold hover:bg-white/10"><Star className="h-4 w-4" aria-hidden />Starred</Link>
          <Link href="/stories" data-testid="link-nav-stories" className="ip-focus min-h-11 px-3 rounded-lg inline-flex items-center gap-2 font-semibold hover:bg-white/10"><BookOpen className="h-4 w-4" aria-hidden />Stories</Link>
          <Link href="/sessions/new" data-testid="link-nav-log-session" className="ip-focus ml-1 min-h-11 px-3 rounded-lg inline-flex items-center justify-center whitespace-nowrap font-semibold border border-white/30">+ Log session</Link>
          <span className="hidden xl:inline text-sm text-white/75 truncate max-w-[10rem]">{user?.email}</span>
          {btn}
        </div>
        <button className="lg:hidden ip-focus h-11 w-11 grid place-items-center rounded-lg border border-white/30"
          aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="lg:hidden px-5 pb-4 space-y-3 ip-rise">
          <Link href="/dashboard" onClick={() => setOpen(false)} data-testid="link-mobile-dashboard" className="ip-focus min-h-11 w-full rounded-lg inline-flex items-center justify-center gap-2 font-semibold border border-white/30"><LayoutDashboard className="h-4 w-4" aria-hidden />Dashboard</Link>
          <Link href="/sessions" onClick={() => setOpen(false)} className="ip-focus min-h-11 w-full rounded-lg inline-flex items-center justify-center gap-2 font-semibold border border-white/30"><ListChecks className="h-4 w-4" aria-hidden />Sessions</Link>
          <Link href="/starred" onClick={() => setOpen(false)} data-testid="link-mobile-starred" className="ip-focus min-h-11 w-full rounded-lg inline-flex items-center justify-center gap-2 font-semibold border border-white/30"><Star className="h-4 w-4" aria-hidden />Starred</Link>
          <Link href="/stories" onClick={() => setOpen(false)} data-testid="link-mobile-stories" className="ip-focus min-h-11 w-full rounded-lg inline-flex items-center justify-center gap-2 font-semibold border border-white/30"><BookOpen className="h-4 w-4" aria-hidden />Stories</Link>
          <Link href="/sessions/new" onClick={() => setOpen(false)} className="ip-focus min-h-11 w-full rounded-lg inline-flex items-center justify-center font-semibold border border-white/30">+ Log session</Link>
          <p className="text-sm text-white/75 break-all">{user?.email}</p>
          <div className="[&>button]:w-full [&>button]:justify-center">{btn}</div>
        </div>
      )}
      {err && <div className="bg-white px-5 sm:px-8 py-3 border-b"><div className="max-w-5xl mx-auto"><Inline>{err}</Inline></div></div>}
    </header>
  );
}
