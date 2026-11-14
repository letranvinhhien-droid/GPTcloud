import React, { useId, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { api } from "../api";
import "./auth.css";

function AuthBrand() {
  return (
    <div className="auth-brand">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M6 25V7l10 11L26 7v18M16 18v7"
          stroke="currentColor"
          strokeWidth="2.7"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <span>
        meridian<span className="auth-brand-dot">.</span>
      </span>
    </div>
  );
}

export default function AuthPage({
  onAuthenticated,
  demoEnabled = false,
  registrationEnabled = true,
  setupRequired = false,
  setupEnabled = false,
  setupIssue,
}) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const id = useId();
  const registering =
    !setupRequired && mode === "register" && registrationEnabled;
  const settingUp = setupRequired && setupEnabled;
  const creating = registering || settingUp;
  function changeMode(next) {
    setMode(next);
    setError("");
    setPassword("");
    setConfirmation("");
    setShowPassword(false);
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (setupRequired && !setupEnabled) return;
    if (creating && password.length < 12)
      return setError("Choose a password with at least 12 characters.");
    if (creating && password !== confirmation)
      return setError("The passwords don’t match. Please try again.");
    setBusy("account");
    try {
      const body = settingUp
        ? { setupToken, name: name.trim(), email: email.trim(), password }
        : registering
          ? { name: name.trim(), email: email.trim(), password }
          : { email: email.trim(), password };
      const result = await api(
        settingUp
          ? "/auth/setup"
          : registering
            ? "/auth/register"
            : "/auth/login",
        {
          method: "POST",
          body,
        },
      );
      setPassword("");
      setConfirmation("");
      setSetupToken("");
      await onAuthenticated?.(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }
  async function openDemo(role) {
    setBusy(role);
    setError("");
    try {
      const result = await api("/auth/demo", {
        method: "POST",
        body: { role },
      });
      await onAuthenticated?.(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Meridian learning community">
        <AuthBrand />
        <div className="auth-story-main">
          <span className="auth-kicker">
            <Leaf size={16} /> A PLACE TO GROW
          </span>
          <h1>
            A little progress.
            <br />A world of
            <br />
            <span>possibility.</span>
          </h1>
          <p>
            Bring your curiosity. Find your community.
            <br />
            Make your next chapter a meaningful one.
          </p>
          <div className="auth-illustration" aria-hidden="true">
            <div className="auth-orbit auth-orbit-one" />
            <div className="auth-orbit auth-orbit-two" />
            <div className="auth-sun" />
            <div className="auth-arch">
              <div className="auth-arch-inner" />
            </div>
            <div className="auth-learning-card">
              <span className="auth-card-icon">
                <BookOpen size={25} />
              </span>
              <div>
                <strong>Keep moving forward.</strong>
                <span>One new idea at a time.</span>
              </div>
              <span className="auth-card-check">
                <Check size={18} />
              </span>
              <div className="auth-card-progress">
                <span />
              </div>
            </div>
            <div className="auth-spark">
              <Sparkles size={26} />
            </div>
          </div>
        </div>
        <p className="auth-story-footer">
          Made for the way you teach.
          <br />
          Built for the way you learn.
        </p>
      </section>
      <section className="auth-entry" aria-labelledby={`${id}-heading`}>
        <div className="auth-mobile-brand">
          <AuthBrand />
        </div>
        <div className="auth-form-wrap">
          <div className="auth-entry-mark">
            <GraduationCap size={26} />
          </div>
          <p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
          <h2 id={`${id}-heading`}>
            {setupRequired
              ? setupEnabled
                ? "Set up your workspace."
                : "Workspace setup is pending."
              : registering
                ? "Room for one more."
                : "Welcome to Meridian."}
          </h2>
          <p className="auth-intro">
            {setupRequired
              ? setupEnabled
                ? "Create the first administrator account to start building your learning community."
                : setupIssue === "missing_key"
                  ? "The running workspace has not received its setup key. If you have already saved it in Cloudflare, deploy the Worker version containing the secret, then check again."
                  : setupIssue === "invalid_key"
                    ? "The configured setup key must contain 32–512 characters. Update its value in Cloudflare, save and deploy the change, then check again."
                    : "The workspace owner needs to enable administrator setup before accounts can be created."
              : registering
                ? "Create your learner account and find your next opportunity to grow."
                : "Sign in to pick up where you left off."}
          </p>
          {!setupRequired && registrationEnabled && (
            <div className="auth-mode-tabs" aria-label="Account options">
              <button
                type="button"
                aria-pressed={!registering}
                className={!registering ? "active" : ""}
                disabled={Boolean(busy)}
                onClick={() => changeMode("login")}
              >
                Sign in
              </button>
              <button
                type="button"
                aria-pressed={registering}
                className={registering ? "active" : ""}
                disabled={Boolean(busy)}
                onClick={() => changeMode("register")}
              >
                Create learner account
              </button>
            </div>
          )}
          {setupRequired && !setupEnabled ? (
            <button
              className="btn btn-primary auth-submit"
              onClick={() => window.location.reload()}
            >
              Check again <ArrowRight size={17} />
            </button>
          ) : (
            <form
              className="auth-form"
              onSubmit={submit}
              aria-busy={Boolean(busy)}
            >
              <fieldset disabled={Boolean(busy)}>
                {settingUp && (
                  <label className="field" htmlFor={`${id}-setup-token`}>
                    Setup key
                    <input
                      id={`${id}-setup-token`}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      autoCapitalize="none"
                      required
                      minLength={32}
                      maxLength={512}
                      value={setupToken}
                      onChange={(e) => setSetupToken(e.target.value)}
                      placeholder="Enter your workspace setup key"
                      aria-describedby={`${id}-setup-hint`}
                    />
                    <small id={`${id}-setup-hint`}>
                      This key verifies that you own the workspace. It is
                      separate from your new account password.
                    </small>
                  </label>
                )}
                {creating && (
                  <label className="field" htmlFor={`${id}-name`}>
                    Full name
                    <input
                      id={`${id}-name`}
                      autoComplete="name"
                      required
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                    />
                  </label>
                )}
                <label className="field" htmlFor={`${id}-email`}>
                  Email address
                  <input
                    id={`${id}-email`}
                    type="email"
                    autoComplete="username"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <div className="field">
                  <label htmlFor={`${id}-password`}>Password</label>
                  <div className="auth-password-field">
                    <input
                      id={`${id}-password`}
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        creating ? "new-password" : "current-password"
                      }
                      required
                      minLength={creating ? 12 : undefined}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        creating
                          ? "At least 12 characters"
                          : "Enter your password"
                      }
                      aria-describedby={
                        creating ? `${id}-password-hint` : undefined
                      }
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {creating && (
                    <small id={`${id}-password-hint`}>
                      Use at least 12 characters. A memorable passphrase works
                      well.
                    </small>
                  )}
                </div>
                {creating && (
                  <label className="field" htmlFor={`${id}-confirm`}>
                    Confirm password
                    <input
                      id={`${id}-confirm`}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      placeholder="Enter your password again"
                    />
                  </label>
                )}
                {error && (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="btn btn-primary auth-submit" type="submit">
                  {busy === "account" ? (
                    <>
                      <LoaderCircle size={17} className="auth-spinner" />
                      {creating ? "Creating your account…" : "Signing in…"}
                    </>
                  ) : (
                    <>
                      {settingUp
                        ? "Create administrator account"
                        : registering
                          ? "Create learner account"
                          : "Sign in"}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </fieldset>
            </form>
          )}
          {(!setupRequired || settingUp) && (
            <p className="auth-account-note">
              {settingUp
                ? "Administrator setup closes after this account is created."
                : registering
                  ? "Staff accounts are provided by your institution."
                  : "Need help signing in? Contact your institution’s administrator."}
            </p>
          )}
          {!setupRequired && demoEnabled && (
            <div className="auth-demo">
              <div className="auth-divider">
                <span>JUST LOOKING AROUND?</span>
              </div>
              <p>Explore the sample workspace.</p>
              <div className="auth-demo-buttons">
                <button
                  className="btn btn-secondary"
                  style={{ gridColumn: "1 / -1" }}
                  disabled={Boolean(busy)}
                  onClick={() => openDemo("admin")}
                >
                  {busy === "admin" ? (
                    <LoaderCircle className="auth-spinner" size={17} />
                  ) : (
                    <ShieldCheck size={17} />
                  )}
                  Admin demo
                  <ArrowRight size={14} />
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={Boolean(busy)}
                  onClick={() => openDemo("instructor")}
                >
                  {busy === "instructor" ? (
                    <LoaderCircle className="auth-spinner" size={17} />
                  ) : (
                    <GraduationCap size={17} />
                  )}
                  Instructor demo
                  <ArrowRight size={14} />
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={Boolean(busy)}
                  onClick={() => openDemo("learner")}
                >
                  {busy === "learner" ? (
                    <LoaderCircle className="auth-spinner" size={17} />
                  ) : (
                    <BookOpen size={17} />
                  )}
                  Learner demo
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
        <footer className="auth-entry-footer">
          <LockKeyhole size={13} />
          <span>Your learning has a home here.</span>
        </footer>
      </section>
    </main>
  );
}
