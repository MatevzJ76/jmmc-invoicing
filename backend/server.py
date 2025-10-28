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
    invoiceDate: Optional[str] = None
    dueDate: Optional[str] = None
    periodFrom: Optional[str] = None
    periodTo: Optional[str] = None
    lines: List[Dict[str, Any]]

class AIRequest(BaseModel):
    text: str
    feature: str  # grammar, fraud, gdpr

class AISettings(BaseModel):
    aiProvider: str = "emergent"
    customApiKey: Optional[str] = None
    customModel: str = "gpt-5"
    grammarPrompt: str = "Fix grammar and spelling errors in this invoice text. Return only the corrected text without explanations."
    fraudPrompt: str = "Analyze this invoice description for potential fraud indicators or suspicious patterns. Provide a brief risk assessment."
    gdprPrompt: str = "Identify and mask any personal data (names, emails, phone numbers, addresses) in this text. Return the masked version with [REDACTED] in place of sensitive data."
    verificationPrompt: str = "Analyze this work description for suspicious patterns, irregularities, or fraud indicators. Look for: vague descriptions, unusual time patterns, duplicate entries, inconsistent work details, or missing descriptions. If suspicious, respond with JSON: {\"flagged\": true, \"reason\": \"brief explanation\"}. If normal, respond with: {\"flagged\": false, \"reason\": \"\"}"
    eracuniEndpoint: Optional[str] = "https://e-racuni.com/WebServicesSI/API"
    eracuniUsername: Optional[str] = None
    eracuniSecretKey: Optional[str] = None
    eracuniToken: Optional[str] = None
    testPrompt: Optional[str] = None  # For testing AI connection quality

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
                hours_raw = float(str(hours_val).replace(',', '.')) if hours_val else 0.0
                # Round to 2 decimal places to avoid floating-point precision issues
                hours = round(hours_raw, 2)
            except:
                hours = 0.0
            
            # Parse value (handle comma as decimal separator)
            try:
                value_raw = float(str(value_str).replace(',', '.')) if value_str else 0.0
                # Round to 2 decimal places for currency
                value = round(value_raw, 2)
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
    
    # Get customer names and project names for each entry
    jmmc_hp_entries = []
    jmmc_finance_entries = []
    no_client_entries = []
    extra_entries = []
    
    for entry in all_entries:
        # Get customer name
        customer = await db.customers.find_one({"id": entry["customerId"]})
        customer_name = customer["name"] if customer else ""
        
        # Get tariff value
        tariff_value = entry.get("tariff", "")
        
        # Categorize entries
        if "JMMC HP d.o.o." in customer_name:
            jmmc_hp_entries.append(entry)
        elif "JMMC Finance d.o.o." in customer_name:
            jmmc_finance_entries.append(entry)
        elif (not customer_name or customer_name.strip() == "" or customer_name == "General") and tariff_value == "999 - EXTRA":
            # EXTRA category: no client and tariff is "999 - EXTRA"
            extra_entries.append(entry)
        elif not customer_name or customer_name.strip() == "" or customer_name == "General":
            # No client category (excluding EXTRA entries)
            no_client_entries.append(entry)
    
    return {
        "jmmcHP": jmmc_hp_entries,
        "jmmcFinance": jmmc_finance_entries,
        "noClient": no_client_entries,
        "extra": extra_entries

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
        model = user_settings.get("customModel", "gpt-5")
    else:
        if not EMERGENT_LLM_KEY:
            return {"results": {}, "message": "AI not configured"}
        api_key = EMERGENT_LLM_KEY
        model = "gpt-5"
    
    # Get entries specifically from verification categories (JMMC HP, JMMC Finance, No Client)
    # This ensures we verify the entries the user actually sees in the UI
    all_entries = await db.timeEntries.find({"batchId": batch_id}, {"_id": 0}).to_list(10000)
    
    if not all_entries:
        return {"results": {}, "message": "No entries found"}
    
    # Categorize to match what user sees in verification tile
    verification_entries = []
    for entry in all_entries:
        customer = await db.customers.find_one({"id": entry["customerId"]})
        customer_name = customer["name"] if customer else ""
        
        # Only include entries from the three verification categories
        if ("JMMC HP d.o.o." in customer_name or 
            "JMMC Finance d.o.o." in customer_name or 
            not customer_name or customer_name.strip() == "" or customer_name == "General"):
            verification_entries.append(entry)
    
    #  Limit to prevent long processing
    MAX_ENTRIES = 50
    if len(verification_entries) > MAX_ENTRIES:
        entries_to_check = verification_entries[:MAX_ENTRIES]
        logger.info(f"Limited to {MAX_ENTRIES} of {len(verification_entries)} verification entries")
    else:
        entries_to_check = verification_entries
        logger.info(f"Verifying all {len(verification_entries)} verification entries")
    
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
                description = entry.get('notes', '') or '(No description provided)'
                hours_value = entry.get('hours', 0)
                # Round hours to 2 decimals for cleaner AI output
                hours_rounded = round(float(hours_value), 2) if hours_value else 0
                batch_text += f"\n{idx + 1}. Entry ID: {entry.get('id')}\n"
                batch_text += f"   Description: {description}\n"
                batch_text += f"   Employee: {entry.get('employeeName', 'N/A')}\n"
                batch_text += f"   Hours: {hours_rounded}\n"
                batch_text += f"   Date: {entry.get('date', 'N/A')}\n"
            
            batch_text += f"\n{verification_prompt}"
            
            # Make single API call for batch with timeout
            try:
                # Determine provider based on model
                if "claude" in model.lower():
                    provider = "anthropic"
                elif "gemini" in model.lower():
                    provider = "google"
                else:
                    provider = "openai"
                
                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"verification-{current_user.email}-{i}",
                    system_message="You are an AI assistant for invoice verification. Always respond with valid JSON array."
                ).with_model(provider, model)
                
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


# ============ COMPANIES ============
@api_router.get("/companies")
async def get_all_companies(current_user: User = Depends(get_current_user)):
    """Get all companies - ensure only JMMC HP d.o.o. and JMMC Finance d.o.o. exist"""
    
    # Define the two official companies
    official_companies = [
        {"name": "JMMC HP d.o.o."},
        {"name": "JMMC Finance d.o.o."}
    ]
    
    # Check if official companies exist
    existing_companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
    
    # Get or create each official company
    final_companies = []
    for official in official_companies:
        company = await db.companies.find_one({"name": official["name"]})
        if not company:
            # Create the official company
            company_id = str(uuid.uuid4())
            company = {
                "id": company_id,
                "name": official["name"]
            }
            await db.companies.insert_one(company)
            logger.info(f"Created official company: {official['name']}")
        final_companies.append({"id": company["id"], "name": company["name"]})
    
    # Sort by name
    final_companies.sort(key=lambda x: x.get("name", "").lower())
    return final_companies

# ============ CUSTOMERS ============
@api_router.post("/customers")
async def create_customer(
    customer_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Create a new customer manually"""
    # Generate unique ID
    customer_id = str(uuid.uuid4())
    
    # Build customer object
    new_customer = {
        "id": customer_id,
        "name": customer_data.get("name", "").strip(),
        "unitPrice": float(customer_data.get("unitPrice", 0)),
        "historicalInvoices": []
    }
    
    # Add company if provided
    if customer_data.get("companyId"):
        new_customer["companyId"] = customer_data["companyId"]
    
    # Check if customer with same name already exists
    existing = await db.customers.find_one({"name": new_customer["name"]})
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this name already exists")
    
    # Insert into database
    await db.customers.insert_one(new_customer)
    
    return {"message": "Customer created successfully", "customerId": customer_id}

@api_router.get("/customers")
async def get_all_customers(company_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Get all customers from database with statistics from historical data"""
    # Build query filter
    query = {}
    if company_id:
        query["companyId"] = company_id
    
    customers = await db.customers.find(query, {"_id": 0}).to_list(10000)
    
    # Add statistics for each customer based on historical data only
    for customer in customers:
        historical_invoices = customer.get("historicalInvoices", [])
        
        # Calculate statistics from historical data
        total_amount = sum(inv.get("amount", 0) for inv in historical_invoices)
        invoice_count = len(historical_invoices)
        
        customer["invoiceCount"] = invoice_count
        customer["totalInvoiced"] = total_amount
        customer["averageInvoice"] = total_amount / invoice_count if invoice_count > 0 else 0
        customer["unitPrice"] = customer.get("unitPrice", 0)
        
        # Add company name if customer has companyId
        if customer.get("companyId"):
            company = await db.companies.find_one({"id": customer["companyId"]}, {"_id": 0})
            customer["companyName"] = company.get("name", "") if company else ""
        else:
            customer["companyName"] = ""
    
    # Sort by name A-Z
    customers.sort(key=lambda x: x.get("name", "").lower())
    
    return customers

@api_router.get("/customers/{customer_id}")
async def get_customer_detail(customer_id: str, current_user: User = Depends(get_current_user)):
    """Get detailed customer information with historical invoices from uploaded data"""
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Get all historical invoices from uploaded data (sorted by date descending)
    historical_invoices = customer.get("historicalInvoices", [])
    
    # Filter to only show entries with individualRows (new format) OR manual entries
    # This removes old plain entries without expandable details
    historical_invoices = [
        inv for inv in historical_invoices 
        if inv.get("individualRows") or inv.get("source") == "manual"
    ]
    
    # Sort by date descending (show all, no limit)
    if historical_invoices:
        # Add unique IDs to each historical invoice for deletion
        for idx, inv in enumerate(historical_invoices):
            if "id" not in inv:
                inv["id"] = f"hist_{idx}_{inv.get('date', '')}_{inv.get('amount', 0)}"
        
        historical_invoices.sort(key=lambda x: x.get("date", ""), reverse=True)
        # No limit - show all periods
    
    # Calculate statistics from all historical data (including old format)
    all_historical = customer.get("historicalInvoices", [])
    total_amount = sum(inv.get("amount", 0) for inv in all_historical)
    invoice_count = len(all_historical)
    
    customer["lastInvoices"] = historical_invoices
    customer["invoiceCount"] = invoice_count
    customer["totalInvoiced"] = total_amount
    customer["averageInvoice"] = total_amount / invoice_count if invoice_count > 0 else 0
    customer["unitPrice"] = customer.get("unitPrice", 0)
    customer["historicalInvoices"] = customer.get("historicalInvoices", [])
    
    # Add company name if customer has companyId
    if customer.get("companyId"):
        company = await db.companies.find_one({"id": customer["companyId"]}, {"_id": 0})
        customer["companyName"] = company.get("name", "") if company else ""
    else:
        customer["companyName"] = ""
    
    return customer

@api_router.delete("/customers/{customer_id}/historical/{invoice_index}")
async def delete_historical_invoice(
    customer_id: str,
    invoice_index: int,
    current_user: User = Depends(get_current_user)
):
    """Delete a historical invoice entry"""
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    historical_invoices = customer.get("historicalInvoices", [])
    
    if 0 <= invoice_index < len(historical_invoices):
        historical_invoices.pop(invoice_index)
        
        await db.customers.update_one(
            {"id": customer_id},
            {"$set": {"historicalInvoices": historical_invoices}}
        )
        
        return {"message": "Historical invoice deleted successfully"}
    else:
        raise HTTPException(status_code=404, detail="Historical invoice not found")

@api_router.put("/customers/{customer_id}")
async def update_customer(
    customer_id: str, 
    update_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Update customer information (unit price, company)"""
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Only allow updating specific fields
    allowed_fields = ["unitPrice", "companyId"]
    update_fields = {k: v for k, v in update_data.items() if k in allowed_fields}
    
    if update_fields:
        await db.customers.update_one(
            {"id": customer_id},
            {"$set": update_fields}
        )
    
    return {"message": "Customer updated successfully"}

@api_router.post("/customers/{customer_id}/add-manual-entry")
async def add_manual_historical_entry(
    customer_id: str,
    entry_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Manually add a historical invoice entry"""
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Create manual entry
    manual_entry = {
        "date": entry_data.get("date"),
        "description": entry_data.get("description", ""),
        "amount": float(entry_data.get("amount", 0)),
        "source": "manual",
        "individualRows": []  # Manual entries don't have sub-rows
    }
    
    # Add to historical invoices
    existing_history = customer.get("historicalInvoices", [])
    existing_history.append(manual_entry)
    
    await db.customers.update_one(
        {"id": customer_id},
        {"$set": {"historicalInvoices": existing_history}}
    )
    
    return {"message": "Manual entry added successfully"}

@api_router.post("/customers/upload-history")
async def upload_customer_history(
    file: UploadFile = File(...),
    customer_ids: str = Form(None),  # Comma-separated customer IDs, or "all"
    current_user: User = Depends(get_current_user)
):
    """Upload historical invoice data from XLSX/XLS file"""
    import openpyxl
    import uuid
    from io import BytesIO
    from datetime import datetime
    
    try:
        contents = await file.read()
        wb = openpyxl.load_workbook(BytesIO(contents))
        sheet = wb.active
        
        # Check for company name in metadata format (Row 3: "Podjetje: JMMC HP d.o.o.")
        company_name_from_metadata = None
        for row_num in range(1, min(10, sheet.max_row + 1)):
            row_values = [cell.value for cell in sheet[row_num]]
            # Look for "Podjetje:" in first column
            if row_values and row_values[0] and 'podjetje:' in str(row_values[0]).lower():
                # Company name is usually in the next column
                if len(row_values) > 1 and row_values[1]:
                    company_name_from_metadata = str(row_values[1]).strip()
                    logger.info(f"Found company in metadata: {company_name_from_metadata}")
                break
        
        # Find the header row (look for row containing multiple key headers)
        header_row_num = 1
        headers = None
        for row_num in range(1, min(20, sheet.max_row + 1)):  # Check first 20 rows
            row_values = [cell.value for cell in sheet[row_num]]
            # Count how many key columns are present
            key_columns_found = 0
            if any(cell and 'poz' in str(cell).lower() and len(str(cell).strip()) < 10 for cell in row_values):
                key_columns_found += 1
            if any(cell and 'kupec' in str(cell).lower() and 'kupec:' not in str(cell).lower() for cell in row_values):
                key_columns_found += 1
            if any(cell and 'dat.dok' in str(cell).lower() for cell in row_values):
                key_columns_found += 1
            if any(cell and 'znesek eur' in str(cell).lower() for cell in row_values):
                key_columns_found += 1
            
            # If we found 3+ key columns, this is likely the header row
            if key_columns_found >= 3:
                headers = row_values
                header_row_num = row_num
                logger.info(f"Found header row at line {row_num} with {key_columns_found} key columns")
                break
        
        if not headers:
            raise HTTPException(status_code=400, detail="Could not find header row. Please ensure XLSX has proper headers.")
        
        logger.info(f"Headers found at row {header_row_num}: {headers}")
        
        # Map column names to indices
        col_map = {}
        for idx, header in enumerate(headers):
            if header:
                header_lower = str(header).lower().strip()
                if 'kupec' in header_lower:
                    col_map['customer'] = idx
                elif 'dat.dok' in header_lower or 'datum dokumenta' in header_lower:
                    col_map['date'] = idx
                elif 'naziv artikla' in header_lower:
                    col_map['description'] = idx
                elif 'opis artikla' in header_lower and 'description' not in col_map:
                    col_map['alt_description'] = idx
                elif 'znesek eur' in header_lower:
                    col_map['amount'] = idx
                elif 'podjetje' in header_lower:
                    col_map['company'] = idx
                elif 'kol.' in header_lower or 'količina' in header_lower:
                    col_map['quantity'] = idx
                elif header_lower == 'em' or 'enota mere' in header_lower:
                    col_map['unit'] = idx
                elif 'cena' in header_lower and 'brez' not in header_lower:
                    col_map['unit_price'] = idx
        
        logger.info(f"Column mapping: {col_map}")
        
        # Extract data by month
        monthly_data = {}  # {customer_name: {month_key: {date, total_amount, descriptions[], company_name}}}
        
        for row in sheet.iter_rows(min_row=header_row_num + 1, values_only=True):
            if not row or all(cell is None or cell == '' for cell in row):
                continue
            
            # Extract values
            customer_name = row[col_map.get('customer')] if 'customer' in col_map else None
            date_val = row[col_map.get('date')] if 'date' in col_map else None
            description = row[col_map.get('description')] if 'description' in col_map else ""
            alt_description = row[col_map.get('alt_description')] if 'alt_description' in col_map else ""
            if not description:
                description = alt_description
            amount_val = row[col_map.get('amount')] if 'amount' in col_map else None
            company_name = row[col_map.get('company')] if 'company' in col_map else None
            
            # Extract additional columns
            quantity_val = row[col_map.get('quantity')] if 'quantity' in col_map else None
            unit_val = row[col_map.get('unit')] if 'unit' in col_map else None
            unit_price_val = row[col_map.get('unit_price')] if 'unit_price' in col_map else None
            
            if not customer_name or not date_val:
                continue
            
            customer_name = str(customer_name).strip()
            
            # Clean company name if present
            if company_name:
                company_name = str(company_name).strip()
            
            # Parse date
            date_str = ""
            if hasattr(date_val, 'isoformat'):
                date_obj = date_val
                date_str = date_val.isoformat()
            elif isinstance(date_val, str):
                try:
                    date_obj = datetime.strptime(date_val, '%Y-%m-%d')
                    date_str = date_val
                except:
                    continue
            else:
                continue
            
            # Get month key (YYYY-MM)
            month_key = f"{date_obj.year}-{str(date_obj.month).zfill(2)}"
            
            # Parse amount
            try:
                if isinstance(amount_val, (int, float)):
                    amount = float(amount_val)
                elif amount_val:
                    amount = float(str(amount_val).replace(',', '.'))
                else:
                    amount = 0.0
            except:
                amount = 0.0
            
            # Parse quantity
            try:
                if isinstance(quantity_val, (int, float)):
                    quantity = float(quantity_val)
                elif quantity_val:
                    quantity = float(str(quantity_val).replace(',', '.'))
                else:
                    quantity = None
            except:
                quantity = None
            
            # Parse unit price
            try:
                if isinstance(unit_price_val, (int, float)):
                    unit_price = float(unit_price_val)
                elif unit_price_val:
                    unit_price = float(str(unit_price_val).replace(',', '.'))
                else:
                    unit_price = None
            except:
                unit_price = None
            
            # Initialize customer data
            if customer_name not in monthly_data:
                monthly_data[customer_name] = {}
            
            # Initialize month data
            if month_key not in monthly_data[customer_name]:
                # Use company from column, or fall back to metadata company
                effective_company_name = company_name if company_name else company_name_from_metadata
                monthly_data[customer_name][month_key] = {
                    'date': date_str,
                    'month': month_key,
                    'total_amount': 0.0,
                    'descriptions': [],
                    'individual_rows': [],  # Store individual row details
                    'company_name': effective_company_name  # Store company name (from column or metadata)
                }
            
            # Accumulate data for the month
            monthly_data[customer_name][month_key]['total_amount'] += amount
            if description and str(description).strip():
                monthly_data[customer_name][month_key]['descriptions'].append(str(description).strip())
            
            # Store individual row with all details
            individual_row = {
                'date': date_str,
                'description': str(description).strip() if description else "",
                'detailedDescription': str(alt_description).strip() if alt_description else "",
                'amount': amount
            }
            
            # Add optional fields if available
            if quantity is not None:
                individual_row['quantity'] = quantity
            if unit_val:
                individual_row['unit'] = str(unit_val).strip()
            if unit_price is not None:
                individual_row['unitPrice'] = unit_price
            
            monthly_data[customer_name][month_key]['individual_rows'].append(individual_row)
        
        logger.info(f"Extracted data for {len(monthly_data)} customers")
        
        # Convert to historical invoice entries
        historical_entries_by_customer = {}
        for customer_name, months in monthly_data.items():
            entries = []
            for month_key, month_data in months.items():
                # Create a single entry per month with combined description
                unique_descriptions = list(set(month_data['descriptions']))
                combined_description = "; ".join(unique_descriptions[:5])  # Limit to 5 unique descriptions
                if len(unique_descriptions) > 5:
                    combined_description += f" (+{len(unique_descriptions) - 5} more)"
                
                entries.append({
                    "date": month_data['date'],
                    "month": month_key,
                    "description": combined_description,
                    "amount": round(month_data['total_amount'], 2),
                    "individualRows": month_data['individual_rows']  # Include individual row details
                })
            
            historical_entries_by_customer[customer_name] = entries
            logger.info(f"Customer '{customer_name}': {len(entries)} monthly entries")
        
        # Process customers: create if not exists, update historical data
        updated_count = 0
        created_count = 0
        total_entries = 0
        
        # Get all customer names from the uploaded data
        all_customer_names = list(historical_entries_by_customer.keys())
        
        # If filtering by specific customer_id (single customer upload from detail page)
        if customer_ids and customer_ids != "all":
            target_ids = [cid.strip() for cid in customer_ids.split(",")]
            
            # For single customer upload, apply ALL data from file to that customer
            if len(target_ids) == 1:
                target_customer = await db.customers.find_one({"id": target_ids[0]})
                if target_customer:
                    logger.info(f"Single customer upload mode: applying all data to {target_customer['name']}")
                    
                    # Extract company name from uploaded data
                    company_name_from_data = None
                    for customer_months in monthly_data.values():
                        for month_data in customer_months.values():
                            if month_data.get('company_name'):
                                company_name_from_data = month_data['company_name']
                                break
                        if company_name_from_data:
                            break
                    
                    # Update company if present in data
                    if company_name_from_data:
                        # Find or create company
                        company = await db.companies.find_one({"name": company_name_from_data})
                        if not company:
                            company_id = str(uuid.uuid4())
                            company = {
                                "id": company_id,
                                "name": company_name_from_data
                            }
                            await db.companies.insert_one(company)
                            logger.info(f"Created new company: {company_name_from_data}")
                        else:
                            company_id = company["id"]
                        
                        # Update customer's company
                        await db.customers.update_one(
                            {"id": target_customer["id"]},
                            {"$set": {"companyId": company_id}}
                        )
                        logger.info(f"Updated customer '{target_customer['name']}' with company: {company_name_from_data}")
                    
                    # Combine all entries from all customers in the file
                    all_new_entries = []
                    for entries in historical_entries_by_customer.values():
                        all_new_entries.extend(entries)
                    
                    # Mark as imported
                    for entry in all_new_entries:
                        entry["source"] = "imported"
                    
                    # Extract unit price from last "Računovodstvo" entry
                    unit_price_to_set = None
                    for entry in reversed(all_new_entries):  # Start from most recent
                        individual_rows = entry.get("individualRows", [])
                        for row in reversed(individual_rows):  # Most recent rows first
                            description = row.get("description", "").lower()
                            if "računovodstvo" in description or "racunovodstvo" in description:
                                if row.get("unitPrice") is not None:
                                    unit_price_to_set = row["unitPrice"]
                                    logger.info(f"Found Računovodstvo unit price: €{unit_price_to_set}")
                                    break
                        if unit_price_to_set is not None:
                            break
                    
                    # Keep only manual entries
                    existing_history = target_customer.get("historicalInvoices", [])
                    manual_entries = [entry for entry in existing_history if entry.get("source") == "manual"]
                    
                    # Combine manual + new imported
                    merged_history = manual_entries + all_new_entries
                    
                    # Prepare update data
                    update_data = {"historicalInvoices": merged_history}
                    if unit_price_to_set is not None:
                        update_data["unitPrice"] = unit_price_to_set
                        logger.info(f"Updating customer unit price to: €{unit_price_to_set}")
                    
                    # Update in database
                    await db.customers.update_one(
                        {"id": target_customer["id"]},
                        {"$set": update_data}
                    )
                    updated_count = 1
                    total_entries = len(all_new_entries)
                    
                    return {
                        "message": f"Historical data uploaded and grouped by month",
                        "customersUpdated": updated_count,
                        "customersCreated": 0,
                        "monthlyEntriesCreated": total_entries
                    }
        
        # For "all" mode or multiple customers, match by name
        for customer_name in all_customer_names:
            # Get company name from first month's data (they should all be the same)
            company_name_from_data = None
            first_month = list(historical_entries_by_customer[customer_name])[0] if historical_entries_by_customer[customer_name] else None
            if first_month:
                months = monthly_data.get(customer_name, {})
                for month_data in months.values():
                    if month_data.get('company_name'):
                        company_name_from_data = month_data['company_name']
                        break
            
            # Find or create company if company name exists
            company_id = None
            if company_name_from_data:
                # Check if company exists
                company = await db.companies.find_one({"name": company_name_from_data})
                if not company:
                    # Create company
                    company_id = str(uuid.uuid4())
                    company = {
                        "id": company_id,
                        "name": company_name_from_data
                    }
                    await db.companies.insert_one(company)
                    logger.info(f"Created new company: {company_name_from_data}")
                else:
                    company_id = company["id"]
                    logger.info(f"Found existing company: {company_name_from_data} (ID: {company_id})")
            
            # Check if customer exists
            customer = await db.customers.find_one({"name": customer_name})
            
            logger.info(f"Processing customer '{customer_name}' - Found in DB: {customer is not None}")
            
            # If filtering by specific customer_ids, skip if not in the list
            if customer_ids and customer_ids != "all":
                target_ids = [cid.strip() for cid in customer_ids.split(",")]
                logger.info(f"Filtering by customer IDs: {target_ids}")
                
                if customer and customer["id"] not in target_ids:
                    logger.info(f"Skipping {customer_name} - ID {customer['id']} not in target list")
                    continue
                elif not customer:
                    # Customer doesn't exist, but we're filtering by ID
                    # Check if we should create it anyway when uploading to "all"
                    logger.info(f"Customer '{customer_name}' not found in DB and filtering by IDs - skipping creation")
                    continue
            
            # Create customer if doesn't exist
            if not customer:
                customer_id = str(uuid.uuid4())
                customer = {
                    "id": customer_id,
                    "name": customer_name,
                    "unitPrice": 0,
                    "historicalInvoices": []
                }
                if company_id:
                    customer["companyId"] = company_id
                await db.customers.insert_one(customer)
                created_count += 1
                logger.info(f"Created new customer: {customer_name} with company: {company_name_from_data if company_id else 'None'}")
            else:
                # Update company if it exists in the data
                if company_id:
                    await db.customers.update_one(
                        {"id": customer["id"]},
                        {"$set": {"companyId": company_id}}
                    )
                    logger.info(f"Updated customer '{customer_name}' with company: {company_name_from_data}")
            
            # Update historical invoices - keep manual entries, replace imported ones
            existing_history = customer.get("historicalInvoices", [])
            new_entries = historical_entries_by_customer[customer_name]
            
            # Mark new entries as imported
            for entry in new_entries:
                entry["source"] = "imported"
            
            # Extract unit price from last "Računovodstvo" entry
            unit_price_to_set = None
            for entry in reversed(new_entries):  # Start from most recent
                individual_rows = entry.get("individualRows", [])
                for row in reversed(individual_rows):  # Most recent rows first
                    description = row.get("description", "").lower()
                    if "računovodstvo" in description or "racunovodstvo" in description:
                        if row.get("unitPrice") is not None:
                            unit_price_to_set = row["unitPrice"]
                            logger.info(f"Found Računovodstvo unit price for {customer_name}: €{unit_price_to_set}")
                            break
                if unit_price_to_set is not None:
                    break
            
            # Keep only manually entered rows from existing history
            manual_entries = [entry for entry in existing_history if entry.get("source") == "manual"]
            
            # Combine manual entries with new imported entries
            merged_history = manual_entries + new_entries
            
            # Prepare update data
            update_data = {"historicalInvoices": merged_history}
            if unit_price_to_set is not None:
                update_data["unitPrice"] = unit_price_to_set
                logger.info(f"Updating customer '{customer_name}' unit price to: €{unit_price_to_set}")
            
            # Update in database
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": update_data}
            )
            updated_count += 1
            total_entries += len(new_entries)
        
        return {
            "message": f"Historical data uploaded and grouped by month",
            "customersUpdated": updated_count,
            "customersCreated": created_count,
            "monthlyEntriesCreated": total_entries
        }
        
    except Exception as e:
        logger.error(f"Error uploading historical data: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

# ============ TIME ENTRIES ============
@api_router.post("/time-entries/{entry_id}/move-customer")
async def move_time_entry_to_customer(
    entry_id: str, 
    new_customer_id: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Move a time entry to a different customer"""
    logger.info(f"Move request: entry_id={entry_id}, new_customer_id={new_customer_id}")
    
    # Find the time entry
    entry = await db.timeEntries.find_one({"id": entry_id})
    if not entry:
        logger.error(f"Time entry not found: {entry_id}")
        raise HTTPException(status_code=404, detail="Time entry not found")
    
    old_customer_id = entry.get("customerId")
    logger.info(f"Found entry. Old customer: {old_customer_id}, New customer: {new_customer_id}")
    
    # Verify new customer exists
    new_customer = await db.customers.find_one({"id": new_customer_id})
    if not new_customer:
        logger.error(f"Target customer not found: {new_customer_id}")
        raise HTTPException(status_code=404, detail="Target customer not found")
    
    # Update the time entry
    result = await db.timeEntries.update_one(
        {"id": entry_id},
        {"$set": {"customerId": new_customer_id}}
    )
    logger.info(f"Time entry updated. Modified count: {result.modified_count}")
    
    # Find affected invoices and update them
    batch_id = entry.get("batchId")
    
    # Remove this entry from old customer's invoice lines in invoiceLines collection
    if old_customer_id:
        old_invoice = await db.invoices.find_one({
            "batchId": batch_id,
            "customerId": old_customer_id
        })
        
        if old_invoice:
            # Delete line from invoiceLines collection
            delete_result = await db.invoiceLines.delete_many({
                "invoiceId": old_invoice["id"],
                "timeEntryId": entry_id
            })
            
            # Recalculate total from remaining lines
            remaining_lines = await db.invoiceLines.find(
                {"invoiceId": old_invoice["id"]},
                {"_id": 0}
            ).to_list(1000)
            
            new_total = sum(line.get("amount", 0) for line in remaining_lines)
            
            await db.invoices.update_one(
                {"id": old_invoice["id"]},
                {"$set": {"total": new_total}}
            )
            logger.info(f"Removed {delete_result.deleted_count} line(s) from old invoice. New line count: {len(remaining_lines)}, New total: {new_total}")
    
    # Add to new customer's invoice or create if doesn't exist
    new_invoice = await db.invoices.find_one({
        "batchId": batch_id,
        "customerId": new_customer_id
    })
    
    # Get project info for the line description
    project = await db.projects.find_one({"id": entry.get("projectId")})
    project_name = project.get("name", "General") if project else "General"
    
    # Create new line item for this entry
    hours = entry.get("hours", 0)
    value = entry.get("value", 0)
    unit_price = (value / hours) if hours > 0 else 0
    
    new_line_id = str(uuid.uuid4())
    new_line_doc = {
        "id": new_line_id,
        "invoiceId": "",  # Will be set below
        "timeEntryId": entry_id,
        "description": f"{project_name} - {entry.get('employeeName', 'Unknown')} - {entry.get('notes', '')}",
        "quantity": hours,
        "unitPrice": unit_price,
        "amount": value,
        "taxCode": None
    }
    
    logger.info(f"Creating new line: hours={hours}, value={value}, unitPrice={unit_price}")
    
    if new_invoice:
        # Add line to existing invoice in invoiceLines collection
        new_line_doc["invoiceId"] = new_invoice["id"]
        await db.invoiceLines.insert_one(new_line_doc)
        
        # Recalculate total from all lines
        all_lines = await db.invoiceLines.find(
            {"invoiceId": new_invoice["id"]},
            {"_id": 0}
        ).to_list(1000)
        new_total = sum(line.get("amount", 0) for line in all_lines)
        
        await db.invoices.update_one(
            {"id": new_invoice["id"]},
            {"$set": {"total": new_total}}
        )
        logger.info(f"Added entry to existing invoice {new_invoice['id']}. New line count: {len(all_lines)}, New total: {new_total}")
    else:
        # Create new invoice for this customer
        batch = await db.importBatches.find_one({"id": batch_id})
        
        new_invoice_id = str(uuid.uuid4())
        await db.invoices.insert_one({
            "id": new_invoice_id,
            "batchId": batch_id,
            "customerId": new_customer_id,
            "customerName": new_customer.get("name", ""),
            "invoiceDate": batch.get("invoiceDate"),
            "dueDate": batch.get("dueDate"),
            "periodFrom": batch.get("periodFrom"),
            "periodTo": batch.get("periodTo"),
            "total": value,
            "status": "draft",
            "createdAt": datetime.now(timezone.utc).isoformat()
        })
        
        # Add line to invoiceLines collection
        new_line_doc["invoiceId"] = new_invoice_id
        await db.invoiceLines.insert_one(new_line_doc)
        
        logger.info(f"Created new invoice {new_invoice_id} for customer {new_customer.get('name')} with 1 line, total: {value}")
    

@api_router.post("/invoices/migrate-time-entry-ids")
async def migrate_time_entry_ids(current_user: User = Depends(get_current_user)):
    """Migration: Add timeEntryId to existing invoice lines"""
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Get all invoice lines
    all_lines = await db.invoiceLines.find({}, {"_id": 0}).to_list(100000)
    
    updated_count = 0
    for line in all_lines:
        # Skip if already has timeEntryId
        if line.get("timeEntryId"):
            continue
        
        # Try to find matching time entry based on description, quantity, and invoice
        invoice = await db.invoices.find_one({"id": line["invoiceId"]})
        if not invoice:
            continue
        
        batch_id = invoice.get("batchId")
        customer_id = invoice.get("customerId")
        
        # Find time entry that matches this line
        # Match by hours (quantity), customerId, and batchId
        matching_entry = await db.timeEntries.find_one({
            "batchId": batch_id,
            "customerId": customer_id,
            "hours": line.get("quantity", 0)
        })
        
        if matching_entry:
            # Update the line with timeEntryId
            await db.invoiceLines.update_one(
                {"id": line["id"]},
                {"$set": {"timeEntryId": matching_entry["id"]}}
            )
            updated_count += 1
    
    logger.info(f"Migration complete: Updated {updated_count} invoice lines with timeEntryId")
    return {"message": f"Updated {updated_count} invoice lines", "total_lines": len(all_lines)}


    # Audit event
    await db.auditEvents.insert_one({
        "id": str(uuid.uuid4()),
        "actorId": current_user.email,
        "action": "move_time_entry",
        "entity": "TimeEntry",
        "entityId": entry_id,
        "metadata": {
            "oldCustomerId": old_customer_id,
            "newCustomerId": new_customer_id
        },
        "at": datetime.now(timezone.utc).isoformat()
    })
    
    logger.info(f"Move complete: Entry {entry_id} moved from {old_customer_id} to {new_customer_id}")
    
    return {
        "message": "Time entry moved successfully",
        "oldCustomerId": old_customer_id,
        "newCustomerId": new_customer_id
    }


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
            "status": "imported",
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
                "timeEntryId": entry["id"],  # Add timeEntryId for move functionality
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
    
    # Update invoice header fields if provided
    header_updates = {}
    # Don't allow changing invoice number if already posted (set by e-računi)
    if update.number and invoice.get("status") != "posted":
        header_updates["number"] = update.number
    if update.invoiceDate:
        header_updates["invoiceDate"] = update.invoiceDate
    if update.dueDate:
        header_updates["dueDate"] = update.dueDate
    if update.periodFrom:
        header_updates["periodFrom"] = update.periodFrom
    if update.periodTo:
        header_updates["periodTo"] = update.periodTo
    
    if header_updates:
        await db.invoices.update_one({"id": invoice_id}, {"$set": header_updates})
    
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
    
    # Update total and mark as edited if status is imported
    update_fields = {"total": total}
    if invoice.get("status") == "imported":
        update_fields["status"] = "edited"
    
    await db.invoices.update_one({"id": invoice_id}, {"$set": update_fields})
    

@api_router.put("/invoices/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: str, 
    new_status: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Update invoice status"""
    valid_statuses = ["imported", "edited", "draft", "issued", "posted", "deleted"]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
    
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"status": new_status}}
    )
    
    return {"message": f"Invoice status updated to {new_status}"}

@api_router.post("/invoices/{invoice_id}/confirm-draft")
async def confirm_draft(invoice_id: str, current_user: User = Depends(get_current_user)):
    """Confirm invoice as draft"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"status": "draft"}}
    )
    
    return {"message": "Invoice confirmed as draft"}

@api_router.post("/invoices/{invoice_id}/issue")
async def issue_invoice(invoice_id: str, current_user: User = Depends(get_current_user)):
    """Issue invoice (mark as issued)"""
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin role required")
    
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"status": "issued"}}
    )
    
    return {"message": "Invoice issued successfully"}

@api_router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, current_user: User = Depends(get_current_user)):
    """Soft delete invoice (change status to deleted)"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"status": "deleted"}}
    )
    
    return {"message": "Invoice deleted (status set to deleted)"}


    return {"message": "Invoice updated"}

@api_router.post("/invoices/{invoice_id}/post")
async def post_invoice(invoice_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin role required")
    
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get invoice lines
    lines = await db.invoiceLines.find({"invoiceId": invoice_id}, {"_id": 0}).to_list(1000)
    
    # Get customer details
    customer = await db.customers.find_one({"id": invoice.get("customerId")})
    
    if ERACUNI_MODE == "stub":
        external_number = f"ER-STUB-{int(datetime.now(timezone.utc).timestamp())}"
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {
                "status": "posted",
                "number": external_number,  # Set invoice number from stub
                "externalNumber": external_number
            }}
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
    
    # Real e-računi integration
    else:
        import httpx
        
        # Get e-računi settings
        user_settings = await db.aiSettings.find_one({"userId": current_user.email})
        if not user_settings or not user_settings.get("eracuniUsername") or not user_settings.get("eracuniToken"):
            raise HTTPException(status_code=400, detail="e-računi credentials not configured in Settings")
        
        endpoint = user_settings.get("eracuniEndpoint", "https://e-racuni.com/WebServicesSI/API")
        
        # Build e-računi API payload
        items = []
        for line in lines:
            # Use unitPrice directly, don't set to None if 0
            net_price = line.get("unitPrice", 0)
            items.append({
                "description": line.get("description", "Services"),
                "productCode": "000001",
                "quantity": line.get("quantity", 1),
                "unit": "h",
                "netPrice": net_price
            })
        
        payload = {
            "username": user_settings["eracuniUsername"],
            "secretKey": user_settings["eracuniSecretKey"],
            "token": user_settings["eracuniToken"],
            "method": "SalesInvoiceCreate",
            "parameters": {
                "SalesInvoice": {
                    "status": "IssuedInvoice",
                    "dateOfSupplyFrom": invoice.get("invoiceDate"),
                    "date": invoice.get("invoiceDate"),
                    "documentCurrency": "EUR",
                    "documentLanguage": "English",
                    "vatTransactionType": "0",
                    "type": "Gross",
                    "methodOfPayment": "BankTransfer",
                    "buyerName": customer.get("name", "") if customer else "",
                    "buyerStreet": "",
                    "buyerPostalCode": "",
                    "buyerCity": "",
                    "buyerCountry": "SI",
                    "buyerEMail": "",
                    "buyerPhone": "",
                    "buyerCode": "",
                    "buyerDocumentID": "",
                    "buyerTaxNumber": "",
                    "buyerVatRegistration": "None",
                    "Items": items,
                    "city": "Nova Gorica"
                }
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    endpoint,
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                
                logger.info(f"e-računi post - Status: {response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    
                    # Log full response for debugging
                    logger.info(f"e-računi response: {result}")
                    
                    # Check for errors in response
                    if result.get("response", {}).get("status") == "ok":
                        # Success! Extract document info
                        result_data = result.get("response", {}).get("result", {})
                        external_number = result_data.get("number")
                        document_id = result_data.get("documentID")
                        
                        await db.invoices.update_one(
                            {"id": invoice_id},
                            {"$set": {
                                "status": "posted",
                                "number": external_number,  # Set invoice number from e-računi
                                "externalNumber": external_number,
                                "documentID": document_id
                            }}
                        )
                        
                        # Audit event
                        await db.auditEvents.insert_one({
                            "id": str(uuid.uuid4()),
                            "actorId": current_user.email,
                            "action": "post_invoice",
                            "entity": "Invoice",
                            "entityId": invoice_id,
                            "metadata": {"externalNumber": external_number, "documentID": document_id},
                            "at": datetime.now(timezone.utc).isoformat()
                        })
                        
                        return {
                            "externalNumber": external_number, 
                            "documentID": document_id, 
                            "status": "posted",
                            "raw": result  # Include full response for debugging
                        }
                    else:
                        # API returned error in response body
                        error_details = result.get("response", {})
                        logger.error(f"e-računi API error in response: {error_details}")
                        raise HTTPException(
                            status_code=400, 
                            detail=f"e-računi API error: {error_details.get('error', error_details)}"
                        )
                else:
                    # Non-200 status code
                    response_body = response.text[:1000]
                    logger.error(f"e-računi API HTTP {response.status_code}: {response_body}")
                    raise HTTPException(
                        status_code=400, 
                        detail=f"e-računi API returned HTTP {response.status_code}. Response: {response_body}"
                    )
        
        except httpx.TimeoutException:
            raise HTTPException(status_code=400, detail="e-računi API timeout")
        except Exception as e:
            logger.error(f"e-računi posting error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Failed to post to e-računi: {str(e)}")

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
    # Get test prompt from settings (passed as extra field)
    test_prompt = getattr(settings, 'testPrompt', None) or "Hello, this is a connection test. Please respond with 'OK'."
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        if settings.aiProvider == "emergent":
            if not EMERGENT_LLM_KEY:
                raise HTTPException(status_code=400, detail="Emergent LLM key not configured")
            
            # Determine provider based on model name
            if "claude" in settings.customModel.lower():
                provider = "anthropic"
            elif "gemini" in settings.customModel.lower():
                provider = "google"
            else:
                provider = "openai"
            
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"test-{current_user.email}",
                system_message="You are a helpful AI assistant. IMPORTANT: Always respond in the SAME LANGUAGE as the user's prompt. If the prompt is in Slovenian, respond in Slovenian. If in English, respond in English. Match the language exactly."
            ).with_model(provider, settings.customModel)
            
        else:  # custom
            if not settings.customApiKey:
                raise HTTPException(status_code=400, detail="Custom API key required")
            
            # Determine provider from custom model
            if "claude" in settings.customModel.lower():
                provider = "anthropic"
            elif "gemini" in settings.customModel.lower():
                provider = "google"
            else:
                provider = "openai"
            
            chat = LlmChat(
                api_key=settings.customApiKey,
                session_id=f"test-{current_user.email}",
                system_message="You are a helpful AI assistant. IMPORTANT: Always respond in the SAME LANGUAGE as the user's prompt. If the prompt is in Slovenian, respond in Slovenian. If in English, respond in English. Match the language exactly."
            ).with_model(provider, settings.customModel)
        
        # Send test message
        message = UserMessage(text=test_prompt)
        response = await chat.send_message(message)
        
        return {
            "message": f"Connection successful! Model: {settings.customModel}",
            "response": response,
            "testPrompt": test_prompt
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")


# ============ E-RAČUNI ENDPOINTS ============
@api_router.post("/settings/eracuni/test")
async def test_eracuni_connection(
    username: str = Form(...),
    secretKey: str = Form(...),
    apiToken: str = Form(...),
    endpoint: str = Form(default="https://e-racuni.com/WebServices/API"),
    current_user: User = Depends(get_current_user)
):
    """Test e-računi API connection"""
    import httpx
    
    try:
        # Use configured endpoint or default
        api_url = endpoint or "https://e-racuni.com/WebServices/API"
        
        # Test with a simple PartnerList method (least intrusive)
        payload = {
            "username": username,
            "secretKey": secretKey,
            "token": apiToken,
            "method": "PartnerList",
            "parameters": {
                "page": 1,
                "limit": 1
            }
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                api_url,
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            
            # Log the response for debugging
            logger.info(f"e-računi API test - Status: {response.status_code}, URL: {api_url}, Method: PartnerList")
            logger.info(f"Response body (first 200 chars): {response.text[:200]}")
            
            # Check if request was successful
            if response.status_code == 200:
                result = response.json()
                
                # Check if there's an error in the response
                if result.get("error"):
                    # Even if there's an error, connection was made
                    return {
                        "message": f"⚠️ API connection established but returned error: {result.get('error', 'Unknown')}. This may indicate invalid credentials or insufficient permissions.",
                        "fullResponse": result,
                        "statusCode": 200,
                        "warning": True
                    }
                
                return {
                    "message": "✅ e-računi connection successful! Credentials are valid and API responded correctly.",
                    "fullResponse": result,
                    "statusCode": 200
                }
            elif response.status_code == 404:
                # 404 might mean the method doesn't exist, but endpoint is reachable
                return {
                    "message": "⚠️ API endpoint is reachable but test method failed (404). This could mean: 1) Endpoint URL needs adjustment, 2) Test method 'PartnerList' not available, 3) Different API structure. For production use, configure the actual posting endpoint.",
                    "fullResponse": {"statusCode": 404, "note": "Endpoint reachable but test method not found", "suggestion": "Ready for production configuration"},
                    "statusCode": 404,
                    "warning": True
                }
            elif response.status_code == 401 or response.status_code == 403:
                # Authentication error
                return {
                    "message": f"❌ Authentication failed (HTTP {response.status_code}). Please verify your username, secret key, and token are correct.",
                    "fullResponse": {"statusCode": response.status_code, "body": response.text[:300]},
                    "statusCode": response.status_code
                }
            else:
                # Other errors
                error_body = response.text[:500] if response.text else "No response body"
                return {
                    "message": f"⚠️ Unexpected response (HTTP {response.status_code}). See debug details.",
                    "fullResponse": {"statusCode": response.status_code, "body": error_body},
                    "statusCode": response.status_code,
                    "warning": True
                }
    
    except httpx.TimeoutException:
        raise HTTPException(status_code=400, detail="Connection timeout - please check your network")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection test failed: {str(e)}")


@api_router.post("/ai/suggest")
async def ai_suggest(request: AIRequest, current_user: User = Depends(get_current_user)):
    # Get user's AI settings
    user_settings = await db.aiSettings.find_one({"userId": current_user.email})
    
    if not user_settings:
        user_settings = AISettings().model_dump()
    
    # Determine API key and model
    if user_settings.get("aiProvider") == "custom" and user_settings.get("customApiKey"):
        api_key = user_settings["customApiKey"]
        model = user_settings.get("customModel", "gpt-5")
    else:
        if not EMERGENT_LLM_KEY:
            return {"suggestion": request.text, "message": "AI not configured"}
        api_key = EMERGENT_LLM_KEY
        model = "gpt-5"
    
    try:
        # Determine provider based on model
        if "claude" in model.lower():
            provider = "anthropic"
        elif "gemini" in model.lower():
            provider = "google"
        else:
            provider = "openai"
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"ai-{current_user.email}",
            system_message="You are an AI assistant for invoice processing."
        ).with_model(provider, model)
        
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