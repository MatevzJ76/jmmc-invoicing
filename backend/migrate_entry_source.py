#!/usr/bin/env python3
"""
Migration script to add entrySource field to all time entries
Sets all existing entries to 'imported'
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

# Get MongoDB URL from environment
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

async def migrate_entries():
    """Add entrySource field to all time entries"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # Update all time entries that don't have entrySource field
        result = await db.timeEntries.update_many(
            {"entrySource": {"$exists": False}},
            {"$set": {"entrySource": "imported"}}
        )
        
        print(f"✓ Updated {result.modified_count} time entries with entrySource: imported")
        
        # Count total entries
        total = await db.timeEntries.count_documents({})
        imported = await db.timeEntries.count_documents({"entrySource": "imported"})
        manual = await db.timeEntries.count_documents({"entrySource": "manual"})
        
        print(f"\n📊 Time Entry Source Summary:")
        print(f"   Total entries: {total}")
        print(f"   Imported: {imported}")
        print(f"   Manual: {manual}")
        
    except Exception as e:
        print(f"❌ Error during migration: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(migrate_entries())
