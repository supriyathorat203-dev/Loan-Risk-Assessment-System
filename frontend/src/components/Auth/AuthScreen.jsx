import { useState } from "react";
import { login, register, getErrorMessage } from "../../api";

export default function AuthScreen({ onAuthSuccess, theme = "light", onToggleTheme }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "register") {
        await register(email.trim(), password);
      }
      const data = await login(email.trim(), password);
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("current_user", JSON.stringify(data.user));
      onAuthSuccess(data.user);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fillQuickAccount = (demoEmail, demoPass = "Admin@123") => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError("");
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
          {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
        </button>
      )}
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-logo-large">
            <h1>
              Loan<span className="brand-accent">Wise</span>
            </h1>
            <p className="auth-subtitle">Loan Risk Assessment & Underwriting System</p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setError("");
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
              }}
            >
              Register (Borrower)
            </button>
          </div>
        </div>

        {error && <div className="alert-banner alert-danger">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
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
            <label>Password</label>
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
              ? "Access Account →"
              : "Create Borrower Account →"}
          </button>
        </form>

        {/* Quick Credentials Helper */}
        <div className="demo-accounts-box">
          <span className="demo-title">⚡ Quick Sign-In Accounts:</span>
          <div className="demo-btn-group">
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => fillQuickAccount("yogitaj2518@gmail.com", "Admin@123")}
              title="Admin / Bank Officer Account"
            >
              🛡️ Admin: yogitaj2518@gmail.com
            </button>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => fillQuickAccount("customer@example.com", "Password123!")}
              title="Customer / Borrower Account"
            >
              👤 Customer: customer@example.com
            </button>
          </div>
          <small className="demo-hint">
            Or type your own credentials above to sign in or register.
          </small>
        </div>
      </div>
    </div>
  );
}
