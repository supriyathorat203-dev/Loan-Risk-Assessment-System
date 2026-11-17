import { useState, useEffect } from "react";
import {
  createApplication,
  uploadDocument,
  getApplicationDocuments,
  getCustomerDocuments,
  money,
  explainRisk,
  getErrorMessage,
} from "../../api";
import DocumentPreviewModal from "../Common/DocumentPreviewModal";
import AIChatbot from "../Common/AIChatbot";

const DOC_TYPES = [
  { id: "PAN Card", name: "PAN Card (Identity Document)", required: true },
  { id: "Income Proof", name: "Income Proof (Salary Slip / Form 16 / ITR)", required: true },
  { id: "Bank Statement", name: "Bank Statement (Last 3–6 Months)", required: true },
  { id: "Address Proof", name: "Address Proof (Masked Aadhaar / Utility Bill)", required: false },
];

export default function CustomerDashboard({
  currentUser,
  applications,
  onRefresh,
  refreshing,
  onLogout,
  theme = "light",
  onToggleTheme,
}) {
  const [activeMenu, setActiveMenu] = useState("Dashboard");
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [appDocuments, setAppDocuments] = useState([]);
  const [allCustomerDocs, setAllCustomerDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [viewDetailsApp, setViewDetailsApp] = useState(null);
  const [showFloatingChat, setShowFloatingChat] = useState(false);

  // Apply Form State
  const initialForm = {
    applicant_name: "",
    email: currentUser?.email || "",
    mobile_no: "",
    aadhaar_no: "",
    address: "",
    age: "",
    annual_income: "",
    loan_amount: "",
    credit_score: 720,
    employment_type: "Salaried",
    existing_debt: "0",
  };
  const [form, setForm] = useState(initialForm);
  const [formLoading, setFormLoading] = useState(false);
  const [formSuccess, setFormSuccess] = useState(null);
  const [formError, setFormError] = useState("");

  // Upload Form State
  const [uploadDocType, setUploadDocType] = useState("PAN Card");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [uploadError, setUploadError] = useState("");

  // Search/Filter for My Applications
  const [appSearchTerm, setAppSearchTerm] = useState("");
  const [appStatusFilter, setAppStatusFilter] = useState("All");

  const loadAllCustomerDocuments = async () => {
    try {
      const docs = await getCustomerDocuments();
      setAllCustomerDocs(docs);
    } catch (err) {
      console.warn("Could not load all customer documents", err);
    }
  };

  // Keep selected application synced, prioritizing applications that already have uploaded documents
  useEffect(() => {
    if (applications && applications.length > 0) {
      if (!selectedAppId || !applications.some((a) => a.id === selectedAppId)) {
        const appWithDocs =
          applications.find((a) => a.documents && a.documents.length > 0) ||
          applications[0];
        setSelectedAppId(appWithDocs.id);
      }
    }
    loadAllCustomerDocuments();
  }, [applications]);

  // Load documents when selected app changes
  useEffect(() => {
    if (selectedAppId) {
      loadDocumentsForApp(selectedAppId);
    } else {
      setAppDocuments([]);
    }
  }, [selectedAppId]);

  const loadDocumentsForApp = async (appId) => {
    setDocsLoading(true);
    try {
      const docs = await getApplicationDocuments(appId);
      setAppDocuments(docs);
    } catch (err) {
      console.error("Failed to load documents", err);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    setFormSuccess(null);

    // Validate mobile number
    const cleanMobile = form.mobile_no.replace(/\D/g, "");
    if (cleanMobile.length !== 10) {
      setFormError("Please enter a valid 10-digit mobile number.");
      setFormLoading(false);
      return;
    }

    // Validate Aadhaar number
    const cleanAadhaar = form.aadhaar_no.replace(/\D/g, "");
    if (cleanAadhaar.length !== 12) {
      setFormError("Please enter a valid 12-digit Aadhaar number.");
      setFormLoading(false);
      return;
    }

    try {
      const payload = {
        applicant_name: form.applicant_name.trim(),
        email: form.email?.trim() || null,
        mobile_no: cleanMobile,
        aadhaar_no: form.aadhaar_no.trim(),
        address: form.address?.trim() || null,
        age: Number(form.age),
        annual_income: Number(form.annual_income),
        loan_amount: Number(form.loan_amount),
        credit_score: Number(form.credit_score),
        employment_type: form.employment_type,
        existing_debt: Number(form.existing_debt || 0),
      };

      const newApp = await createApplication(payload);
      setFormSuccess(newApp);
      setForm(initialForm);
      setSelectedAppId(newApp.id);
      if (onRefresh) onRefresh();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setFormLoading(false);
    }
  };

  const handleDocumentUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("Please choose a file to upload.");
      return;
    }
    if (!selectedAppId) {
      setUploadError("Please select an application first.");
      return;
    }

    setUploadLoading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      await uploadDocument(selectedAppId, uploadDocType, uploadFile);
      setUploadSuccess(`"${uploadDocType}" uploaded successfully! Status updated to Under Review.`);
      setUploadFile(null);
      const inputEl = document.getElementById("cust-file-input");
      if (inputEl) inputEl.value = "";
      await loadDocumentsForApp(selectedAppId);
      await loadAllCustomerDocuments();
      if (onRefresh) onRefresh();
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploadLoading(false);
    }
  };

  const currentApp = applications.find((a) => a.id === selectedAppId) || applications[0];

  // Counts for Dashboard
  const pendingCount = applications.filter((a) =>
    ["Pending", "Submitted", "Documents Pending", "Under Review"].includes(a.status)
  ).length;
  const approvedCount = applications.filter((a) => a.status === "Approved").length;
  const rejectedCount = applications.filter((a) => a.status === "Rejected").length;

  // Real-time Affordability preview for the form
  const pIncome = Number(form.annual_income) || 0;
  const pLoan = Number(form.loan_amount) || 0;
  const pDebt = Number(form.existing_debt) || 0;
  const pCredit = Number(form.credit_score) || 720;
  const dti = pIncome > 0 ? ((pDebt / pIncome) * 100).toFixed(1) : "0";
  const lti = pIncome > 0 ? (pLoan / pIncome).toFixed(2) : "0";

  // Estimated Monthly EMI (36 Months @ 9.5% p.a.)
  const monthlyRate = 0.095 / 12;
  const tenureMonths = 36;
  const estimatedEMI =
    pLoan > 0
      ? Math.round(
          (pLoan * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
            (Math.pow(1 + monthlyRate, tenureMonths) - 1)
        )
      : 0;

  // Filtered applications for "My Applications"
  const filteredMyApps = applications.filter((item) => {
    const q = appSearchTerm.trim().toLowerCase();
    const matchSearch =
      !q ||
      item.applicant_name?.toLowerCase().includes(q) ||
      String(item.id).includes(q);
    const matchStatus =
      appStatusFilter === "All" || item.status === appStatusFilter;
    return matchSearch && matchStatus;
  });

  const customerName =
    applications[0]?.applicant_name ||
    currentUser?.email?.split("@")[0] ||
    "Customer";

  return (
    <div className="portal-container customer-portal-layout">
      {/* 1. CUSTOMER SIDEBAR */}
      <aside className="portal-sidebar customer-sidebar-theme">
        <div className="sidebar-brand-box">
          <h2 className="brand-title">
            Loan<span className="brand-accent">Wise</span>
          </h2>
          <span className="customer-portal-badge">Customer Portal</span>
        </div>

        <nav className="nav-menu">
          {[
            { id: "Dashboard", label: "Dashboard", icon: "📊" },
            { id: "Apply for Loan", label: "Apply for Loan", icon: "📝" },
            { id: "My Applications", label: `My Applications (${applications.length})`, icon: "📋" },
            { id: "Upload Documents", label: "Upload Documents", icon: "📁" },
            { id: "Risk Assessment", label: "Risk Assessment", icon: "⚡" },
            { id: "Application Status", label: "Application Status", icon: "🔄" },
            { id: "AI Assistant", label: "AI Advisor 🤖", icon: "🤖" },
            { id: "Profile", label: "Profile", icon: "👤" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link ${activeMenu === item.id ? "active" : ""}`}
              onClick={() => {
                setActiveMenu(item.id);
                setFormSuccess(null);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
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

        <div className="customer-sidebar-user">
          <div className="user-avatar-sm">
            {currentUser?.email?.slice(0, 2).toUpperCase()}
          </div>
          <div className="user-details-truncate">
            <strong>{customerName}</strong>
            <small>{currentUser?.email}</small>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="portal-content">
        {/* Top Header */}
        <header className="customer-topbar">
          <div>
            <span className="topbar-breadcrumb">CUSTOMER PORTAL / {activeMenu.toUpperCase()}</span>
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
              onClick={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? "⟳ Syncing..." : "⟳ Refresh Data"}
            </button>
            <span className="badge-customer-role">Borrower Account</span>
          </div>
        </header>

        {/* ----------------- 1. DASHBOARD ----------------- */}
        {activeMenu === "Dashboard" && (
          <div className="tab-pane fade-in">
            {/* Welcome Banner */}
            <div className="customer-welcome-card">
              <div className="welcome-text">
                <h2>Welcome, {customerName}! 👋</h2>
                <p>
                  Manage your loan applications, upload verification files, and track your
                  underwriting progress in real time.
                </p>
                <div className="welcome-btn-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setActiveMenu("Apply for Loan")}
                  >
                    + Apply for a New Loan
                  </button>
                  {applications.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setActiveMenu("Application Status")}
                    >
                      Track Application Status →
                    </button>
                  )}
                </div>
              </div>
              <div className="welcome-badge-stat">
                <span className="stat-pill-label">Active Loans</span>
                <h3>{applications.length}</h3>
                <small>Linked to your account</small>
              </div>
            </div>

            {/* Statistics Cards */}
            <div className="stats-grid">
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-blue">📋</div>
                <div>
                  <span className="stat-label">Total Applications</span>
                  <h3 className="stat-value">{applications.length}</h3>
                  <span className="stat-desc">All applications submitted</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-yellow">⏳</div>
                <div>
                  <span className="stat-label">Pending / In Review</span>
                  <h3 className="stat-value">{pendingCount}</h3>
                  <span className="stat-desc">Awaiting officer decision</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-green">✅</div>
                <div>
                  <span className="stat-label">Approved Applications</span>
                  <h3 className="stat-value">{approvedCount}</h3>
                  <span className="stat-desc">Ready for disbursement</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-red">❌</div>
                <div>
                  <span className="stat-label">Rejected Applications</span>
                  <h3 className="stat-value">{rejectedCount}</h3>
                  <span className="stat-desc">Reviewed with remarks</span>
                </div>
              </div>
            </div>

            {/* Recent Application Activity */}
            <div className="card">
              <div className="card-header-flex">
                <div>
                  <h3>Recent Application Activity</h3>
                  <p className="text-muted">Your latest loan submissions and their processing status</p>
                </div>
                {applications.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setActiveMenu("My Applications")}
                  >
                    View All ({applications.length}) →
                  </button>
                )}
              </div>

              {applications.length === 0 ? (
                <div className="empty-substate">
                  <p>You have not submitted any loan applications yet.</p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setActiveMenu("Apply for Loan")}
                  >
                    Apply Now
                  </button>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>App ID</th>
                        <th>Applicant Name</th>
                        <th>Loan Amount</th>
                        <th>Submission Date</th>
                        <th>Risk Category</th>
                        <th>Application Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.slice(0, 4).map((app) => (
                        <tr key={app.id}>
                          <td>#{app.id}</td>
                          <td><strong>{app.applicant_name}</strong></td>
                          <td>{money(app.loan_amount)}</td>
                          <td>{new Date(app.created_at).toLocaleDateString("en-IN")}</td>
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
                              className="btn btn-sm btn-outline"
                              onClick={() => {
                                setSelectedAppId(app.id);
                                setActiveMenu("Application Status");
                              }}
                            >
                              Check Status →
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

        {/* ----------------- 2. APPLY FOR LOAN ----------------- */}
        {activeMenu === "Apply for Loan" && (
          <div className="tab-pane fade-in">
            <div className="pane-header">
              <h2>Loan Application Form</h2>
              <p>Please enter your accurate personal and financial details to initiate risk underwriting.</p>
            </div>

            {formSuccess ? (
              <div className="card success-step-card">
                <div className="success-icon-badge">✓</div>
                <h3>Application #{formSuccess.id} Submitted Successfully!</h3>
                <p>
                  Your preliminary loan request of <strong>{money(formSuccess.loan_amount)}</strong> has been registered
                  with status: <span className="status-pill pill-pending">{formSuccess.status}</span>.
                </p>
                <div className="next-step-prompt">
                  <strong>Required Next Step: Upload Verification Documents</strong>
                  <p>
                    Please upload your PAN card, Income Proof, and Bank Statements to enable officer verification.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => {
                      setSelectedAppId(formSuccess.id);
                      setActiveMenu("Upload Documents");
                    }}
                  >
                    Proceed to Upload Documents →
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-layout-grid">
                <div className="card form-main-card">
                  <h3>Applicant Information & Loan Request</h3>
                  {formError && <div className="alert-banner alert-danger">{formError}</div>}

                  <form onSubmit={handleFormSubmit} className="loan-grid-form">
                    <div className="form-group full-width">
                      <label>Applicant Full Legal Name</label>
                      <input
                        type="text"
                        name="applicant_name"
                        value={form.applicant_name}
                        onChange={handleFormChange}
                        placeholder="e.g. Rahul Sharma"
                        required
                        minLength={2}
                      />
                    </div>

                    <div className="form-group">
                      <label>Email Address</label>
                      <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleFormChange}
                        placeholder="e.g. rahul.sharma@example.com"
                        required
                      />
                      <small className="field-hint">Sanction letter & notices will be sent here</small>
                    </div>

                    <div className="form-group">
                      <label>Mobile Number (10 Digits)</label>
                      <input
                        type="tel"
                        name="mobile_no"
                        value={form.mobile_no}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                          setForm((prev) => ({ ...prev, mobile_no: val }));
                        }}
                        placeholder="e.g. 9876543210"
                        required
                        maxLength={10}
                      />
                      <small className="field-hint">Primary number for OTP & verification</small>
                    </div>

                    <div className="form-group">
                      <label>Aadhaar Number (12 Digits)</label>
                      <input
                        type="text"
                        name="aadhaar_no"
                        value={form.aadhaar_no}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "").slice(0, 12);
                          const formatted = raw.replace(/(\d{4})(?=\d)/g, "$1 ");
                          setForm((prev) => ({ ...prev, aadhaar_no: formatted }));
                        }}
                        placeholder="e.g. 5432 1234 9876"
                        required
                        maxLength={14}
                      />
                      <small className="field-hint">Used for KYC deduplication & identity</small>
                    </div>

                    <div className="form-group full-width">
                      <label>Current Residential Address</label>
                      <textarea
                        name="address"
                        value={form.address}
                        onChange={handleFormChange}
                        placeholder="Enter complete residential address with house/flat no., street, city, state and PIN code..."
                        rows={2}
                        required
                        minLength={10}
                      />
                      <small className="field-hint">Must match your address proof document</small>
                    </div>

                    <div className="form-group">
                      <label>Age (18–100)</label>
                      <input
                        type="number"
                        name="age"
                        value={form.age}
                        onChange={handleFormChange}
                        placeholder="e.g. 30"
                        required
                        min={18}
                        max={100}
                      />
                    </div>

                    <div className="form-group">
                      <label>Employment Type</label>
                      <select
                        name="employment_type"
                        value={form.employment_type}
                        onChange={handleFormChange}
                        required
                      >
                        <option value="Salaried">Salaried (Full-time Employee)</option>
                        <option value="Self-employed">Self-employed Professional</option>
                        <option value="Business owner">Business Owner / Enterprise</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Annual Income (₹)</label>
                      <input
                        type="number"
                        name="annual_income"
                        value={form.annual_income}
                        onChange={handleFormChange}
                        placeholder="e.g. 700000"
                        required
                        min={1000}
                      />
                      <small className="field-hint">Your gross annual earnings</small>
                    </div>

                    <div className="form-group">
                      <label>Existing Total Debt (₹)</label>
                      <input
                        type="number"
                        name="existing_debt"
                        value={form.existing_debt}
                        onChange={handleFormChange}
                        placeholder="e.g. 50000"
                        min={0}
                      />
                      <small className="field-hint">Credit cards, personal loans, car EMIs</small>
                    </div>

                    <div className="form-group">
                      <label>Requested Loan Amount (₹)</label>
                      <input
                        type="number"
                        name="loan_amount"
                        value={form.loan_amount}
                        onChange={handleFormChange}
                        placeholder="e.g. 500000"
                        required
                        min={1000}
                      />
                    </div>

                    <div className="form-group">
                      <label>Credit Score (CIBIL: 300–850)</label>
                      <input
                        type="number"
                        name="credit_score"
                        value={form.credit_score}
                        onChange={handleFormChange}
                        required
                        min={300}
                        max={850}
                      />
                    </div>

                    <div className="form-actions full-width">
                      <button
                        type="submit"
                        className="btn btn-primary btn-lg"
                        disabled={formLoading}
                      >
                        {formLoading ? "Submitting Application..." : "Submit Application →"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Live Estimator Sidebar */}
                <div className="card preview-sidebar-card">
                  <h4>Live Affordability Estimator</h4>
                  <p className="text-muted">Calculated in real-time as you type:</p>

                  <div className="metric-box">
                    <span>Estimated Monthly EMI (36 Mos @ 9.5%)</span>
                    <h3 style={{ color: "#059669" }}>{money(estimatedEMI)}</h3>
                    <small className="text-muted">Indicative monthly installment</small>
                  </div>

                  <div className="metric-box">
                    <span>Debt-to-Income (DTI)</span>
                    <h3>{dti}%</h3>
                    <small className={Number(dti) > 40 ? "text-danger" : "text-success"}>
                      {Number(dti) > 40 ? "High debt ratio (>40%)" : "Manageable debt ratio (≤40%)"}
                    </small>
                  </div>

                  <div className="metric-box">
                    <span>Loan-to-Income Multiplier</span>
                    <h3>{lti}x</h3>
                    <small className={Number(lti) > 3 ? "text-danger" : "text-success"}>
                      {Number(lti) > 3 ? "High loan leverage (>3x)" : "Moderate loan size (≤3x)"}
                    </small>
                  </div>

                  <div className="guidance-box">
                    <strong>📌 Application Guidelines:</strong>
                    <ul>
                      <li>Ensure your legal name matches your PAN document.</li>
                      <li>Credit scores above 740 receive preferential low-risk rating.</li>
                      <li>Verification documents can be uploaded immediately after submission.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------- 3. MY APPLICATIONS ----------------- */}
        {activeMenu === "My Applications" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>My Applications</h2>
                <p>Displaying all loan requests filed under your account.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setFormSuccess(null);
                  setActiveMenu("Apply for Loan");
                }}
              >
                + New Application
              </button>
            </div>

            {/* Filter Bar */}
            <div className="card filter-bar-card">
              <div className="filter-grid" style={{ gridTemplateColumns: "2fr 1fr auto" }}>
                <div className="filter-item">
                  <label>Search Applications</label>
                  <input
                    type="search"
                    placeholder="Search by ID or applicant name..."
                    value={appSearchTerm}
                    onChange={(e) => setAppSearchTerm(e.target.value)}
                    className="form-control"
                  />
                </div>
                <div className="filter-item">
                  <label>Filter by Status</label>
                  <select
                    value={appStatusFilter}
                    onChange={(e) => setAppStatusFilter(e.target.value)}
                    className="form-control"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
                <div className="filter-item reset-item">
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    onClick={() => {
                      setAppSearchTerm("");
                      setAppStatusFilter("All");
                    }}
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>

            {/* Applications Table */}
            <div className="card">
              {filteredMyApps.length === 0 ? (
                <div className="empty-substate">
                  <p>No matching loan applications found.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>App ID</th>
                        <th>Applicant</th>
                        <th>Loan Amount</th>
                        <th>Annual Income</th>
                        <th>Application Date</th>
                        <th>Risk Category</th>
                        <th>Application Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMyApps.map((item) => (
                        <tr key={item.id}>
                          <td><strong>#{item.id}</strong></td>
                          <td>{item.applicant_name}</td>
                          <td>{money(item.loan_amount)}</td>
                          <td>{money(item.annual_income)}</td>
                          <td>{new Date(item.created_at).toLocaleDateString("en-IN")}</td>
                          <td>
                            <span className={`risk-badge badge-${item.risk_category.toLowerCase().replace(/\s+/g, "-")}`}>
                              {item.risk_category}
                            </span>
                          </td>
                          <td>
                            <span className={`status-pill pill-${(item.status || "pending").toLowerCase().replace(/\s+/g, "-")}`}>
                              {item.status}
                            </span>
                          </td>
                          <td>
                            <div className="table-btn-group">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                onClick={() => setViewDetailsApp(item)}
                              >
                                View Details
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  setSelectedAppId(item.id);
                                  setActiveMenu("Upload Documents");
                                }}
                              >
                                Docs & Status →
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

        {/* ----------------- 4. UPLOAD DOCUMENTS ----------------- */}
        {activeMenu === "Upload Documents" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>Upload Verification Documents</h2>
                <p>Submit your PAN, Income Proof, Bank Statement, and Address Proof (PDF, JPG, PNG up to 5MB).</p>
              </div>

              {applications.length > 1 && (
                <div className="app-picker">
                  <label>Select Application:</label>
                  <select
                    value={selectedAppId || ""}
                    onChange={(e) => setSelectedAppId(Number(e.target.value))}
                    className="select-control"
                  >
                    {applications.map((a) => (
                      <option key={a.id} value={a.id}>
                        App #{a.id} - {a.applicant_name} ({a.documents?.length || 0} Docs • {money(a.loan_amount)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {!currentApp ? (
              <div className="card empty-state">
                <div className="empty-icon">📁</div>
                <h3>No Applications Found</h3>
                <p>Please submit a loan application first before uploading verification files.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setActiveMenu("Apply for Loan")}
                >
                  Apply Now
                </button>
              </div>
            ) : (
              <div className="doc-section-grid">
                {/* Upload Form Box */}
                <div className="card upload-box-card">
                  <h3>Submit a Document for App #{currentApp.id}</h3>
                  <p className="text-muted">
                    Accepted formats: PDF, JPG, PNG &bull; Maximum file size: 5 MB
                  </p>

                  {uploadSuccess && <div className="alert-banner alert-success">{uploadSuccess}</div>}
                  {uploadError && <div className="alert-banner alert-danger">{uploadError}</div>}

                  <form onSubmit={handleDocumentUpload} className="upload-form">
                    <div className="form-group">
                      <label>Document Type</label>
                      <select
                        value={uploadDocType}
                        onChange={(e) => setUploadDocType(e.target.value)}
                        className="form-control"
                      >
                        <option value="PAN Card">PAN Document (PAN Card)</option>
                        <option value="Income Proof">Income Proof (Salary Slip / Form 16 / ITR)</option>
                        <option value="Bank Statement">Bank Statement (Last 3–6 Months)</option>
                        <option value="Address Proof">Address Proof (Masked Aadhaar only / Utility Bill)</option>
                        <option value="Other Document">Other Supporting Document</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Select File</label>
                      <input
                        id="cust-file-input"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setUploadFile(e.target.files[0] || null)}
                        required
                        className="file-input-control"
                      />
                      {uploadFile && (
                        <div className="selected-file-pill">
                          📄 {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary btn-block"
                      disabled={uploadLoading || !uploadFile}
                    >
                      {uploadLoading ? "Uploading to Server..." : `Upload ${uploadDocType}`}
                    </button>
                  </form>

                  {/* Document Checklist */}
                  <div className="checklist-box">
                    <strong>Required Documents Checklist:</strong>
                    <ul>
                      {DOC_TYPES.map((dt) => {
                        const uploaded = appDocuments.some((d) => d.document_type === dt.id);
                        const verified = appDocuments.some(
                          (d) => d.document_type === dt.id && d.status === "Verified"
                        );
                        const rejected = appDocuments.some(
                          (d) => d.document_type === dt.id && d.status === "Rejected"
                        );

                        return (
                          <li key={dt.id} className="checklist-item">
                            <span className="checklist-icon">
                              {verified ? "✅" : rejected ? "❌" : uploaded ? "⏳" : "○"}
                            </span>
                            <span>{dt.name}</span>
                            <span className="checklist-status">
                              {verified ? "Verified" : rejected ? "Rejected" : uploaded ? "In Review" : "Pending"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

                {/* Uploaded Documents List */}
                <div className="card doc-table-card">
                  <div className="card-header-flex">
                    <div>
                      <h3>Uploaded Documents Status</h3>
                      <p className="text-muted">
                        {appDocuments.length} document(s) uploaded for Application #{currentApp.id}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => loadDocumentsForApp(currentApp.id)}
                      disabled={docsLoading}
                    >
                      {docsLoading ? "Refreshing..." : "⟳ Refresh"}
                    </button>
                  </div>

                  {appDocuments.length === 0 ? (
                    <div className="empty-substate">
                      <p>No documents uploaded for this application yet.</p>
                      <p className="text-muted">Use the form on the left to upload your PAN card and proofs.</p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>Document Type</th>
                            <th>Filename</th>
                            <th>Upload Date</th>
                            <th>Verification Status</th>
                            <th>Admin Remarks</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {appDocuments.map((doc) => (
                            <tr key={doc.id} className={doc.status === "Rejected" ? "row-danger" : ""}>
                              <td><strong>{doc.document_type}</strong></td>
                              <td>
                                <span className="file-name-truncate" title={doc.original_filename}>
                                  📄 {doc.original_filename}
                                </span>
                              </td>
                              <td>{new Date(doc.uploaded_at).toLocaleDateString("en-IN")}</td>
                              <td>
                                <span className={`status-pill pill-${(doc.status || "pending").toLowerCase()}`}>
                                  {doc.status}
                                </span>
                              </td>
                              <td>
                                {doc.remarks ? (
                                  <span className={doc.status === "Rejected" ? "text-danger" : "text-muted"}>
                                    {doc.remarks}
                                  </span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                              <td>
                                <div className="table-btn-group">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline"
                                    onClick={() => setPreviewDoc(doc)}
                                  >
                                    👁 View File
                                  </button>
                                  {doc.status === "Rejected" && (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-danger"
                                      onClick={() => {
                                        setUploadDocType(doc.document_type);
                                        const el = document.getElementById("cust-file-input");
                                        if (el) el.scrollIntoView({ behavior: "smooth" });
                                      }}
                                    >
                                      Re-upload
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

            {/* All Submitted Documents Across All User Applications */}
            {allCustomerDocs && allCustomerDocs.length > 0 && (
              <div className="card" style={{ marginTop: "24px" }}>
                <div className="card-header-flex">
                  <div>
                    <h3>All Submitted Documents ({allCustomerDocs.length})</h3>
                    <p className="text-muted">
                      Complete log of all verification files you have uploaded across your loan applications.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={loadAllCustomerDocuments}
                  >
                    ⟳ Refresh All
                  </button>
                </div>

                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Doc ID</th>
                        <th>App ID</th>
                        <th>Document Type</th>
                        <th>File Name</th>
                        <th>Uploaded On</th>
                        <th>Verification Status</th>
                        <th>Officer Remarks</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allCustomerDocs.map((doc) => (
                        <tr key={doc.id} className={doc.status === "Rejected" ? "row-danger" : ""}>
                          <td>#{doc.id}</td>
                          <td><strong>App #{doc.application_id}</strong></td>
                          <td><span className="doc-type-badge">{doc.document_type}</span></td>
                          <td>
                            <span className="file-name-truncate" title={doc.original_filename}>
                              📄 {doc.original_filename}
                            </span>
                          </td>
                          <td>{new Date(doc.uploaded_at).toLocaleDateString("en-IN")}</td>
                          <td>
                            <span className={`status-pill pill-${(doc.status || "pending").toLowerCase()}`}>
                              {doc.status}
                            </span>
                          </td>
                          <td>
                            <small className={doc.status === "Rejected" ? "text-danger" : "text-muted"}>
                              {doc.remarks || "—"}
                            </small>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => setPreviewDoc(doc)}
                            >
                              👁 View File
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------- 5. RISK ASSESSMENT ----------------- */}
        {activeMenu === "Risk Assessment" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>Risk Assessment Explanation</h2>
                <p>Understand the factors contributing to your loan risk score in clear, simple terms.</p>
              </div>

              {applications.length > 1 && (
                <div className="app-picker">
                  <label>Select Application:</label>
                  <select
                    value={selectedAppId || ""}
                    onChange={(e) => setSelectedAppId(Number(e.target.value))}
                    className="select-control"
                  >
                    {applications.map((a) => (
                      <option key={a.id} value={a.id}>
                        App #{a.id} - {a.applicant_name} ({a.documents?.length || 0} Docs • {money(a.loan_amount)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {!currentApp ? (
              <div className="card empty-state">
                <p>No applications available for risk assessment.</p>
              </div>
            ) : (
              <div className="card">
                <div className="risk-score-hero-box">
                  <div className="score-circle-display">
                    <span className="score-number">{currentApp.risk_score}</span>
                    <span className="score-total">/ 100</span>
                  </div>
                  <div className="score-details">
                    <span className={`risk-badge badge-${currentApp.risk_category.toLowerCase().replace(/\s+/g, "-")}`}>
                      {currentApp.risk_category}
                    </span>
                    <h3>Application #{currentApp.id}: {currentApp.applicant_name}</h3>
                    <p className="text-muted">
                      Requested Loan: <strong>{money(currentApp.loan_amount)}</strong> &bull; Annual Income:{" "}
                      <strong>{money(currentApp.annual_income)}</strong> &bull; Credit Score:{" "}
                      <strong>{currentApp.credit_score}</strong>
                    </p>
                  </div>
                </div>

                <h4 style={{ marginTop: "24px", marginBottom: "12px" }}>Why this risk score was given:</h4>
                <div className="risk-factors-list">
                  {explainRisk(currentApp).map((reason, idx) => (
                    <div key={idx} className={`factor-item ${reason.severity}`}>
                      <div>
                        <strong>{reason.title}</strong>
                        <p>{reason.detail}</p>
                      </div>
                      <span className="factor-points">+{reason.points} pts</span>
                    </div>
                  ))}
                </div>

                <div className="guidance-box" style={{ marginTop: "24px" }}>
                  <strong>How Risk Categories Are Defined:</strong>
                  <ul>
                    <li><strong>Low Risk (0–29 points):</strong> Eligible for fast-track processing and prime interest rates.</li>
                    <li><strong>Medium Risk (30–59 points):</strong> Requires thorough income and bank statement verification.</li>
                    <li><strong>High Risk (60–100 points):</strong> Requires detailed collateral check and officer underwriting.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------- 6. APPLICATION STATUS ----------------- */}
        {activeMenu === "Application Status" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>Application Processing Status</h2>
                <p>Live progress tracking and reviewing officer feedback for your loan.</p>
              </div>

              {applications.length > 1 && (
                <div className="app-picker">
                  <label>Select Application:</label>
                  <select
                    value={selectedAppId || ""}
                    onChange={(e) => setSelectedAppId(Number(e.target.value))}
                    className="select-control"
                  >
                    {applications.map((a) => (
                      <option key={a.id} value={a.id}>
                        App #{a.id} - {a.applicant_name} ({a.documents?.length || 0} Docs • {money(a.loan_amount)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {!currentApp ? (
              <div className="card empty-state">
                <p>No active applications to display status for.</p>
              </div>
            ) : (
              <div className="card processing-stepper-card">
                <div className="stepper-header">
                  <div>
                    <span className="stepper-title">Application #{currentApp.id} Progress</span>
                    <p className="stepper-desc">
                      Requested sum: {money(currentApp.loan_amount)} &bull; Submitted on{" "}
                      {new Date(currentApp.created_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <span className={`status-pill pill-${(currentApp.status || "pending").toLowerCase().replace(/\s+/g, "-")}`}>
                    Status: {currentApp.status}
                  </span>
                </div>

                {/* Stepper Pipeline */}
                <div className="stepper-track">
                  <div className="step-node completed">
                    <div className="step-circle">✓</div>
                    <div className="step-info">
                      <strong>Submitted</strong>
                      <small>Info Logged</small>
                    </div>
                  </div>

                  <div className={`step-connector ${appDocuments.length > 0 ? "active" : ""}`} />

                  <div className={`step-node ${appDocuments.length > 0 ? "completed" : "active"}`}>
                    <div className="step-circle">{appDocuments.length > 0 ? "✓" : "2"}</div>
                    <div className="step-info">
                      <strong>Documents</strong>
                      <small>{appDocuments.length} Uploaded</small>
                    </div>
                  </div>

                  <div className={`step-connector ${["Under Review", "Approved", "Rejected"].includes(currentApp.status) ? "active" : ""}`} />

                  <div className={`step-node ${["Under Review", "Approved", "Rejected"].includes(currentApp.status) ? "completed" : "active"}`}>
                    <div className="step-circle">{["Under Review", "Approved", "Rejected"].includes(currentApp.status) ? "✓" : "3"}</div>
                    <div className="step-info">
                      <strong>Officer Review</strong>
                      <small>Underwriting</small>
                    </div>
                  </div>

                  <div className={`step-connector ${["Approved", "Rejected"].includes(currentApp.status) ? "active" : ""}`} />

                  <div className={`step-node ${currentApp.status === "Approved" ? "completed" : currentApp.status === "Rejected" ? "rejected" : ""}`}>
                    <div className="step-circle">
                      {currentApp.status === "Approved" ? "✓" : currentApp.status === "Rejected" ? "✕" : "4"}
                    </div>
                    <div className="step-info">
                      <strong>Final Decision</strong>
                      <small>{currentApp.status}</small>
                    </div>
                  </div>
                </div>

                {/* Status Decision & Remarks Callout */}
                <div className={`status-callout callout-${(currentApp.status || "pending").toLowerCase().replace(/\s+/g, "-")}`}>
                  {currentApp.status === "Approved" ? (
                    <div>
                      <h4>🎉 Your Loan Application Has Been Approved!</h4>
                      <p>The bank underwriting committee has approved your application for disbursement.</p>
                      {currentApp.admin_remarks && (
                        <div className="admin-remarks-quote">
                          <strong>Admin Officer Remarks:</strong> "{currentApp.admin_remarks}"
                        </div>
                      )}
                    </div>
                  ) : currentApp.status === "Rejected" ? (
                    <div>
                      <h4>Application Declined</h4>
                      <p>We regret to inform you that this application did not meet our underwriting requirements.</p>
                      {currentApp.admin_remarks && (
                        <div className="admin-remarks-quote">
                          <strong>Admin Officer Explanation:</strong> "{currentApp.admin_remarks}"
                        </div>
                      )}
                    </div>
                  ) : currentApp.status === "Under Review" ? (
                    <div>
                      <h4>Application Under Active Review</h4>
                      <p>Your uploaded documents and risk profile are currently being inspected by an underwriter.</p>
                      {currentApp.admin_remarks && (
                        <div className="admin-remarks-quote">
                          <strong>Latest Officer Note:</strong> "{currentApp.admin_remarks}"
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h4>Application Pending Review</h4>
                      <p>Your application is received. Please ensure all required documents are uploaded.</p>
                      {currentApp.admin_remarks && (
                        <div className="admin-remarks-quote">
                          <strong>Admin Remarks:</strong> "{currentApp.admin_remarks}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* All Submitted Documents Across All User Applications */}
            {allCustomerDocs && allCustomerDocs.length > 0 && (
              <div className="card" style={{ marginTop: "24px" }}>
                <div className="card-header-flex">
                  <div>
                    <h3>All Submitted Documents ({allCustomerDocs.length})</h3>
                    <p className="text-muted">
                      Complete log of all verification files you have uploaded across your loan applications.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={loadAllCustomerDocuments}
                  >
                    ⟳ Refresh All
                  </button>
                </div>

                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Doc ID</th>
                        <th>App ID</th>
                        <th>Document Type</th>
                        <th>File Name</th>
                        <th>Uploaded On</th>
                        <th>Verification Status</th>
                        <th>Officer Remarks</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allCustomerDocs.map((doc) => (
                        <tr key={doc.id} className={doc.status === "Rejected" ? "row-danger" : ""}>
                          <td>#{doc.id}</td>
                          <td><strong>App #{doc.application_id}</strong></td>
                          <td><span className="doc-type-badge">{doc.document_type}</span></td>
                          <td>
                            <span className="file-name-truncate" title={doc.original_filename}>
                              📄 {doc.original_filename}
                            </span>
                          </td>
                          <td>{new Date(doc.uploaded_at).toLocaleDateString("en-IN")}</td>
                          <td>
                            <span className={`status-pill pill-${(doc.status || "pending").toLowerCase()}`}>
                              {doc.status}
                            </span>
                          </td>
                          <td>
                            <small className={doc.status === "Rejected" ? "text-danger" : "text-muted"}>
                              {doc.remarks || "—"}
                            </small>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => setPreviewDoc(doc)}
                            >
                              👁 View File
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------- 7. AI ASSISTANT ----------------- */}
        {activeMenu === "AI Assistant" && (
          <div className="tab-pane fade-in">
            <div className="pane-header">
              <h2>LoanWise AI Financial Advisor & Problem Solver</h2>
              <p>
                Get real-time answers about your application status, solve document rejection issues, calculate custom EMIs, and receive personalized tips to improve your CIBIL rating.
              </p>
            </div>

            <div className="card ai-fullscreen-card">
              <AIChatbot
                currentUser={currentUser}
                currentAppId={selectedAppId}
                applications={applications}
                mode="embedded"
                onNavigateTab={(tab) => setActiveMenu(tab)}
              />
            </div>
          </div>
        )}

        {/* ----------------- 8. PROFILE ----------------- */}
        {activeMenu === "Profile" && (
          <div className="tab-pane fade-in">
            <div className="pane-header">
              <h2>Customer Profile</h2>
              <p>Your verified customer account information and application summary.</p>
            </div>

            <div className="card profile-card">
              <div className="profile-header-banner">
                <div className="profile-avatar-large">
                  {currentUser?.email?.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3>{customerName}</h3>
                  <span className="badge-customer-role">Verified Borrower</span>
                </div>
              </div>

              <div className="profile-info-grid">
                <div className="info-cell">
                  <span>Registered Email</span>
                  <strong>{currentUser?.email}</strong>
                </div>
                <div className="info-cell">
                  <span>Customer ID</span>
                  <strong>USER-#{currentUser?.id}</strong>
                </div>
                <div className="info-cell">
                  <span>Total Applications Filed</span>
                  <strong>{applications.length}</strong>
                </div>
                <div className="info-cell">
                  <span>Approved Loans</span>
                  <strong>{approvedCount}</strong>
                </div>
                <div className="info-cell">
                  <span>Pending Loans</span>
                  <strong>{pendingCount}</strong>
                </div>
                <div className="info-cell">
                  <span>Account Status</span>
                  <span className="status-pill pill-approved">Active & Verified</span>
                </div>
              </div>

              <div className="card-footer-actions">
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={onLogout}
                >
                  Sign Out from Customer Portal
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* View Application Details Modal */}
      {viewDetailsApp && (
        <div className="modal-backdrop" onClick={() => setViewDetailsApp(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Application Details: #{viewDetailsApp.id}</h3>
                <p className="modal-subtitle">{viewDetailsApp.applicant_name} &bull; {money(viewDetailsApp.loan_amount)}</p>
              </div>
              <button type="button" className="close-btn" onClick={() => setViewDetailsApp(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="dossier-metrics-grid">
                <div className="dossier-metric">
                  <span>Requested Loan</span>
                  <h4>{money(viewDetailsApp.loan_amount)}</h4>
                </div>
                <div className="dossier-metric">
                  <span>Annual Income</span>
                  <h4>{money(viewDetailsApp.annual_income)}</h4>
                </div>
                <div className="dossier-metric">
                  <span>Credit Score</span>
                  <h4>{viewDetailsApp.credit_score}</h4>
                </div>
                <div className="dossier-metric">
                  <span>Existing Debt</span>
                  <h4>{money(viewDetailsApp.existing_debt)}</h4>
                </div>
                <div className="dossier-metric">
                  <span>Risk Score</span>
                  <h4>{viewDetailsApp.risk_score} / 100</h4>
                </div>
                <div className="dossier-metric">
                  <span>Status</span>
                  <span className={`status-pill pill-${(viewDetailsApp.status || "pending").toLowerCase().replace(/\s+/g, "-")}`}>
                    {viewDetailsApp.status}
                  </span>
                </div>
              </div>

              {/* Verified KYC & Contact Strip */}
              <div className="kyc-details-strip">
                <div className="kyc-cell">
                  <span className="kyc-label">Aadhaar Number</span>
                  <strong>{viewDetailsApp.aadhaar_no || "—"}</strong>
                </div>
                <div className="kyc-cell">
                  <span className="kyc-label">Mobile Number</span>
                  <strong>{viewDetailsApp.mobile_no ? `+91 ${viewDetailsApp.mobile_no}` : "—"}</strong>
                </div>
                <div className="kyc-cell">
                  <span className="kyc-label">Email ID</span>
                  <strong>{viewDetailsApp.email || viewDetailsApp.user_email || "—"}</strong>
                </div>
                <div className="kyc-cell full-width">
                  <span className="kyc-label">Residential Address</span>
                  <strong>{viewDetailsApp.address || "—"}</strong>
                </div>
              </div>

              {viewDetailsApp.admin_remarks && (
                <div className="admin-remarks-box">
                  <strong>Admin Remarks:</strong>
                  <p>{viewDetailsApp.admin_remarks}</p>
                </div>
              )}

              {/* Attached Documents */}
              <div style={{ marginTop: "20px" }}>
                <h4 style={{ margin: "0 0 10px 0", fontSize: "1rem" }}>
                  Attached Documents ({viewDetailsApp.documents?.length || 0})
                </h4>
                {!viewDetailsApp.documents || viewDetailsApp.documents.length === 0 ? (
                  <p className="text-muted" style={{ fontSize: "0.9rem" }}>No documents uploaded for this application yet.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="custom-table" style={{ fontSize: "0.85rem" }}>
                      <thead>
                        <tr>
                          <th>Document Type</th>
                          <th>Filename</th>
                          <th>Status</th>
                          <th>Remarks</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewDetailsApp.documents.map((doc) => (
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
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                onClick={() => setPreviewDoc(doc)}
                              >
                                View File
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
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setViewDetailsApp(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
          isAdmin={false}
        />
      )}

      {/* Floating AI Assistant Trigger & Widget */}
      <div className="ai-floating-widget-wrapper">
        {showFloatingChat ? (
          <div className="ai-floating-drawer-backdrop" onClick={() => setShowFloatingChat(false)}>
            <div className="ai-floating-drawer card" onClick={(e) => e.stopPropagation()}>
              <AIChatbot
                currentUser={currentUser}
                currentAppId={selectedAppId}
                applications={applications}
                mode="widget"
                onClose={() => setShowFloatingChat(false)}
                onNavigateTab={(tab) => {
                  setShowFloatingChat(false);
                  setActiveMenu(tab);
                }}
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="ai-floating-launcher-btn"
            onClick={() => setShowFloatingChat(true)}
            title="Need Help? Click to Ask LoanWise AI"
          >
            <span className="ai-floating-btn-icon">🤖</span>
            <span className="ai-floating-btn-text">AI Problem Solver</span>
            <span className="ai-floating-badge-pulse" />
          </button>
        )}
      </div>
    </div>
  );
}
