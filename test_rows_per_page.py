#!/usr/bin/env python3
"""
Test script to verify rowsPerPage save and load functionality
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def test_rows_per_page():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    print("=== Testing rowsPerPage Save/Load ===\n")
    
    # Find first batch
    batch = await db.importBatches.find_one({}, {"_id": 0})
    if not batch:
        print("❌ No batches found in database")
        return
    
    batch_id = batch['id']
    print(f"✅ Found batch: {batch_id}")
    print(f"   Current rowsPerPage: {batch.get('rowsPerPage', 'NOT SET')}")
    
    # Test 1: Save rowsPerPage = 25
    print("\n--- Test 1: Saving rowsPerPage = 25 ---")
    result = await db.importBatches.update_one(
        {"id": batch_id},
        {"$set": {"rowsPerPage": 25}}
    )
    print(f"✅ Update result: matched={result.matched_count}, modified={result.modified_count}")
    
    # Load and verify
    batch_after = await db.importBatches.find_one({"id": batch_id}, {"_id": 0})
    print(f"✅ Loaded rowsPerPage: {batch_after.get('rowsPerPage')} (type: {type(batch_after.get('rowsPerPage'))})")
    
    # Test 2: Save rowsPerPage = "all"
    print("\n--- Test 2: Saving rowsPerPage = 'all' ---")
    result = await db.importBatches.update_one(
        {"id": batch_id},
        {"$set": {"rowsPerPage": "all"}}
    )
    print(f"✅ Update result: matched={result.matched_count}, modified={result.modified_count}")
    
    # Load and verify
    batch_after = await db.importBatches.find_one({"id": batch_id}, {"_id": 0})
    print(f"✅ Loaded rowsPerPage: {batch_after.get('rowsPerPage')} (type: {type(batch_after.get('rowsPerPage'))})")
    
    # Test 3: Save rowsPerPage = 100 (default)
    print("\n--- Test 3: Saving rowsPerPage = 100 (default) ---")
    result = await db.importBatches.update_one(
        {"id": batch_id},
        {"$set": {"rowsPerPage": 100}}
    )
    print(f"✅ Update result: matched={result.matched_count}, modified={result.modified_count}")
    
    # Load and verify
    batch_after = await db.importBatches.find_one({"id": batch_id}, {"_id": 0})
    print(f"✅ Loaded rowsPerPage: {batch_after.get('rowsPerPage')} (type: {type(batch_after.get('rowsPerPage'))})")
    
    print("\n=== Test Complete ===")
    client.close()

if __name__ == "__main__":
    asyncio.run(test_rows_per_page())
