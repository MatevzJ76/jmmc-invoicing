import requests
import json
from pymongo import MongoClient
import os

# Configuration
BACKEND_URL = "https://invoice-ai-12.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@local"
ADMIN_PASSWORD = "Admin2025!"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

class TestCustomerIdIssue:
    def __init__(self):
        self.token = None
        self.mongo_client = MongoClient(MONGO_URL)
        self.db = self.mongo_client[DB_NAME]
        
    def login(self) -> bool:
        """Login as admin and get auth token"""
        print("\n" + "="*80)
        print("STEP 1: Login as admin")
        print("="*80)
        try:
            response = requests.post(
                f"{BACKEND_URL}/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                print(f"✅ Login successful")
                print(f"   User: {data.get('user', {}).get('email')}")
                print(f"   Role: {data.get('user', {}).get('role')}")
                return True
            else:
                print(f"❌ Login failed: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False
    
    def get_headers(self):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {self.token}"}
    
    def test_scenario_1_existing_batch(self):
        """Test Scenario 1: Check existing batch time entries"""
        print("\n" + "="*80)
        print("SCENARIO 1: Check existing 'in progress' batch time entries")
        print("="*80)
        
        try:
            # Find first "in progress" batch from database
            batch = self.db.importBatches.find_one({"status": "in progress"})
            
            if not batch:
                print("⚠️  No 'in progress' batch found in database")
                print("   Trying to find any batch with time entries...")
                
                # Try to find any batch
                batch = self.db.importBatches.find_one({})
                
                if not batch:
                    print("❌ No batches found in database at all")
                    return False
            
            batch_id = batch.get("id")
            batch_title = batch.get("title", "Unknown")
            batch_status = batch.get("status", "Unknown")
            
            print(f"\n📦 Found batch:")
            print(f"   ID: {batch_id}")
            print(f"   Title: {batch_title}")
            print(f"   Status: {batch_status}")
            
            # Call GET /api/batches/{batch_id}/time-entries
            print(f"\n🔍 Calling GET /api/batches/{batch_id}/time-entries")
            response = requests.get(
                f"{BACKEND_URL}/batches/{batch_id}/time-entries",
                headers=self.get_headers()
            )
            
            print(f"   Response status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ API call failed: {response.text}")
                return False
            
            entries = response.json()
            print(f"   Retrieved {len(entries)} time entries")
            
            if not entries:
                print("⚠️  No time entries found in this batch")
                return False
            
            # Check first 3 entries for customerId field
            print(f"\n📋 Checking first 3 entries for customerId field:")
            
            missing_customer_id_count = 0
            
            for i, entry in enumerate(entries[:3]):
                print(f"\n   Entry {i+1}:")
                print(f"      Entry ID: {entry.get('id', 'N/A')}")
                print(f"      Employee: {entry.get('employeeName', 'N/A')}")
                print(f"      Hours: {entry.get('hours', 'N/A')}")
                print(f"      Date: {entry.get('date', 'N/A')}")
                
                # Check for customerId field
                if 'customerId' in entry:
                    customer_id = entry.get('customerId')
                    print(f"      ✅ customerId: {customer_id}")
                    
                    # Also check customerName
                    if 'customerName' in entry:
                        print(f"      ✅ customerName: {entry.get('customerName')}")
                    else:
                        print(f"      ⚠️  customerName: MISSING")
                else:
                    print(f"      ❌ customerId: MISSING")
                    missing_customer_id_count += 1
                
                # Show all fields in the entry
                print(f"      All fields: {list(entry.keys())}")
            
            # Summary
            print(f"\n📊 Summary:")
            print(f"   Total entries checked: 3")
            print(f"   Entries missing customerId: {missing_customer_id_count}")
            
            if missing_customer_id_count > 0:
                print(f"\n❌ ISSUE CONFIRMED: {missing_customer_id_count} entries missing customerId field")
                return False
            else:
                print(f"\n✅ All entries have customerId field")
                return True
                
        except Exception as e:
            print(f"❌ Error in scenario 1: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def test_scenario_2_database_check(self):
        """Test Scenario 2: Check database directly"""
        print("\n" + "="*80)
        print("SCENARIO 2: Check MongoDB timeEntries collection directly")
        print("="*80)
        
        try:
            # Query MongoDB timeEntries collection
            print("\n🔍 Querying timeEntries collection...")
            
            # Get first 3 documents
            entries = list(self.db.timeEntries.find({}).limit(3))
            
            print(f"   Found {len(entries)} entries in database")
            
            if not entries:
                print("⚠️  No time entries found in database")
                return False
            
            # Check each entry for customerId field
            print(f"\n📋 Checking first 3 entries from database:")
            
            missing_customer_id_count = 0
            
            for i, entry in enumerate(entries):
                print(f"\n   Entry {i+1}:")
                print(f"      Entry ID: {entry.get('id', 'N/A')}")
                print(f"      Batch ID: {entry.get('batchId', 'N/A')}")
                print(f"      Employee: {entry.get('employeeName', 'N/A')}")
                print(f"      Hours: {entry.get('hours', 'N/A')}")
                
                # Check for customerId field
                if 'customerId' in entry:
                    customer_id = entry.get('customerId')
                    print(f"      ✅ customerId: {customer_id}")
                    
                    # Verify customer exists
                    customer = self.db.customers.find_one({"id": customer_id})
                    if customer:
                        print(f"      ✅ Customer exists: {customer.get('name')}")
                    else:
                        print(f"      ⚠️  Customer NOT found in database")
                else:
                    print(f"      ❌ customerId: MISSING")
                    missing_customer_id_count += 1
                
                # Show all fields
                print(f"      All fields: {list(entry.keys())}")
            
            # Summary
            print(f"\n📊 Summary:")
            print(f"   Total entries checked: {len(entries)}")
            print(f"   Entries missing customerId: {missing_customer_id_count}")
            
            if missing_customer_id_count > 0:
                print(f"\n❌ DATABASE ISSUE: {missing_customer_id_count} entries missing customerId in database")
                return False
            else:
                print(f"\n✅ All entries have customerId in database")
                return True
                
        except Exception as e:
            print(f"❌ Error in scenario 2: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def test_scenario_3_complete_flow(self):
        """Test Scenario 3: Test complete flow with new batch"""
        print("\n" + "="*80)
        print("SCENARIO 3: Test complete flow - create new batch and verify customerId")
        print("="*80)
        
        try:
            # Create test batch via POST /api/imports/from-verification
            print("\n📝 Creating test batch with 3 time entries...")
            
            test_data = {
                "title": "Test Batch - CustomerId Debug",
                "invoiceDate": "2025-01-31",
                "periodFrom": "2025-01-01",
                "periodTo": "2025-01-31",
                "dueDate": "2025-02-15",
                "filename": "test_debug.xlsx",
                "rows": [
                    {
                        "customer": "JMMC HP d.o.o.",
                        "project": "Test Project 1",
                        "employee": "John Doe",
                        "date": "2025-01-15",
                        "tariff": "Standard",
                        "comments": "Test work entry 1",
                        "hours": 5.0,
                        "value": 225.0
                    },
                    {
                        "customer": "JMMC Finance d.o.o.",
                        "project": "Test Project 2",
                        "employee": "Jane Smith",
                        "date": "2025-01-16",
                        "tariff": "Standard",
                        "comments": "Test work entry 2",
                        "hours": 3.5,
                        "value": 157.5
                    },
                    {
                        "customer": "Test Customer ABC",
                        "project": "Test Project 3",
                        "employee": "Bob Johnson",
                        "date": "2025-01-17",
                        "tariff": "Standard",
                        "comments": "Test work entry 3",
                        "hours": 8.0,
                        "value": 360.0
                    }
                ]
            }
            
            response = requests.post(
                f"{BACKEND_URL}/imports/from-verification",
                headers=self.get_headers(),
                json=test_data
            )
            
            print(f"   Response status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ Failed to create batch: {response.text}")
                return False
            
            result = response.json()
            batch_id = result.get("batchId")
            row_count = result.get("rowCount")
            
            print(f"   ✅ Batch created successfully")
            print(f"   Batch ID: {batch_id}")
            print(f"   Row count: {row_count}")
            
            # Check database directly for customerId
            print(f"\n🔍 Checking database for customerId in new entries...")
            
            db_entries = list(self.db.timeEntries.find({"batchId": batch_id}))
            print(f"   Found {len(db_entries)} entries in database")
            
            db_missing_count = 0
            for i, entry in enumerate(db_entries):
                if 'customerId' not in entry or not entry.get('customerId'):
                    print(f"   ❌ Entry {i+1}: customerId MISSING or empty")
                    db_missing_count += 1
                else:
                    print(f"   ✅ Entry {i+1}: customerId = {entry.get('customerId')}")
            
            # Call GET /api/batches/{batch_id}/time-entries
            print(f"\n🔍 Calling GET /api/batches/{batch_id}/time-entries...")
            
            response = requests.get(
                f"{BACKEND_URL}/batches/{batch_id}/time-entries",
                headers=self.get_headers()
            )
            
            print(f"   Response status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ API call failed: {response.text}")
                return False
            
            api_entries = response.json()
            print(f"   Retrieved {len(api_entries)} entries from API")
            
            # Check API response for customerId
            api_missing_count = 0
            for i, entry in enumerate(api_entries):
                print(f"\n   Entry {i+1}:")
                print(f"      Employee: {entry.get('employeeName')}")
                
                if 'customerId' not in entry or not entry.get('customerId'):
                    print(f"      ❌ customerId: MISSING or empty")
                    api_missing_count += 1
                else:
                    print(f"      ✅ customerId: {entry.get('customerId')}")
                
                if 'customerName' in entry:
                    print(f"      ✅ customerName: {entry.get('customerName')}")
                else:
                    print(f"      ⚠️  customerName: MISSING")
            
            # Summary
            print(f"\n📊 Summary:")
            print(f"   Database entries missing customerId: {db_missing_count}/{len(db_entries)}")
            print(f"   API response entries missing customerId: {api_missing_count}/{len(api_entries)}")
            
            if db_missing_count > 0:
                print(f"\n❌ DATABASE ISSUE: Entries created without customerId")
                return False
            elif api_missing_count > 0:
                print(f"\n❌ API RESPONSE ISSUE: customerId not included in API response")
                return False
            else:
                print(f"\n✅ Complete flow working correctly - customerId present in database and API")
                return True
                
        except Exception as e:
            print(f"❌ Error in scenario 3: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def run_all_tests(self):
        """Run all test scenarios"""
        print("\n" + "="*80)
        print("DEBUGGING customerId FIELD ISSUE IN TIME ENTRIES")
        print("="*80)
        
        # Login first
        if not self.login():
            print("\n❌ Cannot proceed without login")
            return
        
        # Run all scenarios
        results = {
            "Scenario 1 - Existing Batch": self.test_scenario_1_existing_batch(),
            "Scenario 2 - Database Check": self.test_scenario_2_database_check(),
            "Scenario 3 - Complete Flow": self.test_scenario_3_complete_flow()
        }
        
        # Final summary
        print("\n" + "="*80)
        print("FINAL TEST SUMMARY")
        print("="*80)
        
        for scenario, passed in results.items():
            status = "✅ PASSED" if passed else "❌ FAILED"
            print(f"{status} - {scenario}")
        
        # Overall result
        all_passed = all(results.values())
        
        if all_passed:
            print("\n✅ ALL TESTS PASSED - customerId field is working correctly")
        else:
            print("\n❌ SOME TESTS FAILED - customerId field issue confirmed")
            print("\nPossible causes:")
            print("1. Database issue - entries created without customerId")
            print("2. API response issue - customerId not included in response")
            print("3. Backend code issue - customerId not being set during import")

if __name__ == "__main__":
    tester = TestCustomerIdIssue()
    tester.run_all_tests()
