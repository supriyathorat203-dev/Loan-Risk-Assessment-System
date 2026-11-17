import os
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BACKEND_DIR / "private_documents"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}

MAX_FILE_SIZE = 5 * 1024 * 1024
load_dotenv(BACKEND_DIR / ".env", override=True)

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from auth import (
    create_access_token,
    get_current_user,
    get_current_user_flexible,
    get_optional_current_user,
    hash_password,
    require_admin,
    verify_password,
)
from database import Base, engine, get_db

app = FastAPI(title="Loan Risk Assessment System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)


def is_admin(user: models.User) -> bool:
    return user.role in ("admin", "bank_officer")


def calculate_risk(data: schemas.LoanApplicationCreate):
    score = 0

    # 1. Credit score
    if data.credit_score < 580:
        score += 40
    elif data.credit_score < 670:
        score += 25
    elif data.credit_score < 740:
        score += 10

    # 2. Existing debt ratio relative to annual income
    debt_ratio = (
        data.existing_debt / data.annual_income if data.annual_income > 0 else 1.0
    )
    if debt_ratio > 0.4:
        score += 25
    elif debt_ratio > 0.2:
        score += 10

    # 3. Loan amount ratio relative to annual income
    loan_ratio = (
        data.loan_amount / data.annual_income if data.annual_income > 0 else 5.0
    )
    if loan_ratio > 3:
        score += 30
    elif loan_ratio > 1.5:
        score += 15

    score = min(score, 100)

    if score >= 60:
        category = "High Risk"
    elif score >= 30:
        category = "Medium Risk"
    else:
        category = "Low Risk"

    return score, category


def format_application_response(
    app_obj: models.LoanApplication,
) -> schemas.LoanApplicationResponse:
    docs = [
        schemas.DocumentResponse(
            id=d.id,
            application_id=d.application_id,
            uploaded_by=d.uploaded_by,
            document_type=d.document_type,
            original_filename=d.original_filename,
            content_type=d.content_type,
            status=d.status,
            remarks=d.remarks,
            uploaded_at=d.uploaded_at,
            applicant_name=app_obj.applicant_name,
        )
        for d in (app_obj.documents or [])
    ]

    return schemas.LoanApplicationResponse(
        id=app_obj.id,
        user_id=app_obj.user_id,
        applicant_name=app_obj.applicant_name,
        email=app_obj.email or (app_obj.user.email if app_obj.user else None),
        mobile_no=app_obj.mobile_no,
        aadhaar_no=app_obj.aadhaar_no,
        address=app_obj.address,
        age=app_obj.age,
        annual_income=app_obj.annual_income,
        loan_amount=app_obj.loan_amount,
        credit_score=app_obj.credit_score,
        employment_type=app_obj.employment_type,
        existing_debt=app_obj.existing_debt,
        risk_score=app_obj.risk_score,
        risk_category=app_obj.risk_category,
        status=app_obj.status or "Submitted",
        admin_remarks=app_obj.admin_remarks,
        created_at=app_obj.created_at,
        updated_at=app_obj.updated_at,
        documents=docs,
        user_email=app_obj.user.email if app_obj.user else None,
    )


# -------------------- HEALTH & ROOT --------------------


@app.get("/")
def home():
    return {
        "name": "Loan Risk Assessment System API",
        "version": "2.0.0",
        "status": "online",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


# -------------------- AUTHENTICATION & OTP SECURITY --------------------


def generate_otp() -> str:
    return f"{random.randint(100000, 999999)}"


def send_otp_email(to_email: str, otp: str, purpose: str = "email_verification"):
    title = (
        "LOANWISE EMAIL VERIFICATION CODE"
        if purpose == "email_verification"
        else "LOANWISE PASSWORD RESET CODE"
    )
    print("\n" + "=" * 60)
    print(f"[{title}]")
    print(f"To: {to_email}")
    print(f"Your 6-Digit OTP Code: {otp}")
    print("Valid for: 10 minutes")
    print("=" * 60 + "\n")

    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = os.getenv("SMTP_PORT")
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    if smtp_host and smtp_user and smtp_pass:
        try:
            import smtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"Your LoanWise Security Code: {otp}"
            msg["From"] = smtp_user
            msg["To"] = to_email

            action_name = "email verification" if purpose == "email_verification" else "password reset"
            html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #2563eb; margin: 0; font-size: 24px;">LoanWise Security</h2>
                    <p style="color: #64748b; font-size: 13px; margin-top: 4px;">Loan Risk Assessment & Underwriting Platform</p>
                </div>
                <p style="font-size: 15px; color: #1e293b;">Hello,</p>
                <p style="font-size: 14px; color: #334155; line-height: 1.6;">
                    Please enter the following 6-digit one-time password (OTP) to complete your <strong>{action_name}</strong>:
                </p>
                <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0;">
                    <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e3a8a; font-family: monospace;">{otp}</span>
                </div>
                <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">
                    ⏱️ This verification code is valid for <strong>10 minutes</strong>. Never share your OTP with anyone.
                </p>
            </div>
            """
            msg.attach(MIMEText(html, "html"))
            port = int(smtp_port) if smtp_port else 587
            with smtplib.SMTP(smtp_host, port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_user, to_email, msg.as_string())
        except Exception as e:
            print(f"[SMTP Warning] Could not dispatch email via SMTP: {e}")


@app.post(
    "/api/register",
    response_model=schemas.UserRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    user_data: schemas.UserRegister,
    db: Session = Depends(get_db),
):
    email = str(user_data.email).lower().strip()

    existing_user = db.scalar(
        select(models.User).where(models.User.email == email)
    )

    if existing_user:
        # If user registered previously but never verified email, re-issue OTP
        if not existing_user.is_verified:
            otp = generate_otp()
            existing_user.otp_code = otp
            existing_user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
            existing_user.otp_purpose = "email_verification"
            db.commit()
            send_otp_email(email, otp, "email_verification")
            return {
                "message": "Account already created but not verified. We sent a new 6-digit OTP to your email.",
                "email": email,
                "requires_otp": True,
                "otp_debug": otp,
            }
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists. Please sign in.",
        )

    otp = generate_otp()
    user = models.User(
        email=email,
        password_hash=hash_password(user_data.password),
        role="customer",
        is_verified=False,
        otp_code=otp,
        otp_expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        otp_purpose="email_verification",
    )

    db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    send_otp_email(email, otp, "email_verification")

    return {
        "message": "Account created! Please enter the 6-digit verification code sent to your email.",
        "email": email,
        "requires_otp": True,
        "otp_debug": otp,
    }


@app.post("/api/login")
def login_user(
    login_data: schemas.UserLogin,
    db: Session = Depends(get_db),
):
    email = str(login_data.email).lower().strip()

    user = db.scalar(
        select(models.User).where(models.User.email == email)
    )

    if user is None or not verify_password(
        login_data.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    # Check if first-time sign-in requires OTP verification
    if not user.is_verified:
        otp = generate_otp()
        user.otp_code = otp
        user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        user.otp_purpose = "email_verification"
        db.commit()
        send_otp_email(user.email, otp, "email_verification")
        return {
            "requires_otp": True,
            "email": user.email,
            "message": "First-time sign-in requires email verification. We have sent a 6-digit OTP to your email.",
            "otp_debug": otp,
        }

    access_token = create_access_token(user.id, user.role)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "is_verified": user.is_verified,
        },
    }


@app.post("/api/auth/verify-otp")
def verify_otp(
    req: schemas.OTPVerifyRequest,
    db: Session = Depends(get_db),
):
    email = str(req.email).lower().strip()
    otp = str(req.otp).strip()

    user = db.scalar(select(models.User).where(models.User.email == email))
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    if not user.otp_code or user.otp_code != otp:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification code. Please check your email and try again.",
        )

    if user.otp_expires_at and user.otp_expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="This verification code has expired. Please request a new one.",
        )

    # Mark user verified and clear OTP
    user.is_verified = True
    user.otp_code = None
    user.otp_expires_at = None
    user.otp_purpose = None
    db.commit()

    access_token = create_access_token(user.id, user.role)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "is_verified": True,
        },
        "message": "Email verified successfully! Welcome to LoanWise.",
    }


@app.post("/api/auth/resend-otp")
def resend_otp(
    req: schemas.OTPResendRequest,
    db: Session = Depends(get_db),
):
    email = str(req.email).lower().strip()
    user = db.scalar(select(models.User).where(models.User.email == email))
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    otp = generate_otp()
    user.otp_code = otp
    user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    user.otp_purpose = req.purpose
    db.commit()

    send_otp_email(user.email, otp, req.purpose)
    return {
        "message": "A new 6-digit verification code has been sent to your email.",
        "otp_debug": otp,
    }


@app.post("/api/auth/forgot-password")
def forgot_password(
    req: schemas.ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    email = str(req.email).lower().strip()
    user = db.scalar(select(models.User).where(models.User.email == email))

    if not user:
        return {
            "message": "If an account exists with this email, a 6-digit reset code has been sent."
        }

    otp = generate_otp()
    user.otp_code = otp
    user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    user.otp_purpose = "password_reset"
    db.commit()

    send_otp_email(user.email, otp, "password_reset")
    return {
        "message": "A 6-digit password reset code has been sent to your email.",
        "email": email,
        "otp_debug": otp,
    }


@app.post("/api/auth/reset-password")
def reset_password(
    req: schemas.ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    email = str(req.email).lower().strip()
    otp = str(req.otp).strip()

    user = db.scalar(select(models.User).where(models.User.email == email))
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    if not user.otp_code or user.otp_code != otp:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification code. Please check and try again.",
        )

    if user.otp_purpose != "password_reset":
        raise HTTPException(
            status_code=400,
            detail="This code is not valid for password reset.",
        )

    if user.otp_expires_at and user.otp_expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="This reset code has expired. Please request a new one.",
        )

    user.password_hash = hash_password(req.new_password)
    user.is_verified = True
    user.otp_code = None
    user.otp_expires_at = None
    user.otp_purpose = None
    db.commit()

    return {
        "message": "Your password has been successfully reset! You can now sign in with your new password."
    }


@app.get(
    "/api/me",
    response_model=schemas.UserResponse,
)
def get_me(
    current_user: models.User = Depends(get_current_user),
):
    return current_user


# -------------------- LOAN APPLICATIONS --------------------


@app.post(
    "/api/applications",
    response_model=schemas.LoanApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_application(
    application_data: schemas.LoanApplicationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    risk_score, risk_category = calculate_risk(application_data)

    application = models.LoanApplication(
        **application_data.model_dump(),
        user_id=current_user.id,
        risk_score=risk_score,
        risk_category=risk_category,
        status="Pending",
        admin_remarks=None,
    )

    db.add(application)
    db.commit()
    db.refresh(application)

    return format_application_response(application)


@app.get(
    "/api/applications",
    response_model=list[schemas.LoanApplicationResponse],
)
def list_applications(
    status_filter: str | None = Query(None, alias="status"),
    risk_filter: str | None = Query(None, alias="risk_category"),
    search: str | None = Query(None),
    user_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = (
        select(models.LoanApplication)
        .options(
            joinedload(models.LoanApplication.documents),
            joinedload(models.LoanApplication.user),
        )
        .order_by(models.LoanApplication.created_at.desc())
    )

    if not is_admin(current_user):
        # Customer only views their own applications
        query = query.where(
            models.LoanApplication.user_id == current_user.id
        )
    else:
        # Admin can apply filters
        if user_id:
            query = query.where(models.LoanApplication.user_id == user_id)
        if status_filter and status_filter != "All":
            query = query.where(models.LoanApplication.status == status_filter)
        if risk_filter and risk_filter != "All":
            query = query.where(
                models.LoanApplication.risk_category == risk_filter
            )
        if search and search.strip():
            s = f"%{search.strip().lower()}%"
            query = query.where(
                func.lower(models.LoanApplication.applicant_name).like(s)
                | func.cast(models.LoanApplication.id, models.String).like(s)
            )

    apps = db.scalars(query).unique().all()
    return [format_application_response(a) for a in apps]


@app.get(
    "/api/applications/{application_id}",
    response_model=schemas.LoanApplicationResponse,
)
def get_application(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = (
        select(models.LoanApplication)
        .options(
            joinedload(models.LoanApplication.documents),
            joinedload(models.LoanApplication.user),
        )
        .where(models.LoanApplication.id == application_id)
    )
    application = db.scalar(query)

    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found.",
        )

    if not is_admin(current_user) and application.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot access this application.",
        )

    return format_application_response(application)


@app.put(
    "/api/applications/{application_id}",
    response_model=schemas.LoanApplicationResponse,
)
def update_application(
    application_id: int,
    application_data: schemas.LoanApplicationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = (
        select(models.LoanApplication)
        .options(
            joinedload(models.LoanApplication.documents),
            joinedload(models.LoanApplication.user),
        )
        .where(models.LoanApplication.id == application_id)
    )
    application = db.scalar(query)

    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found.",
        )

    if not is_admin(current_user) and application.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot update this application.",
        )

    risk_score, risk_category = calculate_risk(application_data)

    for field, value in application_data.model_dump().items():
        setattr(application, field, value)

    application.risk_score = risk_score
    application.risk_category = risk_category

    db.commit()
    db.refresh(application)

    return format_application_response(application)


@app.patch(
    "/api/applications/{application_id}/status",
    response_model=schemas.LoanApplicationResponse,
)
def update_application_status(
    application_id: int,
    status_update: schemas.LoanStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    query = (
        select(models.LoanApplication)
        .options(
            joinedload(models.LoanApplication.documents),
            joinedload(models.LoanApplication.user),
        )
        .where(models.LoanApplication.id == application_id)
    )
    application = db.scalar(query)

    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found.",
        )

    application.status = status_update.status
    if status_update.admin_remarks is not None:
        application.admin_remarks = status_update.admin_remarks

    db.commit()
    db.refresh(application)

    return format_application_response(application)


@app.delete("/api/applications/{application_id}")
def delete_application(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    application = db.get(models.LoanApplication, application_id)

    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found.",
        )

    if not is_admin(current_user) and application.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot delete this application.",
        )

    db.delete(application)
    db.commit()

    return {"message": "Application deleted successfully"}


# -------------------- DOCUMENTS --------------------


@app.post("/api/applications/{application_id}/documents")
async def upload_document(
    application_id: int,
    document_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    application = db.get(models.LoanApplication, application_id)

    if application is None:
        raise HTTPException(status_code=404, detail="Application not found.")

    if not is_admin(current_user) and application.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not allowed to upload for this application."
        )

    extension = ALLOWED_TYPES.get(file.content_type)

    if not extension:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, JPG and PNG files are allowed.",
        )

    content = await file.read(MAX_FILE_SIZE + 1)
    await file.close()

    if not content or len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File must be smaller than 5 MB.",
        )

    valid_file = (
        (extension == ".pdf" and content.startswith(b"%PDF-"))
        or (extension == ".jpg" and content.startswith(b"\xff\xd8\xff"))
        or (
            extension == ".png"
            and content.startswith(b"\x89PNG\r\n\x1a\n")
        )
    )

    if not valid_file:
        raise HTTPException(
            status_code=400,
            detail="File signature does not match its stated extension.",
        )

    stored_name = f"{uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / stored_name

    try:
        file_path.write_bytes(content)

        document = models.Document(
            application_id=application_id,
            uploaded_by=current_user.id,
            document_type=document_type,
            original_filename=Path(file.filename or "document").name,
            stored_filename=stored_name,
            content_type=file.content_type,
            status="Pending",
            remarks=None,
        )

        db.add(document)

        # Automatically transition application to 'Under Review' if currently 'Pending' or 'Submitted'
        if application.status in ("Pending", "Submitted", "Documents Pending"):
            application.status = "Under Review"

        db.commit()
        db.refresh(document)

    except Exception:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail="Could not save document on disk.",
        )

    return {
        "message": "Document uploaded successfully.",
        "document_id": document.id,
        "status": document.status,
        "application_status": application.status,
    }


@app.get(
    "/api/applications/{application_id}/documents",
    response_model=list[schemas.DocumentResponse],
)
def list_documents(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    application = db.get(models.LoanApplication, application_id)

    if application is None:
        raise HTTPException(status_code=404, detail="Application not found.")

    if not is_admin(current_user) and application.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed.")

    query = (
        select(models.Document)
        .where(models.Document.application_id == application_id)
        .order_by(models.Document.uploaded_at.desc())
    )

    docs = db.scalars(query).all()
    return [
        schemas.DocumentResponse(
            id=d.id,
            application_id=d.application_id,
            uploaded_by=d.uploaded_by,
            document_type=d.document_type,
            original_filename=d.original_filename,
            content_type=d.content_type,
            status=d.status,
            remarks=d.remarks,
            uploaded_at=d.uploaded_at,
            applicant_name=application.applicant_name,
        )
        for d in docs
    ]


@app.get("/api/documents/{document_id}/file")
def view_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user_flexible),
):
    document = db.get(models.Document, document_id)

    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    application = db.get(models.LoanApplication, document.application_id)

    if application is None:
        raise HTTPException(status_code=404, detail="Application not found.")

    if not is_admin(current_user) and application.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed.")

    file_path = UPLOAD_DIR / document.stored_filename

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document file not found.")

    return FileResponse(
        file_path,
        media_type=document.content_type,
        filename=document.original_filename,
    )


@app.get(
    "/api/customer/documents",
    response_model=list[schemas.DocumentResponse],
)
def customer_list_all_documents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = (
        select(models.Document)
        .options(joinedload(models.Document.application))
        .join(
            models.LoanApplication,
            models.Document.application_id == models.LoanApplication.id,
        )
        .where(models.LoanApplication.user_id == current_user.id)
        .order_by(models.Document.uploaded_at.desc())
    )

    docs = db.scalars(query).unique().all()
    return [
        schemas.DocumentResponse(
            id=d.id,
            application_id=d.application_id,
            uploaded_by=d.uploaded_by,
            document_type=d.document_type,
            original_filename=d.original_filename,
            content_type=d.content_type,
            status=d.status,
            remarks=d.remarks,
            uploaded_at=d.uploaded_at,
            applicant_name=d.application.applicant_name
            if d.application
            else "Applicant",
        )
        for d in docs
    ]


@app.patch(
    "/api/documents/{document_id}/verify",
    response_model=schemas.DocumentResponse,
)
def verify_document(
    document_id: int,
    verification: schemas.DocumentVerify,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    document = db.get(models.Document, document_id)

    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    document.status = verification.status
    if verification.remarks is not None:
        document.remarks = verification.remarks

    db.commit()
    db.refresh(document)

    app_obj = db.get(models.LoanApplication, document.application_id)
    applicant_name = app_obj.applicant_name if app_obj else "Applicant"

    return schemas.DocumentResponse(
        id=document.id,
        application_id=document.application_id,
        uploaded_by=document.uploaded_by,
        document_type=document.document_type,
        original_filename=document.original_filename,
        content_type=document.content_type,
        status=document.status,
        remarks=document.remarks,
        uploaded_at=document.uploaded_at,
        applicant_name=applicant_name,
    )


@app.get(
    "/api/admin/documents",
    response_model=list[schemas.DocumentResponse],
)
def admin_list_all_documents(
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    query = (
        select(models.Document)
        .options(joinedload(models.Document.application))
        .order_by(models.Document.uploaded_at.desc())
    )

    if status_filter and status_filter != "All":
        query = query.where(models.Document.status == status_filter)

    documents = db.scalars(query).unique().all()

    return [
        schemas.DocumentResponse(
            id=d.id,
            application_id=d.application_id,
            uploaded_by=d.uploaded_by,
            document_type=d.document_type,
            original_filename=d.original_filename,
            content_type=d.content_type,
            status=d.status,
            remarks=d.remarks,
            uploaded_at=d.uploaded_at,
            applicant_name=d.application.applicant_name
            if d.application
            else "Unknown",
        )
        for d in documents
    ]


# -------------------- ADMIN DASHBOARD & METRICS --------------------


@app.get(
    "/api/admin/stats",
    response_model=schemas.AdminDashboardStats,
)
def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    apps = db.scalars(select(models.LoanApplication)).all()
    docs = db.scalars(select(models.Document)).all()
    total_customers = db.scalar(
        select(func.count(models.User.id)).where(models.User.role == "customer")
    ) or 0

    total_applications = len(apps)
    pending_review = sum(
        1
        for a in apps
        if a.status in ("Pending", "Submitted", "Documents Pending", "Under Review")
    )
    approved = sum(1 for a in apps if a.status == "Approved")
    rejected = sum(1 for a in apps if a.status == "Rejected")
    total_loan_amount = sum(a.loan_amount for a in apps)
    avg_loan_amount = (
        total_loan_amount / total_applications if total_applications > 0 else 0
    )
    avg_credit_score = (
        sum(a.credit_score for a in apps) / total_applications
        if total_applications > 0
        else 0
    )

    low_risk = sum(1 for a in apps if a.risk_category == "Low Risk")
    medium_risk = sum(1 for a in apps if a.risk_category == "Medium Risk")
    high_risk = sum(1 for a in apps if a.risk_category == "High Risk")

    total_documents = len(docs)
    pending_documents = sum(1 for d in docs if d.status == "Pending")
    verified_documents = sum(1 for d in docs if d.status == "Verified")
    rejected_documents = sum(1 for d in docs if d.status == "Rejected")

    return schemas.AdminDashboardStats(
        total_customers=total_customers,
        total_applications=total_applications,
        pending_review=pending_review,
        approved=approved,
        rejected=rejected,
        total_loan_amount=total_loan_amount,
        avg_loan_amount=avg_loan_amount,
        avg_credit_score=avg_credit_score,
        total_documents=total_documents,
        pending_documents=pending_documents,
        verified_documents=verified_documents,
        rejected_documents=rejected_documents,
        low_risk=low_risk,
        medium_risk=medium_risk,
        high_risk=high_risk,
    )


@app.get(
    "/api/admin/users",
    response_model=list[schemas.UserAdminView],
)
def admin_list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    users = db.scalars(
        select(models.User).order_by(models.User.created_at.desc())
    ).all()

    result = []
    for u in users:
        app_count = db.scalar(
            select(func.count(models.LoanApplication.id)).where(
                models.LoanApplication.user_id == u.id
            )
        ) or 0
        total_loan = db.scalar(
            select(func.coalesce(func.sum(models.LoanApplication.loan_amount), 0.0)).where(
                models.LoanApplication.user_id == u.id
            )
        ) or 0.0
        result.append(
            schemas.UserAdminView(
                id=u.id,
                email=u.email,
                role=u.role,
                created_at=u.created_at,
                applications_count=app_count,
                total_loan_amount=float(total_loan),
            )
        )

    return result


@app.patch(
    "/api/admin/users/{user_id}/role",
    response_model=schemas.UserResponse,
)
def admin_update_user_role(
    user_id: int,
    role_update: schemas.UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.role = role_update.role
    db.commit()
    db.refresh(user)
    return user


# -------------------- CUSTOMER DASHBOARD SUMMARY --------------------


@app.get("/api/user/dashboard-summary")
def get_user_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    user_apps = db.scalars(
        select(models.LoanApplication)
        .options(joinedload(models.LoanApplication.documents))
        .where(models.LoanApplication.user_id == current_user.id)
        .order_by(models.LoanApplication.created_at.desc())
    ).unique().all()

    total = len(user_apps)
    approved = sum(1 for a in user_apps if a.status == "Approved")
    rejected = sum(1 for a in user_apps if a.status == "Rejected")
    under_review = sum(
        1
        for a in user_apps
        if a.status in ("Under Review", "Submitted", "Documents Pending")
    )

    # Check for any rejected documents that require customer attention
    action_items = []
    for a in user_apps:
        for d in a.documents or []:
            if d.status == "Rejected":
                action_items.append(
                    {
                        "application_id": a.id,
                        "document_id": d.id,
                        "document_type": d.document_type,
                        "remarks": d.remarks or "Rejected by reviewing officer.",
                    }
                )

    return {
        "total_applications": total,
        "approved": approved,
        "rejected": rejected,
        "under_review": under_review,
        "latest_application": format_application_response(user_apps[0])
        if user_apps
        else None,
        "action_items": action_items,
    }


# -------------------- AI FINANCIAL & LOAN CHATBOT --------------------


def calculate_sample_emi(principal: float, annual_rate: float, tenure_years: int) -> float:
    monthly_rate = (annual_rate / 100) / 12
    months = tenure_years * 12
    if monthly_rate == 0:
        return principal / months
    emi = (principal * monthly_rate * ((1 + monthly_rate) ** months)) / (((1 + monthly_rate) ** months) - 1)
    return round(emi, 2)


@app.post("/api/ai/chat", response_model=schemas.AIChatResponse)
def ai_chat_assistant(
    chat_req: schemas.AIChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(get_optional_current_user),
):
    msg = chat_req.message.strip().lower()
    user_app = None

    # Check for contextual application if specified or if user is logged in
    if chat_req.context_application_id:
        user_app = db.scalar(
            select(models.LoanApplication)
            .options(joinedload(models.LoanApplication.documents))
            .where(models.LoanApplication.id == chat_req.context_application_id)
        )
    elif current_user:
        user_app = db.scalar(
            select(models.LoanApplication)
            .options(joinedload(models.LoanApplication.documents))
            .where(models.LoanApplication.user_id == current_user.id)
            .order_by(models.LoanApplication.created_at.desc())
        )

    # 1. APPLICATION STATUS & DIAGNOSTIC
    if any(k in msg for k in ["my status", "application status", "check application", "why is my loan", "why pending", "is my loan approved"]):
        if not current_user:
            return schemas.AIChatResponse(
                reply="Please sign in to your LoanWise account so I can look up the real-time status of your active loan applications and documents.",
                suggested_actions=["Login to Account", "Check General Requirements", "Calculate Loan EMI"],
                category="status",
            )
        if not user_app:
            return schemas.AIChatResponse(
                reply="You haven't submitted any loan applications yet! Click **'Apply for Loan'** from the sidebar to submit your details and get an instant risk assessment.",
                suggested_actions=["Apply for Loan", "Required Documents Checklist", "Estimate Affordability"],
                category="status",
            )

        doc_count = len(user_app.documents or [])
        verified_count = sum(1 for d in user_app.documents if d.status == "Verified")
        rejected_docs = [d for d in user_app.documents if d.status == "Rejected"]

        status_msg = f"### 📊 Application #{user_app.id} Status: **{user_app.status}**\n\n"
        status_msg += f"- **Applicant**: {user_app.applicant_name}\n"
        status_msg += f"- **Loan Amount**: ₹{user_app.loan_amount:,.2f}\n"
        status_msg += f"- **Risk Assessment**: **{user_app.risk_category}** (Score: {user_app.risk_score}/100)\n"
        status_msg += f"- **Verification Documents**: {verified_count}/{doc_count} Verified\n\n"

        if rejected_docs:
            status_msg += "⚠️ **Action Required**: The following documents were rejected by the reviewing officer:\n"
            for rd in rejected_docs:
                status_msg += f"- **{rd.document_type}**: *\"{rd.remarks or 'Please re-upload a clearer copy.'}\"*\n"
            status_msg += "\n👉 Go to the **Upload Documents** tab to re-upload clear copies."
            actions = ["Upload Rejected Documents", "Document Guidelines", "Contact Support"]
        elif user_app.status == "Approved":
            status_msg += "🎉 **Congratulations!** Your loan has been officially approved. The bank underwriting desk has passed your file to final disbursement processing."
            actions = ["Disbursement Timeline", "View Approval Letter", "Calculate EMI"]
        elif user_app.status == "Rejected":
            status_msg += f"❌ **Application Declined**: {user_app.admin_remarks or 'The application did not meet our credit underwriting criteria.'}\n\n"
            status_msg += "Common reasons include high debt-to-income ratio (>40%) or insufficient CIBIL score. Ask me *'How to improve my loan approval chances'* for steps to re-apply."
            actions = ["How to improve approval chances", "Improve CIBIL Score", "Lower DTI Ratio"]
        elif doc_count < 3:
            status_msg += "⏳ **Pending Documents**: To complete officer verification, please upload your mandatory documents: PAN Card, Income Proof (Salary Slip/ITR), and Bank Statement (3–6 months)."
            actions = ["Upload Documents Now", "Document Checklist", "Explain Risk Score"]
        else:
            status_msg += "⏳ Your documents are currently queued for underwriting verification. Bank officers typically review files within 24 to 48 business hours."
            actions = ["Verification Timeline", "Explain Risk Score", "Check Eligibility"]

        return schemas.AIChatResponse(
            reply=status_msg,
            suggested_actions=actions,
            category="status",
        )

    # 2. DOCUMENT REJECTION & REQUIREMENTS
    if any(k in msg for k in ["document", "rejected", "rejection", "upload", "pan", "aadhaar", "salary slip", "bank statement"]):
        reply = (
            "### 📄 Document Requirements & Rejection Resolution Guide\n\n"
            "To ensure swift approval and avoid rejection by bank officers, verify the following standards:\n\n"
            "1. **PAN Card (Mandatory)**:\n"
            "   - Must show full legal name matching the loan application exactly.\n"
            "   - Ensure clear focus with all 4 corners visible (no glare, no blur).\n\n"
            "2. **Income Proof (Salary Slip / Form 16 / ITR)**:\n"
            "   - **Salaried**: Latest 3 months salary slips with employer name and deductions.\n"
            "   - **Self-Employed**: Last 2 financial years ITR computation with acknowledgement.\n\n"
            "3. **Bank Statement (3–6 Months)**:\n"
            "   - Official net banking e-statement PDF or stamped bank copy showing salary credits.\n"
            "   - Do not upload phone screenshots or truncated statements.\n\n"
            "4. **Address Proof (Masked Aadhaar / Utility Bill)**:\n"
            "   - As per RBI guidelines, **mask the first 8 digits** of your Aadhaar (`XXXX-XXXX-1234`). Only the last 4 digits should be visible.\n\n"
            "💡 **If your document was rejected**: Go to **'Upload Documents'**, select your application, and upload an updated, high-resolution copy."
        )
        return schemas.AIChatResponse(
            reply=reply,
            suggested_actions=["Upload Documents", "Check Application Status", "How to Mask Aadhaar"],
            category="documents",
        )

    # 3. CIBIL / CREDIT SCORE PROBLEM SOLVING
    if any(k in msg for k in ["credit score", "cibil", "low score", "improve score", "credit rating"]):
        reply = (
            "### 📈 How to Improve Your CIBIL / Credit Score (300 to 850)\n\n"
            "A higher credit score unlocks lower interest rates and faster loan approvals:\n\n"
            "| CIBIL Range | Risk Rating | Loan Approval Outlook |\n"
            "|---|---|---|\n"
            "| **750 – 850** | **Low Risk** | Instant approval, lowest interest rates |\n"
            "| **650 – 749** | **Medium Risk** | Standard terms, documents carefully scrutinized |\n"
            "| **300 – 649** | **High Risk** | High chance of rejection or requires co-applicant |\n\n"
            "#### 5 Proven Steps to Boost Your Score by 50–100 Points:\n"
            "1. **Zero Missed Payments**: Pay credit card bills and EMIs at least 3 days before the due date (payment history = 35% of score).\n"
            "2. **Keep Credit Utilization Below 30%**: If your card limit is ₹1,00,000, keep outstanding balance below ₹30,000.\n"
            "3. **Do Not Apply to Multiple Lenders Simultaneously**: Each application creates a 'Hard Inquiry' which drops your score by 5–10 points.\n"
            "4. **Maintain Credit Age**: Keep your oldest credit card active even if seldom used.\n"
            "5. **Check for Bureau Errors**: Check your CIBIL report for false overdue remarks and raise immediate disputes."
        )
        return schemas.AIChatResponse(
            reply=reply,
            suggested_actions=["Check My Risk Score", "Lower DTI Ratio", "Apply with Co-Applicant"],
            category="credit_score",
        )

    # 3. RISK SCORE & UNDERWRITING RULES
    if any(k in msg for k in ["risk score", "risk category", "how risk calculated", "underwriting", "points"]):
        reply = (
            "### ⚡ How LoanWise Calculates Your Risk Score (0–100 Points)\n\n"
            "Our automated underwriting engine scores applications on 4 core risk pillars:\n\n"
            "1. **Credit Score (CIBIL)**:\n"
            "   - Score ≥ 750: **0 penalty points** (Excellent)\n"
            "   - Score 650–749: **15 penalty points** (Moderate)\n"
            "   - Score < 650: **35 penalty points** (High Risk)\n\n"
            "2. **Debt-to-Income (DTI) Ratio**:\n"
            "   - Total Debt / Annual Income. DTI > 40% adds **25 penalty points**.\n\n"
            "3. **Loan-to-Income (LTI) Multiplier**:\n"
            "   - Requested Loan / Annual Income. If loan exceeds 80% of annual income, adds **20 penalty points**.\n\n"
            "4. **Employment Stability**:\n"
            "   - Self-employed professionals receive a **10 penalty point** baseline adjustment.\n\n"
            "**Classification Thresholds**:\n"
            "- 🟢 **Low Risk (0–29 points)**: Fast-track approval.\n"
            "- 🟡 **Medium Risk (30–59 points)**: Detailed document inspection required.\n"
            "- 🔴 **High Risk (60–100 points)**: Elevated risk; requires additional collateral or lower loan amount."
        )
        return schemas.AIChatResponse(
            reply=reply,
            suggested_actions=["Check My Applications", "How to Lower Risk Score", "Apply for Loan"],
            category="risk",
        )

    # 4. EMI & AFFORDABILITY CALCULATOR
    if any(k in msg for k in ["emi", "monthly payment", "how much emi", "interest rate", "calculate emi", "affordability"]):
        emi_3yr = calculate_sample_emi(500000, 10.5, 3)
        emi_5yr = calculate_sample_emi(500000, 10.5, 5)
        reply = (
            "### 💰 Loan EMI & Affordability Estimator\n\n"
            "Here is the standard benchmark EMI calculation at **10.5% p.a. interest** for a **₹5,00,000** personal loan:\n\n"
            f"- **3-Year Tenure (36 Months)**: **₹{emi_3yr:,.2f} / month** (Total Interest: ₹{(emi_3yr*36 - 500000):,.2f})\n"
            f"- **5-Year Tenure (60 Months)**: **₹{emi_5yr:,.2f} / month** (Total Interest: ₹{(emi_5yr*60 - 500000):,.2f})\n\n"
            "#### 📐 The 40% DTI Golden Rule:\n"
            "Banks recommend that your **total monthly loan repayments** (existing debts + new EMI) should never exceed **40% of your monthly take-home salary**.\n\n"
            "- Example: If your net salary is ₹60,000/month, your maximum comfortable EMI capacity is ₹24,000/month."
        )
        return schemas.AIChatResponse(
            reply=reply,
            suggested_actions=["Check My Eligibility", "Apply for Loan", "Explain Risk Score"],
            category="calculator",
        )

    # 6. AADHAAR & PERSONAL DETAILS
    if any(k in msg for k in ["aadhaar", "address", "mobile", "phone", "email"]):
        reply = (
            "### 🔒 Personal Details & KYC Security\n\n"
            "When filling your loan application:\n\n"
            "- **Aadhaar Number**: Enter your 12-digit Aadhaar number for KYC validation. All data is encrypted with bank-grade security.\n"
            "- **Masked Aadhaar**: When uploading your Aadhaar PDF/image document, ensure the first 8 digits are masked (`XXXX-XXXX-1234`).\n"
            "- **Mobile & Email**: Ensure your primary mobile number and email are valid, as loan sanction letters and e-signatures are delivered there.\n"
            "- **Address**: Must match the address specified in your uploaded utility bill or address proof document."
        )
        return schemas.AIChatResponse(
            reply=reply,
            suggested_actions=["Apply for Loan", "Upload Documents", "Check Status"],
            category="kyc",
        )

    # 7. DEFAULT PROBLEM SOLVER
    default_reply = (
        "### 👋 Hello! I am your LoanWise AI Financial Advisor & Problem Solver.\n\n"
        "I can help you troubleshoot issues, calculate affordability, and get your loan approved faster. How can I help you today?\n\n"
        "Here are some common topics you can ask me:\n"
        "- 📊 **'What is the current status of my application?'**\n"
        "- 📑 **'What documents are required and why was my document rejected?'**\n"
        "- 📈 **'How can I improve my CIBIL score to qualify for lower rates?'**\n"
        "- 💰 **'Calculate my monthly EMI for ₹5,00,000 loan'**\n"
        "- ⚡ **'How is my Risk Category (Low/Medium/High) calculated?'**\n"
        "- 🔒 **'Guidelines for Aadhaar, Mobile, and Address verification'**\n\n"
        "Type your question below or click any of the quick action buttons!"
    )
    return schemas.AIChatResponse(
        reply=default_reply,
        suggested_actions=[
            "Check Application Status",
            "Document Upload Guidelines",
            "Calculate Loan EMI",
            "Improve CIBIL Score",
        ],
        category="general",
    )
