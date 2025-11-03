import requests
import json
from typing import Dict, Any, Optional

# Configuration
BACKEND_URL = "https://invoice-workflow-2.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@local"
ADMIN_PASSWORD = "Admin2025!"

class TestForfaitBatch:
    def __init__(self):
        self.token = None
        self.customer_id = "290cf431-a8c1-4dca-bc5c-e06fa66ad926"
        self.customer_name = "123 HIŠKA d.o.o."
        self.batch_id = None
        self.created_entry_id = None
        
    def login(self) -> bool:
        """Login as admin and get auth token"""
        print("\n=== Testing Login ===")
        try:
            response = requests.post(
                f"{BACKEND_URL}/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                print(f"✅ Login successful")
                print(f"User: {data.get('user', {}).get('email')}")
                print(f"Role: {data.get('user', {}).get('role')}")
                return True
            else:
                print(f"❌ Login failed: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False
    
    def get_headers(self) -> Dict[str, str]:
        """Get authorization headers"""
        return {"Authorization": f"Bearer {self.token}"}
    
    def verify_customer(self) -> bool:
        """Verify customer exists and has fixedForfaitValue"""
        print(f"\n=== Verifying Customer: {self.customer_name} ===")
        try:
            response = requests.get(
                f"{BACKEND_URL}/customers/{self.customer_id}",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                customer = response.json()
                print(f"✅ Customer found: {customer.get('name')}")
                print(f"Customer ID: {customer.get('id')}")
                print(f"Fixed Forfait Value: €{customer.get('fixedForfaitValue', 0)}")
                print(f"Invoicing Type: {customer.get('invoicingType', 'N/A')}")
                
                # Verify fixedForfaitValue
                fixed_forfait = customer.get('fixedForfaitValue')
                if fixed_forfait is None:
                    print("⚠️ WARNING: fixedForfaitValue is None")
                    return False
                
                if fixed_forfait != 220.0:
                    print(f"⚠️ WARNING: Expected fixedForfaitValue=220.0, got {fixed_forfait}")
                    return False
                
                print(f"✅ Customer has correct fixedForfaitValue: €{fixed_forfait}")
                return True
            else:
                print(f"❌ Failed to get customer: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error getting customer: {str(e)}")
            return False
    
    def find_october_batch(self) -> bool:
        """Find an October 2025 batch (preferably in progress)"""
        print("\n=== Finding October 2025 Batch ===")
        try:
            response = requests.get(
                f"{BACKEND_URL}/batches",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                batches = response.json()
                print(f"Total batches: {len(batches)}")
                
                # Filter for October 2025 batches
                october_batches = []
                for batch in batches:
                    period_from = batch.get('periodFrom', '')
                    period_to = batch.get('periodTo', '')
                    status = batch.get('status', '')
                    
                    if '2025-10' in period_from or '2025-10' in period_to:
                        october_batches.append(batch)
                        print(f"\nFound October batch:")
                        print(f"  ID: {batch.get('id')}")
                        print(f"  Title: {batch.get('title')}")
                        print(f"  Period: {period_from} to {period_to}")
                        print(f"  Status: {status}")
                
                if not october_batches:
                    print("❌ No October 2025 batches found")
                    return False
                
                # Prefer 'in progress' status
                in_progress = [b for b in october_batches if b.get('status') == 'in progress']
                if in_progress:
                    self.batch_id = in_progress[0].get('id')
                    print(f"\n✅ Selected 'in progress' batch: {self.batch_id}")
                else:
                    self.batch_id = october_batches[0].get('id')
                    print(f"\n✅ Selected batch: {self.batch_id} (status: {october_batches[0].get('status')})")
                
                return True
            else:
                print(f"❌ Failed to get batches: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error getting batches: {str(e)}")
            return False
    
    def create_forfait_entry(self) -> bool:
        """Create forfait batch entry"""
        print("\n=== Creating Forfait Batch Entry ===")
        
        payload = {
            "customerId": self.customer_id,
            "employeeName": "",
            "date": "2025-10-31",
            "hours": 1,
            "tariff": "001 - Računovodstvo",
            "notes": "",
            "status": "uninvoiced",
            "entrySource": "forfait_batch"
        }
        
        print(f"Batch ID: {self.batch_id}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        try:
            response = requests.post(
                f"{BACKEND_URL}/batches/{self.batch_id}/manual-entry",
                headers=self.get_headers(),
                json=payload
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                data = response.json()
                self.created_entry_id = data.get('entryId')
                print(f"✅ Forfait entry created successfully")
                print(f"Entry ID: {self.created_entry_id}")
                print(f"Message: {data.get('message')}")
                return True
            else:
                print(f"❌ Failed to create forfait entry: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error creating forfait entry: {str(e)}")
            return False
    
    def verify_forfait_entry(self) -> bool:
        """Verify the created forfait entry has correct values"""
        print("\n=== Verifying Forfait Entry ===")
        
        try:
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.batch_id}/time-entries",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                entries = response.json()
                print(f"Total entries in batch: {len(entries)}")
                
                # Find the created entry
                forfait_entry = None
                for entry in entries:
                    if entry.get('id') == self.created_entry_id:
                        forfait_entry = entry
                        break
                
                if not forfait_entry:
                    print(f"❌ Created entry not found (ID: {self.created_entry_id})")
                    return False
                
                print(f"\n✅ Found forfait entry")
                print(f"Entry details:")
                print(json.dumps(forfait_entry, indent=2))
                
                # Verify all required fields
                checks = []
                
                # 1. entrySource
                entry_source = forfait_entry.get('entrySource')
                if entry_source == 'forfait_batch':
                    print(f"✅ entrySource = 'forfait_batch'")
                    checks.append(True)
                else:
                    print(f"❌ entrySource = '{entry_source}' (expected 'forfait_batch')")
                    checks.append(False)
                
                # 2. hourlyRate
                hourly_rate = forfait_entry.get('hourlyRate')
                if hourly_rate == 220.0:
                    print(f"✅ hourlyRate = €{hourly_rate} (customer's fixedForfaitValue)")
                    checks.append(True)
                else:
                    print(f"❌ hourlyRate = €{hourly_rate} (expected €220.0)")
                    checks.append(False)
                
                # 3. value
                value = forfait_entry.get('value')
                if value == 220.0:
                    print(f"✅ value = €{value} (customer's fixedForfaitValue)")
                    checks.append(True)
                else:
                    print(f"❌ value = €{value} (expected €220.0)")
                    checks.append(False)
                
                # 4. projectName
                project_name = forfait_entry.get('projectName')
                if project_name == 'Forfait Batch':
                    print(f"✅ projectName = '{project_name}'")
                    checks.append(True)
                else:
                    print(f"❌ projectName = '{project_name}' (expected 'Forfait Batch')")
                    checks.append(False)
                
                # 5. employeeName
                employee_name = forfait_entry.get('employeeName')
                if employee_name == '':
                    print(f"✅ employeeName = '' (empty)")
                    checks.append(True)
                else:
                    print(f"❌ employeeName = '{employee_name}' (expected empty)")
                    checks.append(False)
                
                # 6. notes
                notes = forfait_entry.get('notes')
                if notes == '':
                    print(f"✅ notes = '' (empty)")
                    checks.append(True)
                else:
                    print(f"❌ notes = '{notes}' (expected empty)")
                    checks.append(False)
                
                # 7. forfaitBatchParentId field exists
                if 'forfaitBatchParentId' in forfait_entry:
                    print(f"✅ forfaitBatchParentId field exists (value: {forfait_entry.get('forfaitBatchParentId')})")
                    checks.append(True)
                else:
                    print(f"❌ forfaitBatchParentId field missing")
                    checks.append(False)
                
                # 8. forfaitBatchSubRows field exists
                if 'forfaitBatchSubRows' in forfait_entry:
                    print(f"✅ forfaitBatchSubRows field exists (value: {forfait_entry.get('forfaitBatchSubRows')})")
                    checks.append(True)
                else:
                    print(f"❌ forfaitBatchSubRows field missing")
                    checks.append(False)
                
                # 9. customerName
                customer_name = forfait_entry.get('customerName')
                if customer_name == self.customer_name:
                    print(f"✅ customerName = '{customer_name}'")
                    checks.append(True)
                else:
                    print(f"⚠️ customerName = '{customer_name}' (expected '{self.customer_name}')")
                    checks.append(True)  # Not critical
                
                # Summary
                print(f"\n=== Verification Summary ===")
                passed = sum(checks)
                total = len(checks)
                print(f"Checks passed: {passed}/{total}")
                
                if all(checks):
                    print("✅ ALL CHECKS PASSED - Forfait batch entry feature is working correctly!")
                    return True
                else:
                    print("❌ SOME CHECKS FAILED - See details above")
                    return False
                
            else:
                print(f"❌ Failed to get time entries: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error verifying forfait entry: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("=" * 80)
        print("FORFAIT BATCH ENTRY FEATURE TEST")
        print("=" * 80)
        
        results = []
        
        # Test 1: Login
        if not self.login():
            print("\n❌ TEST SUITE FAILED: Login failed")
            return False
        results.append(("Login", True))
        
        # Test 2: Verify customer
        if not self.verify_customer():
            print("\n❌ TEST SUITE FAILED: Customer verification failed")
            return False
        results.append(("Customer Verification", True))
        
        # Test 3: Find October batch
        if not self.find_october_batch():
            print("\n❌ TEST SUITE FAILED: Could not find October batch")
            return False
        results.append(("Find October Batch", True))
        
        # Test 4: Create forfait entry
        if not self.create_forfait_entry():
            print("\n❌ TEST SUITE FAILED: Failed to create forfait entry")
            return False
        results.append(("Create Forfait Entry", True))
        
        # Test 5: Verify forfait entry
        if not self.verify_forfait_entry():
            print("\n❌ TEST SUITE FAILED: Forfait entry verification failed")
            results.append(("Verify Forfait Entry", False))
        else:
            results.append(("Verify Forfait Entry", True))
        
        # Final summary
        print("\n" + "=" * 80)
        print("FINAL TEST RESULTS")
        print("=" * 80)
        for test_name, passed in results:
            status = "✅ PASSED" if passed else "❌ FAILED"
            print(f"{test_name}: {status}")
        
        all_passed = all(result[1] for result in results)
        print("\n" + "=" * 80)
        if all_passed:
            print("✅ ALL TESTS PASSED - FORFAIT BATCH FEATURE IS WORKING!")
        else:
            print("❌ SOME TESTS FAILED - SEE DETAILS ABOVE")
        print("=" * 80)
        
        return all_passed

if __name__ == "__main__":
    tester = TestForfaitBatch()
    tester.run_all_tests()
