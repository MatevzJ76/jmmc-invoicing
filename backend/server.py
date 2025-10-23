from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
import jwt
from collections import defaultdict
import openpyxl
from io import BytesIO
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Password hasher
ph = PasswordHasher()

# JWT config
SECRET_KEY = os.environ.get("JWT_SECRET", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# eRačuni config
ERACUNI_MODE = os.environ.get("ERACUNI_MODE", "stub")
ERACUNI_BASE_URL = os.environ.get("ERACUNI_BASE_URL", "")
ERACUNI_API_KEY = os.environ.get("ERACUNI_API_KEY", "")

# LLM config
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Rate limiting store (simple in-memory) - 10 attempts per 15 minutes
login_attempts = defaultdict(list)

# ============ MODELS ============
class User(BaseModel):
    email: str
    role: str  # ADMIN or USER
    mustReset: bool = False

class LoginRequest(BaseModel):
    email: str
    password: str

class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: User

class ImportMetadata(BaseModel):
    invoiceDate: str
    periodFrom: str
    periodTo: str
    dueDate: str

class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    customerId: str
    customerName: str
    number: Optional[str] = None
    invoiceDate: str
    periodFrom: str
    periodTo: str
    dueDate: str
    status: str
    total: float
    externalNumber: Optional[str] = None

class InvoiceLine(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    invoiceId: str
    description: str
    quantity: float
    unitPrice: float
    amount: float
    taxCode: Optional[str] = None

class InvoiceUpdate(BaseModel):
    number: Optional[str] = None
    lines: List[Dict[str, Any]]

class AIRequest(BaseModel):
    text: str
    feature: str  # grammar, fraud, gdpr

# ============ AUTH HELPERS ============
def create_token(data: dict, expires_delta: timedelta):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user_doc = await db.users.find_one({"email": email}, {"_id": 0, "passwordHash": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        
        return User(**user_doc)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

def check_rate_limit(email: str) -> bool:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=15)
    login_attempts[email] = [t for t in login_attempts[email] if t > cutoff]
    return len(login_attempts[email]) < 10  # Increased from 5 to 10

# ============ AUTH ENDPOINTS ============
@api_router.post("/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    if not check_rate_limit(request.email):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again in 15 minutes.")
    
    user_doc = await db.users.find_one({"email": request.email})
    if not user_doc:
        login_attempts[request.email].append(datetime.now(timezone.utc))  # Only count failed attempts
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    try:
        ph.verify(user_doc["passwordHash"], request.password)
    except VerifyMismatchError:
        login_attempts[request.email].append(datetime.now(timezone.utc))  # Only count failed attempts
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Successful login - clear attempts for this email
    if request.email in login_attempts:
        login_attempts[request.email] = []
    
    access_token = create_token({"sub": request.email}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    refresh_token = create_token({"sub": request.email}, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    
    user = User(email=user_doc["email"], role=user_doc["role"], mustReset=user_doc.get("mustReset", False))
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=user)

@api_router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        
        user_doc = await db.users.find_one({"email": email})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        
        access_token = create_token({"sub": email}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
        refresh_token = create_token({"sub": email}, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
        
        user = User(email=user_doc["email"], role=user_doc["role"], mustReset=user_doc.get("mustReset", False))
        return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=user)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@api_router.post("/auth/change-password")
async def change_password(request: ChangePasswordRequest, current_user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"email": current_user.email})
    
    try:
        ph.verify(user_doc["passwordHash"], request.currentPassword)
    except VerifyMismatchError:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    new_hash = ph.hash(request.newPassword)
    await db.users.update_one(
        {"email": current_user.email},
        {"$set": {"passwordHash": new_hash, "mustReset": False}}
    )
    
    return {"message": "Password changed successfully"}

@api_router.post("/auth/clear-rate-limit")
async def clear_rate_limit(email: str, current_user: User = Depends(get_current_user)):
    """Clear rate limiting for a specific email (admin debugging)"""
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin role required")
    
    if email in login_attempts:
        login_attempts[email] = []
    
    return {"message": f"Rate limit cleared for {email}"}

# ============ IMPORT ENDPOINTS ============
@api_router.post("/imports")
async def import_xlsx(
    file: UploadFile = File(...),
    invoiceDate: str = Form(...),
    periodFrom: str = Form(...),
    periodTo: str = Form(...),
    dueDate: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    try:
        contents = await file.read()
        wb = openpyxl.load_workbook(BytesIO(contents))
        sheet = wb.active
        
        # Validate headers - strip None values and check
        expected_headers = ["Projekt", "Stranka", "Datum", "Tarifa", "Delavec", "Opombe", "Porabljene ure", "Vrednost", "Št. računa"]
        alternative_headers = ["Projekt", "Stranka", "Datum", "Tarifa", "Delavec", "Opombe", "Porabljene ure", "Vrednost", "Št.računa"]
        raw_headers = [cell.value for cell in sheet[1]]
        
        # Remove leading # if present and filter out None values
        headers = [h for h in raw_headers if h is not None and h != '#']
        
        if headers != expected_headers and headers != alternative_headers:
            raise HTTPException(status_code=400, detail=f"Invalid XLSX headers. Expected: {expected_headers}, Got: {headers}")
        
        # Create batch
        batch_id = str(uuid.uuid4())
        batch_doc = {
            "id": batch_id,
            "filename": file.filename,
            "periodFrom": periodFrom,
            "periodTo": periodTo,
            "invoiceDate": invoiceDate,
            "dueDate": dueDate,
            "status": "imported",
            "createdBy": current_user.email,
            "createdAt": datetime.now(timezone.utc).isoformat()
        }
        await db.importBatches.insert_one(batch_doc)
        
        # Parse rows - handle grouped structure where Projekt/Stranka are section headers
        entries = []
        current_project = "General"
        current_customer = "General"
        
        for row in sheet.iter_rows(min_row=2, values_only=True):
            # Skip completely empty rows
            if not row or all(cell is None or cell == '' for cell in row):
                continue
            
            # Handle rows with leading # column
            if row[0] and (str(row[0]).endswith('.') or row[0] == '#'):
                # Data row - skip # column if present
                row_data = row[1:11] if row[0] == '#' else row[0:10]
            else:
                row_data = row[0:10]
            
            # Check if this is a section header row (has Projekt/Stranka but no date)
            projekt_val = row_data[0]
            stranka_val = row_data[1]
            datum_val = row_data[2]
            
            # If Stranka has a value but no date, it's a customer section header
            if stranka_val and not datum_val:
                current_customer = str(stranka_val).strip()
                # If there's also a Projekt value, update it
                if projekt_val:
                    current_project = str(projekt_val).strip()
                continue
            
            # If only Projekt has a value but no date, it's a project section header
            if projekt_val and not stranka_val and not datum_val:
                current_project = str(projekt_val).strip()
                continue
            
            # Skip if no date (not a data row)
            if not datum_val:
                continue
            
            # Parse data row
            tariff = row_data[3]
            employee = row_data[4]
            notes = row_data[5]
            hours_val = row_data[6]
            value_str = row_data[7]
            invoice_num = row_data[8]
            
            # Parse hours (handle text and various formats)
            try:
                hours = float(str(hours_val).replace(',', '.')) if hours_val else 0.0
            except:
                hours = 0.0
            
            # Parse value (handle comma as decimal separator)
            try:
                value = float(str(value_str).replace(',', '.')) if value_str else 0.0
            except:
                value = 0.0
            
            # Find or create customer
            customer = await db.customers.find_one({"name": current_customer})
            if not customer:
                customer_id = str(uuid.uuid4())
                await db.customers.insert_one({"id": customer_id, "name": current_customer})
            else:
                customer_id = customer["id"]
            
            # Find or create project
            project = await db.projects.find_one({"name": current_project, "customerId": customer_id})
            if not project:
                project_id = str(uuid.uuid4())
                await db.projects.insert_one({"id": project_id, "name": current_project, "customerId": customer_id})
            else:
                project_id = project["id"]
            
            entry = {
                "id": str(uuid.uuid4()),
                "batchId": batch_id,
                "projectId": project_id,
                "customerId": customer_id,
                "employeeName": employee or "Unknown",
                "date": datum_val.isoformat() if hasattr(datum_val, 'isoformat') else str(datum_val),
                "hours": hours,
                "tariff": str(tariff) if tariff else "N/A",
                "notes": str(notes) if notes else "",
                "value": value
            }
            entries.append(entry)
        
        if entries:
            await db.timeEntries.insert_many(entries)
        
        return {"batchId": batch_id, "rowCount": len(entries)}
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============ INVOICE ENDPOINTS ============
@api_router.post("/invoices/compose")
async def compose_invoices(batchId: str, current_user: User = Depends(get_current_user)):
    batch = await db.importBatches.find_one({"id": batchId})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get all time entries
    entries = await db.timeEntries.find({"batchId": batchId}).to_list(10000)
    
    # Group by customer
    customer_groups = defaultdict(list)
    for entry in entries:
        customer_groups[entry["customerId"]].append(entry)
    
    # Create invoices
    invoice_ids = []
    for customer_id, customer_entries in customer_groups.items():
        customer = await db.customers.find_one({"id": customer_id})
        
        invoice_id = str(uuid.uuid4())
        invoice_doc = {
            "id": invoice_id,
            "customerId": customer_id,
            "customerName": customer["name"],
            "invoiceDate": batch["invoiceDate"],
            "periodFrom": batch["periodFrom"],
            "periodTo": batch["periodTo"],
            "dueDate": batch["dueDate"],
            "status": "draft",
            "total": sum(e["value"] for e in customer_entries),
            "createdAt": datetime.now(timezone.utc).isoformat()
        }
        await db.invoices.insert_one(invoice_doc)
        
        # Create invoice lines
        lines = []
        for entry in customer_entries:
            line_id = str(uuid.uuid4())
            project = await db.projects.find_one({"id": entry["projectId"]})
            
            line_doc = {
                "id": line_id,
                "invoiceId": invoice_id,
                "description": f"{project['name']} - {entry['employeeName']} - {entry['notes'] or ''}",
                "quantity": entry["hours"],
                "unitPrice": entry["value"] / entry["hours"] if entry["hours"] > 0 else 0,
                "amount": entry["value"],
                "taxCode": None
            }
            lines.append(line_doc)
        
        if lines:
            await db.invoiceLines.insert_many(lines)
        
        invoice_ids.append(invoice_id)
    
    return {"invoiceIds": invoice_ids}

@api_router.get("/invoices/{invoice_id}", response_model=Dict[str, Any])
async def get_invoice(invoice_id: str, current_user: User = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    lines = await db.invoiceLines.find({"invoiceId": invoice_id}, {"_id": 0}).to_list(1000)
    
    return {"invoice": invoice, "lines": lines}

@api_router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, update: InvoiceUpdate, current_user: User = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Update invoice number if provided
    if update.number:
        await db.invoices.update_one({"id": invoice_id}, {"$set": {"number": update.number}})
    
    # Update lines and recalculate amounts
    await db.invoiceLines.delete_many({"invoiceId": invoice_id})
    
    total = 0
    for line_data in update.lines:
        line_id = line_data.get("id") or str(uuid.uuid4())
        amount = line_data["quantity"] * line_data["unitPrice"]
        total += amount
        
        line_doc = {
            "id": line_id,
            "invoiceId": invoice_id,
            "description": line_data["description"],
            "quantity": line_data["quantity"],
            "unitPrice": line_data["unitPrice"],
            "amount": amount,
            "taxCode": line_data.get("taxCode")
        }
        await db.invoiceLines.insert_one(line_doc)
    
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"total": total}})
    
    return {"message": "Invoice updated"}

@api_router.post("/invoices/{invoice_id}/post")
async def post_invoice(invoice_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin role required")
    
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if ERACUNI_MODE == "stub":
        external_number = f"ER-STUB-{int(datetime.now(timezone.utc).timestamp())}"
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {"status": "posted", "externalNumber": external_number}}
        )
        
        # Audit event
        await db.auditEvents.insert_one({
            "id": str(uuid.uuid4()),
            "actorId": current_user.email,
            "action": "post_invoice",
            "entity": "Invoice",
            "entityId": invoice_id,
            "at": datetime.now(timezone.utc).isoformat()
        })
        
        return {"externalNumber": external_number, "status": "posted"}
    else:
        raise HTTPException(status_code=501, detail="Real eRačuni integration not implemented yet")

@api_router.get("/invoices")
async def list_invoices(current_user: User = Depends(get_current_user)):
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(1000)
    return invoices

# ============ AI ENDPOINTS ============
@api_router.post("/ai/suggest")
async def ai_suggest(request: AIRequest, current_user: User = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        return {"suggestion": request.text, "message": "AI not configured"}
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"ai-{current_user.email}",
            system_message="You are an AI assistant for invoice processing."
        ).with_model("openai", "gpt-4o-mini")
        
        prompts = {
            "grammar": f"Fix grammar and spelling errors in this invoice text, return only the corrected text: {request.text}",
            "fraud": f"Analyze this invoice description for potential fraud indicators: {request.text}. Return a brief risk assessment.",
            "gdpr": f"Identify and mask any personal data (names, emails, IDs) in this text: {request.text}. Return the masked version."
        }
        
        message = UserMessage(text=prompts.get(request.feature, request.text))
        response = await chat.send_message(message)
        
        return {"suggestion": response, "original": request.text}
    except Exception as e:
        return {"suggestion": request.text, "message": f"AI error: {str(e)}"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()