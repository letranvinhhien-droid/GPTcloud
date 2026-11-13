import React, { useId, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { api } from "../api";
import "./auth.css";

export default function AccountSecurity({ user, notify, onRefresh }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const id = useId();
  const isDemo = ["admin", "instructor", "learner"].includes(user?.id);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaved(false);
    if (newPassword.length < 12)
      return setError("Choose a new password with at least 12 characters.");
    if (newPassword !== confirmation)
      return setError("The new passwords don’t match.");
    if (newPassword === currentPassword)
      return setError(
        "Choose a password different from your current password.",
      );
    setBusy(true);
    try {
      await api("/auth/password", {
        method: "PATCH",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSaved(true);
      await onRefresh?.();
      notify?.("Password updated. Your other sessions have been signed out.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card account-security" aria-labelledby={`${id}-title`}>
      <div className="account-security-heading">
        <span className="account-security-icon">
          <ShieldCheck size={22} />
        </span>
        <div>
          <h3 id={`${id}-title`}>Account security</h3>
          <p>
            {isDemo
              ? "You’re exploring a shared demo workspace."
              : "Keep your account and your learning protected."}
          </p>
        </div>
      </div>
      {isDemo ? (
        <div className="account-security-demo">
          <KeyRound size={21} />
          <p>
            Demo accounts don’t have a personal password. Create a learner
            account from the sign-in page to save your own learning progress.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy}>
            <div className="account-security-body">
              <label className="field" htmlFor={`${id}-current`}>
                Current password
                <input
                  id={`${id}-current`}
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <div className="form-grid">
                <label className="field" htmlFor={`${id}-new`}>
                  New password
                  <input
                    id={`${id}-new`}
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                    value={newPassword}
                    aria-describedby={`${id}-hint`}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setSaved(false);
                    }}
                  />
                  <small id={`${id}-hint`}>At least 12 characters.</small>
                </label>
                <label className="field" htmlFor={`${id}-confirm`}>
                  Confirm new password
                  <input
                    id={`${id}-confirm`}
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                    value={confirmation}
                    onChange={(e) => {
                      setConfirmation(e.target.value);
                      setSaved(false);
                    }}
                  />
                </label>
              </div>
              <button
                className="account-password-toggle"
                type="button"
                aria-pressed={visible}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}{" "}
                {visible ? "Hide passwords" : "Show passwords"}
              </button>
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              {saved && (
                <p className="account-security-success" role="status">
                  <CheckCircle2 size={18} />
                  Your password has been updated.
                </p>
              )}
            </div>
            <div className="account-security-footer">
              <p>Changing your password signs out your other sessions.</p>
              <button className="btn btn-primary" type="submit">
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="auth-spinner" />
                    Updating…
                  </>
                ) : (
                  <>
                    <KeyRound size={16} />
                    Update password
                  </>
                )}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
