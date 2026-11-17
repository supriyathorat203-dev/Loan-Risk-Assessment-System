import { useState, useEffect } from "react";
import {
  login,
  register,
  verifyOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
  getErrorMessage,
} from "../../api";

export default function AuthScreen({ onAuthSuccess, theme = "light", onToggleTheme }) {
  // Modes: "login" | "register" | "otp_verify" | "forgot_password" | "reset_password"
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpDebugHint, setOtpDebugHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Resend OTP countdown timer
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      if (mode === "login") {
        const data = await login(email.trim(), password);

        // If backend says first-time sign-in requires OTP
        if (data.requires_otp) {
          setOtpDebugHint(data.otp_debug || "");
          setSuccessMsg(data.message || "Please enter the 6-digit verification code sent to your email.");
          setMode("otp_verify");
          setResendCooldown(30);
          return;
        }

        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("current_user", JSON.stringify(data.user));
        onAuthSuccess(data.user);
      } else if (mode === "register") {
        const regData = await register(email.trim(), password);
        setOtpDebugHint(regData.otp_debug || "");
        setSuccessMsg(regData.message || "Account created! A 6-digit verification code has been sent to your email.");
        setMode("otp_verify");
        setResendCooldown(30);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!otp || otp.trim().length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await verifyOTP(email.trim(), otp.trim());
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("current_user", JSON.stringify(data.user));
      onAuthSuccess(data.user);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async (purpose = "email_verification") => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError("");

    try {
      const data = await resendOTP(email.trim(), purpose);
      setSuccessMsg("A new 6-digit code has been dispatched to your email!");
      if (data.otp_debug) setOtpDebugHint(data.otp_debug);
      setResendCooldown(30);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email || !email.trim()) {
      setError("Please enter your registered email address.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await forgotPassword(email.trim());
      setSuccessMsg(data.message || "A 6-digit password reset code has been sent to your email.");
      if (data.otp_debug) setOtpDebugHint(data.otp_debug);
      setMode("reset_password");
      setResendCooldown(30);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!otp || otp.trim().length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await resetPassword(email.trim(), otp.trim(), password);
      setSuccessMsg(data.message || "Password reset successful! Please sign in with your new password.");
      setMode("login");
      setPassword("");
      setConfirmPassword("");
      setOtp("");
      setOtpDebugHint("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      {onToggleTheme && (
        <button
          type="button"
          className="auth-theme-toggle"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>
      )}

      <div className="auth-card">
        {/* Brand Header */}
        <div className="auth-header">
          <div className="brand-logo-large">
            <h1>
              Loan<span className="brand-accent">Wise</span>
            </h1>
            <p className="auth-subtitle">Loan Risk Assessment & Underwriting System</p>
          </div>

          {/* Mode Switch Tabs (Only shown on login & register) */}
          {(mode === "login" || mode === "register") && (
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab ${mode === "login" ? "active" : ""}`}
                onClick={() => {
                  setMode("login");
                  setError("");
                  setSuccessMsg("");
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-tab ${mode === "register" ? "active" : ""}`}
                onClick={() => {
                  setMode("register");
                  setError("");
                  setSuccessMsg("");
                }}
              >
                Register (Borrower)
              </button>
            </div>
          )}
        </div>

        {/* Status Alerts */}
        {error && <div className="alert-banner alert-danger">{error}</div>}
        {successMsg && <div className="alert-banner alert-success">{successMsg}</div>}

        {/* 1. LOGIN & REGISTRATION FORMS */}
        {(mode === "login" || mode === "register") && (
          <form onSubmit={handleAuthSubmit} className="auth-form">
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <div className="label-with-action">
                <label>Password</label>
                {mode === "login" && (
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => {
                      setMode("forgot_password");
                      setError("");
                      setSuccessMsg("");
                    }}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Min 8 characters" : "Enter password"}
                required
                minLength={mode === "register" ? 8 : 1}
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading
                ? "Authenticating..."
                : mode === "login"
                ? "Sign In →"
                : "Create Account & Verify OTP →"}
            </button>
          </form>
        )}

        {/* 2. OTP EMAIL VERIFICATION FORM (First-time sign in or registration) */}
        {mode === "otp_verify" && (
          <form onSubmit={handleVerifyOTP} className="auth-form otp-verify-form">
            <div className="otp-intro-box">
              <div className="otp-icon-badge">📩</div>
              <h3>Verify Your Email</h3>
              <p className="text-muted">
                First-time sign in requires email verification. We have sent a 6-digit OTP to:
                <br />
                <strong className="otp-target-email">{email}</strong>
              </p>
              {otpDebugHint && (
                <div className="otp-debug-pill">
                  <span>Dev OTP Code:</span> <strong>{otpDebugHint}</strong>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="text-center">Enter 6-Digit OTP</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="• • • • • •"
                maxLength={6}
                required
                autoFocus
                className="otp-digit-input"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? "Verifying..." : "Verify & Access Portal →"}
            </button>

            <div className="otp-footer-actions">
              <button
                type="button"
                className="btn btn-link"
                onClick={() => handleResendOTP("email_verification")}
                disabled={resendCooldown > 0 || loading}
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : "Didn't receive code? Resend OTP"}
              </button>

              <button
                type="button"
                className="btn btn-link text-muted"
                onClick={() => {
                  setMode("login");
                  setOtp("");
                  setError("");
                  setSuccessMsg("");
                }}
              >
                ← Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* 3. FORGOT PASSWORD (Enter Email) */}
        {mode === "forgot_password" && (
          <form onSubmit={handleForgotPassword} className="auth-form">
            <div className="otp-intro-box">
              <div className="otp-icon-badge">🔑</div>
              <h3>Password Recovery</h3>
              <p className="text-muted">
                Enter your registered email and we will send you a 6-digit OTP code to reset your password.
              </p>
            </div>

            <div className="form-group">
              <label>Registered Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoFocus
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? "Sending OTP..." : "Send Reset Code →"}
            </button>

            <div className="text-center" style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="btn btn-link text-muted"
                onClick={() => {
                  setMode("login");
                  setError("");
                  setSuccessMsg("");
                }}
              >
                ← Return to Sign In
              </button>
            </div>
          </form>
        )}

        {/* 4. RESET PASSWORD (Enter OTP + New Password) */}
        {mode === "reset_password" && (
          <form onSubmit={handleResetPassword} className="auth-form">
            <div className="otp-intro-box">
              <div className="otp-icon-badge">🔒</div>
              <h3>Create New Password</h3>
              <p className="text-muted">
                Enter the 6-digit OTP sent to <strong>{email}</strong> and choose a secure password.
              </p>
              {otpDebugHint && (
                <div className="otp-debug-pill">
                  <span>Dev Reset Code:</span> <strong>{otpDebugHint}</strong>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>6-Digit Reset Code (OTP)</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit code"
                maxLength={6}
                required
                className="otp-digit-input"
              />
            </div>

            <div className="form-group">
              <label>New Password (Min 8 Characters)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                required
                minLength={8}
              />
            </div>

            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
                minLength={8}
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password & Sign In →"}
            </button>

            <div className="otp-footer-actions">
              <button
                type="button"
                className="btn btn-link"
                onClick={() => handleResendOTP("password_reset")}
                disabled={resendCooldown > 0 || loading}
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : "Resend Reset OTP"}
              </button>

              <button
                type="button"
                className="btn btn-link text-muted"
                onClick={() => {
                  setMode("login");
                  setError("");
                  setSuccessMsg("");
                }}
              >
                ← Back to Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
