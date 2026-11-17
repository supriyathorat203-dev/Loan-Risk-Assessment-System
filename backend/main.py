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


# -------------------- AUTHENTICATION --------------------


@app.post(
    "/api/register",
    response_model=schemas.UserResponse,
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
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = models.User(
        email=email,
        password_hash=hash_password(user_data.password),
        role="customer",
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

    return user


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

    access_token = create_access_token(user.id, user.role)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
        },
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
