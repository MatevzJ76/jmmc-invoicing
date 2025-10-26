import requests
import json
from typing import Dict, Any, Optional

# Configuration
BACKEND_URL = "https://eracun-integration.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@local"
ADMIN_PASSWORD = "Admin2025!"

class TestMoveTimeEntry:
    def __init__(self):
        self.token = None
        self.customers = []
        self.test_batch_id = "eee5c6ba-330d-4034-a209-9ea96cec222c"
        
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
    
    def test_get_customers(self) -> bool:
        """Test GET /api/customers endpoint"""
        print("\n=== Testing GET /api/customers ===")
        try:
            response = requests.get(
                f"{BACKEND_URL}/customers",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                self.customers = response.json()
                print(f"✅ Retrieved {len(self.customers)} customers")
                
                # Verify structure
                if self.customers:
                    sample = self.customers[0]
                    has_id = "id" in sample
                    has_name = "name" in sample
                    
                    print(f"Sample customer: {sample}")
                    print(f"Has 'id' field: {has_id}")
                    print(f"Has 'name' field: {has_name}")
                    
                    if not (has_id and has_name):
                        print("❌ Customer objects missing required fields")
                        return False
                
                # List all customers
                print("\nAll customers:")
                for customer in self.customers:
                    print(f"  - {customer.get('name')} (ID: {customer.get('id')})")
                
                return True
            else:
                print(f"❌ Failed to get customers: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error getting customers: {str(e)}")
            return False
    
    def get_customer_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Find customer by name"""
        for customer in self.customers:
            if name in customer.get("name", ""):
                return customer
        return None
    
    def get_time_entries_from_batch(self) -> list:
        """Get time entries from the test batch"""
        print(f"\n=== Getting time entries from batch {self.test_batch_id} ===")
        try:
            # We need to query MongoDB directly or use an endpoint
            # Let's try to get batch verification data which includes entries
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.test_batch_id}/verification",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                all_entries = []
                all_entries.extend(data.get("jmmcHP", []))
                all_entries.extend(data.get("jmmcFinance", []))
                all_entries.extend(data.get("noClient", []))
                
                print(f"✅ Found {len(all_entries)} time entries in batch")
                print(f"  - JMMC HP: {len(data.get('jmmcHP', []))}")
                print(f"  - JMMC Finance: {len(data.get('jmmcFinance', []))}")
                print(f"  - No Client: {len(data.get('noClient', []))}")
                
                return all_entries
            else:
                print(f"❌ Failed to get batch verification: {response.text}")
                return []
        except Exception as e:
            print(f"❌ Error getting time entries: {str(e)}")
            return []
    
    def get_invoice_for_customer(self, customer_id: str) -> Optional[Dict[str, Any]]:
        """Get invoice for a specific customer in the test batch"""
        try:
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.test_batch_id}/invoices",
                headers=self.get_headers()
            )
            
            if response.status_code == 200:
                invoices = response.json()
                for invoice in invoices:
                    if invoice.get("customerId") == customer_id:
                        return invoice
            return None
        except Exception as e:
            print(f"Error getting invoice: {str(e)}")
            return None
    
    def verify_time_entry_in_invoice(self, entry_id: str, customer_id: str) -> bool:
        """Verify if a time entry is in a customer's invoice"""
        invoice = self.get_invoice_for_customer(customer_id)
        if not invoice:
            return False
        
        lines = invoice.get("lines", [])
        for line in lines:
            if line.get("timeEntryId") == entry_id:
                return True
        return False
    
    def test_move_time_entry(self, entry_id: str, new_customer_id: str, 
                            old_customer_id: str, scenario_name: str) -> bool:
        """Test moving a time entry to a different customer"""
        print(f"\n=== Testing: {scenario_name} ===")
        print(f"Entry ID: {entry_id}")
        print(f"Old Customer ID: {old_customer_id}")
        print(f"New Customer ID: {new_customer_id}")
        
        try:
            # Get old invoice state
            old_invoice_before = self.get_invoice_for_customer(old_customer_id)
            old_lines_count_before = len(old_invoice_before.get("lines", [])) if old_invoice_before else 0
            old_total_before = old_invoice_before.get("total", 0) if old_invoice_before else 0
            
            new_invoice_before = self.get_invoice_for_customer(new_customer_id)
            new_lines_count_before = len(new_invoice_before.get("lines", [])) if new_invoice_before else 0
            new_total_before = new_invoice_before.get("total", 0) if new_invoice_before else 0
            
            print(f"\nBefore move:")
            print(f"  Old customer invoice: {old_lines_count_before} lines, total: {old_total_before}")
            print(f"  New customer invoice: {new_lines_count_before} lines, total: {new_total_before}")
            
            # Move the entry
            response = requests.post(
                f"{BACKEND_URL}/time-entries/{entry_id}/move-customer",
                headers=self.get_headers(),
                data={"new_customer_id": new_customer_id}
            )
            print(f"\nMove API Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code != 200:
                print(f"❌ Move failed")
                return False
            
            # Verify the move
            print("\n--- Verification ---")
            
            # 1. Check old invoice
            old_invoice_after = self.get_invoice_for_customer(old_customer_id)
            if old_invoice_after:
                old_lines_count_after = len(old_invoice_after.get("lines", []))
                old_total_after = old_invoice_after.get("total", 0)
                
                # Verify entry is removed
                entry_in_old = self.verify_time_entry_in_invoice(entry_id, old_customer_id)
                
                print(f"Old customer invoice after:")
                print(f"  Lines: {old_lines_count_before} -> {old_lines_count_after}")
                print(f"  Total: {old_total_before} -> {old_total_after}")
                print(f"  Entry still in old invoice: {entry_in_old}")
                
                if entry_in_old:
                    print("❌ Entry still exists in old customer's invoice (duplication!)")
                    return False
                
                # Don't check line count - other entries may exist for this customer
                print("✅ Entry successfully removed from old invoice")
            
            # 2. Check new invoice
            new_invoice_after = self.get_invoice_for_customer(new_customer_id)
            if new_invoice_after:
                new_lines_count_after = len(new_invoice_after.get("lines", []))
                new_total_after = new_invoice_after.get("total", 0)
                
                # Verify entry is added
                entry_in_new = self.verify_time_entry_in_invoice(entry_id, new_customer_id)
                
                print(f"\nNew customer invoice after:")
                print(f"  Lines: {new_lines_count_before} -> {new_lines_count_after}")
                print(f"  Total: {new_total_before} -> {new_total_after}")
                print(f"  Entry in new invoice: {entry_in_new}")
                
                if not entry_in_new:
                    print("❌ Entry not found in new customer's invoice")
                    return False
                
                print("✅ Entry successfully added to new invoice")
            else:
                print("❌ New customer invoice not found after move")
                return False
            
            print(f"\n✅ {scenario_name} - PASSED")
            return True
            
        except Exception as e:
            print(f"❌ Error during move: {str(e)}")
            return False
    
    def test_move_invalid_entry(self) -> bool:
        """Test moving with invalid entry_id"""
        print("\n=== Testing: Move with invalid entry_id ===")
        
        invalid_entry_id = "invalid-entry-id-12345"
        customer = self.customers[0] if self.customers else None
        
        if not customer:
            print("❌ No customers available for test")
            return False
        
        try:
            response = requests.post(
                f"{BACKEND_URL}/time-entries/{invalid_entry_id}/move-customer",
                headers=self.get_headers(),
                data={"new_customer_id": customer["id"]}
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 404:
                print("✅ Correctly returned 404 for invalid entry_id")
                return True
            else:
                print(f"❌ Expected 404, got {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            return False
    
    def test_move_invalid_customer(self) -> bool:
        """Test moving to invalid customer_id"""
        print("\n=== Testing: Move to invalid customer_id ===")
        
        # Get a valid entry
        entries = self.get_time_entries_from_batch()
        if not entries:
            print("❌ No entries available for test")
            return False
        
        entry = entries[0]
        invalid_customer_id = "invalid-customer-id-12345"
        
        try:
            response = requests.post(
                f"{BACKEND_URL}/time-entries/{entry['id']}/move-customer",
                headers=self.get_headers(),
                data={"new_customer_id": invalid_customer_id}
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 404:
                print("✅ Correctly returned 404 for invalid customer_id")
                return True
            else:
                print(f"❌ Expected 404, got {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests"""
        print("=" * 80)
        print("MOVE TIME ENTRY FEATURE - BACKEND TESTS")
        print("=" * 80)
        
        results = {}
        
        # 1. Login
        if not self.login():
            print("\n❌ CRITICAL: Login failed. Cannot proceed with tests.")
            return
        
        # 2. Get customers
        results["GET /api/customers"] = self.test_get_customers()
        
        if not results["GET /api/customers"]:
            print("\n❌ CRITICAL: Cannot get customers. Cannot proceed with move tests.")
            return
        
        # Find specific customers
        no_client = self.get_customer_by_name("General")
        jmmc_hp = self.get_customer_by_name("JMMC HP d.o.o.")
        jmmc_finance = self.get_customer_by_name("JMMC Finance d.o.o.")
        
        print(f"\nTarget customers:")
        print(f"  No Client/General: {no_client}")
        print(f"  JMMC HP: {jmmc_hp}")
        print(f"  JMMC Finance: {jmmc_finance}")
        
        # Get time entries
        entries = self.get_time_entries_from_batch()
        
        if not entries:
            print("\n⚠️  WARNING: No time entries found in batch. Cannot test move functionality.")
            print("This might be expected if the batch doesn't exist or has no entries.")
        else:
            # Test scenarios with actual entries
            
            # Scenario A: Move from No Client to JMMC HP
            if no_client and jmmc_hp:
                no_client_entries = [e for e in entries if e.get("customerId") == no_client["id"]]
                if no_client_entries:
                    entry = no_client_entries[0]
                    results["Move: No Client -> JMMC HP"] = self.test_move_time_entry(
                        entry["id"], 
                        jmmc_hp["id"], 
                        no_client["id"],
                        "Move from No Client to JMMC HP d.o.o."
                    )
                else:
                    print("\n⚠️  No entries found for 'No Client' customer")
            
            # Scenario B: Move from JMMC HP to JMMC Finance
            if jmmc_hp and jmmc_finance:
                jmmc_hp_entries = [e for e in entries if e.get("customerId") == jmmc_hp["id"]]
                if jmmc_hp_entries:
                    entry = jmmc_hp_entries[0]
                    results["Move: JMMC HP -> JMMC Finance"] = self.test_move_time_entry(
                        entry["id"], 
                        jmmc_finance["id"], 
                        jmmc_hp["id"],
                        "Move from JMMC HP d.o.o. to JMMC Finance d.o.o."
                    )
                else:
                    print("\n⚠️  No entries found for 'JMMC HP' customer")
        
        # Test error scenarios
        results["Invalid entry_id (404)"] = self.test_move_invalid_entry()
        results["Invalid customer_id (404)"] = self.test_move_invalid_customer()
        
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
        else:
            print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    tester = TestMoveTimeEntry()
    tester.run_all_tests()


class TestEracuniIntegration:
    def __init__(self):
        self.token = None
        self.test_invoice_id = "0e4c2b84-10b8-4500-af52-60f3be1cd6cd"  # Draft invoice ID from user
        
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
    
    def get_all_invoices(self) -> list:
        """Get all invoices to find a draft one"""
        print("\n=== Getting All Invoices ===")
        try:
            response = requests.get(
                f"{BACKEND_URL}/invoices",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                invoices = response.json()
                print(f"✅ Retrieved {len(invoices)} invoices")
                
                # Find draft invoices
                draft_invoices = [inv for inv in invoices if inv.get("status") in ["draft", "imported", "edited"]]
                print(f"Found {len(draft_invoices)} draft/imported/edited invoices")
                
                if draft_invoices:
                    print("\nDraft invoices:")
                    for inv in draft_invoices[:5]:  # Show first 5
                        print(f"  - ID: {inv.get('id')}, Status: {inv.get('status')}, Customer: {inv.get('customerName')}, Total: {inv.get('total')}")
                
                return invoices
            else:
                print(f"❌ Failed to get invoices: {response.text}")
                return []
        except Exception as e:
            print(f"❌ Error getting invoices: {str(e)}")
            return []
    
    def get_invoice_details(self, invoice_id: str) -> Optional[Dict[str, Any]]:
        """Get invoice details including lines"""
        print(f"\n=== Getting Invoice Details: {invoice_id} ===")
        try:
            response = requests.get(
                f"{BACKEND_URL}/invoices/{invoice_id}",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                invoice = data.get("invoice", {})
                lines = data.get("lines", [])
                
                print(f"✅ Invoice found")
                print(f"  Customer: {invoice.get('customerName')}")
                print(f"  Status: {invoice.get('status')}")
                print(f"  Total: {invoice.get('total')}")
                print(f"  Invoice Date: {invoice.get('invoiceDate')}")
                print(f"  Due Date: {invoice.get('dueDate')}")
                print(f"  Lines: {len(lines)}")
                
                if lines:
                    print("\n  Invoice Lines:")
                    for line in lines:
                        print(f"    - {line.get('description')}: {line.get('quantity')} x {line.get('unitPrice')} = {line.get('amount')}")
                
                return data
            else:
                print(f"❌ Failed to get invoice: {response.text}")
                return None
        except Exception as e:
            print(f"❌ Error getting invoice: {str(e)}")
            return None
    
    def confirm_draft(self, invoice_id: str) -> bool:
        """Confirm invoice as draft"""
        print(f"\n=== Confirming Invoice as Draft: {invoice_id} ===")
        try:
            response = requests.put(
                f"{BACKEND_URL}/invoices/{invoice_id}/confirm-draft",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                print("✅ Invoice confirmed as draft")
                return True
            else:
                print(f"❌ Failed to confirm draft: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error confirming draft: {str(e)}")
            return False
    
    def issue_invoice(self, invoice_id: str) -> bool:
        """Issue the invoice"""
        print(f"\n=== Issuing Invoice: {invoice_id} ===")
        try:
            response = requests.post(
                f"{BACKEND_URL}/invoices/{invoice_id}/issue",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                print("✅ Invoice issued successfully")
                return True
            else:
                print(f"❌ Failed to issue invoice: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error issuing invoice: {str(e)}")
            return False
    
    def post_invoice_to_eracuni(self, invoice_id: str) -> Dict[str, Any]:
        """Post invoice to e-računi API"""
        print(f"\n=== Posting Invoice to e-računi: {invoice_id} ===")
        try:
            response = requests.post(
                f"{BACKEND_URL}/invoices/{invoice_id}/post",
                headers=self.get_headers()
            )
            
            print(f"\n{'='*80}")
            print("E-RAČUNI API RESPONSE")
            print(f"{'='*80}")
            print(f"HTTP Status Code: {response.status_code}")
            print(f"\nResponse Headers:")
            for key, value in response.headers.items():
                print(f"  {key}: {value}")
            
            print(f"\nResponse Body:")
            try:
                response_data = response.json()
                print(json.dumps(response_data, indent=2))
            except:
                print(response.text)
            
            print(f"{'='*80}\n")
            
            if response.status_code == 200:
                response_data = response.json()
                
                # Check if we got a real e-računi response
                external_number = response_data.get("externalNumber")
                document_id = response_data.get("documentID")
                status = response_data.get("status")
                raw_response = response_data.get("raw")
                
                print("✅ Invoice posted successfully!")
                print(f"  External Number: {external_number}")
                print(f"  Document ID: {document_id}")
                print(f"  Status: {status}")
                
                # Check if it's a stub response
                if external_number and external_number.startswith("ER-STUB-"):
                    print("\n⚠️  WARNING: This is a STUB response, not a real e-računi API call!")
                    print("  The system is still in stub mode.")
                    return {
                        "success": False,
                        "is_stub": True,
                        "message": "System is in stub mode, not making real API calls",
                        "response": response_data
                    }
                else:
                    print("\n✅ This appears to be a REAL e-računi API response!")
                    if raw_response:
                        print("\nFull e-računi API Response:")
                        print(json.dumps(raw_response, indent=2))
                    
                    return {
                        "success": True,
                        "is_stub": False,
                        "external_number": external_number,
                        "document_id": document_id,
                        "response": response_data
                    }
            else:
                print(f"❌ Failed to post invoice")
                error_message = response.text
                
                try:
                    error_data = response.json()
                    error_message = error_data.get("detail", error_message)
                except:
                    pass
                
                print(f"Error: {error_message}")
                
                return {
                    "success": False,
                    "is_stub": False,
                    "error": error_message,
                    "status_code": response.status_code
                }
        except Exception as e:
            print(f"❌ Error posting invoice: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def run_eracuni_test(self):
        """Run the complete e-računi integration test"""
        print("=" * 80)
        print("E-RAČUNI API INTEGRATION TEST")
        print("=" * 80)
        
        # 1. Login
        if not self.login():
            print("\n❌ CRITICAL: Login failed. Cannot proceed with tests.")
            return
        
        # 2. Get all invoices to find a suitable one
        invoices = self.get_all_invoices()
        
        # Try to use the specified invoice ID first
        invoice_id = self.test_invoice_id
        
        # Check if the specified invoice exists
        invoice_data = self.get_invoice_details(invoice_id)
        
        if not invoice_data:
            print(f"\n⚠️  Specified invoice {invoice_id} not found.")
            
            # Try to find any draft invoice
            draft_invoices = [inv for inv in invoices if inv.get("status") in ["draft", "imported", "edited"]]
            
            if draft_invoices:
                invoice_id = draft_invoices[0]["id"]
                print(f"Using alternative draft invoice: {invoice_id}")
                invoice_data = self.get_invoice_details(invoice_id)
            else:
                print("\n❌ No draft invoices available for testing.")
                print("Please create a draft invoice first.")
                return
        
        invoice = invoice_data.get("invoice", {})
        current_status = invoice.get("status")
        
        print(f"\nCurrent invoice status: {current_status}")
        
        # 3. Confirm as draft if needed
        if current_status in ["imported", "edited"]:
            if not self.confirm_draft(invoice_id):
                print("\n❌ Failed to confirm invoice as draft. Cannot proceed.")
                return
        
        # 4. Issue the invoice if not already issued
        if current_status != "issued":
            if not self.issue_invoice(invoice_id):
                print("\n❌ Failed to issue invoice. Cannot proceed.")
                return
        
        # 5. Post to e-računi
        result = self.post_invoice_to_eracuni(invoice_id)
        
        # 6. Summary
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        if result.get("success"):
            print("✅ E-RAČUNI INTEGRATION TEST PASSED")
            print(f"  External Number: {result.get('external_number')}")
            print(f"  Document ID: {result.get('document_id')}")
            print("\n✅ Invoice successfully posted to e-računi system!")
        elif result.get("is_stub"):
            print("⚠️  E-RAČUNI INTEGRATION TEST - STUB MODE DETECTED")
            print("  The system is configured in stub mode.")
            print("  No real API calls are being made to e-računi.")
            print("\n❌ ERACUNI_MODE needs to be set to 'real' in backend/.env")
        else:
            print("❌ E-RAČUNI INTEGRATION TEST FAILED")
            print(f"  Error: {result.get('error', 'Unknown error')}")
            print(f"  Status Code: {result.get('status_code', 'N/A')}")
            
            # Provide debugging hints
            print("\n🔍 Debugging Hints:")
            print("  1. Check if e-računi credentials are saved in Settings")
            print("  2. Verify ERACUNI_MODE is set to 'real' in backend/.env")
            print("  3. Check backend logs for detailed error messages")
            print("  4. Verify the e-računi API endpoint is correct")
            print("  5. Ensure the invoice has valid data (customer, lines, dates)")

if __name__ == "__main__":
    # Run e-računi integration test
    print("\n" + "=" * 80)
    print("RUNNING E-RAČUNI INTEGRATION TEST")
    print("=" * 80)
    
    eracuni_tester = TestEracuniIntegration()
    eracuni_tester.run_eracuni_test()

