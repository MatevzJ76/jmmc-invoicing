#!/usr/bin/env python3
"""
Migration script to add status field to all customers
Sets all existing customers to 'active' status
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

# Get MongoDB URL from environment
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")

async def migrate_customers():
    """Add status field to all customers"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.invoicing
    
    try:
        # Update all customers that don't have a status field
        result = await db.customers.update_many(
            {"status": {"$exists": False}},
            {"$set": {"status": "active"}}
        )
        
        print(f"✓ Updated {result.modified_count} customers with status: active")
        
        # Count total customers
        total = await db.customers.count_documents({})
        active = await db.customers.count_documents({"status": "active"})
        inactive = await db.customers.count_documents({"status": "inactive"})
        
        print(f"\n📊 Customer Status Summary:")
        print(f"   Total customers: {total}")
        print(f"   Active: {active}")
        print(f"   Inactive: {inactive}")
        
    except Exception as e:
        print(f"❌ Error during migration: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(migrate_customers())
