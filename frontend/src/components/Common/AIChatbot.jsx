import { useState, useRef, useEffect } from "react";
import { sendAIChatMessage, getErrorMessage } from "../../api";

const QUICK_PROMPTS = [
  { icon: "📊", label: "Check my application status", text: "What is the current status of my application and documents?" },
  { icon: "📄", label: "Why was my document rejected?", text: "Why was my document rejected and what are the exact requirements to fix it?" },
  { icon: "📈", label: "How to improve CIBIL score?", text: "How can I improve my CIBIL score quickly to get lower interest rates?" },
  { icon: "💰", label: "Calculate EMI for ₹5 Lakh", text: "Calculate the estimated monthly EMI for a ₹5,00,000 loan at 10.5% interest for 3 years." },
  { icon: "⚡", label: "How is Risk Score calculated?", text: "Explain how the LoanWise Risk Score and Risk Category are calculated." },
  { icon: "🔒", label: "Aadhaar & KYC rules", text: "What are the guidelines for Aadhaar number, mobile number, and address verification?" },
];

export default function AIChatbot({
  currentUser,
  currentAppId = null,
  applications = [],
  mode = "widget", // "widget" (floating drawer) or "embedded" (full view)
  onClose,
  onNavigateTab,
}) {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "ai",
      text: `Hello ${currentUser?.email ? currentUser.email.split("@")[0] : "there"}! 👋 I am your **LoanWise AI Financial Advisor & Problem Solver**.\n\nI can help you troubleshoot document issues, calculate monthly EMIs, understand risk assessments, or check on your application status.\n\nHow can I help you today?`,
      suggestedActions: [
        "Check my application status",
        "Why was my document rejected?",
        "Calculate EMI for ₹5 Lakh",
        "How to improve CIBIL score?",
      ],
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState(currentAppId || (applications[0]?.id || null));
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (currentAppId) {
      setSelectedAppId(currentAppId);
    } else if (applications.length > 0 && !selectedAppId) {
      setSelectedAppId(applications[0].id);
    }
  }, [currentAppId, applications]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async (customText = null) => {
    const textToSend = customText || inputText;
    if (!textToSend || !textToSend.trim() || loading) return;

    const userMsgId = Date.now().toString();
    const newMsg = {
      id: userMsgId,
      sender: "user",
      text: textToSend.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, newMsg]);
    if (!customText) setInputText("");
    setLoading(true);

    try {
      // Build conversation history for context
      const history = messages
        .slice(-6)
        .map((m) => ({ role: m.sender === "user" ? "user" : "assistant", content: m.text }));

      const res = await sendAIChatMessage(textToSend.trim(), selectedAppId, history);

      const aiMsg = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: res.reply,
        suggestedActions: res.suggested_actions || [],
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: `⚠️ **Unable to process query**: ${getErrorMessage(err)}\n\nPlease ensure your backend server is running, or try asking in different words.`,
        suggestedActions: ["Check my application status", "Calculate EMI for ₹5 Lakh", "Document Requirements"],
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = (action) => {
    // Check if the action implies tab navigation
    if (onNavigateTab) {
      if (action.toLowerCase().includes("upload")) {
        onNavigateTab("Upload Documents");
        return;
      }
      if (action.toLowerCase().includes("apply for loan") || action.toLowerCase().includes("apply now")) {
        onNavigateTab("Apply for Loan");
        return;
      }
      if (action.toLowerCase().includes("application status") || action.toLowerCase().includes("check status")) {
        onNavigateTab("Application Status");
        return;
      }
    }
    handleSendMessage(action);
  };

  const clearChat = () => {
    setMessages([
      {
        id: "welcome-reset",
        sender: "ai",
        text: "Conversation reset. How can I assist you with your loan or underwriting today?",
        suggestedActions: [
          "Check my application status",
          "Document Requirements",
          "Calculate EMI for ₹5 Lakh",
          "Improve CIBIL Score",
        ],
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const renderFormattedText = (text) => {
    // Format bold headers and markdown bullets for clean banking UI
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("### ")) {
        return <h4 key={idx} className="ai-md-h3">{line.replace("### ", "")}</h4>;
      }
      if (line.startsWith("#### ")) {
        return <h5 key={idx} className="ai-md-h4">{line.replace("#### ", "")}</h5>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const itemContent = line.replace(/^[-*]\s+/, "");
        return (
          <div key={idx} className="ai-md-bullet">
            <span className="ai-bullet-dot">•</span>
            <span>{renderInlineBold(itemContent)}</span>
          </div>
        );
      }
      if (line.startsWith("1. ") || line.startsWith("2. ") || line.startsWith("3. ") || line.startsWith("4. ") || line.startsWith("5. ")) {
        return (
          <div key={idx} className="ai-md-bullet ai-numbered">
            <span className="ai-number-badge">{line.slice(0, 3)}</span>
            <span>{renderInlineBold(line.slice(3))}</span>
          </div>
        );
      }
      if (line.startsWith("|")) {
        // Simple table line rendering
        return (
          <div key={idx} className="ai-md-table-line">
            {line}
          </div>
        );
      }
      if (line.trim() === "") {
        return <div key={idx} className="ai-md-spacer" />;
      }
      return <p key={idx} className="ai-md-p">{renderInlineBold(line)}</p>;
    });
  };

  const renderInlineBold = (str) => {
    const parts = str.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  return (
    <div className={`ai-chatbot-container ai-mode-${mode}`}>
      {/* Chat Header */}
      <div className="ai-chat-header">
        <div className="ai-header-info">
          <div className="ai-avatar-badge">
            <span className="ai-avatar-icon">🤖</span>
            <span className="ai-online-dot" title="AI Agent Active" />
          </div>
          <div>
            <h3 className="ai-header-title">LoanWise AI Advisor</h3>
            <span className="ai-header-sub">Problem Solver & Financial Assistant</span>
          </div>
        </div>

        <div className="ai-header-actions">
          {applications.length > 0 && (
            <div className="ai-context-picker">
              <label>App:</label>
              <select
                value={selectedAppId || ""}
                onChange={(e) => setSelectedAppId(Number(e.target.value))}
                title="Select application for context"
              >
                {applications.map((a) => (
                  <option key={a.id} value={a.id}>
                    #{a.id} - ₹{Number(a.loan_amount).toLocaleString("en-IN")} ({a.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            className="ai-icon-btn"
            onClick={clearChat}
            title="Reset conversation"
          >
            🔄
          </button>

          {mode === "widget" && onClose && (
            <button
              type="button"
              className="ai-icon-btn ai-close-btn"
              onClick={onClose}
              title="Close Chat"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Quick Problem Solving Pills */}
      <div className="ai-quick-pills-bar">
        <span className="ai-pills-label">💡 Quick Problem Solvers:</span>
        <div className="ai-pills-scroll">
          {QUICK_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              className="ai-quick-pill"
              onClick={() => handleSendMessage(p.text)}
              disabled={loading}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Messages Thread */}
      <div className="ai-messages-scroll">
        {messages.map((m) => (
          <div key={m.id} className={`ai-message-row ai-msg-${m.sender}`}>
            {m.sender === "ai" && <div className="ai-msg-avatar">🤖</div>}
            <div className="ai-message-bubble">
              <div className="ai-message-body">{renderFormattedText(m.text)}</div>

              {/* Action buttons suggested by AI */}
              {m.suggestedActions && m.suggestedActions.length > 0 && (
                <div className="ai-suggested-actions">
                  <span className="ai-actions-hint">Suggested follow-ups:</span>
                  <div className="ai-action-buttons">
                    {m.suggestedActions.map((act, aIdx) => (
                      <button
                        key={aIdx}
                        type="button"
                        className="ai-action-btn"
                        onClick={() => handleActionClick(act)}
                        disabled={loading}
                      >
                        {act} →
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <span className="ai-message-time">{m.time}</span>
            </div>
          </div>
        ))}

        {loading && (
          <div className="ai-message-row ai-msg-ai">
            <div className="ai-msg-avatar">🤖</div>
            <div className="ai-message-bubble ai-typing-bubble">
              <div className="ai-typing-indicator">
                <span />
                <span />
                <span />
              </div>
              <span className="ai-typing-text">LoanWise AI is analyzing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="ai-chat-input-bar"
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask a question or explain your issue (e.g. document rejected, low CIBIL, EMI)..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={loading}
          className="ai-input-field"
        />
        <button
          type="submit"
          disabled={loading || !inputText.trim()}
          className="btn btn-primary ai-send-btn"
        >
          {loading ? "..." : "Send ➤"}
        </button>
      </form>
    </div>
  );
}
