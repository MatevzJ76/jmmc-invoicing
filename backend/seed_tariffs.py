import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

# Tariff codes data
TARIFFS = [
    {"code": "001 - Računovodstvo", "description": "Računovodstvo", "value": 0.0},
    {"code": "002 - 45 EUR/uro", "description": "45 EUR/uro", "value": 45.0},
    {"code": "0021 - GPT Opravila", "description": "GPT Opravila", "value": 0.0},
    {"code": "012 - Izobraževanje", "description": "Izobraževanje", "value": 0.0},
    {"code": "090 - Privat", "description": "Privat", "value": 0.0},
    {"code": "092 - Letni dopust", "description": "Letni dopust", "value": 0.0},
    {"code": "999 - EXTRA", "description": "EXTRA", "value": 0.0}
]

async def seed_tariffs():
    client = AsyncIOMotorClient(mongo_url)
    db = client[DB_NAME]
    
    try:
        # Check if tariffs already exist
        existing_count = await db.tariffs.count_documents({})
        
        if existing_count > 0:
            print(f"Tariffs collection already has {existing_count} documents. Skipping seed.")
            return
        
        # Add timestamps
        now = datetime.now(timezone.utc).isoformat()
        for tariff in TARIFFS:
            tariff['created_at'] = now
            tariff['updated_at'] = now
        
        # Insert all tariffs
        result = await db.tariffs.insert_many(TARIFFS)
        print(f"✅ Seeded {len(result.inserted_ids)} tariff codes successfully!")
        
        # Print seeded tariffs
        print("\nSeeded tariffs:")
        for tariff in TARIFFS:
            print(f"  - {tariff['code']}: {tariff['description']}")
        
    except Exception as e:
        print(f"❌ Error seeding tariffs: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(seed_tariffs())
