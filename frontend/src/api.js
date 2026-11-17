import axios from "axios";

export const API_BASE = "http://127.0.0.1:8001/api";

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If a request fails with 401 and it's not the login request itself, clear the stale token
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes("/login")
    ) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("current_user");
    }
    return Promise.reject(error);
  }
);

export function getErrorMessage(err) {
  if (!err) return "An unknown error occurred.";
  if (!err.response) {
    return "Cannot connect to the backend server. Please verify FastAPI is running on port 8001.";
  }

  // Prioritize specific error message from the backend
  const detail = err.response.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
  }

  if (err.response.status === 401) {
    return "Incorrect email or password, or session has expired.";
  }
  if (err.response.status === 403) {
    return "Access denied: You do not have permission for this action.";
  }
  return `Server returned error (${err.response.status}).`;
}

export const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

export function explainRisk(item) {
  if (!item) return [];
  const reasons = [];
  const creditScore = Number(item.credit_score || 0);
  const annualIncome = Number(item.annual_income || 0);
  const loanAmount = Number(item.loan_amount || 0);
  const existingDebt = Number(item.existing_debt || 0);

  if (creditScore < 580) {
    reasons.push({
      title: "Poor credit score (< 580)",
      detail: "Significant default risk; adds 40 risk points.",
      points: 40,
      severity: "high",
    });
  } else if (creditScore < 670) {
    reasons.push({
      title: "Fair credit score (580–669)",
      detail: "Moderate default probability; adds 25 risk points.",
      points: 25,
      severity: "medium",
    });
  } else if (creditScore < 740) {
    reasons.push({
      title: "Good credit score (670–739)",
      detail: "Standard prime borrower profile; adds 10 risk points.",
      points: 10,
      severity: "low",
    });
  } else {
    reasons.push({
      title: "Excellent credit score (≥ 740)",
      detail: "Low default risk; adds 0 penalty points.",
      points: 0,
      severity: "positive",
    });
  }

  const debtRatio = annualIncome > 0 ? existingDebt / annualIncome : 1;
  const loanRatio = annualIncome > 0 ? loanAmount / annualIncome : 5;

  if (debtRatio > 0.4) {
    reasons.push({
      title: "High debt-to-income ratio (> 40%)",
      detail: `Existing debt represents ${(debtRatio * 100).toFixed(1)}% of annual earnings. Adds 25 points.`,
      points: 25,
      severity: "high",
    });
  } else if (debtRatio > 0.2) {
    reasons.push({
      title: "Moderate debt-to-income ratio (20%–40%)",
      detail: `Existing debt is ${(debtRatio * 100).toFixed(1)}% of annual earnings. Adds 10 points.`,
      points: 10,
      severity: "medium",
    });
  } else {
    reasons.push({
      title: "Healthy debt-to-income ratio (≤ 20%)",
      detail: `Existing debt is only ${(debtRatio * 100).toFixed(1)}% of annual earnings. Adds 0 points.`,
      points: 0,
      severity: "positive",
    });
  }

  if (loanRatio > 3) {
    reasons.push({
      title: "Very high loan-to-income ratio (> 3x)",
      detail: `Loan requested is ${loanRatio.toFixed(2)}x applicant's annual income. Adds 30 points.`,
      points: 30,
      severity: "high",
    });
  } else if (loanRatio > 1.5) {
    reasons.push({
      title: "Elevated loan-to-income ratio (1.5x–3x)",
      detail: `Loan requested is ${loanRatio.toFixed(2)}x applicant's annual income. Adds 15 points.`,
      points: 15,
      severity: "medium",
    });
  } else {
    reasons.push({
      title: "Conservative loan-to-income ratio (≤ 1.5x)",
      detail: `Loan requested is ${loanRatio.toFixed(2)}x applicant's annual income. Adds 0 points.`,
      points: 0,
      severity: "positive",
    });
  }

  return reasons;
}

// ----------------- API Methods -----------------

export async function login(email, password) {
  const res = await api.post("/login", { email, password });
  return res.data;
}

export async function register(email, password) {
  const res = await api.post("/register", { email, password });
  return res.data;
}

export async function getMe() {
  const res = await api.get("/me");
  return res.data;
}

export async function getApplications(params = {}) {
  const res = await api.get("/applications", { params });
  return res.data;
}

export async function getApplication(id) {
  const res = await api.get(`/applications/${id}`);
  return res.data;
}

export async function createApplication(data) {
  const res = await api.post("/applications", data);
  return res.data;
}

export async function updateApplication(id, data) {
  const res = await api.put(`/applications/${id}`, data);
  return res.data;
}

export async function updateApplicationStatus(id, status, admin_remarks) {
  const res = await api.patch(`/applications/${id}/status`, {
    status,
    admin_remarks,
  });
  return res.data;
}

export async function deleteApplication(id) {
  const res = await api.delete(`/applications/${id}`);
  return res.data;
}

export async function uploadDocument(applicationId, documentType, file) {
  const formData = new FormData();
  formData.append("document_type", documentType);
  formData.append("file", file);

  const res = await api.post(`/applications/${applicationId}/documents`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function getApplicationDocuments(applicationId) {
  const res = await api.get(`/applications/${applicationId}/documents`);
  return res.data;
}

export function getDocumentFileUrl(documentId) {
  const token = localStorage.getItem("access_token");
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${API_BASE}/documents/${documentId}/file${query}`;
}

export async function getCustomerDocuments() {
  const res = await api.get("/customer/documents");
  return res.data;
}

export async function verifyDocument(documentId, status, remarks) {
  const res = await api.patch(`/documents/${documentId}/verify`, {
    status,
    remarks,
  });
  return res.data;
}

export async function getAdminDocuments(statusFilter) {
  const params = statusFilter && statusFilter !== "All" ? { status: statusFilter } : {};
  const res = await api.get("/admin/documents", { params });
  return res.data;
}

export async function getAdminStats() {
  const res = await api.get("/admin/stats");
  return res.data;
}

export async function getAdminUsers() {
  const res = await api.get("/admin/users");
  return res.data;
}

export async function updateUserRole(userId, role) {
  const res = await api.patch(`/admin/users/${userId}/role`, { role });
  return res.data;
}

export async function getUserDashboardSummary() {
  const res = await api.get("/user/dashboard-summary");
  return res.data;
}

export default api;
