import requests
import json
from typing import Dict, Any
import openpyxl
from datetime import datetime

# Configuration
BACKEND_URL = "https://invoice-workflow-2.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@local"
ADMIN_PASSWORD = "Admin2025!"


class TestInvoiceCompositionStatus:
    """Test invoice composition endpoints to verify status='draft' instead of 'imported'"""
    
    def __init__(self):
        self.token = None
        self.batch_id = None
        self.time_entries = []
        
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
    
    def create_test_batch(self) -> bool:
        """Create a test batch with saveAsProgress=true"""
        print("\n=== Creating Test Batch ===")
        
        try:
            # Create workbook with test data
            wb = openpyxl.Workbook()
            ws = wb.active
            
            # Add headers
            headers = ["Projekt", "Stranka", "Datum", "Tarifa", "Delavec", "Opombe", "Porabljene ure", "Vrednost", "Št. računa"]
            ws.append(headers)
            
            # Add test data rows with different customers
            test_rows = [
                ["Project Alpha", "JMMC HP d.o.o.", datetime(2025, 10, 1), "002 - 45 EUR/uro", "John Doe", "Development work for HP", 8.0, 360.0, ""],
                ["Project Beta", "JMMC HP d.o.o.", datetime(2025, 10, 2), "002 - 45 EUR/uro", "Jane Smith", "Testing work for HP", 4.5, 202.5, ""],
                ["Project Gamma", "JMMC Finance d.o.o.", datetime(2025, 10, 3), "002 - 45 EUR/uro", "Bob Johnson", "Finance system work", 6.0, 270.0, ""],
                ["Project Delta", "Test Customer Ltd", datetime(2025, 10, 4), "002 - 45 EUR/uro", "Alice Brown", "Consulting work", 5.0, 225.0, ""],
            ]
            
            for row in test_rows:
                ws.append(row)
            
            # Save to temp file
            test_file_path = "/tmp/test_invoice_composition.xlsx"
            wb.save(test_file_path)
            print(f"✅ Created test XLSX file: {test_file_path}")
            
            # Upload the file with saveAsProgress=true
            with open(test_file_path, 'rb') as f:
                files = {'file': ('test_invoice_composition.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
                data = {
                    'title': 'Invoice Composition Status Test',
                    'invoiceDate': '2025-10-31',
                    'periodFrom': '2025-10-01',
                    'periodTo': '2025-10-31',
                    'dueDate': '2025-11-15',
                    'saveAsProgress': 'true'
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
                
                # Get time entries
                response = requests.get(
                    f"{BACKEND_URL}/batches/{self.batch_id}/time-entries",
                    headers=self.get_headers()
                )
                
                if response.status_code == 200:
                    self.time_entries = response.json()
                    print(f"✅ Retrieved {len(self.time_entries)} time entries")
                    return True
                else:
                    print(f"❌ Failed to get time entries: {response.text}")
                    return False
            else:
                print(f"❌ Import failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error creating batch: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def test_compose_invoices(self) -> bool:
        """Test POST /api/invoices/compose - verify all invoices have status='draft'"""
        print("\n=== Test 1: POST /api/invoices/compose ===")
        
        if not self.batch_id:
            print("❌ No batch ID available")
            return False
        
        try:
            # Compose invoices
            response = requests.post(
                f"{BACKEND_URL}/invoices/compose",
                headers=self.get_headers(),
                params={"batchId": self.batch_id}
            )
            
            print(f"Compose Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code != 200:
                print(f"❌ Failed to compose invoices: {response.text}")
                return False
            
            result = response.json()
            invoice_ids = result.get("invoiceIds", [])
            
            print(f"✅ Composed {len(invoice_ids)} invoices")
            print(f"  Invoice IDs: {invoice_ids}")
            
            # Get all invoices and verify status
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.batch_id}/invoices",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to get invoices: {response.text}")
                return False
            
            invoices = response.json()
            print(f"\n📋 Verifying invoice statuses:")
            
            all_draft = True
            has_imported = False
            
            for idx, invoice in enumerate(invoices):
                invoice_id = invoice.get("id")
                status = invoice.get("status")
                customer_name = invoice.get("customerName")
                total = invoice.get("total")
                
                print(f"\nInvoice {idx + 1}:")
                print(f"  ID: {invoice_id}")
                print(f"  Customer: {customer_name}")
                print(f"  Total: €{total}")
                print(f"  Status: {status}")
                
                if status == "imported":
                    print(f"  ❌ FAIL: Status is 'imported' (should be 'draft')")
                    has_imported = True
                    all_draft = False
                elif status == "draft":
                    print(f"  ✅ PASS: Status is 'draft'")
                else:
                    print(f"  ⚠️  WARNING: Unexpected status '{status}'")
                    all_draft = False
            
            if has_imported:
                print(f"\n❌ TEST FAILED: Found invoices with status='imported'")
                return False
            
            if all_draft:
                print(f"\n✅ TEST PASSED: All {len(invoices)} invoices have status='draft'")
                return True
            else:
                print(f"\n❌ TEST FAILED: Not all invoices have status='draft'")
                return False
                
        except Exception as e:
            print(f"❌ Error testing compose: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def test_compose_filtered_invoices(self) -> bool:
        """Test POST /api/invoices/compose-filtered - verify all invoices have status='draft'"""
        print("\n=== Test 2: POST /api/invoices/compose-filtered ===")
        
        # Create a new batch for this test
        print("\n📦 Creating new batch for filtered composition test...")
        if not self.create_test_batch():
            print("❌ Failed to create new batch")
            return False
        
        if not self.batch_id or not self.time_entries:
            print("❌ No batch or time entries available")
            return False
        
        try:
            # Select first 2 time entries for filtered composition
            entry_ids = [entry["id"] for entry in self.time_entries[:2]]
            
            print(f"\n📝 Composing invoices for {len(entry_ids)} selected entries:")
            for idx, entry_id in enumerate(entry_ids):
                entry = self.time_entries[idx]
                print(f"  Entry {idx + 1}: {entry.get('employeeName')} - {entry.get('customerName')} - {entry.get('hours')}h")
            
            # Compose filtered invoices
            response = requests.post(
                f"{BACKEND_URL}/invoices/compose-filtered",
                headers=self.get_headers(),
                json={
                    "batchId": self.batch_id,
                    "entryIds": entry_ids
                }
            )
            
            print(f"\nCompose Filtered Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code != 200:
                print(f"❌ Failed to compose filtered invoices: {response.text}")
                return False
            
            result = response.json()
            invoice_ids = result.get("invoiceIds", [])
            entries_processed = result.get("entriesProcessed", 0)
            
            print(f"✅ Composed {len(invoice_ids)} invoices")
            print(f"  Invoice IDs: {invoice_ids}")
            print(f"  Entries Processed: {entries_processed}")
            
            # Get all invoices and verify status
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.batch_id}/invoices",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to get invoices: {response.text}")
                return False
            
            invoices = response.json()
            print(f"\n📋 Verifying invoice statuses:")
            
            all_draft = True
            has_imported = False
            
            for idx, invoice in enumerate(invoices):
                invoice_id = invoice.get("id")
                status = invoice.get("status")
                customer_name = invoice.get("customerName")
                total = invoice.get("total")
                
                print(f"\nInvoice {idx + 1}:")
                print(f"  ID: {invoice_id}")
                print(f"  Customer: {customer_name}")
                print(f"  Total: €{total}")
                print(f"  Status: {status}")
                
                if status == "imported":
                    print(f"  ❌ FAIL: Status is 'imported' (should be 'draft')")
                    has_imported = True
                    all_draft = False
                elif status == "draft":
                    print(f"  ✅ PASS: Status is 'draft'")
                else:
                    print(f"  ⚠️  WARNING: Unexpected status '{status}'")
                    all_draft = False
            
            if has_imported:
                print(f"\n❌ TEST FAILED: Found invoices with status='imported'")
                return False
            
            if all_draft:
                print(f"\n✅ TEST PASSED: All {len(invoices)} invoices have status='draft'")
                return True
            else:
                print(f"\n❌ TEST FAILED: Not all invoices have status='draft'")
                return False
                
        except Exception as e:
            print(f"❌ Error testing compose-filtered: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def run_all_tests(self):
        """Run all invoice composition status tests"""
        print("=" * 80)
        print("INVOICE COMPOSITION STATUS - BACKEND TESTS")
        print("=" * 80)
        print("\nTesting that invoices created via compose endpoints have status='draft'")
        print("instead of 'imported' (as reported by user)")
        print("\nEndpoints tested:")
        print("  1. POST /api/invoices/compose")
        print("  2. POST /api/invoices/compose-filtered")
        print("=" * 80)
        
        results = {}
        
        # 1. Login
        if not self.login():
            print("\n❌ CRITICAL: Login failed. Cannot proceed with tests.")
            return
        
        # 2. Create test batch
        print("\n📦 Creating first test batch...")
        if not self.create_test_batch():
            print("\n❌ CRITICAL: Failed to create test batch. Cannot proceed.")
            return
        
        # 3. Test compose invoices
        results["Test 1: POST /api/invoices/compose - status='draft'"] = self.test_compose_invoices()
        
        # 4. Test compose filtered invoices
        results["Test 2: POST /api/invoices/compose-filtered - status='draft'"] = self.test_compose_filtered_invoices()
        
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
            print("\n✅ Invoice composition status fix is working correctly:")
            print("  - POST /api/invoices/compose creates invoices with status='draft' ✅")
            print("  - POST /api/invoices/compose-filtered creates invoices with status='draft' ✅")
            print("  - No invoices have status='imported' anymore ✅")
            print("\n📝 User-reported issue is FIXED:")
            print("  - Invoices posted from Import Verification page now have status='Draft'")
            print("  - Previously they had status='Imported' which was incorrect")
        else:
            print(f"\n⚠️  {total - passed} test(s) failed")
            print("\n🔍 Debugging Hints:")
            print("  1. Check server.py line 3021 (POST /api/invoices/compose)")
            print("  2. Check server.py line 3129 (POST /api/invoices/compose-filtered)")
            print("  3. Verify both endpoints set status='draft' not 'imported'")
            print("  4. Check backend logs for any errors")


if __name__ == "__main__":
    # Run the invoice composition status tests
    tester = TestInvoiceCompositionStatus()
    tester.run_all_tests()
