import { useState, useEffect } from "react";
import {
  getAdminStats,
  getAdminDocuments,
  getAdminUsers,
  getApplications,
  updateApplicationStatus,
  deleteApplication,
  verifyDocument,
  money,
  explainRisk,
  getErrorMessage,
} from "../../api";
import DocumentPreviewModal from "../Common/DocumentPreviewModal";

export default function AdminDashboard({
  currentUser,
  applications,
  onRefresh,
  refreshing,
  onLogout,
  theme = "light",
  onToggleTheme,
}) {
  const [activeMenu, setActiveMenu] = useState("Dashboard");
  const [adminStats, setAdminStats] = useState(null);
  const [adminDocs, setAdminDocs] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);

  // Search & Filters for All Applications
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");
  const [sortBy, setSortBy] = useState("newest");

  // Document Verification Filter
  const [docFilter, setDocFilter] = useState("All");

  // Customer Management Search
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerHistory, setSelectedCustomerHistory] = useState(null);
  const [customerApps, setCustomerApps] = useState([]);
  const [customerAppsLoading, setCustomerAppsLoading] = useState(false);

  // Underwriting Review Dossier Modal
  const [selectedApp, setSelectedApp] = useState(null);
  const [decisionStatus, setDecisionStatus] = useState("Pending");
  const [decisionRemarks, setDecisionRemarks] = useState("");
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionSuccess, setDecisionSuccess] = useState("");
  const [decisionError, setDecisionError] = useState("");

  // Document Preview Modal
  const [previewDoc, setPreviewDoc] = useState(null);

  // Global Alert Message
  const [alertMsg, setAlertMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    loadStats();
    loadDocs();
    loadUsers();
  }, []);

  useEffect(() => {
    loadDocs();
  }, [docFilter]);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const stats = await getAdminStats();
      setAdminStats(stats);
    } catch (err) {
      console.error("Failed to load admin stats", err);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadDocs = async () => {
    setDocsLoading(true);
    try {
      const docs = await getAdminDocuments(docFilter);
      setAdminDocs(docs);
    } catch (err) {
      console.error("Failed to load admin docs", err);
    } finally {
      setDocsLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const users = await getAdminUsers();
      setAdminUsers(users);
    } catch (err) {
      console.error("Failed to load admin users", err);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleOpenDossier = async (app) => {
    setSelectedApp(app);
    setDecisionStatus(app.status || "Pending");
    setDecisionRemarks(app.admin_remarks || "");
    setDecisionSuccess("");
    setDecisionError("");
    try {
      const full = await getApplication(app.id);
      setSelectedApp(full);
    } catch (e) {
      console.warn("Could not reload full application dossier", e);
    }
  };

  const handleSaveDecision = async (e) => {
    e.preventDefault();
    if (!selectedApp) return;

    setDecisionLoading(true);
    setDecisionError("");
    setDecisionSuccess("");

    try {
      const updated = await updateApplicationStatus(
        selectedApp.id,
        decisionStatus,
        decisionRemarks
      );
      setDecisionSuccess(`Decision saved: Application #${updated.id} is now "${updated.status}".`);
      setSelectedApp(updated);
      if (onRefresh) onRefresh();
      loadStats();
    } catch (err) {
      setDecisionError(getErrorMessage(err));
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleDeleteApp = async (appId) => {
    if (!window.confirm(`Are you sure you want to delete application #${appId}?`)) {
      return;
    }
    try {
      await deleteApplication(appId);
      setAlertMsg({ type: "success", text: `Application #${appId} deleted.` });
      if (selectedApp?.id === appId) setSelectedApp(null);
      if (onRefresh) onRefresh();
      loadStats();
    } catch (err) {
      setAlertMsg({ type: "danger", text: getErrorMessage(err) });
    }
  };

  const handleVerifyDocAction = async (docId, newStatus, remarks) => {
    try {
      await verifyDocument(docId, newStatus, remarks);
      setAlertMsg({
        type: "success",
        text: `Document #${docId} successfully marked as ${newStatus}.`,
      });
      loadDocs();
      loadStats();
      if (onRefresh) onRefresh();

      if (selectedApp && selectedApp.documents) {
        setSelectedApp((prev) => ({
          ...prev,
          documents: prev.documents.map((d) =>
            d.id === docId ? { ...d, status: newStatus, remarks } : d
          ),
        }));
      }
    } catch (err) {
      setAlertMsg({ type: "danger", text: getErrorMessage(err) });
    }
  };

  const viewCustomerHistory = async (customer) => {
    setSelectedCustomerHistory(customer);
    setCustomerAppsLoading(true);
    try {
      const apps = await getApplications({ user_id: customer.id });
      setCustomerApps(apps);
    } catch (err) {
      console.error("Failed to load customer apps", err);
    } finally {
      setCustomerAppsLoading(false);
    }
  };

  // Filtered applications
  const filteredApps = (applications || [])
    .filter((item) => {
      const q = searchTerm.trim().toLowerCase();
      const matchSearch =
        !q ||
        item.applicant_name?.toLowerCase().includes(q) ||
        String(item.id).includes(q) ||
        item.user_email?.toLowerCase().includes(q);

      const matchStatus = statusFilter === "All" || item.status === statusFilter;
      const matchRisk = riskFilter === "All" || item.risk_category === riskFilter;

      return matchSearch && matchStatus && matchRisk;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return a.id - b.id;
        case "highestLoan":
          return b.loan_amount - a.loan_amount;
        case "lowestLoan":
          return a.loan_amount - b.loan_amount;
        case "highestRisk":
          return b.risk_score - a.risk_score;
        default:
          return b.id - a.id;
      }
    });

  // Filtered customers
  const filteredCustomers = adminUsers.filter((u) => {
    const q = customerSearch.trim().toLowerCase();
    return !q || u.email?.toLowerCase().includes(q) || String(u.id).includes(q);
  });

  // Analytics helper calculations
  const totalAppsCount = adminStats?.total_applications || applications.length || 1;
  const approvedCount = adminStats?.approved || 0;
  const rejectedCount = adminStats?.rejected || 0;
  const pendingCount = adminStats?.pending_review || 0;
  const approvalRate = ((approvedCount / totalAppsCount) * 100).toFixed(1);
  const rejectionRate = ((rejectedCount / totalAppsCount) * 100).toFixed(1);
  const pendingRate = ((pendingCount / totalAppsCount) * 100).toFixed(1);

  const lowRiskCount = adminStats?.low_risk || 0;
  const medRiskCount = adminStats?.medium_risk || 0;
  const highRiskCount = adminStats?.high_risk || 0;

  return (
    <div className="portal-container admin-portal-layout">
      {/* 1. ADMIN SIDEBAR */}
      <aside className="portal-sidebar admin-sidebar-theme">
        <div className="sidebar-brand-box">
          <h2 className="brand-title">
            Loan<span className="brand-accent">Wise</span>
          </h2>
          <span className="admin-portal-badge">Admin & Underwriting</span>
        </div>

        <nav className="nav-menu">
          {[
            { id: "Dashboard", label: "Dashboard", icon: "📊" },
            { id: "All Applications", label: `All Applications (${applications.length})`, icon: "📑" },
            { id: "Customer Management", label: "Customer Management", icon: "👥" },
            { id: "Document Verification", label: "Document Verification", icon: "🔍", badge: adminStats?.pending_documents },
            { id: "Risk Assessment", label: "Risk Assessment", icon: "⚖️" },
            { id: "Reports and Analytics", label: "Reports and Analytics", icon: "📈" },
            { id: "Profile", label: "Profile", icon: "🛡️" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link ${activeMenu === item.id ? "active" : ""}`}
              onClick={() => setActiveMenu(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge > 0 && <span className="badge-alert-count">{item.badge}</span>}
            </button>
          ))}

          <button
            type="button"
            className="nav-link nav-logout-btn"
            onClick={onLogout}
          >
            <span className="nav-icon">🚪</span>
            <span>Logout</span>
          </button>
        </nav>

        <div className="admin-sidebar-user">
          <div className="admin-avatar-sm">ADM</div>
          <div className="user-details-truncate">
            <strong>System Admin</strong>
            <small>{currentUser?.email}</small>
          </div>
        </div>
      </aside>

      {/* 2. ADMIN MAIN CONTENT */}
      <main className="portal-content">
        {/* Top Header */}
        <header className="admin-topbar">
          <div>
            <span className="topbar-breadcrumb">ADMIN CONSOLE / {activeMenu.toUpperCase()}</span>
            <h1>{activeMenu}</h1>
          </div>
          <div className="topbar-actions">
            {onToggleTheme && (
              <button
                type="button"
                className="btn btn-theme-toggle"
                onClick={onToggleTheme}
                title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                onRefresh();
                loadStats();
                loadDocs();
                loadUsers();
              }}
              disabled={refreshing || statsLoading}
            >
              {refreshing || statsLoading ? "⟳ Syncing..." : "⟳ Refresh Console"}
            </button>
            <span className="badge-admin-role">Bank Officer Access</span>
          </div>
        </header>

        {/* Global Alert Notification */}
        {alertMsg.text && (
          <div className={`alert-banner alert-${alertMsg.type}`}>
            <span>{alertMsg.text}</span>
            <button
              type="button"
              className="close-alert-btn"
              onClick={() => setAlertMsg({ type: "", text: "" })}
            >
              &times;
            </button>
          </div>
        )}

        {/* ----------------- 1. ADMIN DASHBOARD ----------------- */}
        {activeMenu === "Dashboard" && (
          <div className="tab-pane fade-in">
            {/* Executive Underwriting Command Banner */}
            <div className="admin-command-hero">
              <div className="command-hero-content">
                <span className="command-live-pulse">
                  <span className="pulse-dot" /> LIVE UNDERWRITING DESK &bull; SYSTEM OPERATIONAL
                </span>
                <h2>Executive Risk & Portfolio Management</h2>
                <p>
                  Monitoring {adminStats?.total_applications ?? applications.length} active credit files across {adminStats?.total_customers ?? adminUsers.length} borrowers.
                </p>
              </div>
              <div className="command-hero-stats">
                <div className="command-hero-stat">
                  <span>Portfolio Value</span>
                  <strong>{money(adminStats?.total_loan_amount ?? 0)}</strong>
                </div>
                <div className="command-hero-stat">
                  <span>Approval Rate</span>
                  <strong style={{ color: "#34d399" }}>{approvalRate}%</strong>
                </div>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="stats-grid">
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-blue">👥</div>
                <div>
                  <span className="stat-label">Registered Customers</span>
                  <h3 className="stat-value">{adminStats?.total_customers ?? adminUsers.length}</h3>
                  <span className="stat-desc">Borrower accounts</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-blue">📑</div>
                <div>
                  <span className="stat-label">Total Applications</span>
                  <h3 className="stat-value">{adminStats?.total_applications ?? applications.length}</h3>
                  <span className="stat-desc">Total loan files</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-yellow">⏳</div>
                <div>
                  <span className="stat-label">Pending Review</span>
                  <h3 className="stat-value">{adminStats?.pending_review ?? 0}</h3>
                  <span className="stat-desc">Awaiting underwriter decision</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-green">✅</div>
                <div>
                  <span className="stat-label">Approved Applications</span>
                  <h3 className="stat-value">{adminStats?.approved ?? 0}</h3>
                  <span className="stat-desc">Loans authorized</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-red">❌</div>
                <div>
                  <span className="stat-label">Rejected Applications</span>
                  <h3 className="stat-value">{adminStats?.rejected ?? 0}</h3>
                  <span className="stat-desc">Declined with remarks</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-yellow">📁</div>
                <div>
                  <span className="stat-label">Docs Awaiting Verification</span>
                  <h3 className="stat-value">{adminStats?.pending_documents ?? 0}</h3>
                  <span className="stat-desc">PAN, ITR & bank statements</span>
                </div>
              </div>
            </div>

            {/* Risk Category Breakdown & Capital Volume */}
            <div className="overview-row-grid">
              <div className="card">
                <h3>Risk Category Statistics</h3>
                <p className="text-muted">Proportion of applicants across automated risk tiers</p>
                <div className="risk-bars-container" style={{ marginTop: "20px" }}>
                  <div className="risk-bar-row">
                    <span className="risk-tag tag-low">Low Risk</span>
                    <div className="progress-bar-wrap">
                      <div
                        className="progress-bar bar-green"
                        style={{ width: `${(lowRiskCount / totalAppsCount) * 100}%` }}
                      />
                    </div>
                    <strong>{lowRiskCount} ({((lowRiskCount / totalAppsCount) * 100).toFixed(0)}%)</strong>
                  </div>

                  <div className="risk-bar-row">
                    <span className="risk-tag tag-medium">Medium Risk</span>
                    <div className="progress-bar-wrap">
                      <div
                        className="progress-bar bar-yellow"
                        style={{ width: `${(medRiskCount / totalAppsCount) * 100}%` }}
                      />
                    </div>
                    <strong>{medRiskCount} ({((medRiskCount / totalAppsCount) * 100).toFixed(0)}%)</strong>
                  </div>

                  <div className="risk-bar-row">
                    <span className="risk-tag tag-high">High Risk</span>
                    <div className="progress-bar-wrap">
                      <div
                        className="progress-bar bar-red"
                        style={{ width: `${(highRiskCount / totalAppsCount) * 100}%` }}
                      />
                    </div>
                    <strong>{highRiskCount} ({((highRiskCount / totalAppsCount) * 100).toFixed(0)}%)</strong>
                  </div>
                </div>

                <div className="capital-total-box" style={{ marginTop: "24px" }}>
                  <span className="text-muted">Total Requested Capital:</span>
                  <h2 className="capital-number">
                    {money(adminStats?.total_loan_amount ?? 0)}
                  </h2>
                </div>
              </div>

              {/* Document Desk Status */}
              <div className="card">
                <h3>Document Verification Desk</h3>
                <p className="text-muted">Status of customer-uploaded identity and income proofs</p>

                <div className="doc-kpi-grid" style={{ marginTop: "20px" }}>
                  <div className="doc-kpi-item pending">
                    <span>Awaiting Verification</span>
                    <h4>{adminStats?.pending_documents ?? 0}</h4>
                  </div>
                  <div className="doc-kpi-item verified">
                    <span>Verified & Cleared</span>
                    <h4>{adminStats?.verified_documents ?? 0}</h4>
                  </div>
                  <div className="doc-kpi-item rejected">
                    <span>Rejected with Reason</span>
                    <h4>{adminStats?.rejected_documents ?? 0}</h4>
                  </div>
                  <div className="doc-kpi-item">
                    <span>Total Uploaded</span>
                    <h4>{adminStats?.total_documents ?? 0}</h4>
                  </div>
                </div>

                <div className="desk-shortcut-box" style={{ marginTop: "20px" }}>
                  <span>Review PAN cards, salary slips, and bank statements in the queue.</span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setActiveMenu("Document Verification")}
                  >
                    Open Verification Desk →
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Application Activity */}
            <div className="card">
              <div className="card-header-flex">
                <div>
                  <h3>Recent Application Activity</h3>
                  <p className="text-muted">Applications submitted across all customer accounts</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveMenu("All Applications")}
                >
                  View All Applications →
                </button>
              </div>

              <div className="table-responsive">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>App ID</th>
                      <th>Applicant</th>
                      <th>Customer Email</th>
                      <th>Loan Amount</th>
                      <th>Credit Score</th>
                      <th>Risk Score</th>
                      <th>Risk Category</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.slice(0, 5).map((app) => (
                      <tr key={app.id}>
                        <td><strong>#{app.id}</strong></td>
                        <td>{app.applicant_name}</td>
                        <td><small className="text-muted">{app.user_email || "N/A"}</small></td>
                        <td>{money(app.loan_amount)}</td>
                        <td>{app.credit_score}</td>
                        <td>{app.risk_score}</td>
                        <td>
                          <span className={`risk-badge badge-${app.risk_category.toLowerCase().replace(/\s+/g, "-")}`}>
                            {app.risk_category}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill pill-${(app.status || "pending").toLowerCase().replace(/\s+/g, "-")}`}>
                            {app.status}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleOpenDossier(app)}
                          >
                            Review & Decide
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- 2. ALL APPLICATIONS ----------------- */}
        {activeMenu === "All Applications" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>All Loan Applications</h2>
                <p>Search, inspect financial profiles, review documents, and update underwriting decisions.</p>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="card filter-bar-card">
              <div className="filter-grid">
                <div className="filter-item search-item">
                  <label>Search Applicant</label>
                  <input
                    type="search"
                    placeholder="Search by name, ID, or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="filter-item">
                  <label>Application Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="form-control"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>

                <div className="filter-item">
                  <label>Risk Category</label>
                  <select
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value)}
                    className="form-control"
                  >
                    <option value="All">All Risk Tiers</option>
                    <option value="Low Risk">Low Risk</option>
                    <option value="Medium Risk">Medium Risk</option>
                    <option value="High Risk">High Risk</option>
                  </select>
                </div>

                <div className="filter-item">
                  <label>Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="form-control"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="highestLoan">Highest Loan</option>
                    <option value="lowestLoan">Lowest Loan</option>
                    <option value="highestRisk">Highest Risk</option>
                  </select>
                </div>

                <div className="filter-item reset-item">
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    onClick={() => {
                      setSearchTerm("");
                      setStatusFilter("All");
                      setRiskFilter("All");
                      setSortBy("newest");
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="results-meta">
                Showing {filteredApps.length} of {applications.length} total applications
              </div>
            </div>

            {/* Table */}
            <div className="card">
              {filteredApps.length === 0 ? (
                <div className="empty-substate">
                  <p>No applications match the search/filter criteria.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Applicant</th>
                        <th>Customer Email</th>
                        <th>Loan Amount</th>
                        <th>Annual Income</th>
                        <th>Credit Score</th>
                        <th>Risk Score</th>
                        <th>Risk Category</th>
                        <th>Status</th>
                        <th>Docs Attached</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApps.map((app) => (
                        <tr key={app.id}>
                          <td><strong>#{app.id}</strong></td>
                          <td><strong>{app.applicant_name}</strong></td>
                          <td><small className="text-muted">{app.user_email || "N/A"}</small></td>
                          <td>{money(app.loan_amount)}</td>
                          <td>{money(app.annual_income)}</td>
                          <td>{app.credit_score}</td>
                          <td>{app.risk_score}</td>
                          <td>
                            <span className={`risk-badge badge-${app.risk_category.toLowerCase().replace(/\s+/g, "-")}`}>
                              {app.risk_category}
                            </span>
                          </td>
                          <td>
                            <span className={`status-pill pill-${(app.status || "pending").toLowerCase().replace(/\s+/g, "-")}`}>
                              {app.status}
                            </span>
                          </td>
                          <td>📁 {app.documents?.length || 0}</td>
                          <td>
                            <div className="table-btn-group">
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => handleOpenDossier(app)}
                              >
                                Review & Decide
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleDeleteApp(app.id)}
                                title="Delete application"
                              >
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------- 3. CUSTOMER MANAGEMENT ----------------- */}
        {activeMenu === "Customer Management" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>Customer Management</h2>
                <p>View registered borrower profiles, application history, and overall portfolio exposure.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadUsers}
                disabled={usersLoading}
              >
                {usersLoading ? "Refreshing..." : "⟳ Refresh Customers"}
              </button>
            </div>

            {/* Customer Search Bar */}
            <div className="card filter-bar-card">
              <div style={{ maxWidth: "400px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", display: "block", marginBottom: "4px" }}>
                  Search by Customer Email or ID
                </label>
                <input
                  type="search"
                  placeholder="e.g. customer@example.com..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="form-control"
                />
              </div>
            </div>

            <div className="card">
              {usersLoading ? (
                <div className="loading-state">Loading customers...</div>
              ) : filteredCustomers.length === 0 ? (
                <div className="empty-substate">
                  <p>No customer accounts found matching your query.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Customer ID</th>
                        <th>Email Address</th>
                        <th>Account Role</th>
                        <th>Applications Filed</th>
                        <th>Total Capital Requested</th>
                        <th>Member Since</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((user) => (
                        <tr key={user.id}>
                          <td><strong>USER-#{user.id}</strong></td>
                          <td><strong>{user.email}</strong></td>
                          <td>
                            <span className={`role-badge role-${user.role.toLowerCase()}`}>
                              {user.role}
                            </span>
                          </td>
                          <td><strong>{user.applications_count}</strong> application(s)</td>
                          <td>{money(user.total_loan_amount || 0)}</td>
                          <td>{new Date(user.created_at).toLocaleDateString("en-IN")}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => viewCustomerHistory(user)}
                            >
                              View History ({user.applications_count}) →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------- 4. DOCUMENT VERIFICATION ----------------- */}
        {activeMenu === "Document Verification" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>Document Verification Queue</h2>
                <p>Inspect and verify customer PAN cards, salary proofs, bank statements, and address records.</p>
              </div>
              <div className="doc-filter-buttons">
                {[
                  { id: "All", label: `All (${adminStats?.total_documents ?? adminDocs.length})` },
                  { id: "Pending", label: `Pending (${adminStats?.pending_documents ?? 0})` },
                  { id: "Verified", label: `Verified (${adminStats?.verified_documents ?? 0})` },
                  { id: "Rejected", label: `Rejected (${adminStats?.rejected_documents ?? 0})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`btn btn-sm ${docFilter === tab.id ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setDocFilter(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              {docsLoading ? (
                <div className="loading-state">Loading documents queue...</div>
              ) : adminDocs.length === 0 ? (
                <div className="empty-substate">
                  <p>No documents found in "{docFilter}" status.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Doc ID</th>
                        <th>Applicant</th>
                        <th>App ID</th>
                        <th>Document Type</th>
                        <th>Filename</th>
                        <th>Upload Date</th>
                        <th>Status</th>
                        <th>Admin Remarks</th>
                        <th>Verification Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminDocs.map((doc) => (
                        <tr key={doc.id} className={doc.status === "Rejected" ? "row-danger" : ""}>
                          <td>#{doc.id}</td>
                          <td><strong>{doc.applicant_name}</strong></td>
                          <td>App #{doc.application_id}</td>
                          <td><span className="doc-type-badge">{doc.document_type}</span></td>
                          <td>
                            <span className="file-name-truncate" title={doc.original_filename}>
                              📄 {doc.original_filename}
                            </span>
                          </td>
                          <td>{new Date(doc.uploaded_at).toLocaleString("en-IN")}</td>
                          <td>
                            <span className={`status-pill pill-${(doc.status || "pending").toLowerCase()}`}>
                              {doc.status}
                            </span>
                          </td>
                          <td><small className="text-muted">{doc.remarks || "—"}</small></td>
                          <td>
                            <div className="table-btn-group">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                onClick={() => setPreviewDoc(doc)}
                              >
                                👁 Inspect
                              </button>
                              {doc.status !== "Verified" && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success"
                                  onClick={() => handleVerifyDocAction(doc.id, "Verified", "Approved by officer.")}
                                >
                                  ✓ Verify
                                </button>
                              )}
                              {doc.status !== "Rejected" && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  onClick={() => {
                                    const reason = prompt("Enter rejection reason (e.g. Document blurry, expired, missing seal):");
                                    if (reason && reason.trim()) {
                                      handleVerifyDocAction(doc.id, "Rejected", reason.trim());
                                    }
                                  }}
                                >
                                  ✕ Reject
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------- 5. RISK ASSESSMENT ----------------- */}
        {activeMenu === "Risk Assessment" && (
          <div className="tab-pane fade-in">
            <div className="pane-header">
              <h2>Customer Risk Assessment & Factor Analysis</h2>
              <p>Review the automated credit risk scoring and penalty reasons for each applicant.</p>
            </div>

            <div className="card">
              <div className="table-responsive">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>App ID</th>
                      <th>Applicant Name</th>
                      <th>Credit Score</th>
                      <th>Annual Income</th>
                      <th>Existing Debt</th>
                      <th>DTI Ratio</th>
                      <th>Loan Amount</th>
                      <th>Risk Score</th>
                      <th>Risk Category</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app) => {
                      const dti =
                        app.annual_income > 0
                          ? ((app.existing_debt / app.annual_income) * 100).toFixed(1) + "%"
                          : "0%";

                      return (
                        <tr key={app.id}>
                          <td><strong>#{app.id}</strong></td>
                          <td><strong>{app.applicant_name}</strong></td>
                          <td>{app.credit_score}</td>
                          <td>{money(app.annual_income)}</td>
                          <td>{money(app.existing_debt)}</td>
                          <td>{dti}</td>
                          <td>{money(app.loan_amount)}</td>
                          <td>
                            <strong>{app.risk_score} / 100</strong>
                          </td>
                          <td>
                            <span className={`risk-badge badge-${app.risk_category.toLowerCase().replace(/\s+/g, "-")}`}>
                              {app.risk_category}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => handleOpenDossier(app)}
                            >
                              Inspect Reasons →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Risk Scoring Methodology Matrix */}
            <div className="guide-grid" style={{ marginTop: "24px" }}>
              <div className="card guide-card">
                <h3>1. Credit Score Thresholds</h3>
                <ul className="guide-rule-list">
                  <li><strong>Credit &lt; 580:</strong> +40 points (High default risk)</li>
                  <li><strong>Credit 580–669:</strong> +25 points (Fair credit)</li>
                  <li><strong>Credit 670–739:</strong> +10 points (Good credit)</li>
                  <li><strong>Credit &ge; 740:</strong> +0 points (Prime borrower)</li>
                </ul>
              </div>

              <div className="card guide-card">
                <h3>2. Debt-to-Income (DTI) Ratios</h3>
                <ul className="guide-rule-list">
                  <li><strong>DTI &gt; 40%:</strong> +25 points (Heavy monthly debt burden)</li>
                  <li><strong>DTI 20%–40%:</strong> +10 points (Moderate commitments)</li>
                  <li><strong>DTI &le; 20%:</strong> +0 points (Healthy low debt)</li>
                </ul>
              </div>

              <div className="card guide-card">
                <h3>3. Loan-to-Income (LTI) Multipliers</h3>
                <ul className="guide-rule-list">
                  <li><strong>LTI &gt; 3.0x:</strong> +30 points (Very high leverage)</li>
                  <li><strong>LTI 1.5x–3.0x:</strong> +15 points (Elevated leverage)</li>
                  <li><strong>LTI &le; 1.5x:</strong> +0 points (Conservative borrowing)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- 6. REPORTS AND ANALYTICS ----------------- */}
        {activeMenu === "Reports and Analytics" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>Portfolio Reports & Underwriting Analytics</h2>
                <p>Performance indicators, approval rates, risk segmentation, and document clearance metrics.</p>
              </div>
            </div>

            {/* Top Metrics Row */}
            <div className="stats-grid">
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-green">🎯</div>
                <div>
                  <span className="stat-label">Approval Rate</span>
                  <h3 className="stat-value">{approvalRate}%</h3>
                  <span className="stat-desc">{approvedCount} of {totalAppsCount} applications</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-red">📉</div>
                <div>
                  <span className="stat-label">Rejection Rate</span>
                  <h3 className="stat-value">{rejectionRate}%</h3>
                  <span className="stat-desc">{rejectedCount} applications declined</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-yellow">⏳</div>
                <div>
                  <span className="stat-label">Pending Rate</span>
                  <h3 className="stat-value">{pendingRate}%</h3>
                  <span className="stat-desc">{pendingCount} applications in queue</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-blue">💰</div>
                <div>
                  <span className="stat-label">Average Loan Size</span>
                  <h3 className="stat-value">{money(adminStats?.avg_loan_amount ?? 0)}</h3>
                  <span className="stat-desc">Per requested file</span>
                </div>
              </div>
            </div>

            {/* Visual Analytics Grid */}
            <div className="overview-row-grid">
              {/* Approval vs Rejection Breakdown */}
              <div className="card">
                <h3>Application Decision Status Breakdown</h3>
                <p className="text-muted">Proportion of outcomes across current portfolio</p>

                <div className="analytics-bar-group" style={{ marginTop: "24px" }}>
                  <div className="analytics-bar-item">
                    <div className="bar-label-flex">
                      <span>Approved Loans</span>
                      <strong>{approvedCount} ({approvalRate}%)</strong>
                    </div>
                    <div className="progress-bar-wrap">
                      <div className="progress-bar bar-green" style={{ width: `${approvalRate}%` }} />
                    </div>
                  </div>

                  <div className="analytics-bar-item" style={{ marginTop: "16px" }}>
                    <div className="bar-label-flex">
                      <span>Pending / Under Review</span>
                      <strong>{pendingCount} ({pendingRate}%)</strong>
                    </div>
                    <div className="progress-bar-wrap">
                      <div className="progress-bar bar-yellow" style={{ width: `${pendingRate}%` }} />
                    </div>
                  </div>

                  <div className="analytics-bar-item" style={{ marginTop: "16px" }}>
                    <div className="bar-label-flex">
                      <span>Rejected Loans</span>
                      <strong>{rejectedCount} ({rejectionRate}%)</strong>
                    </div>
                    <div className="progress-bar-wrap">
                      <div className="progress-bar bar-red" style={{ width: `${rejectionRate}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Verification Clearance Rate */}
              <div className="card">
                <h3>Document Verification Clearance</h3>
                <p className="text-muted">Total documents submitted vs verified and rejected</p>

                <div className="doc-kpi-grid" style={{ marginTop: "20px" }}>
                  <div className="doc-kpi-item verified">
                    <span>Verified</span>
                    <h4>{adminStats?.verified_documents ?? 0}</h4>
                  </div>
                  <div className="doc-kpi-item pending">
                    <span>Pending</span>
                    <h4>{adminStats?.pending_documents ?? 0}</h4>
                  </div>
                  <div className="doc-kpi-item rejected">
                    <span>Rejected</span>
                    <h4>{adminStats?.rejected_documents ?? 0}</h4>
                  </div>
                  <div className="doc-kpi-item">
                    <span>Total Files</span>
                    <h4>{adminStats?.total_documents ?? 0}</h4>
                  </div>
                </div>

                <div className="capital-total-box" style={{ marginTop: "20px" }}>
                  <span className="text-muted">Average Portfolio Credit Score:</span>
                  <h2 className="capital-number" style={{ color: "#2563eb" }}>
                    {(adminStats?.avg_credit_score ?? 0).toFixed(0)}
                  </h2>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- 7. PROFILE ----------------- */}
        {activeMenu === "Profile" && (
          <div className="tab-pane fade-in">
            <div className="pane-header">
              <h2>Administrator Profile</h2>
              <p>System credentials, officer access privileges, and security settings.</p>
            </div>

            <div className="card profile-card">
              <div className="profile-header-banner">
                <div className="profile-avatar-large" style={{ background: "#1e293b", color: "#38bdf8" }}>
                  ADM
                </div>
                <div>
                  <h3>System Administrator</h3>
                  <span className="badge-admin-role">Bank Officer / Underwriting Role</span>
                </div>
              </div>

              <div className="profile-info-grid">
                <div className="info-cell">
                  <span>Officer Email</span>
                  <strong>{currentUser?.email}</strong>
                </div>
                <div className="info-cell">
                  <span>System Role</span>
                  <strong>{currentUser?.role?.toUpperCase()}</strong>
                </div>
                <div className="info-cell">
                  <span>Total Managed Applications</span>
                  <strong>{applications.length}</strong>
                </div>
                <div className="info-cell">
                  <span>Documents Pending Verification</span>
                  <strong>{adminStats?.pending_documents ?? 0}</strong>
                </div>
                <div className="info-cell">
                  <span>Total Capital Under Review</span>
                  <strong>{money(adminStats?.total_loan_amount ?? 0)}</strong>
                </div>
                <div className="info-cell">
                  <span>Security Authorization</span>
                  <span className="status-pill pill-approved">Level 1 Underwriter</span>
                </div>
              </div>

              <div className="card-footer-actions">
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={onLogout}
                >
                  Sign Out of Admin Console
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Customer Application History Modal */}
      {selectedCustomerHistory && (
        <div className="modal-backdrop" onClick={() => setSelectedCustomerHistory(null)}>
          <div className="modal-container dossier-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Customer Application History</h3>
                <p className="modal-subtitle">
                  Customer: <strong>{selectedCustomerHistory.email}</strong> &bull; Total Applications: {selectedCustomerHistory.applications_count}
                </p>
              </div>
              <button type="button" className="close-btn" onClick={() => setSelectedCustomerHistory(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              {customerAppsLoading ? (
                <div className="loading-state">Loading customer applications...</div>
              ) : customerApps.length === 0 ? (
                <div className="empty-substate">
                  <p>No applications found for this customer.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>App ID</th>
                        <th>Applicant Name</th>
                        <th>Loan Amount</th>
                        <th>Risk Score</th>
                        <th>Risk Category</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerApps.map((ca) => (
                        <tr key={ca.id}>
                          <td><strong>#{ca.id}</strong></td>
                          <td>{ca.applicant_name}</td>
                          <td>{money(ca.loan_amount)}</td>
                          <td>{ca.risk_score}</td>
                          <td>
                            <span className={`risk-badge badge-${ca.risk_category.toLowerCase().replace(/\s+/g, "-")}`}>
                              {ca.risk_category}
                            </span>
                          </td>
                          <td>
                            <span className={`status-pill pill-${(ca.status || "pending").toLowerCase().replace(/\s+/g, "-")}`}>
                              {ca.status}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                setSelectedCustomerHistory(null);
                                handleOpenDossier(ca);
                              }}
                            >
                              Review Dossier
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedCustomerHistory(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNDERWRITING DOSSIER MODAL */}
      {selectedApp && (
        <div className="modal-backdrop" onClick={() => setSelectedApp(null)}>
          <div className="modal-container dossier-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Underwriting Review: Application #{selectedApp.id}</h3>
                <p className="modal-subtitle">
                  Applicant: <strong>{selectedApp.applicant_name}</strong> &bull; User: {selectedApp.user_email || "N/A"}
                </p>
              </div>
              <button type="button" className="close-btn" onClick={() => setSelectedApp(null)}>
                &times;
              </button>
            </div>

            <div className="modal-body dossier-body">
              {decisionSuccess && <div className="alert-banner alert-success">{decisionSuccess}</div>}
              {decisionError && <div className="alert-banner alert-danger">{decisionError}</div>}

              {/* Financial Snapshot */}
              <div className="dossier-metrics-grid">
                <div className="dossier-metric">
                  <span>Requested Loan</span>
                  <h4>{money(selectedApp.loan_amount)}</h4>
                </div>
                <div className="dossier-metric">
                  <span>Annual Income</span>
                  <h4>{money(selectedApp.annual_income)}</h4>
                </div>
                <div className="dossier-metric">
                  <span>Credit Score</span>
                  <h4>{selectedApp.credit_score}</h4>
                </div>
                <div className="dossier-metric">
                  <span>Existing Debt</span>
                  <h4>{money(selectedApp.existing_debt)}</h4>
                </div>
                <div className="dossier-metric">
                  <span>Risk Score</span>
                  <h4>{selectedApp.risk_score} / 100</h4>
                </div>
                <div className="dossier-metric">
                  <span>Risk Tier</span>
                  <span className={`risk-badge badge-${selectedApp.risk_category.toLowerCase().replace(/\s+/g, "-")}`}>
                    {selectedApp.risk_category}
                  </span>
                </div>
              </div>

              {/* Risk Factor Breakdown */}
              <div className="dossier-section">
                <h4>Automated Risk Factor Analysis</h4>
                <div className="risk-factors-list">
                  {explainRisk(selectedApp).map((reason, idx) => (
                    <div key={idx} className={`factor-item ${reason.severity}`}>
                      <div>
                        <strong>{reason.title}</strong>
                        <p>{reason.detail}</p>
                      </div>
                      <span className="factor-points">+{reason.points} pts</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attached Documents Checklist */}
              <div className="dossier-section">
                <h4>Attached Verification Documents ({selectedApp.documents?.length || 0})</h4>
                {!selectedApp.documents || selectedApp.documents.length === 0 ? (
                  <p className="text-muted">No documents uploaded by applicant yet.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Document Type</th>
                          <th>Filename</th>
                          <th>Status</th>
                          <th>Remarks</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedApp.documents.map((doc) => (
                          <tr key={doc.id}>
                            <td><strong>{doc.document_type}</strong></td>
                            <td>📄 {doc.original_filename}</td>
                            <td>
                              <span className={`status-pill pill-${(doc.status || "pending").toLowerCase()}`}>
                                {doc.status}
                              </span>
                            </td>
                            <td><small className="text-muted">{doc.remarks || "—"}</small></td>
                            <td>
                              <div className="table-btn-group">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline"
                                  onClick={() => setPreviewDoc(doc)}
                                >
                                  View
                                </button>
                                {doc.status !== "Verified" && (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-success"
                                    onClick={() => handleVerifyDocAction(doc.id, "Verified", "Verified in dossier.")}
                                  >
                                    Verify
                                  </button>
                                )}
                                {doc.status !== "Rejected" && (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-danger"
                                    onClick={() => {
                                      const reason = prompt("Enter rejection reason:");
                                      if (reason && reason.trim()) {
                                        handleVerifyDocAction(doc.id, "Rejected", reason.trim());
                                      }
                                    }}
                                  >
                                    Reject
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Decision Control Box */}
              <div className="dossier-decision-box">
                <h4>Official Underwriting Decision</h4>
                <form onSubmit={handleSaveDecision}>
                  <div className="form-group">
                    <label>Set Application Status</label>
                    <select
                      value={decisionStatus}
                      onChange={(e) => setDecisionStatus(e.target.value)}
                      className="form-control"
                    >
                      <option value="Pending">Pending (Awaiting documents / review)</option>
                      <option value="Under Review">Under Review (Underwriting in progress)</option>
                      <option value="Approved">Approved (Loan Authorized)</option>
                      <option value="Rejected">Rejected (Declined)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Official Admin Remarks (Visible to Customer)</label>
                    <textarea
                      rows={3}
                      value={decisionRemarks}
                      onChange={(e) => setDecisionRemarks(e.target.value)}
                      placeholder="Enter formal officer decision notes (e.g. Approved at 8.25% p.a., or Reason for decline)..."
                      className="form-control"
                    />
                  </div>

                  <div className="decision-actions">
                    <button
                      type="submit"
                      className="btn btn-primary btn-lg"
                      disabled={decisionLoading}
                    >
                      {decisionLoading ? "Saving Decision..." : "Save Decision & Notify Customer"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-lg"
                      onClick={() => setSelectedApp(null)}
                    >
                      Close Dossier
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
          isAdmin={true}
          onVerify={(docId, status, remarks) => handleVerifyDocAction(docId, status, remarks)}
          onReject={(docId, status, remarks) => handleVerifyDocAction(docId, status, remarks)}
        />
      )}
    </div>
  );
}
