#!/usr/bin/env python3
"""
Test script to verify hoursBreakdownExpanded persistence
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def test_hours_breakdown_expanded():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    print("=== Testing hoursBreakdownExpanded Save/Load ===\n")
    
    # Find first batch
    batch = await db.importBatches.find_one({}, {"_id": 0})
    if not batch:
        print("❌ No batches found in database")
        return
    
    batch_id = batch['id']
    print(f"✅ Found batch: {batch_id}")
    
    # Test 1: Save with hoursBreakdownExpanded = true
    print("\n--- Test 1: Saving hoursBreakdownExpanded = true ---")
    prefs = {
        "searchTerm": "",
        "projectFilter": "all",
        "customerFilter": "all",
        "employeeFilter": "all",
        "tariffFilter": "all",
        "statusFilter": "all",
        "rowsPerPage": 100,
        "hoursBreakdownExpanded": True
    }
    
    result = await db.importBatches.update_one(
        {"id": batch_id},
        {"$set": {"filterPreferences": prefs}}
    )
    print(f"✅ Update result: matched={result.matched_count}, modified={result.modified_count}")
    
    # Load and verify
    batch_after = await db.importBatches.find_one({"id": batch_id}, {"_id": 0})
    loaded = batch_after.get('filterPreferences', {}).get('hoursBreakdownExpanded')
    print(f"✅ Loaded hoursBreakdownExpanded: {loaded} (type: {type(loaded)})")
    
    # Test 2: Save with hoursBreakdownExpanded = false
    print("\n--- Test 2: Saving hoursBreakdownExpanded = false ---")
    prefs['hoursBreakdownExpanded'] = False
    
    result = await db.importBatches.update_one(
        {"id": batch_id},
        {"$set": {"filterPreferences": prefs}}
    )
    print(f"✅ Update result: matched={result.matched_count}, modified={result.modified_count}")
    
    # Load and verify
    batch_after = await db.importBatches.find_one({"id": batch_id}, {"_id": 0})
    loaded = batch_after.get('filterPreferences', {}).get('hoursBreakdownExpanded')
    print(f"✅ Loaded hoursBreakdownExpanded: {loaded} (type: {type(loaded)})")
    
    print("\n=== Test Complete ===")
    client.close()

if __name__ == "__main__":
    asyncio.run(test_hours_breakdown_expanded())
