import { useEffect, useState } from "react";
import api, { getDocumentFileUrl } from "../../api";

export default function DocumentPreviewModal({
  document,
  onClose,
  isAdmin = false,
  onVerify,
  onReject,
}) {
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [loadingFile, setLoadingFile] = useState(true);
  const [fileError, setFileError] = useState("");

  if (!document) return null;

  const fileUrl = getDocumentFileUrl(document.id);
  const isImage =
    document.content_type?.startsWith("image/") ||
    document.original_filename?.match(/\.(jpg|jpeg|png)$/i);
  const isPdf =
    document.content_type === "application/pdf" ||
    document.original_filename?.endsWith(".pdf");

  useEffect(() => {
    let active = true;
    let url = null;
    setLoadingFile(true);
    setFileError("");

    api
      .get(`/documents/${document.id}/file`, { responseType: "blob" })
      .then((res) => {
        if (!active) return;
        url = URL.createObjectURL(res.data);
        setBlobUrl(url);
        setLoadingFile(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to fetch document blob", err);
        setFileError("Could not load file stream directly.");
        setLoadingFile(false);
      });

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [document.id]);

  const handleVerify = async () => {
    if (!onVerify) return;
    setActionLoading(true);
    try {
      await onVerify(document.id, "Verified", "Approved by officer.");
      onClose();
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!onReject) return;
    if (!rejectRemarks.trim()) {
      alert("Please provide a reason for rejecting this document.");
      return;
    }
    setActionLoading(true);
    try {
      await onReject(document.id, "Rejected", rejectRemarks.trim());
      onClose();
    } finally {
      setActionLoading(false);
    }
  };

  const openInNewTab = () => {
    window.open(blobUrl || fileUrl, "_blank");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>{document.document_type}</h3>
            <p className="modal-subtitle">
              {document.original_filename} &bull; Uploaded on{" "}
              {new Date(document.uploaded_at).toLocaleString("en-IN")}
            </p>
          </div>
          <div className="modal-header-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={openInNewTab}
            >
              Open in New Window ↗
            </button>
            <button type="button" className="close-btn" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="modal-body preview-body">
          <div className="doc-meta-bar">
            <div>
              <span className="meta-label">Status:</span>
              <span
                className={`status-pill pill-${(document.status || "pending").toLowerCase()}`}
              >
                {document.status}
              </span>
            </div>
            {document.applicant_name && (
              <div>
                <span className="meta-label">Applicant:</span>
                <strong>{document.applicant_name}</strong>
              </div>
            )}
            <div>
              <span className="meta-label">App ID:</span>
              <strong>#{document.application_id}</strong>
            </div>
          </div>

          {document.remarks && (
            <div className={`remarks-banner ${document.status === "Rejected" ? "danger" : "info"}`}>
              <strong>Officer Remarks:</strong> {document.remarks}
            </div>
          )}

          <div className="file-display-area">
            {loadingFile ? (
              <div className="preview-loading">
                <div className="spinner" />
                <p>Loading secure document preview...</p>
              </div>
            ) : fileError ? (
              <div className="preview-fallback">
                <p>{fileError}</p>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                >
                  Download / View {document.original_filename}
                </a>
              </div>
            ) : isImage ? (
              <img
                src={blobUrl || fileUrl}
                alt={document.original_filename}
                className="preview-image"
              />
            ) : isPdf ? (
              <iframe
                src={blobUrl || fileUrl}
                title={document.original_filename}
                className="preview-iframe"
              />
            ) : (
              <div className="preview-fallback">
                <p>Preview format rendered via download:</p>
                <a
                  href={blobUrl || fileUrl}
                  download={document.original_filename}
                  className="btn btn-primary"
                >
                  Download {document.original_filename}
                </a>
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="modal-footer preview-admin-footer">
            {!showRejectInput ? (
              <div className="admin-quick-actions">
                <span>Underwriting Review:</span>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleVerify}
                  disabled={actionLoading || document.status === "Verified"}
                >
                  {document.status === "Verified" ? "Already Verified" : "Verify Document"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setShowRejectInput(true)}
                  disabled={actionLoading}
                >
                  Reject with Remarks...
                </button>
              </div>
            ) : (
              <div className="reject-form-box">
                <input
                  type="text"
                  placeholder="Reason for rejection (e.g. Document blurry, expired, missing seal)..."
                  value={rejectRemarks}
                  onChange={(e) => setRejectRemarks(e.target.value)}
                  className="form-control"
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleReject}
                  disabled={actionLoading}
                >
                  Confirm Reject
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowRejectInput(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
