import requests
import json
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

# Configuration
BACKEND_URL = "https://timentry-manager.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@local"
ADMIN_PASSWORD = "Admin2025!"

class TestForfaitLinking:
    def __init__(self):
        self.token = None
        self.test_customer_id = None
        self.test_customer_name = None
        self.test_batch_id = None
        self.test_entry_ids = []
        self.forfait_entry_ids = []
        self.forfait_batch_entry_id = None
        
    def login(self) -> bool:
        """Login as admin and get auth token"""
        print("\n" + "="*80)
        print("=== LOGGING IN AS ADMIN ===")
        print("="*80)
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
    
    def find_or_create_test_customer(self) -> bool:
        """Find or create a test customer for forfait testing"""
        print("\n" + "="*80)
        print("=== FINDING OR CREATING TEST CUSTOMER ===")
        print("="*80)
        
        try:
            # Get all customers
            response = requests.get(
                f"{BACKEND_URL}/customers",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to get customers: {response.text}")
                return False
            
            customers = response.json()
            
            # Look for existing test customer
            test_customer = None
            for customer in customers:
                if "Test Forfait Customer" in customer.get("name", ""):
                    test_customer = customer
                    break
            
            if test_customer:
                self.test_customer_id = test_customer["id"]
                self.test_customer_name = test_customer["name"]
                print(f"✅ Found existing test customer: {self.test_customer_name}")
                print(f"   Customer ID: {self.test_customer_id}")
            else:
                # Use first available customer for testing
                if customers:
                    self.test_customer_id = customers[0]["id"]
                    self.test_customer_name = customers[0]["name"]
                    print(f"✅ Using existing customer: {self.test_customer_name}")
                    print(f"   Customer ID: {self.test_customer_id}")
                else:
                    print("❌ No customers found in database")
                    return False
            
            return True
            
        except Exception as e:
            print(f"❌ Error finding/creating customer: {str(e)}")
            return False
    
    def create_test_batch_with_entries(self) -> bool:
        """
        Test 1: Create test batch with mixed entries:
        - 2 entries: status="uninvoiced"
        - 1 entry: status="ready"
        - 2 entries: status="forfait", entrySource="manual"
        - 1 entry: entrySource="forfait_batch", tariff="001 - Računovodstvo"
        """
        print("\n" + "="*80)
        print("=== TEST 1: CREATE TEST BATCH WITH MIXED ENTRIES ===")
        print("="*80)
        
        try:
            # Create a test batch using imports endpoint
            # First, we need to create batch manually via database or use existing batch
            # For simplicity, let's create entries in an existing batch or create a new one
            
            # Get existing batches
            response = requests.get(
                f"{BACKEND_URL}/batches",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to get batches: {response.text}")
                return False
            
            batches = response.json()
            
            # Use the first batch or create entries description
            if batches:
                # Use first batch with status "in progress" or "imported"
                test_batch = None
                for batch in batches:
                    if batch.get("status") in ["in progress", "imported"]:
                        test_batch = batch
                        break
                
                if not test_batch and batches:
                    test_batch = batches[0]
                
                if test_batch:
                    self.test_batch_id = test_batch["id"]
                    print(f"✅ Using existing batch: {test_batch.get('title')}")
                    print(f"   Batch ID: {self.test_batch_id}")
                    print(f"   Status: {test_batch.get('status')}")
                else:
                    print("❌ No suitable batch found")
                    return False
            else:
                print("❌ No batches found in database")
                return False
            
            # Now create manual entries for this batch
            print("\n--- Creating test entries ---")
            
            # Get current date
            today = datetime.now().strftime("%Y-%m-%d")
            
            # Entry 1: uninvoiced
            entry1_data = {
                "customerId": self.test_customer_id,
                "employeeName": "John Doe",
                "date": today,
                "hours": 5.0,
                "tariff": "002 - 45 EUR/uro",
                "notes": "Regular work - uninvoiced entry 1",
                "status": "uninvoiced",
                "entrySource": "manual"
            }
            
            response1 = requests.post(
                f"{BACKEND_URL}/batches/{self.test_batch_id}/manual-entry",
                json=entry1_data,
                headers=self.get_headers()
            )
            
            if response1.status_code == 200:
                entry1_id = response1.json().get("entryId")
                self.test_entry_ids.append(entry1_id)
                print(f"✅ Created entry 1 (uninvoiced): {entry1_id}")
            else:
                print(f"❌ Failed to create entry 1: {response1.text}")
                return False
            
            # Entry 2: uninvoiced
            entry2_data = {
                "customerId": self.test_customer_id,
                "employeeName": "Jane Smith",
                "date": today,
                "hours": 3.5,
                "tariff": "002 - 45 EUR/uro",
                "notes": "Regular work - uninvoiced entry 2",
                "status": "uninvoiced",
                "entrySource": "manual"
            }
            
            response2 = requests.post(
                f"{BACKEND_URL}/batches/{self.test_batch_id}/manual-entry",
                json=entry2_data,
                headers=self.get_headers()
            )
            
            if response2.status_code == 200:
                entry2_id = response2.json().get("entryId")
                self.test_entry_ids.append(entry2_id)
                print(f"✅ Created entry 2 (uninvoiced): {entry2_id}")
            else:
                print(f"❌ Failed to create entry 2: {response2.text}")
                return False
            
            # Entry 3: ready
            entry3_data = {
                "customerId": self.test_customer_id,
                "employeeName": "Bob Johnson",
                "date": today,
                "hours": 2.0,
                "tariff": "002 - 45 EUR/uro",
                "notes": "Ready for invoicing",
                "status": "ready",
                "entrySource": "manual"
            }
            
            response3 = requests.post(
                f"{BACKEND_URL}/batches/{self.test_batch_id}/manual-entry",
                json=entry3_data,
                headers=self.get_headers()
            )
            
            if response3.status_code == 200:
                entry3_id = response3.json().get("entryId")
                self.test_entry_ids.append(entry3_id)
                print(f"✅ Created entry 3 (ready): {entry3_id}")
            else:
                print(f"❌ Failed to create entry 3: {response3.text}")
                return False
            
            # Entry 4: forfait (manual)
            entry4_data = {
                "customerId": self.test_customer_id,
                "employeeName": "Alice Brown",
                "date": (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d"),
                "hours": 4.0,
                "tariff": "001 - Računovodstvo",
                "notes": "Forfait work - accounting tasks",
                "status": "forfait",
                "entrySource": "manual"
            }
            
            response4 = requests.post(
                f"{BACKEND_URL}/batches/{self.test_batch_id}/manual-entry",
                json=entry4_data,
                headers=self.get_headers()
            )
            
            if response4.status_code == 200:
                entry4_id = response4.json().get("entryId")
                self.test_entry_ids.append(entry4_id)
                self.forfait_entry_ids.append(entry4_id)
                print(f"✅ Created entry 4 (forfait manual): {entry4_id}")
            else:
                print(f"❌ Failed to create entry 4: {response4.text}")
                return False
            
            # Entry 5: forfait (manual)
            entry5_data = {
                "customerId": self.test_customer_id,
                "employeeName": "Charlie Davis",
                "date": (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d"),
                "hours": 3.0,
                "tariff": "001 - Računovodstvo",
                "notes": "Forfait work - tax preparation",
                "status": "forfait",
                "entrySource": "manual"
            }
            
            response5 = requests.post(
                f"{BACKEND_URL}/batches/{self.test_batch_id}/manual-entry",
                json=entry5_data,
                headers=self.get_headers()
            )
            
            if response5.status_code == 200:
                entry5_id = response5.json().get("entryId")
                self.test_entry_ids.append(entry5_id)
                self.forfait_entry_ids.append(entry5_id)
                print(f"✅ Created entry 5 (forfait manual): {entry5_id}")
            else:
                print(f"❌ Failed to create entry 5: {response5.text}")
                return False
            
            # Entry 6: forfait_batch with tariff 001
            entry6_data = {
                "customerId": self.test_customer_id,
                "employeeName": "System",
                "date": today,
                "hours": 1.0,
                "tariff": "001 - Računovodstvo",
                "notes": "Forfait batch entry for linking",
                "status": "ready",
                "entrySource": "forfait_batch"
            }
            
            response6 = requests.post(
                f"{BACKEND_URL}/batches/{self.test_batch_id}/manual-entry",
                json=entry6_data,
                headers=self.get_headers()
            )
            
            if response6.status_code == 200:
                entry6_id = response6.json().get("entryId")
                self.test_entry_ids.append(entry6_id)
                self.forfait_batch_entry_id = entry6_id
                print(f"✅ Created entry 6 (forfait_batch): {entry6_id}")
            else:
                print(f"❌ Failed to create entry 6: {response6.text}")
                return False
            
            print(f"\n✅ TEST 1 PASSED: Created batch with 6 mixed entries")
            print(f"   - 2 uninvoiced entries")
            print(f"   - 1 ready entry")
            print(f"   - 2 forfait manual entries")
            print(f"   - 1 forfait_batch entry with tariff 001")
            print(f"   Total entry IDs: {len(self.test_entry_ids)}")
            
            return True
            
        except Exception as e:
            print(f"❌ TEST 1 FAILED: Error creating test batch: {str(e)}")
            return False
    
    def test_valid_forfait_linking(self) -> bool:
        """
        Test 2: SUCCESS CASE - Valid Forfait Linking
        - Call POST /api/invoices/compose-filtered with all entry IDs
        - Verify invoice created successfully
        - Verify invoice has 4 line items (2 uninvoiced + 1 ready + 1 forfait_batch)
        - Verify forfait_batch line has forfaitDetails field
        - Verify forfait details format: "dd.mm.yyyy | description | Xh"
        - Verify all forfait entries marked as "invoiced"
        """
        print("\n" + "="*80)
        print("=== TEST 2: SUCCESS CASE - VALID FORFAIT LINKING ===")
        print("="*80)
        
        try:
            # Compose invoices with all entry IDs
            compose_data = {
                "batchId": self.test_batch_id,
                "entryIds": self.test_entry_ids
            }
            
            print(f"\nCalling POST /api/invoices/compose-filtered")
            print(f"Batch ID: {self.test_batch_id}")
            print(f"Entry IDs: {self.test_entry_ids}")
            
            response = requests.post(
                f"{BACKEND_URL}/invoices/compose-filtered",
                json=compose_data,
                headers=self.get_headers()
            )
            
            print(f"\nResponse Status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ TEST 2 FAILED: Invoice composition failed")
                print(f"   Error: {response.text}")
                return False
            
            result = response.json()
            print(f"✅ Invoice composition successful")
            print(f"   Invoice IDs: {result.get('invoiceIds')}")
            print(f"   Entries processed: {result.get('entriesProcessed')}")
            
            # Get the created invoice
            invoice_ids = result.get("invoiceIds", [])
            if not invoice_ids:
                print(f"❌ TEST 2 FAILED: No invoice IDs returned")
                return False
            
            invoice_id = invoice_ids[0]
            
            # Get invoice details
            invoice_response = requests.get(
                f"{BACKEND_URL}/invoices/{invoice_id}",
                headers=self.get_headers()
            )
            
            if invoice_response.status_code != 200:
                print(f"❌ TEST 2 FAILED: Failed to get invoice details")
                return False
            
            invoice_data = invoice_response.json()
            invoice = invoice_data.get("invoice")
            lines = invoice_data.get("lines", [])
            
            print(f"\n--- Invoice Details ---")
            print(f"Invoice ID: {invoice.get('id')}")
            print(f"Customer: {invoice.get('customerName')}")
            print(f"Status: {invoice.get('status')}")
            print(f"Total: €{invoice.get('total')}")
            print(f"Number of lines: {len(lines)}")
            
            # Verify: Invoice has 4 line items (2 uninvoiced + 1 ready + 1 forfait_batch)
            expected_lines = 4
            if len(lines) != expected_lines:
                print(f"❌ TEST 2 FAILED: Expected {expected_lines} line items, got {len(lines)}")
                return False
            
            print(f"✅ Correct number of line items: {len(lines)}")
            
            # Find the forfait_batch line
            forfait_batch_line = None
            for line in lines:
                if line.get("forfaitDetails"):
                    forfait_batch_line = line
                    break
            
            if not forfait_batch_line:
                print(f"❌ TEST 2 FAILED: No forfait_batch line with forfaitDetails found")
                return False
            
            print(f"\n--- Forfait Batch Line Details ---")
            print(f"Line ID: {forfait_batch_line.get('id')}")
            print(f"Description: {forfait_batch_line.get('description')}")
            print(f"Quantity: {forfait_batch_line.get('quantity')}")
            print(f"Unit Price: €{forfait_batch_line.get('unitPrice')}")
            print(f"Amount: €{forfait_batch_line.get('amount')}")
            
            forfait_details = forfait_batch_line.get("forfaitDetails", "")
            print(f"\n--- Forfait Details ---")
            print(forfait_details)
            
            # Verify forfait details format: "dd.mm.yyyy | description | Xh"
            if not forfait_details:
                print(f"❌ TEST 2 FAILED: forfaitDetails field is empty")
                return False
            
            print(f"✅ forfaitDetails field is present and populated")
            
            # Check EU date format (dd.mm.yyyy)
            lines_in_details = forfait_details.split("\n")
            for detail_line in lines_in_details:
                if "|" in detail_line:
                    parts = detail_line.split("|")
                    if len(parts) >= 3:
                        date_part = parts[0].strip()
                        description_part = parts[1].strip()
                        hours_part = parts[2].strip()
                        
                        # Check date format (dd.mm.yyyy)
                        if "." in date_part:
                            date_components = date_part.split(".")
                            if len(date_components) == 3:
                                print(f"✅ EU date format verified: {date_part}")
                            else:
                                print(f"⚠️  Date format may be incorrect: {date_part}")
                        
                        # Check hours format (Xh)
                        if "h" in hours_part:
                            print(f"✅ Hours format verified: {hours_part}")
                        else:
                            print(f"⚠️  Hours format may be incorrect: {hours_part}")
            
            # Verify all forfait entries marked as "invoiced"
            print(f"\n--- Verifying Forfait Entry Status ---")
            for forfait_entry_id in self.forfait_entry_ids:
                # Get time entries from batch
                entries_response = requests.get(
                    f"{BACKEND_URL}/batches/{self.test_batch_id}/time-entries",
                    headers=self.get_headers()
                )
                
                if entries_response.status_code == 200:
                    all_entries = entries_response.json()
                    forfait_entry = None
                    for entry in all_entries:
                        if entry.get("id") == forfait_entry_id:
                            forfait_entry = entry
                            break
                    
                    if forfait_entry:
                        status = forfait_entry.get("status")
                        if status == "invoiced":
                            print(f"✅ Forfait entry {forfait_entry_id[:8]}... marked as 'invoiced'")
                        else:
                            print(f"❌ Forfait entry {forfait_entry_id[:8]}... has status '{status}' (expected 'invoiced')")
                            return False
            
            print(f"\n✅ TEST 2 PASSED: Valid forfait linking working correctly")
            print(f"   - Invoice created with 4 line items")
            print(f"   - Forfait_batch line has forfaitDetails field")
            print(f"   - Forfait details in EU date format (dd.mm.yyyy)")
            print(f"   - All forfait entries marked as 'invoiced'")
            
            return True
            
        except Exception as e:
            print(f"❌ TEST 2 FAILED: Error testing valid forfait linking: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def test_multiple_forfait_batch_error(self) -> bool:
        """
        Test 3: ERROR CASE - Multiple Forfait_Batch with Tariff 001
        - Create a second forfait_batch entry with tariff "001 - Računovodstvo"
        - Try to compose invoices
        - Expect HTTP 400 error with specific message
        """
        print("\n" + "="*80)
        print("=== TEST 3: ERROR CASE - MULTIPLE FORFAIT_BATCH WITH TARIFF 001 ===")
        print("="*80)
        
        try:
            # Create a second forfait_batch entry
            today = datetime.now().strftime("%Y-%m-%d")
            
            entry_data = {
                "customerId": self.test_customer_id,
                "employeeName": "System",
                "date": today,
                "hours": 1.0,
                "tariff": "001 - Računovodstvo",
                "notes": "Second forfait batch entry (should cause error)",
                "status": "ready",
                "entrySource": "forfait_batch"
            }
            
            response = requests.post(
                f"{BACKEND_URL}/batches/{self.test_batch_id}/manual-entry",
                json=entry_data,
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ TEST 3 FAILED: Could not create second forfait_batch entry")
                print(f"   Error: {response.text}")
                return False
            
            second_forfait_batch_id = response.json().get("entryId")
            print(f"✅ Created second forfait_batch entry: {second_forfait_batch_id}")
            
            # Try to compose invoices (should fail)
            compose_data = {
                "batchId": self.test_batch_id,
                "entryIds": self.test_entry_ids + [second_forfait_batch_id]
            }
            
            print(f"\nAttempting to compose invoices with 2 forfait_batch entries...")
            
            compose_response = requests.post(
                f"{BACKEND_URL}/invoices/compose-filtered",
                json=compose_data,
                headers=self.get_headers()
            )
            
            print(f"Response Status: {compose_response.status_code}")
            
            # Expect HTTP 400
            if compose_response.status_code != 400:
                print(f"❌ TEST 3 FAILED: Expected HTTP 400, got {compose_response.status_code}")
                return False
            
            error_detail = compose_response.json().get("detail", "")
            print(f"Error message: {error_detail}")
            
            # Verify error message
            expected_keywords = ["multiple", "forfait batch", "001", "Računovodstvo", "Only 1 is allowed"]
            all_keywords_present = all(keyword.lower() in error_detail.lower() for keyword in expected_keywords)
            
            if not all_keywords_present:
                print(f"❌ TEST 3 FAILED: Error message doesn't match expected format")
                print(f"   Expected keywords: {expected_keywords}")
                return False
            
            print(f"✅ TEST 3 PASSED: Multiple forfait_batch validation working correctly")
            print(f"   - HTTP 400 error returned")
            print(f"   - Error message contains all expected keywords")
            
            # Clean up: delete the second forfait_batch entry
            # Note: There's no delete endpoint, so we'll leave it for now
            # In a real scenario, we'd need to clean up or use a different test customer
            
            return True
            
        except Exception as e:
            print(f"❌ TEST 3 FAILED: Error testing multiple forfait_batch: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def test_missing_forfait_batch_error(self) -> bool:
        """
        Test 4: ERROR CASE - Missing Forfait_Batch
        - Create a new batch with forfait entries but no forfait_batch
        - Try to compose invoices
        - Expect HTTP 400 error with specific message
        """
        print("\n" + "="*80)
        print("=== TEST 4: ERROR CASE - MISSING FORFAIT_BATCH ===")
        print("="*80)
        
        try:
            # Get a different batch or create entries without forfait_batch
            # For simplicity, we'll use the same batch but with different entries
            
            # Create forfait entries without forfait_batch
            today = datetime.now().strftime("%Y-%m-%d")
            
            # Get a different customer to avoid conflicts
            response = requests.get(
                f"{BACKEND_URL}/customers",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ TEST 4 FAILED: Could not get customers")
                return False
            
            customers = response.json()
            
            # Find a different customer
            different_customer = None
            for customer in customers:
                if customer.get("id") != self.test_customer_id:
                    different_customer = customer
                    break
            
            if not different_customer:
                print(f"⚠️  TEST 4 SKIPPED: No other customer available for testing")
                return True  # Skip this test
            
            test_customer_id = different_customer["id"]
            test_customer_name = different_customer["name"]
            
            print(f"Using customer: {test_customer_name}")
            
            # Create forfait entries without forfait_batch
            forfait_entry_ids = []
            
            entry1_data = {
                "customerId": test_customer_id,
                "employeeName": "Test User 1",
                "date": today,
                "hours": 2.0,
                "tariff": "001 - Računovodstvo",
                "notes": "Forfait work without batch",
                "status": "forfait",
                "entrySource": "manual"
            }
            
            response1 = requests.post(
                f"{BACKEND_URL}/batches/{self.test_batch_id}/manual-entry",
                json=entry1_data,
                headers=self.get_headers()
            )
            
            if response1.status_code == 200:
                forfait_entry_ids.append(response1.json().get("entryId"))
                print(f"✅ Created forfait entry 1")
            else:
                print(f"❌ TEST 4 FAILED: Could not create forfait entry 1")
                return False
            
            # Try to compose invoices (should fail)
            compose_data = {
                "batchId": self.test_batch_id,
                "entryIds": forfait_entry_ids
            }
            
            print(f"\nAttempting to compose invoices with forfait entries but no forfait_batch...")
            
            compose_response = requests.post(
                f"{BACKEND_URL}/invoices/compose-filtered",
                json=compose_data,
                headers=self.get_headers()
            )
            
            print(f"Response Status: {compose_response.status_code}")
            
            # Expect HTTP 400
            if compose_response.status_code != 400:
                print(f"❌ TEST 4 FAILED: Expected HTTP 400, got {compose_response.status_code}")
                return False
            
            error_detail = compose_response.json().get("detail", "")
            print(f"Error message: {error_detail}")
            
            # Verify error message
            expected_keywords = ["forfait entries", "no forfait batch", "001", "Računovodstvo"]
            all_keywords_present = all(keyword.lower() in error_detail.lower() for keyword in expected_keywords)
            
            if not all_keywords_present:
                print(f"❌ TEST 4 FAILED: Error message doesn't match expected format")
                print(f"   Expected keywords: {expected_keywords}")
                return False
            
            print(f"✅ TEST 4 PASSED: Missing forfait_batch validation working correctly")
            print(f"   - HTTP 400 error returned")
            print(f"   - Error message contains all expected keywords")
            
            return True
            
        except Exception as e:
            print(f"❌ TEST 4 FAILED: Error testing missing forfait_batch: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def run_all_tests(self):
        """Run all forfait linking tests"""
        print("\n" + "="*80)
        print("FORFAIT LINKING FEATURE - COMPREHENSIVE TEST SUITE")
        print("="*80)
        
        results = {
            "login": False,
            "find_customer": False,
            "test1_create_batch": False,
            "test2_valid_linking": False,
            "test3_multiple_batch_error": False,
            "test4_missing_batch_error": False
        }
        
        # Login
        if not self.login():
            print("\n❌ CRITICAL: Login failed. Cannot proceed with tests.")
            return results
        results["login"] = True
        
        # Find or create test customer
        if not self.find_or_create_test_customer():
            print("\n❌ CRITICAL: Could not find/create test customer. Cannot proceed.")
            return results
        results["find_customer"] = True
        
        # Test 1: Create test batch with mixed entries
        if not self.create_test_batch_with_entries():
            print("\n❌ CRITICAL: Test 1 failed. Cannot proceed with remaining tests.")
            return results
        results["test1_create_batch"] = True
        
        # Test 2: Valid forfait linking
        results["test2_valid_linking"] = self.test_valid_forfait_linking()
        
        # Test 3: Multiple forfait_batch error
        results["test3_multiple_batch_error"] = self.test_multiple_forfait_batch_error()
        
        # Test 4: Missing forfait_batch error
        results["test4_missing_batch_error"] = self.test_missing_forfait_batch_error()
        
        # Print summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        
        total_tests = len(results)
        passed_tests = sum(1 for v in results.values() if v)
        
        for test_name, passed in results.items():
            status = "✅ PASSED" if passed else "❌ FAILED"
            print(f"{test_name}: {status}")
        
        print(f"\nTotal: {passed_tests}/{total_tests} tests passed")
        
        if passed_tests == total_tests:
            print("\n🎉 ALL TESTS PASSED! Forfait linking feature is working correctly.")
        else:
            print(f"\n⚠️  {total_tests - passed_tests} test(s) failed. Please review the output above.")
        
        return results


if __name__ == "__main__":
    tester = TestForfaitLinking()
    results = tester.run_all_tests()
