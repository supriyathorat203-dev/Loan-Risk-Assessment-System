from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoanApplicationCreate(BaseModel):
    applicant_name: str = Field(min_length=2, max_length=120)
    age: int = Field(ge=18, le=100)
    annual_income: float = Field(gt=0)
    loan_amount: float = Field(gt=0)
    credit_score: int = Field(ge=300, le=850)
    employment_type: str = Field(min_length=2, max_length=50)
    existing_debt: float = Field(default=0, ge=0)
    email: EmailStr | None = None
    mobile_no: str | None = Field(default=None, max_length=20)
    aadhaar_no: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=500)


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    uploaded_by: int
    document_type: str
    original_filename: str
    content_type: str
    status: str
    remarks: str | None = None
    uploaded_at: datetime
    applicant_name: str | None = None


class DocumentVerify(BaseModel):
    status: str = Field(pattern="^(Verified|Rejected|Pending)$")
    remarks: str | None = Field(default=None, max_length=500)


class LoanApplicationResponse(LoanApplicationCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None = None
    risk_score: float
    risk_category: str
    status: str = "Pending"
    admin_remarks: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    documents: list[DocumentResponse] = []
    user_email: str | None = None


class LoanStatusUpdate(BaseModel):
    status: str = Field(
        pattern="^(Pending|Under Review|Approved|Rejected|Submitted|Documents Pending)$"
    )
    admin_remarks: str | None = Field(default=None, max_length=500)


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    role: str
    is_verified: bool = False
    created_at: datetime | None = None


class UserRegisterResponse(BaseModel):
    message: str
    email: EmailStr
    requires_otp: bool = True
    otp_debug: str | None = None


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)


class OTPResendRequest(BaseModel):
    email: EmailStr
    purpose: str = "email_verification"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=128)


class UserAdminView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    role: str
    created_at: datetime | None = None
    applications_count: int = 0
    total_loan_amount: float = 0


class UserRoleUpdate(BaseModel):
    role: str = Field(pattern="^(customer|admin|bank_officer)$")


class AdminDashboardStats(BaseModel):
    total_customers: int = 0
    total_applications: int
    pending_review: int
    approved: int
    rejected: int
    total_loan_amount: float
    avg_loan_amount: float = 0
    avg_credit_score: float = 0
    total_documents: int
    pending_documents: int
    verified_documents: int
    rejected_documents: int
    low_risk: int
    medium_risk: int
    high_risk: int


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1500)
    context_application_id: int | None = None
    history: list[dict[str, str]] = []


class AIChatResponse(BaseModel):
    reply: str
    suggested_actions: list[str] = []
    category: str = "general"
