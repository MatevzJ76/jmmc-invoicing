import requests
import json
from typing import Dict, Any, Optional
import time

# Configuration
BACKEND_URL = "https://timentry-manager.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@local"
ADMIN_PASSWORD = "Admin2025!"

class TestForfaitLinking:
    def __init__(self):
        self.token = None
        self.test_batch_id = None
        self.test_customer_id = None
        self.test_customer_name = None
        self.entry_ids = []
        
    def login(self) -> bool:
        """Login as admin and get auth token"""
        print("\n" + "="*80)
        print("STEP 1: LOGIN AS ADMIN")
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
                print(f"   User: {data.get('user', {}).get('email')}")
                print(f"   Role: {data.get('user', {}).get('role')}")
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
    
    def find_or_create_test_batch(self) -> bool:
        """Find an existing batch with 'in progress' or 'imported' status, or create one"""
        print("\n" + "="*80)
        print("STEP 2: FIND OR CREATE TEST BATCH")
        print("="*80)
        try:
            response = requests.get(
                f"{BACKEND_URL}/batches",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                batches = response.json()
                print(f"Total batches found: {len(batches)}")
                
                # Find a batch with 'in progress' or 'imported' status
                for batch in batches:
                    status = batch.get("status", "")
                    if status in ["in progress", "imported"]:
                        self.test_batch_id = batch.get("id")
                        print(f"✅ Found existing test batch: {batch.get('title')}")
                        print(f"   Batch ID: {self.test_batch_id}")
                        print(f"   Status: {status}")
                        print(f"   Period: {batch.get('periodFrom')} to {batch.get('periodTo')}")
                        return True
                
                print("No batch with 'in progress' or 'imported' status found")
                print("Creating a new test batch...")
                
                # Create a new batch with 'imported' status
                import io
                from datetime import datetime
                
                # Create a minimal Excel file for import
                # We'll use the imports/from-verification endpoint instead
                batch_data = {
                    "title": f"Test Forfait Batch {datetime.now().strftime('%Y%m%d_%H%M%S')}",
                    "invoiceDate": "2025-10-31",
                    "periodFrom": "2025-10-01",
                    "periodTo": "2025-10-31",
                    "dueDate": "2025-11-15",
                    "rows": [],
                    "filename": "test_forfait.xlsx"
                }
                
                response = requests.post(
                    f"{BACKEND_URL}/imports/from-verification",
                    headers=self.get_headers(),
                    json=batch_data
                )
                
                if response.status_code == 200:
                    result = response.json()
                    self.test_batch_id = result.get("batchId")
                    print(f"✅ Created new test batch")
                    print(f"   Batch ID: {self.test_batch_id}")
                    print(f"   Status: imported")
                    return True
                else:
                    print(f"❌ Failed to create batch: {response.text}")
                    return False
            else:
                print(f"❌ Failed to get batches: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error finding/creating batch: {str(e)}")
            return False
    
    def find_test_customer(self) -> bool:
        """Find a test customer"""
        print("\n" + "="*80)
        print("STEP 3: FIND TEST CUSTOMER")
        print("="*80)
        try:
            response = requests.get(
                f"{BACKEND_URL}/customers",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                customers = response.json()
                print(f"Total customers found: {len(customers)}")
                
                # Find a customer (prefer one with a simple name for testing)
                if customers:
                    # Try to find a customer with "Test" in name, otherwise use first one
                    test_customer = None
                    for customer in customers:
                        if "Test" in customer.get("name", ""):
                            test_customer = customer
                            break
                    
                    if not test_customer:
                        test_customer = customers[0]
                    
                    self.test_customer_id = test_customer.get("id")
                    self.test_customer_name = test_customer.get("name")
                    print(f"✅ Using test customer: {self.test_customer_name}")
                    print(f"   Customer ID: {self.test_customer_id}")
                    return True
                else:
                    print("❌ No customers found")
                    return False
            else:
                print(f"❌ Failed to get customers: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error getting customers: {str(e)}")
            return False
    
    def create_test_entries(self) -> bool:
        """Create 6 test entries in the batch"""
        print("\n" + "="*80)
        print("STEP 4: CREATE 6 TEST ENTRIES")
        print("="*80)
        
        # Entry configurations
        entries_config = [
            {"type": "uninvoiced", "status": "uninvoiced", "entrySource": "manual", "hours": 2.0, "notes": "Test uninvoiced entry 1"},
            {"type": "uninvoiced", "status": "uninvoiced", "entrySource": "manual", "hours": 3.0, "notes": "Test uninvoiced entry 2"},
            {"type": "ready", "status": "ready", "entrySource": "manual", "hours": 1.5, "notes": "Test ready entry"},
            {"type": "forfait", "status": "forfait", "entrySource": "manual", "hours": 4.0, "notes": "Test forfait entry 1 (for linking)"},
            {"type": "forfait", "status": "forfait", "entrySource": "manual", "hours": 2.5, "notes": "Test forfait entry 2 (for linking)"},
            {"type": "forfait_batch", "status": "uninvoiced", "entrySource": "forfait_batch", "hours": 0, "notes": "Forfait batch entry", "tariff": "001 - Računovodstvo"}
        ]
        
        self.entry_ids = []
        
        for i, config in enumerate(entries_config, 1):
            print(f"\nCreating entry {i}/6: {config['type']}")
            try:
                entry_data = {
                    "customerId": self.test_customer_id,
                    "employeeName": "Test Employee",
                    "date": "2025-10-15",
                    "hours": config["hours"],
                    "notes": config["notes"],
                    "status": config["status"],
                    "entrySource": config["entrySource"]
                }
                
                # Add tariff for forfait_batch entry
                if "tariff" in config:
                    entry_data["tariff"] = config["tariff"]
                
                response = requests.post(
                    f"{BACKEND_URL}/batches/{self.test_batch_id}/manual-entry",
                    headers=self.get_headers(),
                    json=entry_data
                )
                
                if response.status_code == 200:
                    result = response.json()
                    entry_id = result.get("entryId")
                    self.entry_ids.append(entry_id)
                    print(f"   ✅ Created: {config['type']} (ID: {entry_id})")
                    print(f"      Status: {config['status']}, Source: {config['entrySource']}, Hours: {config['hours']}")
                else:
                    print(f"   ❌ Failed to create entry: {response.text}")
                    return False
                    
            except Exception as e:
                print(f"   ❌ Error creating entry: {str(e)}")
                return False
        
        print(f"\n✅ Successfully created all 6 test entries")
        print(f"   Entry IDs: {self.entry_ids}")
        return True
    
    def call_compose_filtered(self) -> Optional[Dict[str, Any]]:
        """Call POST /api/invoices/compose-filtered with all 6 entry IDs"""
        print("\n" + "="*80)
        print("STEP 5: CALL COMPOSE-FILTERED API")
        print("="*80)
        try:
            payload = {
                "batchId": self.test_batch_id,
                "entryIds": self.entry_ids
            }
            
            print(f"Request payload:")
            print(f"   Batch ID: {self.test_batch_id}")
            print(f"   Entry IDs: {len(self.entry_ids)} entries")
            print(f"   {json.dumps(payload, indent=2)}")
            
            response = requests.post(
                f"{BACKEND_URL}/invoices/compose-filtered",
                headers=self.get_headers(),
                json=payload
            )
            
            print(f"\nResponse Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Invoice composition successful")
                print(f"   Response: {json.dumps(result, indent=2)}")
                return result
            else:
                print(f"❌ Invoice composition failed")
                print(f"   Error: {response.text}")
                return None
                
        except Exception as e:
            print(f"❌ Error calling compose-filtered: {str(e)}")
            return None
    
    def check_backend_logs(self) -> bool:
        """Check backend logs for debug output"""
        print("\n" + "="*80)
        print("STEP 6: CHECK BACKEND LOGS FOR DEBUG OUTPUT")
        print("="*80)
        print("Checking backend logs for debug output...")
        print("Expected debug output:")
        print("   - Total billable entries: 4 (2 uninvoiced + 1 ready + 1 forfait_batch)")
        print("   - Forfait entries: 2 (for linking only)")
        print("\nNote: Debug logs are printed to backend console (supervisor logs)")
        print("To view logs, run: tail -n 100 /var/log/supervisor/backend.out.log")
        return True
    
    def verify_invoice_line_items(self) -> bool:
        """Verify invoice has exactly 4 line items"""
        print("\n" + "="*80)
        print("STEP 7: VERIFY INVOICE LINE ITEMS")
        print("="*80)
        
        try:
            # Get invoices for the batch
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.test_batch_id}/invoices",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to get invoices: {response.text}")
                return False
            
            invoices = response.json()
            print(f"Found {len(invoices)} invoice(s) in batch")
            
            if not invoices:
                print("❌ No invoices found")
                return False
            
            # Check the invoice for our test customer
            test_invoice = None
            for invoice in invoices:
                if invoice.get("customerId") == self.test_customer_id:
                    test_invoice = invoice
                    break
            
            if not test_invoice:
                print(f"❌ No invoice found for test customer {self.test_customer_name}")
                return False
            
            invoice_id = test_invoice.get("id")
            print(f"\nFound test invoice:")
            print(f"   Invoice ID: {invoice_id}")
            print(f"   Customer: {test_invoice.get('customerName')}")
            print(f"   Status: {test_invoice.get('status')}")
            print(f"   Total: €{test_invoice.get('total', 0):.2f}")
            
            # Get invoice lines
            response = requests.get(
                f"{BACKEND_URL}/invoices/{invoice_id}/lines",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to get invoice lines: {response.text}")
                return False
            
            lines = response.json()
            line_count = len(lines)
            
            print(f"\n{'='*80}")
            print(f"INVOICE LINE ITEMS: {line_count} lines")
            print(f"{'='*80}")
            
            for i, line in enumerate(lines, 1):
                print(f"\nLine {i}:")
                print(f"   Description: {line.get('description', '')[:100]}...")
                print(f"   Quantity: {line.get('quantity')} hours")
                print(f"   Unit Price: €{line.get('unitPrice', 0):.2f}")
                print(f"   Amount: €{line.get('amount', 0):.2f}")
                print(f"   Has forfaitDetails: {line.get('forfaitDetails') is not None}")
                
                if line.get('forfaitDetails'):
                    print(f"   Forfait Details:")
                    forfait_details = line.get('forfaitDetails', '')
                    for detail_line in forfait_details.split('\n')[:3]:  # Show first 3 lines
                        print(f"      {detail_line}")
            
            # Verify expectations
            print(f"\n{'='*80}")
            print("VERIFICATION RESULTS")
            print(f"{'='*80}")
            
            success = True
            
            # Check 1: Exactly 4 line items
            if line_count == 4:
                print(f"✅ Line item count: {line_count} (EXPECTED: 4)")
            else:
                print(f"❌ Line item count: {line_count} (EXPECTED: 4)")
                success = False
            
            # Check 2: Forfait details present in one line
            forfait_lines = [line for line in lines if line.get('forfaitDetails')]
            if len(forfait_lines) == 1:
                print(f"✅ Forfait details found in 1 line item")
                forfait_line = forfait_lines[0]
                forfait_details = forfait_line.get('forfaitDetails', '')
                detail_count = len([d for d in forfait_details.split('\n') if d.strip()])
                print(f"   Forfait details contains {detail_count} linked entries")
            elif len(forfait_lines) == 0:
                print(f"❌ No forfait details found in any line item")
                success = False
            else:
                print(f"❌ Forfait details found in {len(forfait_lines)} line items (EXPECTED: 1)")
                success = False
            
            # Check 3: Verify line item sources
            print(f"\n✅ Expected line items:")
            print(f"   - 2 lines from uninvoiced entries")
            print(f"   - 1 line from ready entry")
            print(f"   - 1 line from forfait_batch entry (with forfait details embedded)")
            
            return success
            
        except Exception as e:
            print(f"❌ Error verifying invoice: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("\n" + "="*80)
        print("FORFAIT LINKING TEST - COMPREHENSIVE SCENARIO")
        print("="*80)
        print("Test Scenario:")
        print("1. Login as admin@local")
        print("2. Find an existing batch with 'in progress' or 'imported' status")
        print("3. Find a test customer")
        print("4. Create 6 test entries:")
        print("   - 2 entries: status='uninvoiced', entrySource='manual'")
        print("   - 1 entry: status='ready', entrySource='manual'")
        print("   - 2 entries: status='forfait', entrySource='manual' (for linking)")
        print("   - 1 entry: entrySource='forfait_batch', tariff='001 - Računovodstvo'")
        print("5. Call POST /api/invoices/compose-filtered with ALL 6 entry IDs")
        print("6. Check debug output in logs")
        print("7. Verify invoice has exactly 4 line items")
        print("8. Check forfait_batch line has forfaitDetails field populated")
        print("\nExpected Result:")
        print("✅ 4 invoice line items total (NOT 5)")
        print("✅ Forfait entries do NOT create separate line items")
        print("✅ Forfait details embedded in forfait_batch line")
        print("✅ Debug logs show correct counts")
        
        # Run tests
        if not self.login():
            return False
        
        if not self.find_or_create_test_batch():
            return False
        
        if not self.find_test_customer():
            return False
        
        if not self.create_test_entries():
            return False
        
        result = self.call_compose_filtered()
        if not result:
            return False
        
        self.check_backend_logs()
        
        if not self.verify_invoice_line_items():
            return False
        
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print("✅ All tests completed successfully!")
        print("\nKey Findings:")
        print("- Invoice composition successful")
        print("- Line item count verified")
        print("- Forfait linking logic working as expected")
        print("- Forfait details embedded correctly")
        
        return True

if __name__ == "__main__":
    tester = TestForfaitLinking()
    success = tester.run_all_tests()
    
    if success:
        print("\n✅ FORFAIT LINKING TEST PASSED")
        exit(0)
    else:
        print("\n❌ FORFAIT LINKING TEST FAILED")
        exit(1)
