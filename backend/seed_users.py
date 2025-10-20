#!/usr/bin/env python3
"""
Seed script to create default users on first run
"""
import asyncio
import os
import secrets
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from argon2 import PasswordHasher
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

ph = PasswordHasher()

async def seed_users():
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    # Check if users already exist
    existing_admin = await db.users.find_one({"email": "admin@local"})
    existing_user = await db.users.find_one({"email": "user@local"})
    
    if existing_admin and existing_user:
        print("✓ Users already seeded")
        client.close()
        return
    
    # Generate OTPs
    admin_otp = secrets.token_urlsafe(12)
    user_otp = secrets.token_urlsafe(12)
    
    # Hash passwords
    admin_hash = ph.hash(admin_otp)
    user_hash = ph.hash(user_otp)
    
    # Create users
    admin_user = {
        "email": "admin@local",
        "passwordHash": admin_hash,
        "role": "ADMIN",
        "mustReset": True,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    
    regular_user = {
        "email": "user@local",
        "passwordHash": user_hash,
        "role": "USER",
        "mustReset": True,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    
    if not existing_admin:
        await db.users.insert_one(admin_user)
        print(f"\n🔐 ADMIN USER CREATED")
        print(f"   Email: admin@local")
        print(f"   OTP: {admin_otp}")
        print(f"   (mustReset=true)\n")
    
    if not existing_user:
        await db.users.insert_one(regular_user)
        print(f"🔐 USER CREATED")
        print(f"   Email: user@local")
        print(f"   OTP: {user_otp}")
        print(f"   (mustReset=true)\n")
    
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.customers.create_index("name")
    await db.projects.create_index("customerId")
    await db.importBatches.create_index("createdBy")
    await db.timeEntries.create_index("batchId")
    await db.invoices.create_index("customerId")
    await db.invoiceLines.create_index("invoiceId")
    await db.auditEvents.create_index([("entity", 1), ("entityId", 1)])
    
    print("✓ Database indexes created")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_users())
