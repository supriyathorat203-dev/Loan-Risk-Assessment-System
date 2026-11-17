import { useState, useEffect } from "react";
import { getApplications, getErrorMessage } from "./api";
import CustomerDashboard from "./components/Customer/CustomerDashboard";
import AdminDashboard from "./components/Admin/AdminDashboard";
import AuthScreen from "./components/Auth/AuthScreen";
import "./App.css";

export default function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("loanwise_theme") || "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("loanwise_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = localStorage.getItem("current_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [isLoggedIn, setIsLoggedIn] = useState(
    Boolean(localStorage.getItem("access_token"))
  );

  const [applications, setApplications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const loadApplications = async () => {
    if (!localStorage.getItem("access_token")) return;
    setRefreshing(true);
    setFetchError("");
    try {
      const data = await getApplications();
      setApplications(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.response?.status === 401) {
        handleLogout();
        return;
      }
      setFetchError(getErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      loadApplications();
    }
  }, [isLoggedIn]);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    loadApplications();
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("current_user");
    setCurrentUser(null);
    setIsLoggedIn(false);
    setApplications([]);
    setFetchError("");
  };

  // 1. Unauthenticated -> Show Auth Screen
  if (!isLoggedIn || !currentUser) {
    return (
      <AuthScreen
        onAuthSuccess={handleAuthSuccess}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 2. Strict Role-Based Separation:
  // Admin / Bank Officer -> Admin Dashboard ONLY
  const isAdminRole =
    currentUser.role === "admin" || currentUser.role === "bank_officer";

  if (isAdminRole) {
    return (
      <div className="app-root">
        {fetchError && <div className="global-error-banner">⚠️ {fetchError}</div>}
        <AdminDashboard
          currentUser={currentUser}
          applications={applications}
          onRefresh={loadApplications}
          refreshing={refreshing}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>
    );
  }

  // 3. Customer / Borrower -> Customer Dashboard ONLY
  return (
    <div className="app-root">
      {fetchError && <div className="global-error-banner">⚠️ {fetchError}</div>}
      <CustomerDashboard
        currentUser={currentUser}
        applications={applications}
        onRefresh={loadApplications}
        refreshing={refreshing}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    </div>
  );
}
