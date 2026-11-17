# LoanWise - Loan Risk Assessment & Underwriting System

An end-to-end loan risk assessment and underwriting platform with **dedicated, separated interfaces for Customers (Borrowers) and Bank Officers / Admins**.

---

## 🌟 Key Features

### 👤 Customer (Borrower) Portal
- **Dashboard & Status Overview**: Real-time snapshot of active applications, decision status, and alerts.
- **Apply for Loan (Fill Info & Docs)**:
  - Step 1: Input legal borrower info, annual income, desired loan sum, CIBIL credit score, employment type, and existing debts.
  - Live Affordability Estimator: Instant DTI (Debt-to-Income) and LTI (Loan-to-Income) calculator before submitting.
- **Interactive 5-Stage Processing Status Tracker**:
  1. **Application Submitted**: Details logged with timestamp.
  2. **Documents Uploaded**: Live document counter & checklist (Identity, Income, Bank Statements).
  3. **Document Verification**: Real-time per-document status (`Verified`, `Pending Review`, `Rejected` with officer remarks).
  4. **Automated Risk Engine**: Breakdown of risk points (0–100) and risk category (`Low Risk`, `Medium Risk`, `High Risk`).
  5. **Final Underwriting Decision**: Official decision badge (`Approved`, `Under Review`, `Rejected`) with bank officer notes.
- **Document Center**:
  - Securely upload PDF, JPG, and PNG documents (up to 5MB).
  - Built-in file previewer and download.
  - One-click **Re-upload** if an officer rejects a document with remarks (e.g. "blurry image").
- **My Applications History**: Searchable list of all submitted loan applications.
- **Risk & Eligibility Guide**: Educational rules and credit tips.

---

### 🛡️ Admin (Bank Officer) Console
- **Executive Portfolio Cockpit**:
  - KPIs: Total applications, total capital requested, pending review queue, approved loans, declined loans.
  - Risk distribution analytics (Low, Medium, High risk proportions).
  - Centralized Document verification metrics (Pending, Verified, Rejected).
- **Applications Underwriting Desk**:
  - Comprehensive searchable and filterable table (by applicant name, ID, user email, risk level, status).
  - Sort by: Newest, Oldest, Highest Loan, Lowest Loan, Highest Risk.
  - **Underwriting Dossier**:
    - Applicant financial profile and ratio metrics.
    - Factor-by-factor risk penalty points breakdown.
    - Attached document checklist with inline preview.
    - **Underwriting Decision Panel**: Update status (`Under Review`, `Approved`, `Rejected`, `Documents Pending`) and enter official remarks visible to the borrower.
- **Document Verification Queue**:
  - Queue of all customer documents across the system.
  - Built-in document viewer (PDF and images).
  - One-click **Verify** or **Reject** with custom remarks explaining the reason.
- **Risk Engine Matrix**:
  - Full inspection of scoring weights and criteria.
- **User Management & Audit**:
  - View registered borrowers and staff with application counts.
  - Ability to promote users between `customer`, `bank_officer`, and `admin`.

---

## 🚀 Running the Project

### 1. Backend (FastAPI)
```powershell
cd backend
.\.venv\Scripts\uvicorn main:app --reload --port 8001
```
- API Base URL: `http://127.0.0.1:8001`
- Swagger Docs: `http://127.0.0.1:8001/docs`

### 2. Frontend (React + Vite)
```powershell
cd frontend
npm run dev
```
- Local URL: `http://localhost:5173`

---

## 🔑 Test Accounts

| Role | Email | Password | Notes |
|---|---|---|---|
| **Admin / Underwriter** | `yogitaj2518@gmail.com` | `Admin@123` | Full admin & underwriting permissions |
| **Customer / Borrower** | `customer@example.com` | `Password123!` | Customer portal with existing loans |
| **New Customer** | Register via UI | Min 8 chars | Creates a fresh customer profile |
