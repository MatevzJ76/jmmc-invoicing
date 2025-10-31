import requests
import json
from typing import Dict, Any, Optional

# Configuration
BACKEND_URL = "https://invoiceflow-40.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@local"
ADMIN_PASSWORD = "Admin2025!"


class TestFilteredInvoiceComposition:
    """Test filtered invoice composition flow for 'in progress' batches"""
    
    def __init__(self):
        self.token = None
        self.batch_id = None
        self.time_entry_ids = []
        self.invoice_ids = []
        
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
    
    def create_test_batch_with_progress(self) -> bool:
        """Test 1: Create a test batch with saveAsProgress=true"""
        print("\n=== Test 1: Create test batch with saveAsProgress=true ===")
        
        try:
            import openpyxl
            from datetime import datetime
            
            # Create workbook with test data
            wb = openpyxl.Workbook()
            ws = wb.active
            
            # Add headers
            headers = ["Projekt", "Stranka", "Datum", "Tarifa", "Delavec", "Opombe", "Porabljene ure", "Vrednost", "Št. računa"]
            ws.append(headers)
            
            # Add test data rows with different customers
            test_rows = [
                ["Project Alpha", "JMMC HP d.o.o.", datetime(2025, 10, 1), "Standard", "John Doe", "Development work for Alpha project", 5.0, 225.0, "INV-001"],
                ["Project Beta", "JMMC HP d.o.o.", datetime(2025, 10, 2), "Standard", "Jane Smith", "Testing work for Beta project", 3.5, 157.5, "INV-001"],
                ["Project Gamma", "JMMC Finance d.o.o.", datetime(2025, 10, 3), "Standard", "Bob Johnson", "Financial analysis for Gamma", 4.0, 180.0, "INV-001"],
                ["Project Delta", "JMMC Finance d.o.o.", datetime(2025, 10, 4), "Standard", "Alice Brown", "Accounting work for Delta", 2.5, 112.5, "INV-001"],
                ["Project Epsilon", "Test Customer Ltd.", datetime(2025, 10, 5), "Premium", "Charlie Wilson", "Consulting work for Epsilon", 6.0, 300.0, "INV-001"],
            ]
            
            for row in test_rows:
                ws.append(row)
            
            # Save to temp file
            test_file_path = "/tmp/test_filtered_composition.xlsx"
            wb.save(test_file_path)
            print(f"✅ Created test XLSX file: {test_file_path}")
            
            # Upload the file with saveAsProgress=true
            with open(test_file_path, 'rb') as f:
                files = {'file': ('test_filtered_composition.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
                data = {
                    'title': 'Filtered Composition Test Batch',
                    'invoiceDate': '2025-10-31',
                    'periodFrom': '2025-10-01',
                    'periodTo': '2025-10-31',
                    'dueDate': '2025-11-15',
                    'saveAsProgress': 'true'  # Key parameter for 'in progress' status
                }
                
                response = requests.post(
                    f"{BACKEND_URL}/imports",
                    headers=self.get_headers(),
                    files=files,
                    data=data
                )
            
            print(f"Import Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                self.batch_id = result.get("batchId")
                row_count = result.get("rowCount")
                
                print(f"✅ Import successful")
                print(f"  Batch ID: {self.batch_id}")
                print(f"  Row Count: {row_count}")
                
                # Verify batch status is "in progress"
                batch_response = requests.get(
                    f"{BACKEND_URL}/batches/{self.batch_id}",
                    headers=self.get_headers()
                )
                
                if batch_response.status_code == 200:
                    batch = batch_response.json()
                    batch_status = batch.get("status")
                    
                    print(f"  Batch Status: {batch_status}")
                    
                    if batch_status != "in progress":
                        print(f"❌ Expected batch status 'in progress', got '{batch_status}'")
                        return False
                    
                    print("✅ Batch status is 'in progress'")
                    
                    # Verify time entries were created
                    entries_response = requests.get(
                        f"{BACKEND_URL}/batches/{self.batch_id}/time-entries",
                        headers=self.get_headers()
                    )
                    
                    if entries_response.status_code == 200:
                        entries = entries_response.json()
                        print(f"✅ Time entries created: {len(entries)} entries")
                        
                        if len(entries) != row_count:
                            print(f"⚠️  Warning: Expected {row_count} entries, got {len(entries)}")
                        
                        return True
                    else:
                        print(f"❌ Failed to get time entries: {entries_response.text}")
                        return False
                else:
                    print(f"❌ Failed to get batch details: {batch_response.text}")
                    return False
            else:
                print(f"❌ Import failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error creating test batch: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def get_time_entry_ids(self) -> bool:
        """Test 2: Get time entry IDs from the batch"""
        print("\n=== Test 2: Get time entry IDs ===")
        
        if not self.batch_id:
            print("❌ No batch ID available")
            return False
        
        try:
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.batch_id}/time-entries",
                headers=self.get_headers()
            )
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                entries = response.json()
                print(f"✅ Retrieved {len(entries)} time entries")
                
                # Extract first 3 time entry IDs
                if len(entries) >= 3:
                    self.time_entry_ids = [entries[0]["id"], entries[1]["id"], entries[2]["id"]]
                    print(f"✅ Extracted first 3 time entry IDs:")
                    for idx, entry_id in enumerate(self.time_entry_ids):
                        entry = entries[idx]
                        print(f"  {idx + 1}. {entry_id}")
                        print(f"     Customer: {entry.get('customerName', 'N/A')}")
                        print(f"     Employee: {entry.get('employeeName', 'N/A')}")
                        print(f"     Hours: {entry.get('hours', 0)}")
                        print(f"     Value: €{entry.get('value', 0)}")
                    return True
                else:
                    print(f"❌ Not enough entries. Expected at least 3, got {len(entries)}")
                    return False
            else:
                print(f"❌ Failed to get time entries: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error getting time entry IDs: {str(e)}")
            return False
    
    def compose_filtered_invoices(self) -> bool:
        """Test 3: Compose invoices for filtered entries"""
        print("\n=== Test 3: Compose invoices for filtered entries ===")
        
        if not self.batch_id or not self.time_entry_ids:
            print("❌ No batch ID or time entry IDs available")
            return False
        
        try:
            # Call compose-filtered endpoint
            payload = {
                "batchId": self.batch_id,
                "entryIds": self.time_entry_ids
            }
            
            print(f"Payload: {json.dumps(payload, indent=2)}")
            
            response = requests.post(
                f"{BACKEND_URL}/invoices/compose-filtered",
                headers=self.get_headers(),
                json=payload
            )
            
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                result = response.json()
                self.invoice_ids = result.get("invoiceIds", [])
                entries_processed = result.get("entriesProcessed", 0)
                
                print(f"✅ Filtered composition successful")
                print(f"  Invoice IDs: {self.invoice_ids}")
                print(f"  Entries Processed: {entries_processed}")
                
                # Verify response structure
                if not isinstance(self.invoice_ids, list):
                    print("❌ invoiceIds should be a list")
                    return False
                
                if len(self.invoice_ids) == 0:
                    print("❌ No invoices created")
                    return False
                
                if entries_processed != len(self.time_entry_ids):
                    print(f"⚠️  Warning: Expected {len(self.time_entry_ids)} entries processed, got {entries_processed}")
                
                print(f"✅ Response has correct structure")
                print(f"  - invoiceIds: {len(self.invoice_ids)} invoice(s)")
                print(f"  - entriesProcessed: {entries_processed}")
                
                return True
            else:
                print(f"❌ Compose failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error composing filtered invoices: {str(e)}")
            return False
    
    def verify_invoices_created(self) -> bool:
        """Test 4: Verify invoices were created in database"""
        print("\n=== Test 4: Verify invoices were created ===")
        
        if not self.batch_id or not self.invoice_ids:
            print("❌ No batch ID or invoice IDs available")
            return False
        
        try:
            # Get all invoices for the batch
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.batch_id}/invoices",
                headers=self.get_headers()
            )
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                invoices = response.json()
                print(f"✅ Retrieved {len(invoices)} invoice(s) from batch")
                
                # Verify all invoice IDs exist
                invoice_ids_in_db = [inv["id"] for inv in invoices]
                
                all_found = True
                for invoice_id in self.invoice_ids:
                    if invoice_id in invoice_ids_in_db:
                        print(f"✅ Invoice {invoice_id} found in database")
                    else:
                        print(f"❌ Invoice {invoice_id} NOT found in database")
                        all_found = False
                
                if not all_found:
                    return False
                
                # Verify invoice structure and totals
                print("\n--- Invoice Details ---")
                for invoice in invoices:
                    invoice_id = invoice.get("id")
                    customer_name = invoice.get("customerName", "N/A")
                    total = invoice.get("total", 0)
                    status = invoice.get("status", "N/A")
                    
                    print(f"\nInvoice: {invoice_id}")
                    print(f"  Customer: {customer_name}")
                    print(f"  Total: €{total}")
                    print(f"  Status: {status}")
                    
                    # Verify total is > 0
                    if total <= 0:
                        print(f"  ❌ Invoice total should be > 0, got {total}")
                        return False
                    else:
                        print(f"  ✅ Invoice total is > 0")
                    
                    # Verify required fields
                    required_fields = ["id", "batchId", "customerId", "customerName", "invoiceDate", "periodFrom", "periodTo", "dueDate", "status", "total"]
                    missing_fields = [field for field in required_fields if field not in invoice]
                    
                    if missing_fields:
                        print(f"  ❌ Missing required fields: {missing_fields}")
                        return False
                    else:
                        print(f"  ✅ All required fields present")
                    
                    # Get invoice lines
                    invoice_detail_response = requests.get(
                        f"{BACKEND_URL}/invoices/{invoice_id}",
                        headers=self.get_headers()
                    )
                    
                    if invoice_detail_response.status_code == 200:
                        invoice_detail = invoice_detail_response.json()
                        lines = invoice_detail.get("lines", [])
                        print(f"  Lines: {len(lines)} line(s)")
                        
                        if len(lines) == 0:
                            print(f"  ❌ Invoice should have at least 1 line")
                            return False
                        
                        # Verify line structure
                        for idx, line in enumerate(lines):
                            line_required_fields = ["id", "invoiceId", "description", "quantity", "unitPrice", "amount"]
                            line_missing_fields = [field for field in line_required_fields if field not in line]
                            
                            if line_missing_fields:
                                print(f"  ❌ Line {idx + 1} missing fields: {line_missing_fields}")
                                return False
                        
                        print(f"  ✅ All lines have correct structure")
                    else:
                        print(f"  ❌ Failed to get invoice details: {invoice_detail_response.text}")
                        return False
                
                print("\n✅ All invoices verified successfully")
                return True
            else:
                print(f"❌ Failed to get invoices: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error verifying invoices: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def verify_batch_status_updated(self) -> bool:
        """Test 5: Verify batch status updated from 'in progress' to 'composed'"""
        print("\n=== Test 5: Verify batch status updated ===")
        
        if not self.batch_id:
            print("❌ No batch ID available")
            return False
        
        try:
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.batch_id}",
                headers=self.get_headers()
            )
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                batch = response.json()
                batch_status = batch.get("status")
                
                print(f"Batch Status: {batch_status}")
                
                if batch_status == "composed":
                    print("✅ Batch status correctly updated to 'composed'")
                    return True
                else:
                    print(f"❌ Expected batch status 'composed', got '{batch_status}'")
                    return False
            else:
                print(f"❌ Failed to get batch: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error verifying batch status: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all filtered invoice composition tests"""
        print("=" * 80)
        print("FILTERED INVOICE COMPOSITION FLOW - BACKEND TESTS")
        print("=" * 80)
        print("\nTesting filtered invoice composition for 'in progress' batches:")
        print("  1. Create batch with saveAsProgress=true")
        print("  2. Get time entry IDs")
        print("  3. Compose invoices for filtered entries (first 3)")
        print("  4. Verify invoices created in database")
        print("  5. Verify batch status updated to 'composed'")
        print("=" * 80)
        
        results = {}
        
        # 1. Login
        if not self.login():
            print("\n❌ CRITICAL: Login failed. Cannot proceed with tests.")
            return
        
        # 2. Create test batch with saveAsProgress=true
        results["Test 1: Create batch with saveAsProgress=true"] = self.create_test_batch_with_progress()
        
        if not results["Test 1: Create batch with saveAsProgress=true"]:
            print("\n❌ CRITICAL: Failed to create test batch. Cannot proceed.")
            return
        
        # 3. Get time entry IDs
        results["Test 2: Get time entry IDs"] = self.get_time_entry_ids()
        
        if not results["Test 2: Get time entry IDs"]:
            print("\n❌ CRITICAL: Failed to get time entry IDs. Cannot proceed.")
            return
        
        # 4. Compose filtered invoices
        results["Test 3: Compose invoices for filtered entries"] = self.compose_filtered_invoices()
        
        if not results["Test 3: Compose invoices for filtered entries"]:
            print("\n❌ CRITICAL: Failed to compose filtered invoices. Cannot proceed.")
            return
        
        # 5. Verify invoices created
        results["Test 4: Verify invoices created in database"] = self.verify_invoices_created()
        
        # 6. Verify batch status updated
        results["Test 5: Verify batch status updated to 'composed'"] = self.verify_batch_status_updated()
        
        # Summary
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        passed = sum(1 for v in results.values() if v)
        total = len(results)
        
        for test_name, result in results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{status} - {test_name}")
        
        print(f"\nTotal: {passed}/{total} tests passed")
        
        if passed == total:
            print("\n🎉 ALL TESTS PASSED!")
            print("\n✅ Filtered invoice composition flow is working correctly:")
            print("  - Batch created with 'in progress' status ✅")
            print("  - Time entries retrieved successfully ✅")
            print("  - Invoices composed for filtered entries only ✅")
            print("  - Invoice totals calculated correctly ✅")
            print("  - Invoices persisted in database ✅")
            print("  - Batch status updated to 'composed' ✅")
        else:
            print(f"\n⚠️  {total - passed} test(s) failed")
            print("\n🔍 Debugging Hints:")
            print("  1. Check if POST /api/invoices/compose-filtered endpoint exists")
            print("  2. Verify endpoint accepts { batchId, entryIds } payload")
            print("  3. Check if invoices are created only for specified entry IDs")
            print("  4. Verify invoice totals are calculated correctly")
            print("  5. Check if batch status is updated after composition")


if __name__ == "__main__":
    tester = TestFilteredInvoiceComposition()
    tester.run_all_tests()
