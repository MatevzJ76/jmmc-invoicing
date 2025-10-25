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

class AISettings(BaseModel):
    aiProvider: str = "emergent"
    customApiKey: Optional[str] = None
    customModel: str = "gpt-4o"
    grammarPrompt: str = "Fix grammar and spelling errors in this invoice text. Return only the corrected text without explanations."
    fraudPrompt: str = "Analyze this invoice description for potential fraud indicators or suspicious patterns. Provide a brief risk assessment."
    gdprPrompt: str = "Identify and mask any personal data (names, emails, phone numbers, addresses) in this text. Return the masked version with [REDACTED] in place of sensitive data."
    verificationPrompt: str = "Analyze this work description for suspicious patterns, irregularities, or fraud indicators. Look for: vague descriptions, unusual time patterns, duplicate entries, inconsistent work details. If suspicious, respond with JSON: {\"flagged\": true, \"reason\": \"brief explanation\"}. If normal, respond with: {\"flagged\": false, \"reason\": \"\"}"

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
    title: str = Form(...),
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
            "title": title,
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
        
        # Parse rows - Stranka (customer) appears on each data row, not as section headers
        entries = []
        current_project = "General"
        
        for row in sheet.iter_rows(min_row=2, values_only=True):
            # Skip completely empty rows
            if not row or all(cell is None or cell == '' for cell in row):
                continue
            
            # Handle rows with leading # column (row numbers)
            if row[0] and (str(row[0]).endswith('.') or row[0] == '#'):
                # Data row - skip # column
                row_data = row[1:11]
            else:
                row_data = row[0:10]
            
            # Extract values
            projekt_val = row_data[0]
            stranka_val = row_data[1]  # Customer name
            datum_val = row_data[2]    # Date
            tariff = row_data[3]
            employee = row_data[4]
            notes = row_data[5]
            hours_val = row_data[6]
            value_str = row_data[7]
            invoice_num = row_data[8]
            
            # Skip if no date (not a data row)
            if not datum_val:
                continue
            
            # Determine customer name - use Stranka if available, otherwise use current/general
            if stranka_val and str(stranka_val).strip():
                current_customer = str(stranka_val).strip()
            else:
                current_customer = "General"
            
            # Update project if specified
            if projekt_val and str(projekt_val).strip():
                current_project = str(projekt_val).strip()
            
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
@api_router.get("/batches")
async def list_batches(current_user: User = Depends(get_current_user)):
    """Get all import batches with invoice counts"""
    batches = await db.importBatches.find({}, {"_id": 0}).to_list(1000)
    
    # Add invoice count for each batch
    for batch in batches:
        invoice_count = await db.invoices.count_documents({"batchId": batch.get("id")})
        batch["invoiceCount"] = invoice_count
    
    return batches

@api_router.get("/batches/{batch_id}")
async def get_batch(batch_id: str, current_user: User = Depends(get_current_user)):
    """Get batch details"""
    batch = await db.importBatches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch

@api_router.get("/batches/{batch_id}/invoices")
async def get_batch_invoices(batch_id: str, current_user: User = Depends(get_current_user)):
    """Get all invoices for a specific batch"""
    invoices = await db.invoices.find({"batchId": batch_id}, {"_id": 0}).to_list(1000)
    return invoices

@api_router.get("/batches/{batch_id}/verification")
async def get_batch_verification(batch_id: str, current_user: User = Depends(get_current_user)):
    """Get verification data for specific clients and no-client entries"""
    batch = await db.importBatches.find_one({"id": batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get all time entries for this batch
    all_entries = await db.timeEntries.find({"batchId": batch_id}, {"_id": 0}).to_list(10000)
    
    # Get customer names for each entry
    jmmc_hp_entries = []
    jmmc_finance_entries = []
    no_client_entries = []
    
    for entry in all_entries:
        # Get customer name
        customer = await db.customers.find_one({"id": entry["customerId"]})
        customer_name = customer["name"] if customer else ""
        
        # Categorize entries
        if "JMMC HP d.o.o." in customer_name:
            jmmc_hp_entries.append(entry)
        elif "JMMC Finance d.o.o." in customer_name:
            jmmc_finance_entries.append(entry)
        elif not customer_name or customer_name.strip() == "" or customer_name == "General":
            no_client_entries.append(entry)
    
    return {
        "jmmcHP": jmmc_hp_entries,
        "jmmcFinance": jmmc_finance_entries,
        "noClient": no_client_entries
    }

@api_router.post("/batches/{batch_id}/verify-entries")
async def verify_batch_entries(batch_id: str, current_user: User = Depends(get_current_user)):
    """Run AI verification on time entry descriptions using batch processing"""
    import json
    import asyncio
    
    # Get user's AI settings
    user_settings = await db.aiSettings.find_one({"userId": current_user.email})
    
    if not user_settings:
        user_settings = AISettings().model_dump()
    
    # Determine API key and model
    if user_settings.get("aiProvider") == "custom" and user_settings.get("customApiKey"):
        api_key = user_settings["customApiKey"]
        model = user_settings.get("customModel", "gpt-4o")
    else:
        if not EMERGENT_LLM_KEY:
            return {"results": {}, "message": "AI not configured"}
        api_key = EMERGENT_LLM_KEY
        model = "gpt-4o-mini"
    
    # Get all time entries for this batch
    all_entries = await db.timeEntries.find({"batchId": batch_id}, {"_id": 0}).to_list(10000)
    
    if not all_entries:
        return {"results": {}, "message": "No entries found"}
    
    # Limit total entries to prevent blocking (check all entries, not just those with descriptions)
    MAX_ENTRIES = 50  # Limit to 50 entries to prevent long blocking
    entries_to_check = all_entries
    if len(entries_to_check) > MAX_ENTRIES:
        entries_to_check = entries_to_check[:MAX_ENTRIES]
        logger.info(f"Limited verification to {MAX_ENTRIES} entries out of {len(all_entries)}")
    
    if not entries_to_check:
        return {"results": {}, "message": "No entries with descriptions to check"}
    
    verification_prompt = user_settings.get("verificationPrompt", 
        "Analyze this work description for suspicious patterns. If no description is provided or it's empty/vague, flag it as suspicious. If suspicious, respond with JSON: {\"flagged\": true, \"reason\": \"brief explanation\"}. If normal: {\"flagged\": false, \"reason\": \"\"}")
    
    try:
        # Use batch processing - combine multiple entries into one prompt
        batch_size = 10  # Process 10 entries per API call
        results = {}
        total_batches = (len(entries_to_check) + batch_size - 1) // batch_size
        
        logger.info(f"Starting verification of {len(entries_to_check)} entries in {total_batches} batches")
        
        for i in range(0, len(entries_to_check), batch_size):
            batch = entries_to_check[i:i + batch_size]
            
            # Create a batch prompt
            batch_text = "Analyze the following work entries and return a JSON array with results for each entry. Format: [{\"entry_id\": \"id1\", \"flagged\": true/false, \"reason\": \"explanation\"}]\n\n"
            batch_text += "Entries to analyze:\n"
            
            for idx, entry in enumerate(batch):
                batch_text += f"\n{idx + 1}. Entry ID: {entry.get('id')}\n"
                batch_text += f"   Description: {entry.get('notes', '')}\n"
                batch_text += f"   Employee: {entry.get('employeeName', 'N/A')}\n"
                batch_text += f"   Hours: {entry.get('hours', 0)}\n"
                batch_text += f"   Date: {entry.get('date', 'N/A')}\n"
            
            batch_text += f"\n{verification_prompt}"
            
            # Make single API call for batch with timeout
            try:
                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"verification-{current_user.email}-{i}",
                    system_message="You are an AI assistant for invoice verification. Always respond with valid JSON array."
                ).with_model("openai", model)
                
                message = UserMessage(text=batch_text)
                
                # Add timeout to prevent hanging
                response = await asyncio.wait_for(
                    chat.send_message(message),
                    timeout=30.0  # 30 second timeout per batch
                )
                
                # Parse batch response
                try:
                    clean_response = response.strip()
                    if clean_response.startswith("```"):
                        clean_response = clean_response.split("```")[1]
                        if clean_response.startswith("json"):
                            clean_response = clean_response[4:]
                    clean_response = clean_response.strip()
                    
                    batch_results = json.loads(clean_response)
                    
                    # Process batch results
                    for result in batch_results:
                        if isinstance(result, dict) and result.get("flagged", False):
                            entry_id = result.get("entry_id")
                            if entry_id:
                                results[entry_id] = {
                                    "flagged": True,
                                    "reason": result.get("reason", "Suspicious activity detected")
                                }
                except (json.JSONDecodeError, TypeError) as e:
                    # If batch fails, continue to next batch
                    logger.warning(f"Failed to parse batch {i}: {str(e)}")
                    continue
                    
            except asyncio.TimeoutError:
                logger.warning(f"Batch {i} timed out after 30 seconds")
                continue
        
        logger.info(f"Verification complete: {len(results)} flagged out of {len(entries_to_check)}")
        return {"results": results, "total_checked": len(entries_to_check), "flagged_count": len(results)}
        
    except Exception as e:
        logger.error(f"AI verification error: {str(e)}")
        return {"results": {}, "message": f"AI verification error: {str(e)}"}

@api_router.put("/batches/{batch_id}")
async def update_batch(batch_id: str, update_data: dict, current_user: User = Depends(get_current_user)):
    """Update batch details"""
    batch = await db.importBatches.find_one({"id": batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Update allowed fields
    allowed_fields = ["title", "invoiceDate", "periodFrom", "periodTo", "dueDate", "status"]
    update_fields = {k: v for k, v in update_data.items() if k in allowed_fields}
    
    if update_fields:
        await db.importBatches.update_one(
            {"id": batch_id},
            {"$set": update_fields}
        )
        
        # Update all invoices in this batch with new dates if changed
        if any(k in update_fields for k in ["invoiceDate", "periodFrom", "periodTo", "dueDate"]):
            invoice_updates = {}
            if "invoiceDate" in update_fields:
                invoice_updates["invoiceDate"] = update_fields["invoiceDate"]
            if "periodFrom" in update_fields:
                invoice_updates["periodFrom"] = update_fields["periodFrom"]
            if "periodTo" in update_fields:
                invoice_updates["periodTo"] = update_fields["periodTo"]
            if "dueDate" in update_fields:
                invoice_updates["dueDate"] = update_fields["dueDate"]
            
            if invoice_updates:
                await db.invoices.update_many(
                    {"batchId": batch_id},
                    {"$set": invoice_updates}
                )
    
    return {"message": "Batch updated successfully"}

@api_router.post("/batches/{batch_id}/archive")
async def archive_batch(batch_id: str, current_user: User = Depends(get_current_user)):
    """Archive a batch"""
    batch = await db.importBatches.find_one({"id": batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    await db.importBatches.update_one(
        {"id": batch_id},
        {"$set": {"status": "archived"}}
    )
    
    # Audit event
    await db.auditEvents.insert_one({
        "id": str(uuid.uuid4()),
        "actorId": current_user.email,
        "action": "archive_batch",
        "entity": "Batch",
        "entityId": batch_id,
        "at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Batch archived successfully"}

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
            "batchId": batchId,
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
    
    # Update batch status
    await db.importBatches.update_one(
        {"id": batchId},
        {"$set": {"status": "composed"}}
    )
    
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
@api_router.get("/settings/ai")
async def get_ai_settings(current_user: User = Depends(get_current_user)):
    """Get AI settings for current user"""
    settings = await db.aiSettings.find_one({"userId": current_user.email})
    if not settings:
        # Return default settings
        default_settings = AISettings()
        return default_settings.model_dump()
    
    return {k: v for k, v in settings.items() if k != "_id" and k != "userId"}

@api_router.post("/settings/ai")
async def save_ai_settings(settings: AISettings, current_user: User = Depends(get_current_user)):
    """Save AI settings for current user"""
    settings_dict = settings.model_dump()
    settings_dict["userId"] = current_user.email
    settings_dict["updatedAt"] = datetime.now(timezone.utc).isoformat()
    
    await db.aiSettings.update_one(
        {"userId": current_user.email},
        {"$set": settings_dict},
        upsert=True
    )
    
    return {"message": "Settings saved successfully"}

@api_router.post("/settings/ai/test")
async def test_ai_connection(settings: AISettings, current_user: User = Depends(get_current_user)):
    """Test AI connection with provided settings"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        if settings.aiProvider == "emergent":
            if not EMERGENT_LLM_KEY:
                raise HTTPException(status_code=400, detail="Emergent LLM key not configured")
            
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"test-{current_user.email}",
                system_message="You are a test assistant."
            ).with_model("openai", "gpt-4o-mini")
            
        else:  # custom
            if not settings.customApiKey:
                raise HTTPException(status_code=400, detail="Custom API key required")
            
            chat = LlmChat(
                api_key=settings.customApiKey,
                session_id=f"test-{current_user.email}",
                system_message="You are a test assistant."
            ).with_model("openai", settings.customModel)
        
        # Send test message
        message = UserMessage(text="Hello, this is a connection test. Please respond with 'OK'.")
        response = await chat.send_message(message)
        
        return {"message": f"Connection successful! AI responded: {response[:50]}..."}
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")

@api_router.post("/ai/suggest")
async def ai_suggest(request: AIRequest, current_user: User = Depends(get_current_user)):
    # Get user's AI settings
    user_settings = await db.aiSettings.find_one({"userId": current_user.email})
    
    if not user_settings:
        user_settings = AISettings().model_dump()
    
    # Determine API key and model
    if user_settings.get("aiProvider") == "custom" and user_settings.get("customApiKey"):
        api_key = user_settings["customApiKey"]
        model = user_settings.get("customModel", "gpt-4o")
    else:
        if not EMERGENT_LLM_KEY:
            return {"suggestion": request.text, "message": "AI not configured"}
        api_key = EMERGENT_LLM_KEY
        model = "gpt-4o-mini"
    
    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"ai-{current_user.email}",
            system_message="You are an AI assistant for invoice processing."
        ).with_model("openai", model)
        
        # Get custom prompts
        prompts = {
            "grammar": user_settings.get("grammarPrompt", f"Fix grammar and spelling errors in this invoice text, return only the corrected text: {request.text}"),
            "fraud": user_settings.get("fraudPrompt", f"Analyze this invoice description for potential fraud indicators: {request.text}. Return a brief risk assessment."),
            "gdpr": user_settings.get("gdprPrompt", f"Identify and mask any personal data (names, emails, IDs) in this text: {request.text}. Return the masked version.")
        }
        
        # Format prompt with text
        base_prompt = prompts.get(request.feature, request.text)
        if "{text}" in base_prompt:
            prompt_text = base_prompt.replace("{text}", request.text)
        else:
            prompt_text = f"{base_prompt}\n\nText: {request.text}"
        
        message = UserMessage(text=prompt_text)
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