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
    
    # Use fixed passwords instead of OTPs
    admin_password = "Admin2025!"
    user_password = "User2025!"
    
    # Hash passwords
    admin_hash = ph.hash(admin_password)
    user_hash = ph.hash(user_password)
    
    # Check if users already exist
    existing_admin = await db.users.find_one({"email": "admin@local"})
    existing_user = await db.users.find_one({"email": "user@local"})
    
    # Update or create admin user
    admin_user = {
        "id": "admin-001",
        "email": "admin@local",
        "username": "Admin User",
        "passwordHash": admin_hash,
        "role": "ADMIN",
        "status": "active",
        "mustReset": False,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    
    if existing_admin:
        # Update existing admin with new password and status
        await db.users.update_one(
            {"email": "admin@local"},
            {"$set": {
                "id": "admin-001",
                "username": "Admin User",
                "passwordHash": admin_hash, 
                "mustReset": False,
                "status": "active"
            }}
        )
        print(f"\n🔐 ADMIN USER UPDATED")
    else:
        await db.users.insert_one(admin_user)
        print(f"\n🔐 ADMIN USER CREATED")
    
    print(f"   Email: admin@local")
    print(f"   Password: {admin_password}\n")
    
    # Update or create regular user
    regular_user = {
        "email": "user@local",
        "passwordHash": user_hash,
        "role": "USER",
        "mustReset": False,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    
    if existing_user:
        # Update existing user with new password
        await db.users.update_one(
            {"email": "user@local"},
            {"$set": {"passwordHash": user_hash, "mustReset": False}}
        )
        print(f"🔐 USER UPDATED")
    else:
        await db.users.insert_one(regular_user)
        print(f"🔐 USER CREATED")
    
    print(f"   Email: user@local")
    print(f"   Password: {user_password}\n")
    
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
