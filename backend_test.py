import requests
import json
from typing import Dict, Any, Optional

# Configuration
BACKEND_URL = "https://invoice-verify-4.preview.emergentagent.com/api"
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

class TestUserManagement:
    def __init__(self):
        self.admin_token = None
        self.user_token = None
        self.test_user_id = None
        self.test_user_email = "testuser@example.com"
        
    def login(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        """Login with given credentials"""
        print(f"\n=== Testing Login: {email} ===")
        try:
            response = requests.post(
                f"{BACKEND_URL}/auth/login",
                json={"email": email, "password": password}
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Login successful")
                print(f"User: {data.get('user', {}).get('email')}")
                print(f"Role: {data.get('user', {}).get('role')}")
                print(f"Status: {data.get('user', {}).get('status')}")
                print(f"Username: {data.get('user', {}).get('username')}")
                return data
            else:
                print(f"❌ Login failed: {response.text}")
                return None
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return None
    
    def get_headers(self, token: str) -> Dict[str, str]:
        """Get authorization headers"""
        return {"Authorization": f"Bearer {token}"}
    
    def test_admin_login(self) -> bool:
        """Test admin login"""
        result = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        if result:
            self.admin_token = result.get("access_token")
            user = result.get("user", {})
            
            # Verify user fields
            if user.get("status") != "active":
                print(f"❌ Expected status 'active', got '{user.get('status')}'")
                return False
            
            if user.get("role") != "ADMIN":
                print(f"❌ Expected role 'ADMIN', got '{user.get('role')}'")
                return False
            
            return True
        return False
    
    def test_user_login(self) -> bool:
        """Test regular user login"""
        result = self.login("user@local", "User2025!")
        if result:
            self.user_token = result.get("access_token")
            user = result.get("user", {})
            
            # Verify user fields
            if user.get("status") != "active":
                print(f"❌ Expected status 'active', got '{user.get('status')}'")
                return False
            
            if user.get("role") != "USER":
                print(f"❌ Expected role 'USER', got '{user.get('role')}'")
                return False
            
            return True
        return False
    
    def test_get_user_profile(self) -> bool:
        """Test GET /api/user/profile"""
        print("\n=== Testing GET /api/user/profile ===")
        try:
            response = requests.get(
                f"{BACKEND_URL}/user/profile",
                headers=self.get_headers(self.admin_token)
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                profile = response.json()
                print(f"✅ Profile retrieved successfully")
                print(f"Profile data: {json.dumps(profile, indent=2)}")
                
                # Verify required fields
                required_fields = ["email", "role", "status"]
                for field in required_fields:
                    if field not in profile:
                        print(f"❌ Missing required field: {field}")
                        return False
                
                print("✅ All required fields present")
                return True
            else:
                print(f"❌ Failed to get profile: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error getting profile: {str(e)}")
            return False
    
    def test_list_users_as_admin(self) -> bool:
        """Test GET /api/admin/users as admin"""
        print("\n=== Testing GET /api/admin/users (as admin) ===")
        try:
            response = requests.get(
                f"{BACKEND_URL}/admin/users",
                headers=self.get_headers(self.admin_token)
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                users = response.json()
                print(f"✅ Retrieved {len(users)} users")
                
                # Display users
                for user in users:
                    print(f"  - {user.get('email')} ({user.get('role')}) - Status: {user.get('status')}")
                
                # Verify admin and user@local exist
                emails = [u.get("email") for u in users]
                if ADMIN_EMAIL not in emails:
                    print(f"❌ Admin user not found in list")
                    return False
                if "user@local" not in emails:
                    print(f"❌ user@local not found in list")
                    return False
                
                return True
            else:
                print(f"❌ Failed to list users: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error listing users: {str(e)}")
            return False
    
    def test_list_users_as_user(self) -> bool:
        """Test GET /api/admin/users as regular user (should fail with 403)"""
        print("\n=== Testing GET /api/admin/users (as regular user - should fail) ===")
        try:
            response = requests.get(
                f"{BACKEND_URL}/admin/users",
                headers=self.get_headers(self.user_token)
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 403:
                print(f"✅ Correctly returned 403 Forbidden")
                return True
            else:
                print(f"❌ Expected 403, got {response.status_code}")
                print(f"Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            return False
    
    def test_create_user_valid(self) -> bool:
        """Test POST /api/admin/users with valid data"""
        print("\n=== Testing POST /api/admin/users (valid data) ===")
        try:
            user_data = {
                "email": self.test_user_email,
                "username": "Test User",
                "password": "Test2025!",
                "role": "USER"
            }
            
            response = requests.post(
                f"{BACKEND_URL}/admin/users",
                headers=self.get_headers(self.admin_token),
                json=user_data
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                result = response.json()
                self.test_user_id = result.get("id")
                print(f"✅ User created successfully")
                print(f"User ID: {self.test_user_id}")
                print(f"Email: {result.get('email')}")
                print(f"Username: {result.get('username')}")
                print(f"Role: {result.get('role')}")
                return True
            else:
                print(f"❌ Failed to create user: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error creating user: {str(e)}")
            return False
    
    def test_create_user_weak_password(self) -> bool:
        """Test POST /api/admin/users with weak password (should fail)"""
        print("\n=== Testing POST /api/admin/users (weak password - should fail) ===")
        
        weak_passwords = [
            ("short", "Short password (< 8 chars)"),
            ("nouppercase1!", "No uppercase letter"),
            ("NOLOWERCASE1!", "No lowercase letter"),
            ("NoNumbers!", "No numbers"),
            ("NoSpecial123", "No special characters")
        ]
        
        all_passed = True
        for password, description in weak_passwords:
            print(f"\n  Testing: {description}")
            try:
                user_data = {
                    "email": f"weak_{password}@example.com",
                    "username": "Weak Password User",
                    "password": password,
                    "role": "USER"
                }
                
                response = requests.post(
                    f"{BACKEND_URL}/admin/users",
                    headers=self.get_headers(self.admin_token),
                    json=user_data
                )
                print(f"  Status: {response.status_code}")
                
                if response.status_code == 400:
                    print(f"  ✅ Correctly rejected weak password")
                    print(f"  Error: {response.json().get('detail')}")
                else:
                    print(f"  ❌ Expected 400, got {response.status_code}")
                    all_passed = False
            except Exception as e:
                print(f"  ❌ Error: {str(e)}")
                all_passed = False
        
        return all_passed
    
    def test_archive_user(self) -> bool:
        """Test PUT /api/admin/users/{user_id}/archive"""
        print(f"\n=== Testing PUT /api/admin/users/{self.test_user_id}/archive ===")
        
        if not self.test_user_id:
            print("❌ No test user ID available")
            return False
        
        try:
            response = requests.put(
                f"{BACKEND_URL}/admin/users/{self.test_user_id}/archive",
                headers=self.get_headers(self.admin_token)
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                print(f"✅ User archived successfully")
                return True
            else:
                print(f"❌ Failed to archive user: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error archiving user: {str(e)}")
            return False
    
    def test_archived_user_login(self) -> bool:
        """Test login with archived user (should fail)"""
        print(f"\n=== Testing Login with Archived User (should fail) ===")
        
        result = self.login(self.test_user_email, "Test2025!")
        
        if result is None:
            # Check if the error message is correct
            try:
                response = requests.post(
                    f"{BACKEND_URL}/auth/login",
                    json={"email": self.test_user_email, "password": "Test2025!"}
                )
                
                if response.status_code == 401:
                    error_detail = response.json().get("detail", "")
                    if "archived" in error_detail.lower():
                        print(f"✅ Correctly blocked archived user with message: {error_detail}")
                        return True
                    else:
                        print(f"❌ Wrong error message: {error_detail}")
                        return False
                else:
                    print(f"❌ Expected 401, got {response.status_code}")
                    return False
            except Exception as e:
                print(f"❌ Error: {str(e)}")
                return False
        else:
            print(f"❌ Archived user was able to login!")
            return False
    
    def test_change_user_role(self) -> bool:
        """Test PUT /api/admin/users/{user_id}/role"""
        print(f"\n=== Testing PUT /api/admin/users/{self.test_user_id}/role ===")
        
        if not self.test_user_id:
            print("❌ No test user ID available")
            return False
        
        try:
            response = requests.put(
                f"{BACKEND_URL}/admin/users/{self.test_user_id}/role",
                headers=self.get_headers(self.admin_token),
                json={"role": "ADMIN"}
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                print(f"✅ User role changed successfully")
                return True
            else:
                print(f"❌ Failed to change role: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error changing role: {str(e)}")
            return False
    
    def test_user_cannot_archive_self(self) -> bool:
        """Test that user cannot archive themselves"""
        print(f"\n=== Testing Self-Archive Prevention ===")
        
        # Get admin user ID
        try:
            response = requests.get(
                f"{BACKEND_URL}/admin/users",
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                users = response.json()
                admin_user = next((u for u in users if u.get("email") == ADMIN_EMAIL), None)
                
                if not admin_user:
                    print("❌ Could not find admin user")
                    return False
                
                admin_user_id = admin_user.get("id")
                print(f"Admin user ID: {admin_user_id}")
                
                # Try to archive self
                response = requests.put(
                    f"{BACKEND_URL}/admin/users/{admin_user_id}/archive",
                    headers=self.get_headers(self.admin_token)
                )
                print(f"Status: {response.status_code}")
                print(f"Response: {response.text}")
                
                if response.status_code == 400:
                    error_detail = response.json().get("detail", "")
                    if "cannot archive your own account" in error_detail.lower():
                        print(f"✅ Correctly prevented self-archive")
                        return True
                    else:
                        print(f"❌ Wrong error message: {error_detail}")
                        return False
                else:
                    print(f"❌ Expected 400, got {response.status_code}")
                    return False
            else:
                print(f"❌ Failed to get users: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            return False
    
    def test_user_cannot_change_own_role(self) -> bool:
        """Test that user cannot change their own role"""
        print(f"\n=== Testing Self-Role-Change Prevention ===")
        
        # Get admin user ID
        try:
            response = requests.get(
                f"{BACKEND_URL}/admin/users",
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                users = response.json()
                admin_user = next((u for u in users if u.get("email") == ADMIN_EMAIL), None)
                
                if not admin_user:
                    print("❌ Could not find admin user")
                    return False
                
                admin_user_id = admin_user.get("id")
                print(f"Admin user ID: {admin_user_id}")
                
                # Try to change own role
                response = requests.put(
                    f"{BACKEND_URL}/admin/users/{admin_user_id}/role",
                    headers=self.get_headers(self.admin_token),
                    json={"role": "USER"}
                )
                print(f"Status: {response.status_code}")
                print(f"Response: {response.text}")
                
                if response.status_code == 400:
                    error_detail = response.json().get("detail", "")
                    if "cannot change your own role" in error_detail.lower():
                        print(f"✅ Correctly prevented self-role-change")
                        return True
                    else:
                        print(f"❌ Wrong error message: {error_detail}")
                        return False
                else:
                    print(f"❌ Expected 400, got {response.status_code}")
                    return False
            else:
                print(f"❌ Failed to get users: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all user management tests"""
        print("=" * 80)
        print("USER MANAGEMENT & SECURITY - BACKEND TESTS")
        print("=" * 80)
        
        results = {}
        
        # 1. Authentication tests
        print("\n" + "=" * 80)
        print("AUTHENTICATION TESTS")
        print("=" * 80)
        
        results["Admin Login"] = self.test_admin_login()
        if not results["Admin Login"]:
            print("\n❌ CRITICAL: Admin login failed. Cannot proceed.")
            return
        
        results["User Login"] = self.test_user_login()
        if not results["User Login"]:
            print("\n⚠️  WARNING: User login failed. Some tests may be skipped.")
        
        # 2. User profile test
        print("\n" + "=" * 80)
        print("USER PROFILE TESTS")
        print("=" * 80)
        
        results["GET /api/user/profile"] = self.test_get_user_profile()
        
        # 3. Admin user management tests
        print("\n" + "=" * 80)
        print("ADMIN USER MANAGEMENT TESTS")
        print("=" * 80)
        
        results["GET /api/admin/users (admin)"] = self.test_list_users_as_admin()
        
        if self.user_token:
            results["GET /api/admin/users (user - should fail)"] = self.test_list_users_as_user()
        
        results["POST /api/admin/users (valid)"] = self.test_create_user_valid()
        results["POST /api/admin/users (weak passwords)"] = self.test_create_user_weak_password()
        
        if self.test_user_id:
            results["PUT /api/admin/users/{id}/archive"] = self.test_archive_user()
            results["Archived user login (should fail)"] = self.test_archived_user_login()
            results["PUT /api/admin/users/{id}/role"] = self.test_change_user_role()
        
        # 4. Authorization tests
        print("\n" + "=" * 80)
        print("AUTHORIZATION TESTS")
        print("=" * 80)
        
        results["Self-archive prevention"] = self.test_user_cannot_archive_self()
        results["Self-role-change prevention"] = self.test_user_cannot_change_own_role()
        
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

class TestExcelImport:
    def __init__(self):
        self.token = None
        self.xlsx_batch_id = None
        self.xls_batch_id = None
        self.xlsx_entries = []
        self.xls_entries = []
        
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
    
    def test_import_xlsx(self) -> bool:
        """Test importing .xlsx file (existing functionality)"""
        print("\n=== Testing XLSX Import (Existing Functionality) ===")
        
        try:
            # Prepare form data
            with open('/tmp/test.xlsx', 'rb') as f:
                files = {'file': ('test.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
                data = {
                    'title': 'Test October 2025',
                    'invoiceDate': '2025-10-31',
                    'periodFrom': '2025-10-01',
                    'periodTo': '2025-10-31',
                    'dueDate': '2025-11-15'
                }
                
                response = requests.post(
                    f"{BACKEND_URL}/imports",
                    headers=self.get_headers(),
                    files=files,
                    data=data
                )
            
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                result = response.json()
                self.xlsx_batch_id = result.get("batchId")
                row_count = result.get("rowCount")
                
                print(f"✅ XLSX import successful")
                print(f"  Batch ID: {self.xlsx_batch_id}")
                print(f"  Row Count: {row_count}")
                
                if row_count > 0:
                    print(f"✅ Created {row_count} time entries")
                    return True
                else:
                    print(f"❌ No time entries created")
                    return False
            else:
                print(f"❌ XLSX import failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error importing XLSX: {str(e)}")
            return False
    
    def test_import_xls(self) -> bool:
        """Test importing .xls file (NEW FEATURE)"""
        print("\n=== Testing XLS Import (NEW FEATURE) ===")
        
        try:
            # Prepare form data
            with open('/tmp/test.xls', 'rb') as f:
                files = {'file': ('test.xls', f, 'application/vnd.ms-excel')}
                data = {
                    'title': 'Test XLS October 2025',
                    'invoiceDate': '2025-10-31',
                    'periodFrom': '2025-10-01',
                    'periodTo': '2025-10-31',
                    'dueDate': '2025-11-15'
                }
                
                response = requests.post(
                    f"{BACKEND_URL}/imports",
                    headers=self.get_headers(),
                    files=files,
                    data=data
                )
            
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                result = response.json()
                self.xls_batch_id = result.get("batchId")
                row_count = result.get("rowCount")
                
                print(f"✅ XLS import successful")
                print(f"  Batch ID: {self.xls_batch_id}")
                print(f"  Row Count: {row_count}")
                
                if row_count > 0:
                    print(f"✅ Created {row_count} time entries")
                    return True
                else:
                    print(f"❌ No time entries created")
                    return False
            else:
                print(f"❌ XLS import failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error importing XLS: {str(e)}")
            return False
    
    def get_batch_entries(self, batch_id: str) -> list:
        """Get time entries from a batch"""
        try:
            response = requests.get(
                f"{BACKEND_URL}/batches/{batch_id}/verification",
                headers=self.get_headers()
            )
            
            if response.status_code == 200:
                data = response.json()
                all_entries = []
                all_entries.extend(data.get("jmmcHP", []))
                all_entries.extend(data.get("jmmcFinance", []))
                all_entries.extend(data.get("noClient", []))
                all_entries.extend(data.get("extra", []))
                return all_entries
            else:
                print(f"❌ Failed to get batch entries: {response.text}")
                return []
        except Exception as e:
            print(f"❌ Error getting batch entries: {str(e)}")
            return []
    
    def test_compare_data(self) -> bool:
        """Compare data from XLSX and XLS imports"""
        print("\n=== Comparing XLSX and XLS Data ===")
        
        if not self.xlsx_batch_id or not self.xls_batch_id:
            print("❌ Missing batch IDs for comparison")
            return False
        
        # Get entries from both batches
        self.xlsx_entries = self.get_batch_entries(self.xlsx_batch_id)
        self.xls_entries = self.get_batch_entries(self.xls_batch_id)
        
        print(f"XLSX entries: {len(self.xlsx_entries)}")
        print(f"XLS entries: {len(self.xls_entries)}")
        
        # Check if both have the same number of entries
        if len(self.xlsx_entries) != len(self.xls_entries):
            print(f"❌ Entry count mismatch: XLSX={len(self.xlsx_entries)}, XLS={len(self.xls_entries)}")
            return False
        
        print(f"✅ Both formats created {len(self.xlsx_entries)} entries")
        
        # Compare total values
        xlsx_total = sum(entry.get('value', 0) for entry in self.xlsx_entries)
        xls_total = sum(entry.get('value', 0) for entry in self.xls_entries)
        
        print(f"XLSX total value: €{xlsx_total:.2f}")
        print(f"XLS total value: €{xls_total:.2f}")
        
        if abs(xlsx_total - xls_total) > 0.01:  # Allow for small floating point differences
            print(f"❌ Total value mismatch")
            return False
        
        print(f"✅ Total values match")
        
        # Compare total hours
        xlsx_hours = sum(entry.get('hours', 0) for entry in self.xlsx_entries)
        xls_hours = sum(entry.get('hours', 0) for entry in self.xls_entries)
        
        print(f"XLSX total hours: {xlsx_hours:.2f}")
        print(f"XLS total hours: {xls_hours:.2f}")
        
        if abs(xlsx_hours - xls_hours) > 0.01:
            print(f"❌ Total hours mismatch")
            return False
        
        print(f"✅ Total hours match")
        
        # Sample comparison of first few entries
        print("\n--- Sample Entry Comparison ---")
        for i in range(min(3, len(self.xlsx_entries))):
            xlsx_entry = self.xlsx_entries[i]
            xls_entry = self.xls_entries[i]
            
            print(f"\nEntry {i+1}:")
            print(f"  XLSX: {xlsx_entry.get('employeeName')} - {xlsx_entry.get('hours')}h - €{xlsx_entry.get('value')}")
            print(f"  XLS:  {xls_entry.get('employeeName')} - {xls_entry.get('hours')}h - €{xls_entry.get('value')}")
            
            # Check if key fields match
            if (xlsx_entry.get('employeeName') != xls_entry.get('employeeName') or
                abs(xlsx_entry.get('hours', 0) - xls_entry.get('hours', 0)) > 0.01 or
                abs(xlsx_entry.get('value', 0) - xls_entry.get('value', 0)) > 0.01):
                print(f"  ❌ Entry {i+1} data mismatch")
                return False
            print(f"  ✅ Entry {i+1} matches")
        
        print("\n✅ Data comparison successful - both formats produce identical results")
        return True
    
    def test_verify_batch_details(self) -> bool:
        """Verify batch details are correctly stored"""
        print("\n=== Verifying Batch Details ===")
        
        results = []
        
        for batch_id, title in [(self.xlsx_batch_id, "Test October 2025"), 
                                 (self.xls_batch_id, "Test XLS October 2025")]:
            if not batch_id:
                continue
                
            try:
                response = requests.get(
                    f"{BACKEND_URL}/batches/{batch_id}",
                    headers=self.get_headers()
                )
                
                if response.status_code == 200:
                    batch = response.json()
                    
                    print(f"\nBatch: {title}")
                    print(f"  ID: {batch.get('id')}")
                    print(f"  Title: {batch.get('title')}")
                    print(f"  Filename: {batch.get('filename')}")
                    print(f"  Invoice Date: {batch.get('invoiceDate')}")
                    print(f"  Period: {batch.get('periodFrom')} to {batch.get('periodTo')}")
                    print(f"  Due Date: {batch.get('dueDate')}")
                    print(f"  Status: {batch.get('status')}")
                    
                    # Verify required fields
                    if (batch.get('title') == title and
                        batch.get('invoiceDate') == '2025-10-31' and
                        batch.get('periodFrom') == '2025-10-01' and
                        batch.get('periodTo') == '2025-10-31' and
                        batch.get('dueDate') == '2025-11-15'):
                        print(f"  ✅ Batch details correct")
                        results.append(True)
                    else:
                        print(f"  ❌ Batch details incorrect")
                        results.append(False)
                else:
                    print(f"❌ Failed to get batch {batch_id}: {response.text}")
                    results.append(False)
            except Exception as e:
                print(f"❌ Error getting batch: {str(e)}")
                results.append(False)
        
        return all(results)
    
    def run_all_tests(self):
        """Run all Excel import tests"""
        print("=" * 80)
        print("EXCEL IMPORT FEATURE - BACKEND TESTS (.xlsx and .xls support)")
        print("=" * 80)
        
        results = {}
        
        # 1. Login
        if not self.login():
            print("\n❌ CRITICAL: Login failed. Cannot proceed with tests.")
            return
        
        # 2. Test XLSX import (existing functionality)
        results["XLSX Import (existing)"] = self.test_import_xlsx()
        
        # 3. Test XLS import (NEW feature)
        results["XLS Import (NEW)"] = self.test_import_xls()
        
        # 4. Compare data from both formats
        if results.get("XLSX Import (existing)") and results.get("XLS Import (NEW)"):
            results["Data Comparison"] = self.test_compare_data()
            results["Batch Details Verification"] = self.test_verify_batch_details()
        else:
            print("\n⚠️  Skipping comparison tests due to import failures")
        
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
            print("\n✅ Excel import feature is working correctly:")
            print("  - XLSX format (existing) ✅")
            print("  - XLS format (NEW) ✅")
            print("  - Both formats produce identical data ✅")
            print("  - xlrd library handling .xls correctly ✅")
        else:
            print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    # Run Excel import tests
    print("\n" + "=" * 80)
    print("RUNNING EXCEL IMPORT TESTS (.xlsx and .xls)")
    print("=" * 80)
    
    excel_tester = TestExcelImport()
    excel_tester.run_all_tests()

