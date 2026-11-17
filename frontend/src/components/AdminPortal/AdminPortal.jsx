import { useState, useEffect } from "react";
import {
  getAdminStats,
  getAdminDocuments,
  getAdminUsers,
  updateApplicationStatus,
  deleteApplication,
  verifyDocument,
  updateUserRole,
  money,
  explainRisk,
  getErrorMessage,
} from "../../api";
import DocumentPreviewModal from "../Common/DocumentPreviewModal";

export default function AdminPortal({
  currentUser,
  applications,
  onRefresh,
  refreshing,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [adminStats, setAdminStats] = useState(null);
  const [adminDocs, setAdminDocs] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);

  // Filters & Search for Applications
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");
  const [sortBy, setSortBy] = useState("newest");

  // Document Desk Filters
  const [docFilter, setDocFilter] = useState("Pending");

  // Underwriting Dossier Modal
  const [selectedApp, setSelectedApp] = useState(null);
  const [decisionStatus, setDecisionStatus] = useState("Under Review");
  const [decisionRemarks, setDecisionRemarks] = useState("");
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionSuccess, setDecisionSuccess] = useState("");
  const [decisionError, setDecisionError] = useState("");

  // Document Preview Modal
  const [previewDoc, setPreviewDoc] = useState(null);

  // Success / Error alerts
  const [globalMessage, setGlobalMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    loadAllAdminData();
  }, []);

  const loadAllAdminData = async () => {
    loadStats();
    loadDocs();
    loadUsers();
  };

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

  useEffect(() => {
    loadDocs();
  }, [docFilter]);

  const handleOpenDossier = (app) => {
    setSelectedApp(app);
    setDecisionStatus(app.status || "Under Review");
    setDecisionRemarks(app.admin_remarks || "");
    setDecisionSuccess("");
    setDecisionError("");
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
      setDecisionSuccess(`Decision saved: Application #${updated.id} is now ${updated.status}.`);
      setSelectedApp(updated);
      if (onRefresh) onRefresh();
      loadStats();
    } catch (err) {
      setDecisionError(getErrorMessage(err));
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleDeleteApplication = async (appId) => {
    if (!window.confirm(`Are you sure you want to delete application #${appId}? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteApplication(appId);
      setGlobalMessage({ type: "success", text: `Application #${appId} deleted.` });
      if (selectedApp?.id === appId) setSelectedApp(null);
      if (onRefresh) onRefresh();
      loadStats();
    } catch (err) {
      setGlobalMessage({ type: "danger", text: getErrorMessage(err) });
    }
  };

  const handleVerifyDocAction = async (docId, newStatus, remarks) => {
    try {
      await verifyDocument(docId, newStatus, remarks);
      setGlobalMessage({
        type: "success",
        text: `Document #${docId} marked as ${newStatus}.`,
      });
      // Refresh docs
      loadDocs();
      loadStats();
      if (onRefresh) onRefresh();

      // If dossier is open, update the document in selectedApp as well
      if (selectedApp && selectedApp.documents) {
        setSelectedApp((prev) => ({
          ...prev,
          documents: prev.documents.map((d) =>
            d.id === docId ? { ...d, status: newStatus, remarks } : d
          ),
        }));
      }
    } catch (err) {
      setGlobalMessage({ type: "danger", text: getErrorMessage(err) });
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await updateUserRole(userId, newRole);
      setGlobalMessage({ type: "success", text: `User role updated to ${newRole}.` });
      loadUsers();
    } catch (err) {
      setGlobalMessage({ type: "danger", text: getErrorMessage(err) });
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

  return (
    <div className="portal-container">
      {/* Admin Sidebar Navigation */}
      <aside className="portal-sidebar admin-sidebar-theme">
        <div className="sidebar-section">
          <p className="sidebar-label">ADMIN & UNDERWRITING</p>
          <nav className="nav-menu">
            <button
              type="button"
              className={`nav-link ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              <span className="nav-icon">📈</span>
              <span>Executive Overview</span>
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === "applications" ? "active" : ""}`}
              onClick={() => setActiveTab("applications")}
            >
              <span className="nav-icon">📑</span>
              <span>All Applications ({applications.length})</span>
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === "documents" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("documents");
                loadDocs();
              }}
            >
              <span className="nav-icon">🔍</span>
              <span>Document Verification Desk</span>
              {adminStats?.pending_documents > 0 && (
                <span className="badge-alert-count">{adminStats.pending_documents}</span>
              )}
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === "engine" ? "active" : ""}`}
              onClick={() => setActiveTab("engine")}
            >
              <span className="nav-icon">⚖️</span>
              <span>Risk Scoring Engine</span>
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === "users" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("users");
                loadUsers();
              }}
            >
              <span className="nav-icon">👥</span>
              <span>User Management</span>
            </button>
          </nav>
        </div>

        <div className="sidebar-footer-card admin-footer-badge">
          <div className="badge-officer-shield">🛡️ Underwriter Console</div>
          <small>Logged in as: {currentUser?.email}</small>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="portal-content">
        {/* Global Alert Notification */}
        {globalMessage.text && (
          <div className={`alert-banner alert-${globalMessage.type}`}>
            <span>{globalMessage.text}</span>
            <button
              type="button"
              className="close-alert-btn"
              onClick={() => setGlobalMessage({ type: "", text: "" })}
            >
              &times;
            </button>
          </div>
        )}

        {/* TAB 1: EXECUTIVE OVERVIEW */}
        {activeTab === "overview" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>Admin Cockpit & Portfolio Analytics</h2>
                <p>Live health metrics across all loan applicants and document verification pipelines.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadAllAdminData}
                disabled={statsLoading}
              >
                {statsLoading ? "Refreshing..." : "⟳ Refresh Metrics"}
              </button>
            </div>

            {/* KPI Cards */}
            <div className="stats-grid">
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-blue">📑</div>
                <div>
                  <span className="stat-label">Total Applications</span>
                  <h3 className="stat-value">{adminStats?.total_applications ?? applications.length}</h3>
                  <span className="stat-desc">All-time volume</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-yellow">⏳</div>
                <div>
                  <span className="stat-label">Pending Underwriting</span>
                  <h3 className="stat-value">{adminStats?.pending_review ?? 0}</h3>
                  <span className="stat-desc">Require officer review</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-green">✅</div>
                <div>
                  <span className="stat-label">Approved Loans</span>
                  <h3 className="stat-value">{adminStats?.approved ?? 0}</h3>
                  <span className="stat-desc">Underwriting cleared</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-red">❌</div>
                <div>
                  <span className="stat-label">Declined Loans</span>
                  <h3 className="stat-value">{adminStats?.rejected ?? 0}</h3>
                  <span className="stat-desc">Rejected with remarks</span>
                </div>
              </div>
            </div>

            {/* Financial & Document Pipeline Overview */}
            <div className="overview-row-grid">
              <div className="card">
                <h3>Capital Requested & Risk Distribution</h3>
                <div className="capital-total-box">
                  <span className="text-muted">Total Capital Requested Across Portfolio:</span>
                  <h2 className="capital-number">
                    {money(adminStats?.total_loan_amount ?? applications.reduce((s, a) => s + (a.loan_amount || 0), 0))}
                  </h2>
                </div>

                <div className="risk-bars-container">
                  <div className="risk-bar-row">
                    <span className="risk-tag tag-low">Low Risk</span>
                    <div className="progress-bar-wrap">
                      <div
                        className="progress-bar bar-green"
                        style={{
                          width: `${
                            applications.length > 0
                              ? ((adminStats?.low_risk ?? 0) / applications.length) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <strong>{adminStats?.low_risk ?? 0}</strong>
                  </div>

                  <div className="risk-bar-row">
                    <span className="risk-tag tag-medium">Medium Risk</span>
                    <div className="progress-bar-wrap">
                      <div
                        className="progress-bar bar-yellow"
                        style={{
                          width: `${
                            applications.length > 0
                              ? ((adminStats?.medium_risk ?? 0) / applications.length) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <strong>{adminStats?.medium_risk ?? 0}</strong>
                  </div>

                  <div className="risk-bar-row">
                    <span className="risk-tag tag-high">High Risk</span>
                    <div className="progress-bar-wrap">
                      <div
                        className="progress-bar bar-red"
                        style={{
                          width: `${
                            applications.length > 0
                              ? ((adminStats?.high_risk ?? 0) / applications.length) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <strong>{adminStats?.high_risk ?? 0}</strong>
                  </div>
                </div>
              </div>

              {/* Document Desk KPI */}
              <div className="card">
                <h3>Document Verification Queue Status</h3>
                <div className="doc-kpi-grid">
                  <div className="doc-kpi-item">
                    <span>Total Uploaded</span>
                    <h4>{adminStats?.total_documents ?? 0}</h4>
                  </div>
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
                </div>

                <div className="desk-shortcut-box">
                  <p>There are {adminStats?.pending_documents ?? 0} documents awaiting verification.</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setDocFilter("Pending");
                      setActiveTab("documents");
                    }}
                  >
                    Open Verification Desk →
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Action Queue Table */}
            <div className="card">
              <div className="card-header-flex">
                <div>
                  <h3>Recent Submissions Awaiting Review</h3>
                  <p className="text-muted">Applications in 'Submitted' or 'Under Review' status</p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setActiveTab("applications")}
                >
                  View All ({applications.length}) →
                </button>
              </div>

              <div className="table-responsive">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Applicant</th>
                      <th>Loan Amount</th>
                      <th>Annual Income</th>
                      <th>Credit Score</th>
                      <th>Risk Score</th>
                      <th>Risk Tier</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.slice(0, 5).map((app) => (
                      <tr key={app.id}>
                        <td>#{app.id}</td>
                        <td><strong>{app.applicant_name}</strong></td>
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
                          <span className={`status-pill pill-${(app.status || "submitted").toLowerCase().replace(/\s+/g, "-")}`}>
                            {app.status}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleOpenDossier(app)}
                          >
                            Underwrite ✍️
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

        {/* TAB 2: APPLICATIONS UNDERWRITING DESK */}
        {activeTab === "applications" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>Applications Underwriting Desk</h2>
                <p>Filter, inspect, and approve or reject borrower applications.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onRefresh}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing..." : "⟳ Refresh Applications"}
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="card filter-bar-card">
              <div className="filter-grid">
                <div className="filter-item search-item">
                  <label>Search Applicant</label>
                  <input
                    type="search"
                    placeholder="Search by name, ID, or user email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="filter-item">
                  <label>Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="form-control"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Documents Pending">Documents Pending</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>

                <div className="filter-item">
                  <label>Risk Level</label>
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
                    <option value="highestLoan">Highest Loan Amount</option>
                    <option value="lowestLoan">Lowest Loan Amount</option>
                    <option value="highestRisk">Highest Risk Score</option>
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
                    Clear Filters
                  </button>
                </div>
              </div>

              <div className="results-meta">
                Showing {filteredApps.length} of {applications.length} total applications
              </div>
            </div>

            {/* Applications Table */}
            <div className="card">
              {filteredApps.length === 0 ? (
                <div className="empty-substate">
                  <p>No applications match the selected criteria.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Applicant</th>
                        <th>Account Email</th>
                        <th>Loan Amount</th>
                        <th>Income</th>
                        <th>DTI</th>
                        <th>Credit</th>
                        <th>Risk Score</th>
                        <th>Risk Tier</th>
                        <th>Status</th>
                        <th>Docs</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApps.map((app) => {
                        const dti =
                          app.annual_income > 0
                            ? ((app.existing_debt / app.annual_income) * 100).toFixed(0) + "%"
                            : "—";

                        return (
                          <tr key={app.id}>
                            <td>#{app.id}</td>
                            <td><strong>{app.applicant_name}</strong></td>
                            <td>
                              <small className="text-muted">{app.user_email || "N/A"}</small>
                            </td>
                            <td>{money(app.loan_amount)}</td>
                            <td>{money(app.annual_income)}</td>
                            <td>{dti}</td>
                            <td>{app.credit_score}</td>
                            <td>{app.risk_score}</td>
                            <td>
                              <span className={`risk-badge badge-${app.risk_category.toLowerCase().replace(/\s+/g, "-")}`}>
                                {app.risk_category}
                              </span>
                            </td>
                            <td>
                              <span className={`status-pill pill-${(app.status || "submitted").toLowerCase().replace(/\s+/g, "-")}`}>
                                {app.status}
                              </span>
                            </td>
                            <td>
                              <span className="doc-count-pill">
                                📁 {app.documents?.length || 0}
                              </span>
                            </td>
                            <td>
                              <div className="table-btn-group">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  onClick={() => handleOpenDossier(app)}
                                >
                                  Review
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => handleDeleteApplication(app.id)}
                                  title="Delete Application"
                                >
                                  🗑
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: DEDICATED DOCUMENT VERIFICATION DESK */}
        {activeTab === "documents" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>Document Verification Desk</h2>
                <p>Inspect identity, income, and bank records submitted by applicants.</p>
              </div>
              <div className="doc-filter-buttons">
                {["Pending", "Verified", "Rejected", "All"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`btn btn-sm ${docFilter === tab ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setDocFilter(tab)}
                  >
                    {tab} Documents
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              {docsLoading ? (
                <div className="loading-state">Loading verification records...</div>
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
                        <th>Upload Timestamp</th>
                        <th>Current Status</th>
                        <th>Officer Remarks</th>
                        <th>Underwriting Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminDocs.map((doc) => (
                        <tr key={doc.id} className={doc.status === "Rejected" ? "row-danger" : ""}>
                          <td>#{doc.id}</td>
                          <td><strong>{doc.applicant_name}</strong></td>
                          <td>App #{doc.application_id}</td>
                          <td>
                            <span className="doc-type-badge">{doc.document_type}</span>
                          </td>
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
                          <td>
                            <small className="text-muted">{doc.remarks || "—"}</small>
                          </td>
                          <td>
                            <div className="table-btn-group">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                onClick={() => setPreviewDoc(doc)}
                              >
                                👁 Inspect File
                              </button>
                              {doc.status !== "Verified" && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success"
                                  onClick={() => handleVerifyDocAction(doc.id, "Verified", "Verified by underwriter.")}
                                >
                                  ✓ Verify
                                </button>
                              )}
                              {doc.status !== "Rejected" && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  onClick={() => {
                                    const reason = prompt("Enter reason for rejecting this document:");
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

        {/* TAB 4: RISK SCORING ENGINE */}
        {activeTab === "engine" && (
          <div className="tab-pane fade-in">
            <div className="pane-header">
              <h2>Risk Scoring Rules & Underwriting Matrix</h2>
              <p>Automated criteria implemented in the backend decision algorithm.</p>
            </div>

            <div className="guide-grid">
              <div className="card guide-card">
                <h3>Credit Score Penalty Weight (Max 40 Pts)</h3>
                <p>The primary signal for default risk assessment:</p>
                <ul className="guide-rule-list">
                  <li><strong>Credit &lt; 580:</strong> +40 points (High default risk)</li>
                  <li><strong>Credit 580–669:</strong> +25 points (Fair credit)</li>
                  <li><strong>Credit 670–739:</strong> +10 points (Good credit)</li>
                  <li><strong>Credit &ge; 740:</strong> +0 points (Prime borrower)</li>
                </ul>
              </div>

              <div className="card guide-card">
                <h3>Debt-to-Income (DTI) Burden (Max 25 Pts)</h3>
                <p>Calculated as <code>existing_debt / annual_income</code>:</p>
                <ul className="guide-rule-list">
                  <li><strong>DTI &gt; 40%:</strong> +25 points (Severe debt obligations)</li>
                  <li><strong>DTI 20%–40%:</strong> +10 points (Moderate debt commitments)</li>
                  <li><strong>DTI &le; 20%:</strong> +0 points (Comfortable debt capacity)</li>
                </ul>
              </div>

              <div className="card guide-card">
                <h3>Loan-to-Income (LTI) Multiplier (Max 30 Pts)</h3>
                <p>Calculated as <code>loan_amount / annual_income</code>:</p>
                <ul className="guide-rule-list">
                  <li><strong>LTI &gt; 3.0x:</strong> +30 points (Very large leverage)</li>
                  <li><strong>LTI 1.5x–3.0x:</strong> +15 points (Elevated leverage)</li>
                  <li><strong>LTI &le; 1.5x:</strong> +0 points (Manageable loan size)</li>
                </ul>
              </div>

              <div className="card guide-card">
                <h3>Risk Category Classification</h3>
                <p>Sum of all factors capped at 100 points:</p>
                <ul className="guide-rule-list">
                  <li><strong>60–100 points:</strong> High Risk (Manual inspection mandatory)</li>
                  <li><strong>30–59 points:</strong> Medium Risk (Standard verification required)</li>
                  <li><strong>0–29 points:</strong> Low Risk (Fast-track approval eligible)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: USER MANAGEMENT */}
        {activeTab === "users" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>User Management & Roles</h2>
                <p>View registered accounts and manage system permissions.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadUsers}
                disabled={usersLoading}
              >
                {usersLoading ? "Refreshing..." : "⟳ Refresh Users"}
              </button>
            </div>

            <div className="card">
              {usersLoading ? (
                <div className="loading-state">Loading users directory...</div>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>User ID</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Applications Submitted</th>
                        <th>Joined Date</th>
                        <th>Change Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers.map((u) => (
                        <tr key={u.id}>
                          <td>#{u.id}</td>
                          <td><strong>{u.email}</strong></td>
                          <td>
                            <span className={`role-badge role-${u.role.toLowerCase()}`}>
                              {u.role}
                            </span>
                          </td>
                          <td>
                            <strong>{u.applications_count}</strong> application(s)
                          </td>
                          <td>{new Date(u.created_at).toLocaleDateString("en-IN")}</td>
                          <td>
                            <select
                              value={u.role}
                              onChange={(e) => handleRoleChange(u.id, e.target.value)}
                              className="form-control form-control-sm"
                              disabled={u.id === currentUser?.id}
                            >
                              <option value="customer">customer</option>
                              <option value="bank_officer">bank_officer</option>
                              <option value="admin">admin</option>
                            </select>
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
      </main>

      {/* UNDERWRITING DOSSIER MODAL */}
      {selectedApp && (
        <div className="modal-backdrop" onClick={() => setSelectedApp(null)}>
          <div
            className="modal-container dossier-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Underwriting Dossier: Application #{selectedApp.id}</h3>
                <p className="modal-subtitle">
                  Applicant: <strong>{selectedApp.applicant_name}</strong> &bull; User: {selectedApp.user_email || "N/A"}
                </p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setSelectedApp(null)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body dossier-body">
              {decisionSuccess && (
                <div className="alert-banner alert-success">{decisionSuccess}</div>
              )}
              {decisionError && (
                <div className="alert-banner alert-danger">{decisionError}</div>
              )}

              {/* Applicant Financial Summary */}
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

              {/* Risk Factors Explanation */}
              <div className="dossier-section">
                <h4>Automated Risk Factor Breakdown</h4>
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

              {/* Applicant Uploaded Documents Checklist */}
              <div className="dossier-section">
                <h4>Applicant Verification Documents ({selectedApp.documents?.length || 0})</h4>
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
                                      const reason = prompt("Enter reason for rejection:");
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

              {/* Underwriting Decision Controls */}
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
                      <option value="Submitted">Submitted (Initial Stage)</option>
                      <option value="Documents Pending">Documents Pending (Waiting for applicant)</option>
                      <option value="Under Review">Under Review (Underwriting in progress)</option>
                      <option value="Approved">Approved (Loan Cleared)</option>
                      <option value="Rejected">Rejected (Declined)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Official Officer Notes & Remarks</label>
                    <textarea
                      rows={3}
                      value={decisionRemarks}
                      onChange={(e) => setDecisionRemarks(e.target.value)}
                      placeholder="Add formal remarks visible to the borrower (e.g. Approved at 8.5% interest rate, or Reason for rejection)..."
                      className="form-control"
                    />
                  </div>

                  <div className="decision-actions">
                    <button
                      type="submit"
                      className="btn btn-primary btn-lg"
                      disabled={decisionLoading}
                    >
                      {decisionLoading ? "Saving Decision..." : "Save Decision & Notify Borrower"}
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
