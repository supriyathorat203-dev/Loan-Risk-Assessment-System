export default function Navbar({
  currentUser,
  activePortal,
  setActivePortal,
  onLogout,
  onRefresh,
  refreshing,
}) {
  const isAdminUser =
    currentUser &&
    (currentUser.role === "admin" || currentUser.role === "bank_officer");

  return (
    <header className="app-navbar">
      <div className="navbar-left">
        <div className="brand-logo">
          <h2>
            Loan<span className="brand-accent">Wise</span>
          </h2>
          <span className="brand-tagline">
            {activePortal === "admin"
              ? "Underwriting & Risk Console"
              : "Customer Loan Portal"}
          </span>
        </div>

        {isAdminUser && (
          <div className="portal-switcher">
            <button
              type="button"
              className={`portal-tab-btn ${activePortal === "admin" ? "active" : ""}`}
              onClick={() => setActivePortal("admin")}
            >
              🛡️ Admin Console
            </button>
            <button
              type="button"
              className={`portal-tab-btn ${activePortal === "customer" ? "active" : ""}`}
              onClick={() => setActivePortal("customer")}
            >
              👤 Customer Portal View
            </button>
          </div>
        )}
      </div>

      <div className="navbar-right">
        {onRefresh && (
          <button
            type="button"
            className="btn btn-icon-light"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh Data"
          >
            {refreshing ? "⟳ Syncing..." : "⟳ Refresh"}
          </button>
        )}

        <div className="user-profile-badge">
          <div className="user-avatar">
            {currentUser?.email ? currentUser.email.slice(0, 2).toUpperCase() : "US"}
          </div>
          <div className="user-info">
            <span className="user-email">{currentUser?.email || "User"}</span>
            <span className={`role-badge role-${(currentUser?.role || "customer").toLowerCase()}`}>
              {currentUser?.role === "admin"
                ? "System Admin"
                : currentUser?.role === "bank_officer"
                ? "Bank Officer"
                : "Verified Borrower"}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-outline-danger btn-sm logout-btn"
          onClick={onLogout}
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
