#!/usr/bin/env python3
"""
Test script to verify filterPreferences save and load functionality
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def test_filter_preferences():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    print("=== Testing filterPreferences Save/Load ===\n")
    
    # Find first batch
    batch = await db.importBatches.find_one({}, {"_id": 0})
    if not batch:
        print("❌ No batches found in database")
        return
    
    batch_id = batch['id']
    print(f"✅ Found batch: {batch_id}")
    print(f"   Current filterPreferences: {batch.get('filterPreferences', 'NOT SET')}")
    
    # Test 1: Save complete filter preferences
    print("\n--- Test 1: Saving filterPreferences ---")
    test_prefs = {
        "searchTerm": "test customer",
        "projectFilter": "001 - Računovodstvo",
        "customerFilter": "Test Company",
        "employeeFilter": "all",
        "tariffFilter": "all",
        "statusFilter": "uninvoiced",
        "rowsPerPage": 25
    }
    
    result = await db.importBatches.update_one(
        {"id": batch_id},
        {"$set": {"filterPreferences": test_prefs}}
    )
    print(f"✅ Update result: matched={result.matched_count}, modified={result.modified_count}")
    
    # Load and verify
    batch_after = await db.importBatches.find_one({"id": batch_id}, {"_id": 0})
    loaded_prefs = batch_after.get('filterPreferences')
    print(f"✅ Loaded filterPreferences:")
    for key, value in loaded_prefs.items():
        print(f"   {key}: {value} (type: {type(value).__name__})")
    
    # Test 2: Update single preference (simulating partial update)
    print("\n--- Test 2: Updating single preference (rowsPerPage) ---")
    test_prefs['rowsPerPage'] = 100
    result = await db.importBatches.update_one(
        {"id": batch_id},
        {"$set": {"filterPreferences": test_prefs}}
    )
    print(f"✅ Update result: matched={result.matched_count}, modified={result.modified_count}")
    
    batch_after = await db.importBatches.find_one({"id": batch_id}, {"_id": 0})
    print(f"✅ rowsPerPage updated to: {batch_after.get('filterPreferences', {}).get('rowsPerPage')}")
    
    # Test 3: Clear filters (reset to defaults)
    print("\n--- Test 3: Resetting filters to defaults ---")
    default_prefs = {
        "searchTerm": "",
        "projectFilter": "all",
        "customerFilter": "all",
        "employeeFilter": "all",
        "tariffFilter": "all",
        "statusFilter": "all",
        "rowsPerPage": 100
    }
    
    result = await db.importBatches.update_one(
        {"id": batch_id},
        {"$set": {"filterPreferences": default_prefs}}
    )
    print(f"✅ Update result: matched={result.matched_count}, modified={result.modified_count}")
    
    batch_after = await db.importBatches.find_one({"id": batch_id}, {"_id": 0})
    print(f"✅ Loaded default filterPreferences:")
    for key, value in batch_after.get('filterPreferences', {}).items():
        print(f"   {key}: {value}")
    
    print("\n=== Test Complete ===")
    client.close()

if __name__ == "__main__":
    asyncio.run(test_filter_preferences())
