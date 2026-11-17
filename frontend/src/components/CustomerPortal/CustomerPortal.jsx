import { useState, useEffect } from "react";
import {
  createApplication,
  updateApplication,
  uploadDocument,
  getApplicationDocuments,
  money,
  explainRisk,
  getErrorMessage,
} from "../../api";
import DocumentPreviewModal from "../Common/DocumentPreviewModal";

const RECOMMENDED_DOC_TYPES = [
  { id: "Identity Proof", title: "Identity Proof (Aadhaar / PAN / Passport)", required: true },
  { id: "Income Proof", title: "Income Proof (Salary Slip / Form 16 / ITR)", required: true },
  { id: "Bank Statement", title: "Bank Statement (Last 3 to 6 Months)", required: true },
  { id: "Address Proof", title: "Address Proof (Electricity Bill / Rent Agreement)", required: false },
];

export default function CustomerPortal({
  currentUser,
  applications,
  onRefresh,
  refreshing,
}) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [appDocuments, setAppDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  // New Application Form State
  const initialForm = {
    applicant_name: "",
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
  const [uploadDocType, setUploadDocType] = useState("Identity Proof");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [uploadError, setUploadError] = useState("");

  // Set default selected application
  useEffect(() => {
    if (applications && applications.length > 0 && !selectedAppId) {
      setSelectedAppId(applications[0].id);
    }
  }, [applications, selectedAppId]);

  // Load documents whenever selected application changes
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
      console.error("Failed to load documents for application", err);
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

    try {
      const payload = {
        applicant_name: form.applicant_name.trim(),
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
      setUploadError("Please select a file to upload.");
      return;
    }
    if (!selectedAppId) {
      setUploadError("No active application selected.");
      return;
    }

    setUploadLoading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      await uploadDocument(selectedAppId, uploadDocType, uploadFile);
      setUploadSuccess(`"${uploadDocType}" uploaded successfully! Status updated to Under Review.`);
      setUploadFile(null);
      // Reset file input element
      const fileInput = document.getElementById("customer-file-input");
      if (fileInput) fileInput.value = "";
      // Refresh documents
      await loadDocumentsForApp(selectedAppId);
      if (onRefresh) onRefresh();
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploadLoading(false);
    }
  };

  // Quick re-upload handler for a specific document type
  const triggerReupload = (docType) => {
    setUploadDocType(docType);
    const uploadSection = document.getElementById("customer-doc-uploader");
    if (uploadSection) {
      uploadSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  const currentApp = applications.find((a) => a.id === selectedAppId) || applications[0];

  // Calculate live estimate for the form
  const previewIncome = Number(form.annual_income) || 0;
  const previewLoan = Number(form.loan_amount) || 0;
  const previewDebt = Number(form.existing_debt) || 0;
  const previewCredit = Number(form.credit_score) || 720;
  const previewDTI = previewIncome > 0 ? ((previewDebt / previewIncome) * 100).toFixed(1) : "0";
  const previewLTI = previewIncome > 0 ? (previewLoan / previewIncome).toFixed(2) : "0";

  // Check action items across all user applications (e.g. rejected documents)
  const allRejectedDocs = (applications || []).flatMap((app) =>
    (app.documents || [])
      .filter((d) => d.status === "Rejected")
      .map((d) => ({ ...d, appApplicant: app.applicant_name }))
  );

  return (
    <div className="portal-container">
      {/* Sidebar Navigation */}
      <aside className="portal-sidebar">
        <div className="sidebar-section">
          <p className="sidebar-label">BORROWER PORTAL</p>
          <nav className="nav-menu">
            <button
              type="button"
              className={`nav-link ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              <span className="nav-icon">📊</span>
              <span>Overview & Status</span>
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === "apply" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("apply");
                setFormSuccess(null);
              }}
            >
              <span className="nav-icon">📝</span>
              <span>Apply for a Loan</span>
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === "tracker" ? "active" : ""}`}
              onClick={() => setActiveTab("tracker")}
            >
              <span className="nav-icon">📁</span>
              <span>Document Center & Tracker</span>
              {allRejectedDocs.length > 0 && (
                <span className="badge-alert-count">{allRejectedDocs.length}</span>
              )}
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === "history" ? "active" : ""}`}
              onClick={() => setActiveTab("history")}
            >
              <span className="nav-icon">📋</span>
              <span>My Applications ({applications.length})</span>
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === "guide" ? "active" : ""}`}
              onClick={() => setActiveTab("guide")}
            >
              <span className="nav-icon">💡</span>
              <span>Risk & Eligibility Guide</span>
            </button>
          </nav>
        </div>

        <div className="sidebar-footer-card">
          <div className="support-badge">Need Assistance?</div>
          <p>Bank officers are reviewing applications Monday–Friday.</p>
          <small>Support: help@loanwise.bank</small>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="portal-content">
        {/* Banner for Rejected Docs requiring action */}
        {allRejectedDocs.length > 0 && (
          <div className="alert-banner alert-danger">
            <div className="alert-icon">⚠️</div>
            <div className="alert-content">
              <strong>Action Required: Document Resubmission</strong>
              <p>
                A reviewing officer has requested you re-upload {allRejectedDocs.length} document(s).
                Check the Document Center below to see comments and upload replacements.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-light"
              onClick={() => {
                setSelectedAppId(allRejectedDocs[0].application_id);
                setActiveTab("tracker");
              }}
            >
              View Rejected Docs
            </button>
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="tab-pane fade-in">
            <div className="dashboard-hero">
              <div className="hero-text">
                <span className="hero-tag">Welcome, {currentUser?.email}</span>
                <h2>Track Your Loan Journey in Real-Time</h2>
                <p>
                  Submit your financial information, upload verification documents, and monitor your
                  underwriting status at every milestone.
                </p>
                <div className="hero-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setFormSuccess(null);
                      setActiveTab("apply");
                    }}
                  >
                    + Submit New Loan Request
                  </button>
                  {applications.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setActiveTab("tracker")}
                    >
                      View Live Tracker
                    </button>
                  )}
                </div>
              </div>
              <div className="hero-graphic">
                <div className="graphic-card">
                  <span className="graphic-label">Active Applications</span>
                  <h3>{applications.length}</h3>
                  <div className="graphic-pulse">● Live Underwriting Sync</div>
                </div>
              </div>
            </div>

            {/* Quick Summary Cards */}
            <div className="stats-grid">
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-blue">📋</div>
                <div>
                  <span className="stat-label">Total Applications</span>
                  <h3 className="stat-value">{applications.length}</h3>
                  <span className="stat-desc">Submitted to system</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-yellow">⏳</div>
                <div>
                  <span className="stat-label">In Review / Processing</span>
                  <h3 className="stat-value">
                    {
                      applications.filter((a) =>
                        ["Submitted", "Documents Pending", "Under Review"].includes(a.status)
                      ).length
                    }
                  </h3>
                  <span className="stat-desc">Awaiting final decision</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-green">✅</div>
                <div>
                  <span className="stat-label">Approved Loans</span>
                  <h3 className="stat-value">
                    {applications.filter((a) => a.status === "Approved").length}
                  </h3>
                  <span className="stat-desc">Ready for disbursement</span>
                </div>
              </div>
              <div className="card stat-box">
                <div className="stat-icon-wrap bg-red">❌</div>
                <div>
                  <span className="stat-label">Rejected</span>
                  <h3 className="stat-value">
                    {applications.filter((a) => a.status === "Rejected").length}
                  </h3>
                  <span className="stat-desc">Feedback available</span>
                </div>
              </div>
            </div>

            {/* Latest Application Highlight */}
            {currentApp ? (
              <div className="card dashboard-highlight-card">
                <div className="card-header-flex">
                  <div>
                    <span className="badge-subtitle">CURRENT APPLICATION</span>
                    <h3>
                      Application #{currentApp.id} &bull; {currentApp.applicant_name}
                    </h3>
                  </div>
                  <div className="header-badges">
                    <span className={`status-pill pill-${(currentApp.status || "submitted").toLowerCase().replace(/\s+/g, "-")}`}>
                      {currentApp.status}
                    </span>
                    <span className={`risk-badge badge-${(currentApp.risk_category || "low").toLowerCase().replace(/\s+/g, "-")}`}>
                      {currentApp.risk_category}
                    </span>
                  </div>
                </div>

                <div className="app-summary-row">
                  <div className="summary-item">
                    <span>Requested Amount</span>
                    <strong>{money(currentApp.loan_amount)}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Annual Income</span>
                    <strong>{money(currentApp.annual_income)}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Credit Score</span>
                    <strong>{currentApp.credit_score}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Documents Attached</span>
                    <strong>{currentApp.documents?.length || 0} file(s)</strong>
                  </div>
                  <div className="summary-item">
                    <span>Submitted On</span>
                    <strong>
                      {currentApp.created_at
                        ? new Date(currentApp.created_at).toLocaleDateString("en-IN")
                        : "Recent"}
                    </strong>
                  </div>
                </div>

                {currentApp.admin_remarks && (
                  <div className="admin-remarks-box">
                    <strong>Reviewing Officer Note:</strong>
                    <p>{currentApp.admin_remarks}</p>
                  </div>
                )}

                <div className="card-footer-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setSelectedAppId(currentApp.id);
                      setActiveTab("tracker");
                    }}
                  >
                    Open Document Center & Live Tracker →
                  </button>
                </div>
              </div>
            ) : (
              <div className="card empty-state">
                <div className="empty-icon">📝</div>
                <h3>No Loan Applications Found</h3>
                <p>You haven't submitted any loan requests yet. Start your application in just 2 minutes!</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setActiveTab("apply")}
                >
                  Create Your First Application
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: APPLY FOR A LOAN (FILL INFO & DOCS) */}
        {activeTab === "apply" && (
          <div className="tab-pane fade-in">
            <div className="pane-header">
              <div>
                <h2>Apply for a New Loan</h2>
                <p>Step 1: Fill in your details. Step 2: Upload your verification documents.</p>
              </div>
            </div>

            {formSuccess ? (
              <div className="card success-step-card">
                <div className="success-icon-badge">✓</div>
                <h3>Application #{formSuccess.id} Created Successfully!</h3>
                <p>
                  Your preliminary information has been logged with an initial risk assessment of{" "}
                  <strong>{formSuccess.risk_category}</strong> (Risk Score: {formSuccess.risk_score}/100).
                </p>
                <div className="next-step-prompt">
                  <strong>Next Crucial Step: Upload Verification Documents</strong>
                  <p>
                    To proceed with bank officer review and final approval, please upload your Identity Proof,
                    Income Proof, and Bank Statements.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => {
                      setSelectedAppId(formSuccess.id);
                      setActiveTab("tracker");
                    }}
                  >
                    Proceed to Document Upload & Status Tracker →
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-layout-grid">
                <div className="card form-main-card">
                  <h3>Borrower & Loan Details</h3>
                  <p className="form-subtitle">All fields are required for accurate risk assessment.</p>

                  {formError && <div className="alert-banner alert-danger">{formError}</div>}

                  <form onSubmit={handleFormSubmit} className="loan-grid-form">
                    <div className="form-group full-width">
                      <label>Full Legal Name</label>
                      <input
                        type="text"
                        name="applicant_name"
                        value={form.applicant_name}
                        onChange={handleFormChange}
                        placeholder="e.g. Priya Sharma"
                        required
                        minLength={2}
                      />
                    </div>

                    <div className="form-group">
                      <label>Applicant Age</label>
                      <input
                        type="number"
                        name="age"
                        value={form.age}
                        onChange={handleFormChange}
                        placeholder="e.g. 29"
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
                        <option value="Salaried">Salaried (Full-time)</option>
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
                        placeholder="e.g. 800000"
                        required
                        min={10000}
                      />
                      <small className="field-hint">Your gross annual earnings before tax</small>
                    </div>

                    <div className="form-group">
                      <label>Desired Loan Amount (₹)</label>
                      <input
                        type="number"
                        name="loan_amount"
                        value={form.loan_amount}
                        onChange={handleFormChange}
                        placeholder="e.g. 500000"
                        required
                        min={1000}
                      />
                      <small className="field-hint">Requested borrowing sum</small>
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
                      <div className="credit-meter-bar">
                        <span
                          className={`meter-tag ${
                            previewCredit >= 740 ? "green" : previewCredit >= 670 ? "blue" : previewCredit >= 580 ? "yellow" : "red"
                          }`}
                        >
                          {previewCredit >= 740 ? "Excellent" : previewCredit >= 670 ? "Good" : previewCredit >= 580 ? "Fair" : "Poor"}
                        </span>
                      </div>
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
                      <small className="field-hint">Credit cards, auto loans, personal loans</small>
                    </div>

                    <div className="form-actions full-width">
                      <button type="submit" className="btn btn-primary btn-lg" disabled={formLoading}>
                        {formLoading ? "Submitting Application..." : "Submit Application & Continue to Docs →"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Instant Financial Predictor Sidebar */}
                <div className="card preview-sidebar-card">
                  <h4>Live Affordability Estimator</h4>
                  <p className="text-muted">Calculated on the fly based on your inputs:</p>

                  <div className="metric-box">
                    <span>Debt-to-Income (DTI)</span>
                    <h3>{previewDTI}%</h3>
                    <small className={Number(previewDTI) > 40 ? "text-danger" : "text-success"}>
                      {Number(previewDTI) > 40
                        ? "High debt burden (>40%)"
                        : Number(previewDTI) > 20
                        ? "Moderate debt level (20–40%)"
                        : "Healthy low debt (≤20%)"}
                    </small>
                  </div>

                  <div className="metric-box">
                    <span>Loan-to-Income (LTI) Multiplier</span>
                    <h3>{previewLTI}x</h3>
                    <small className={Number(previewLTI) > 3 ? "text-danger" : "text-success"}>
                      {Number(previewLTI) > 3
                        ? "Very large loan (>3x income)"
                        : Number(previewLTI) > 1.5
                        ? "Moderate loan multiple"
                        : "Conservative borrowing ratio"}
                    </small>
                  </div>

                  <div className="guidance-box">
                    <strong>💡 Tips for Quick Approval</strong>
                    <ul>
                      <li>Credit scores above 740 receive fast-track review.</li>
                      <li>Uploading clear salary slips and 6-month bank statements reduces review time.</li>
                      <li>Accepted file formats: PDF, JPG, and PNG (up to 5MB).</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DOCUMENT CENTER & PROCESSING STATUS TRACKER */}
        {activeTab === "tracker" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>Document Center & Processing Status</h2>
                <p>Track your application's journey from submission to bank officer decision.</p>
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
                        App #{a.id} - {a.applicant_name} ({money(a.loan_amount)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {!currentApp ? (
              <div className="card empty-state">
                <div className="empty-icon">📁</div>
                <h3>No Applications to Track</h3>
                <p>Please submit an application first to track processing status and upload documents.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setActiveTab("apply")}
                >
                  Apply Now
                </button>
              </div>
            ) : (
              <>
                {/* 5-STAGE VISUAL PROCESSING STEPPER */}
                <div className="card processing-stepper-card">
                  <div className="stepper-header">
                    <div>
                      <span className="stepper-title">Application Processing Pipeline</span>
                      <p className="stepper-desc">
                        Application #{currentApp.id} for {money(currentApp.loan_amount)} &bull; Submitted by {currentApp.applicant_name}
                      </p>
                    </div>
                    <span className={`status-pill pill-${(currentApp.status || "submitted").toLowerCase().replace(/\s+/g, "-")}`}>
                      Current Status: {currentApp.status}
                    </span>
                  </div>

                  <div className="stepper-track">
                    {/* Stage 1 */}
                    <div className="step-node completed">
                      <div className="step-circle">✓</div>
                      <div className="step-info">
                        <strong>1. Submitted</strong>
                        <small>Info Recorded</small>
                      </div>
                    </div>

                    <div className={`step-connector ${appDocuments.length > 0 ? "active" : ""}`} />

                    {/* Stage 2 */}
                    <div className={`step-node ${appDocuments.length > 0 ? "completed" : "active"}`}>
                      <div className="step-circle">
                        {appDocuments.length > 0 ? "✓" : "2"}
                      </div>
                      <div className="step-info">
                        <strong>2. Documents</strong>
                        <small>{appDocuments.length} Uploaded</small>
                      </div>
                    </div>

                    <div
                      className={`step-connector ${
                        appDocuments.some((d) => d.status === "Verified")
                          ? "active"
                          : ""
                      }`}
                    />

                    {/* Stage 3 */}
                    <div
                      className={`step-node ${
                        appDocuments.some((d) => d.status === "Rejected")
                          ? "has-error"
                          : appDocuments.some((d) => d.status === "Verified")
                          ? "completed"
                          : appDocuments.length > 0
                          ? "active"
                          : ""
                      }`}
                    >
                      <div className="step-circle">
                        {appDocuments.some((d) => d.status === "Rejected")
                          ? "!"
                          : appDocuments.some((d) => d.status === "Verified")
                          ? "✓"
                          : "3"}
                      </div>
                      <div className="step-info">
                        <strong>3. Verification</strong>
                        <small>
                          {appDocuments.some((d) => d.status === "Rejected")
                            ? "Action Needed"
                            : appDocuments.some((d) => d.status === "Verified")
                            ? "Verified"
                            : "Officer Review"}
                        </small>
                      </div>
                    </div>

                    <div
                      className={`step-connector ${
                        ["Under Review", "Approved", "Rejected"].includes(currentApp.status)
                          ? "active"
                          : ""
                      }`}
                    />

                    {/* Stage 4 */}
                    <div
                      className={`step-node ${
                        ["Under Review", "Approved", "Rejected"].includes(currentApp.status)
                          ? "completed"
                          : "active"
                      }`}
                    >
                      <div className="step-circle">
                        {["Under Review", "Approved", "Rejected"].includes(currentApp.status)
                          ? "✓"
                          : "4"}
                      </div>
                      <div className="step-info">
                        <strong>4. Risk Engine</strong>
                        <small>{currentApp.risk_category}</small>
                      </div>
                    </div>

                    <div
                      className={`step-connector ${
                        ["Approved", "Rejected"].includes(currentApp.status) ? "active" : ""
                      }`}
                    />

                    {/* Stage 5 */}
                    <div
                      className={`step-node ${
                        currentApp.status === "Approved"
                          ? "completed"
                          : currentApp.status === "Rejected"
                          ? "rejected"
                          : "active"
                      }`}
                    >
                      <div className="step-circle">
                        {currentApp.status === "Approved"
                          ? "✓"
                          : currentApp.status === "Rejected"
                          ? "✕"
                          : "5"}
                      </div>
                      <div className="step-info">
                        <strong>5. Final Decision</strong>
                        <small>
                          {currentApp.status === "Approved"
                            ? "Loan Approved"
                            : currentApp.status === "Rejected"
                            ? "Declined"
                            : "Decision Pending"}
                        </small>
                      </div>
                    </div>
                  </div>

                  {/* Status Decision Callout */}
                  <div className={`status-callout callout-${(currentApp.status || "submitted").toLowerCase().replace(/\s+/g, "-")}`}>
                    {currentApp.status === "Approved" ? (
                      <div>
                        <h4>🎉 Congratulations! Your Loan Has Been Approved</h4>
                        <p>
                          Our bank underwriting team has cleared your application for disbursement.
                          {currentApp.admin_remarks && ` Officer Notes: "${currentApp.admin_remarks}"`}
                        </p>
                      </div>
                    ) : currentApp.status === "Rejected" ? (
                      <div>
                        <h4>Application Status: Declined</h4>
                        <p>
                          We are unable to approve this loan application at this time.
                          {currentApp.admin_remarks && ` Officer Explanation: "${currentApp.admin_remarks}"`}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <h4>Application Under Active Review</h4>
                        <p>
                          Your documents and risk profile are currently being inspected by the underwriting team.
                          {currentApp.admin_remarks && ` Latest Officer Note: "${currentApp.admin_remarks}"`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* DOCUMENT UPLOAD & MANAGEMENT SECTION */}
                <div className="doc-section-grid">
                  {/* Upload Box */}
                  <div className="card upload-box-card" id="customer-doc-uploader">
                    <h3>Upload Required Documents</h3>
                    <p className="text-muted">
                      Upload clear copies in PDF, JPG, or PNG format (Max 5MB each).
                    </p>

                    {uploadSuccess && <div className="alert-banner alert-success">{uploadSuccess}</div>}
                    {uploadError && <div className="alert-banner alert-danger">{uploadError}</div>}

                    <form onSubmit={handleDocumentUpload} className="upload-form">
                      <div className="form-group">
                        <label>Document Category</label>
                        <select
                          value={uploadDocType}
                          onChange={(e) => setUploadDocType(e.target.value)}
                          className="form-control"
                        >
                          <option value="Identity Proof">Identity Proof (Aadhaar / PAN / Passport)</option>
                          <option value="Income Proof">Income Proof (Salary Slip / Form 16)</option>
                          <option value="Bank Statement">Bank Statement (Last 3–6 Months)</option>
                          <option value="Address Proof">Address Proof (Utility Bill / Agreement)</option>
                          <option value="Employment Proof">Employment ID / Appointment Letter</option>
                          <option value="Other Supporting Document">Other Supporting Document</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Select File</label>
                        <input
                          id="customer-file-input"
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
                        {uploadLoading ? "Uploading to Bank..." : `Upload ${uploadDocType}`}
                      </button>
                    </form>

                    <div className="checklist-box">
                      <strong>Checklist for Fast Approval:</strong>
                      <ul>
                        {RECOMMENDED_DOC_TYPES.map((item) => {
                          const uploaded = appDocuments.some((d) => d.document_type === item.id);
                          const verified = appDocuments.some(
                            (d) => d.document_type === item.id && d.status === "Verified"
                          );
                          const rejected = appDocuments.some(
                            (d) => d.document_type === item.id && d.status === "Rejected"
                          );

                          return (
                            <li key={item.id} className="checklist-item">
                              <span className="checklist-icon">
                                {verified ? "✅" : rejected ? "❌" : uploaded ? "⏳" : "○"}
                              </span>
                              <span>{item.title}</span>
                              <span className="checklist-status">
                                {verified ? "Verified" : rejected ? "Rejected" : uploaded ? "In Review" : "Needed"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>

                  {/* Uploaded Documents Table */}
                  <div className="card doc-table-card">
                    <div className="card-header-flex">
                      <div>
                        <h3>Submitted Verification Documents</h3>
                        <p className="text-muted">
                          {appDocuments.length} document(s) attached to Application #{currentApp.id}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => loadDocumentsForApp(currentApp.id)}
                        disabled={docsLoading}
                      >
                        {docsLoading ? "Refreshing..." : "⟳ Refresh Docs"}
                      </button>
                    </div>

                    {appDocuments.length === 0 ? (
                      <div className="empty-substate">
                        <p>No documents uploaded for this application yet.</p>
                        <p className="text-muted">
                          Use the upload form on the left to attach your identity and income proofs.
                        </p>
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="custom-table">
                          <thead>
                            <tr>
                              <th>Document Type</th>
                              <th>Filename</th>
                              <th>Upload Date</th>
                              <th>Status</th>
                              <th>Remarks</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {appDocuments.map((doc) => (
                              <tr key={doc.id} className={doc.status === "Rejected" ? "row-danger" : ""}>
                                <td>
                                  <strong>{doc.document_type}</strong>
                                </td>
                                <td>
                                  <span className="file-name-truncate" title={doc.original_filename}>
                                    📄 {doc.original_filename}
                                  </span>
                                </td>
                                <td>{new Date(doc.uploaded_at).toLocaleDateString("en-IN")}</td>
                                <td>
                                  <span
                                    className={`status-pill pill-${(doc.status || "pending").toLowerCase()}`}
                                  >
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
                                      👁 View
                                    </button>
                                    {doc.status === "Rejected" && (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-danger"
                                        onClick={() => triggerReupload(doc.document_type)}
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

                    {/* Risk Explanation for Current App */}
                    <div className="risk-explanation-panel">
                      <h4>Educational Risk Scoring Summary</h4>
                      <p className="text-muted">
                        Automated assessment rule points: <strong>{currentApp.risk_score} / 100</strong> (
                        {currentApp.risk_category})
                      </p>
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
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 4: MY APPLICATIONS HISTORY */}
        {activeTab === "history" && (
          <div className="tab-pane fade-in">
            <div className="pane-header-flex">
              <div>
                <h2>My Applications History</h2>
                <p>All loan applications submitted under your account.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setFormSuccess(null);
                  setActiveTab("apply");
                }}
              >
                + New Application
              </button>
            </div>

            {applications.length === 0 ? (
              <div className="card empty-state">
                <div className="empty-icon">📋</div>
                <h3>No Applications Found</h3>
                <p>You haven't submitted any applications yet.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setActiveTab("apply")}
                >
                  Create Your First Application
                </button>
              </div>
            ) : (
              <div className="card">
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
                        <th>Risk Category</th>
                        <th>Status</th>
                        <th>Documents</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((item) => (
                        <tr key={item.id}>
                          <td>#{item.id}</td>
                          <td><strong>{item.applicant_name}</strong></td>
                          <td>{money(item.loan_amount)}</td>
                          <td>{money(item.annual_income)}</td>
                          <td>{item.credit_score}</td>
                          <td>{item.risk_score}</td>
                          <td>
                            <span className={`risk-badge badge-${item.risk_category.toLowerCase().replace(/\s+/g, "-")}`}>
                              {item.risk_category}
                            </span>
                          </td>
                          <td>
                            <span className={`status-pill pill-${(item.status || "submitted").toLowerCase().replace(/\s+/g, "-")}`}>
                              {item.status}
                            </span>
                          </td>
                          <td>{item.documents?.length || 0} file(s)</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                setSelectedAppId(item.id);
                                setActiveTab("tracker");
                              }}
                            >
                              Track & Docs →
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

        {/* TAB 5: RISK & ELIGIBILITY GUIDE */}
        {activeTab === "guide" && (
          <div className="tab-pane fade-in">
            <div className="pane-header">
              <h2>Borrower Risk & Underwriting Guide</h2>
              <p>Understand the exact rules bank officers and automated scoring engines use.</p>
            </div>

            <div className="guide-grid">
              <div className="card guide-card">
                <h3>1. Credit Score (CIBIL / Experian)</h3>
                <p>Your credit score reflects your historical repayment discipline.</p>
                <ul className="guide-rule-list">
                  <li><strong>740 or higher:</strong> 0 penalty points (Prime borrower, lowest risk).</li>
                  <li><strong>670 to 739:</strong> +10 penalty points (Good standing, standard terms).</li>
                  <li><strong>580 to 669:</strong> +25 penalty points (Fair standing, higher risk).</li>
                  <li><strong>Below 580:</strong> +40 penalty points (High default risk, strict review).</li>
                </ul>
              </div>

              <div className="card guide-card">
                <h3>2. Debt-to-Income (DTI) Ratio</h3>
                <p>Calculated as total existing debt divided by your annual income.</p>
                <ul className="guide-rule-list">
                  <li><strong>≤ 20%:</strong> 0 points (Healthy debt load).</li>
                  <li><strong>20% to 40%:</strong> +10 points (Moderate commitments).</li>
                  <li><strong>&gt; 40%:</strong> +25 points (Heavy monthly debt burden).</li>
                </ul>
              </div>

              <div className="card guide-card">
                <h3>3. Loan-to-Income (LTI) Multiplier</h3>
                <p>Calculated as requested loan sum divided by your annual income.</p>
                <ul className="guide-rule-list">
                  <li><strong>≤ 1.5x:</strong> 0 points (Conservative borrowing).</li>
                  <li><strong>1.5x to 3.0x:</strong> +15 points (Moderate borrowing size).</li>
                  <li><strong>&gt; 3.0x:</strong> +30 points (Very high loan size relative to income).</li>
                </ul>
              </div>

              <div className="card guide-card">
                <h3>4. Final Decision Categories</h3>
                <p>Scores are summed and capped at 100:</p>
                <ul className="guide-rule-list">
                  <li><strong>0–29 points:</strong> Low Risk (Fast-track approval).</li>
                  <li><strong>30–59 points:</strong> Medium Risk (Officer review of bank statements).</li>
                  <li><strong>60–100 points:</strong> High Risk (Detailed underwriting & collateral check).</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
          isAdmin={false}
        />
      )}
    </div>
  );
}
