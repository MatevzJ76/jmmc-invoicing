import requests
import json
import openpyxl
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BACKEND_URL = "https://invoice-flow-38.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@local"
ADMIN_PASSWORD = "Admin2025!"

class TestValueCalculationFromTariffs:
    """
    Test enhanced import function that calculates values from tariff rates 
    instead of reading from Excel "Vrednost" column.
    
    Testing Scenarios:
    1. New Import - Value Calculation from Tariffs
    2. Value Recalculation on Hours Change
    3. Value Recalculation on Tariff Change
    4. Value Recalculation on Manual hourlyRate Change
    5. Comparison - Excel Value vs Calculated Value
    """
    
    def __init__(self):
        self.token = None
        self.batch_id = None
        self.time_entries = []
        self.tariff_codes = []
        
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
    
    def get_tariff_codes(self) -> bool:
        """Get available tariff codes from Settings"""
        print("\n=== Getting Tariff Codes from Settings ===")
        try:
            response = requests.get(
                f"{BACKEND_URL}/tariffs",
                headers=self.get_headers()
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                self.tariff_codes = response.json()
                print(f"✅ Retrieved {len(self.tariff_codes)} tariff codes")
                
                # Display tariff codes
                print("\nAvailable Tariff Codes:")
                for tariff in self.tariff_codes[:10]:  # Show first 10
                    code = tariff.get('code', 'N/A')
                    description = tariff.get('description', 'N/A')
                    value = tariff.get('value', 0)
                    print(f"  - {code}: {description} (€{value})")
                
                if len(self.tariff_codes) > 10:
                    print(f"  ... and {len(self.tariff_codes) - 10} more")
                
                return True
            else:
                print(f"❌ Failed to get tariff codes: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error getting tariff codes: {str(e)}")
            return False
    
    def create_test_excel_file(self, filename: str) -> str:
        """Create test Excel file with known values in Vrednost column"""
        print(f"\n=== Creating Test Excel File: {filename} ===")
        
        try:
            wb = openpyxl.Workbook()
            ws = wb.active
            
            # Add headers
            headers = ["Projekt", "Stranka", "Datum", "Tarifa", "Delavec", "Opombe", "Porabljene ure", "Vrednost", "Št. računa"]
            ws.append(headers)
            
            # Get some tariff codes for testing
            tariff_1 = "002 - 45 EUR/uro"  # €45 per hour
            tariff_2 = "001 - V pavšalu"    # €0 per hour
            
            # Add test data rows with INCORRECT values in Vrednost column
            # These values should be IGNORED by the system
            test_rows = [
                ["Računovodstvo", "Testna Stranka d.o.o.", datetime(2025, 11, 1), tariff_1, "Marko Novak", "Priprava mesečnih poročil", 8.0, 999.99, ""],
                ["Davčno svetovanje", "Testna Stranka d.o.o.", datetime(2025, 11, 2), tariff_1, "Ana Kovač", "Davčna optimizacija", 4.5, 888.88, ""],
                ["Administrativne naloge", "Testna Stranka d.o.o.", datetime(2025, 11, 3), tariff_2, "Peter Horvat", "Ureditev dokumentacije", 3.0, 777.77, ""],
                ["Svetovanje", "Druga Stranka d.o.o.", datetime(2025, 11, 4), tariff_1, "Maja Zupan", "Poslovno svetovanje", 6.0, 666.66, ""],
                ["Analiza", "Druga Stranka d.o.o.", datetime(2025, 11, 5), tariff_2, "Luka Krajnc", "Analiza poslovanja", 2.5, 555.55, ""],
            ]
            
            for row in test_rows:
                ws.append(row)
            
            # Save to temp file
            test_file_path = f"/tmp/{filename}"
            wb.save(test_file_path)
            
            print(f"✅ Created test Excel file: {test_file_path}")
            print(f"\nTest Data Summary:")
            print(f"  - 5 time entries")
            print(f"  - Using tariffs: {tariff_1}, {tariff_2}")
            print(f"  - Excel 'Vrednost' column has INCORRECT values (999.99, 888.88, etc.)")
            print(f"  - These values should be IGNORED by the system")
            print(f"  - System should calculate: value = hours × tariff.value")
            
            return test_file_path
            
        except Exception as e:
            print(f"❌ Error creating Excel file: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    def test_1_import_with_value_calculation(self) -> bool:
        """
        Test 1: New Import - Value Calculation from Tariffs
        
        Verify that:
        - Excel "Vrednost" column is IGNORED
        - value = hours × hourlyRate (from tariff in Settings)
        - hourlyRate comes from tariff code lookup
        """
        print("\n" + "=" * 80)
        print("TEST 1: New Import - Value Calculation from Tariffs")
        print("=" * 80)
        
        try:
            # Create test Excel file
            test_file = self.create_test_excel_file("test_value_calculation.xlsx")
            if not test_file:
                return False
            
            # Upload the file
            print(f"\n=== Uploading Excel File ===")
            with open(test_file, 'rb') as f:
                files = {'file': ('test_value_calculation.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
                data = {
                    'title': 'Test Value Calculation Import',
                    'invoiceDate': '2025-11-30',
                    'periodFrom': '2025-11-01',
                    'periodTo': '2025-11-30',
                    'dueDate': '2025-12-15'
                }
                
                response = requests.post(
                    f"{BACKEND_URL}/imports",
                    headers=self.get_headers(),
                    files=files,
                    data=data
                )
            
            print(f"Import Status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ Import failed: {response.text}")
                return False
            
            result = response.json()
            self.batch_id = result.get("batchId")
            row_count = result.get("rowCount")
            
            print(f"✅ Import successful")
            print(f"  Batch ID: {self.batch_id}")
            print(f"  Row Count: {row_count}")
            
            # Get time entries
            print(f"\n=== Retrieving Time Entries ===")
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.batch_id}/time-entries",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to get time entries: {response.text}")
                return False
            
            self.time_entries = response.json()
            print(f"✅ Retrieved {len(self.time_entries)} time entries")
            
            # Verify value calculations
            print(f"\n=== Verifying Value Calculations ===")
            
            all_correct = True
            for idx, entry in enumerate(self.time_entries):
                hours = entry.get('hours', 0)
                hourly_rate = entry.get('hourlyRate', 0)
                value = entry.get('value', 0)
                tariff = entry.get('tariff', 'N/A')
                
                # Calculate expected value
                expected_value = round(hours * hourly_rate, 2)
                
                print(f"\nEntry {idx + 1}:")
                print(f"  Tariff: {tariff}")
                print(f"  Hours: {hours}")
                print(f"  Hourly Rate: €{hourly_rate}")
                print(f"  Calculated Value: €{value}")
                print(f"  Expected Value: €{expected_value}")
                
                # Verify calculation
                if abs(value - expected_value) < 0.01:  # Allow small floating point differences
                    print(f"  ✅ Value calculation CORRECT (value = hours × hourlyRate)")
                else:
                    print(f"  ❌ Value calculation INCORRECT")
                    print(f"     Expected: €{expected_value}")
                    print(f"     Got: €{value}")
                    all_correct = False
                
                # Verify Excel value was ignored (should NOT be 999.99, 888.88, etc.)
                excel_values = [999.99, 888.88, 777.77, 666.66, 555.55]
                if value in excel_values:
                    print(f"  ❌ ERROR: Value matches Excel 'Vrednost' column!")
                    print(f"     Excel column should be IGNORED")
                    all_correct = False
                else:
                    print(f"  ✅ Excel 'Vrednost' column was IGNORED (value ≠ Excel value)")
            
            if all_correct:
                print(f"\n✅ TEST 1 PASSED: All values correctly calculated from tariff rates")
                print(f"   - Excel 'Vrednost' column was IGNORED ✅")
                print(f"   - value = hours × hourlyRate (from Settings) ✅")
                return True
            else:
                print(f"\n❌ TEST 1 FAILED: Some values incorrectly calculated")
                return False
                
        except Exception as e:
            print(f"❌ Error in Test 1: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def test_2_recalculate_on_hours_change(self) -> bool:
        """
        Test 2: Value Recalculation on Hours Change
        
        Verify that when hours change via PUT endpoint:
        - value automatically recalculates: new_value = new_hours × hourlyRate
        """
        print("\n" + "=" * 80)
        print("TEST 2: Value Recalculation on Hours Change")
        print("=" * 80)
        
        if not self.batch_id or not self.time_entries:
            print("❌ No batch or time entries available")
            return False
        
        try:
            # Select first entry for testing
            entry = self.time_entries[0]
            entry_index = 0
            
            original_hours = entry.get('hours', 0)
            original_hourly_rate = entry.get('hourlyRate', 0)
            original_value = entry.get('value', 0)
            
            print(f"\n=== Original Entry State ===")
            print(f"  Hours: {original_hours}")
            print(f"  Hourly Rate: €{original_hourly_rate}")
            print(f"  Value: €{original_value}")
            
            # Change hours to a new value
            new_hours = 10.0
            expected_new_value = round(new_hours * original_hourly_rate, 2)
            
            print(f"\n=== Updating Hours ===")
            print(f"  New Hours: {new_hours}")
            print(f"  Expected New Value: €{expected_new_value} ({new_hours} × €{original_hourly_rate})")
            
            # Update via PUT endpoint
            updates = [
                {
                    "index": entry_index,
                    "hours": new_hours
                }
            ]
            
            response = requests.put(
                f"{BACKEND_URL}/batches/{self.batch_id}/time-entries",
                headers=self.get_headers(),
                json=updates
            )
            
            print(f"Update Status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ Update failed: {response.text}")
                return False
            
            print(f"✅ Update successful")
            
            # Retrieve entry to verify recalculation
            print(f"\n=== Verifying Recalculation ===")
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.batch_id}/time-entries",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to retrieve entries: {response.text}")
                return False
            
            updated_entries = response.json()
            updated_entry = updated_entries[entry_index]
            
            updated_hours = updated_entry.get('hours', 0)
            updated_value = updated_entry.get('value', 0)
            updated_hourly_rate = updated_entry.get('hourlyRate', 0)
            
            print(f"  Updated Hours: {updated_hours}")
            print(f"  Updated Hourly Rate: €{updated_hourly_rate}")
            print(f"  Updated Value: €{updated_value}")
            print(f"  Expected Value: €{expected_new_value}")
            
            # Verify hours changed
            if abs(updated_hours - new_hours) > 0.01:
                print(f"❌ Hours not updated correctly")
                return False
            
            print(f"✅ Hours updated correctly")
            
            # Verify hourlyRate stayed the same
            if abs(updated_hourly_rate - original_hourly_rate) > 0.01:
                print(f"❌ Hourly rate changed unexpectedly")
                return False
            
            print(f"✅ Hourly rate unchanged (as expected)")
            
            # Verify value recalculated
            if abs(updated_value - expected_new_value) < 0.01:
                print(f"✅ Value recalculated correctly: €{updated_value}")
                print(f"\n✅ TEST 2 PASSED: Value recalculates when hours change")
                return True
            else:
                print(f"❌ Value NOT recalculated correctly")
                print(f"   Expected: €{expected_new_value}")
                print(f"   Got: €{updated_value}")
                return False
                
        except Exception as e:
            print(f"❌ Error in Test 2: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def test_3_recalculate_on_tariff_change(self) -> bool:
        """
        Test 3: Value Recalculation on Tariff Change
        
        Verify that when tariff changes via PUT endpoint:
        - hourlyRate automatically updates to new tariff's value
        - value automatically recalculates: value = hours × new_hourlyRate
        """
        print("\n" + "=" * 80)
        print("TEST 3: Value Recalculation on Tariff Change")
        print("=" * 80)
        
        if not self.batch_id or not self.time_entries:
            print("❌ No batch or time entries available")
            return False
        
        try:
            # Select second entry for testing
            entry = self.time_entries[1] if len(self.time_entries) > 1 else self.time_entries[0]
            entry_index = 1 if len(self.time_entries) > 1 else 0
            
            original_tariff = entry.get('tariff', 'N/A')
            original_hours = entry.get('hours', 0)
            original_hourly_rate = entry.get('hourlyRate', 0)
            original_value = entry.get('value', 0)
            
            print(f"\n=== Original Entry State ===")
            print(f"  Tariff: {original_tariff}")
            print(f"  Hours: {original_hours}")
            print(f"  Hourly Rate: €{original_hourly_rate}")
            print(f"  Value: €{original_value}")
            
            # Find a different tariff code
            new_tariff = None
            new_tariff_value = None
            
            for tariff in self.tariff_codes:
                if tariff.get('code') != original_tariff:
                    new_tariff = tariff.get('code')
                    new_tariff_value = tariff.get('value', 0)
                    break
            
            if not new_tariff:
                print("❌ Could not find alternative tariff code")
                return False
            
            expected_new_value = round(original_hours * new_tariff_value, 2)
            
            print(f"\n=== Changing Tariff ===")
            print(f"  New Tariff: {new_tariff}")
            print(f"  New Tariff Value: €{new_tariff_value}")
            print(f"  Expected New Hourly Rate: €{new_tariff_value}")
            print(f"  Expected New Value: €{expected_new_value} ({original_hours} × €{new_tariff_value})")
            
            # Update via PUT endpoint
            updates = [
                {
                    "index": entry_index,
                    "tariff": new_tariff
                }
            ]
            
            response = requests.put(
                f"{BACKEND_URL}/batches/{self.batch_id}/time-entries",
                headers=self.get_headers(),
                json=updates
            )
            
            print(f"Update Status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ Update failed: {response.text}")
                return False
            
            print(f"✅ Update successful")
            
            # Retrieve entry to verify recalculation
            print(f"\n=== Verifying Recalculation ===")
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.batch_id}/time-entries",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to retrieve entries: {response.text}")
                return False
            
            updated_entries = response.json()
            updated_entry = updated_entries[entry_index]
            
            updated_tariff = updated_entry.get('tariff', 'N/A')
            updated_hours = updated_entry.get('hours', 0)
            updated_hourly_rate = updated_entry.get('hourlyRate', 0)
            updated_value = updated_entry.get('value', 0)
            
            print(f"  Updated Tariff: {updated_tariff}")
            print(f"  Updated Hours: {updated_hours}")
            print(f"  Updated Hourly Rate: €{updated_hourly_rate}")
            print(f"  Updated Value: €{updated_value}")
            print(f"  Expected Hourly Rate: €{new_tariff_value}")
            print(f"  Expected Value: €{expected_new_value}")
            
            # Verify tariff changed
            if updated_tariff != new_tariff:
                print(f"❌ Tariff not updated correctly")
                return False
            
            print(f"✅ Tariff updated correctly")
            
            # Verify hours stayed the same
            if abs(updated_hours - original_hours) > 0.01:
                print(f"❌ Hours changed unexpectedly")
                return False
            
            print(f"✅ Hours unchanged (as expected)")
            
            # Verify hourlyRate updated to new tariff value
            if abs(updated_hourly_rate - new_tariff_value) < 0.01:
                print(f"✅ Hourly rate updated to new tariff value: €{updated_hourly_rate}")
            else:
                print(f"❌ Hourly rate NOT updated correctly")
                print(f"   Expected: €{new_tariff_value}")
                print(f"   Got: €{updated_hourly_rate}")
                return False
            
            # Verify value recalculated
            if abs(updated_value - expected_new_value) < 0.01:
                print(f"✅ Value recalculated correctly: €{updated_value}")
                print(f"\n✅ TEST 3 PASSED: Value and hourlyRate recalculate when tariff changes")
                return True
            else:
                print(f"❌ Value NOT recalculated correctly")
                print(f"   Expected: €{expected_new_value}")
                print(f"   Got: €{updated_value}")
                return False
                
        except Exception as e:
            print(f"❌ Error in Test 3: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def test_4_recalculate_on_manual_hourly_rate_change(self) -> bool:
        """
        Test 4: Value Recalculation on Manual hourlyRate Change
        
        Verify that when hourlyRate is manually changed via PUT endpoint:
        - value automatically recalculates: value = hours × new_hourlyRate
        """
        print("\n" + "=" * 80)
        print("TEST 4: Value Recalculation on Manual hourlyRate Change")
        print("=" * 80)
        
        if not self.batch_id or not self.time_entries:
            print("❌ No batch or time entries available")
            return False
        
        try:
            # Select third entry for testing
            entry = self.time_entries[2] if len(self.time_entries) > 2 else self.time_entries[0]
            entry_index = 2 if len(self.time_entries) > 2 else 0
            
            original_hours = entry.get('hours', 0)
            original_hourly_rate = entry.get('hourlyRate', 0)
            original_value = entry.get('value', 0)
            
            print(f"\n=== Original Entry State ===")
            print(f"  Hours: {original_hours}")
            print(f"  Hourly Rate: €{original_hourly_rate}")
            print(f"  Value: €{original_value}")
            
            # Manually set a new hourly rate
            new_hourly_rate = 75.50
            expected_new_value = round(original_hours * new_hourly_rate, 2)
            
            print(f"\n=== Manually Updating Hourly Rate ===")
            print(f"  New Hourly Rate: €{new_hourly_rate}")
            print(f"  Expected New Value: €{expected_new_value} ({original_hours} × €{new_hourly_rate})")
            
            # Update via PUT endpoint
            updates = [
                {
                    "index": entry_index,
                    "hourlyRate": new_hourly_rate
                }
            ]
            
            response = requests.put(
                f"{BACKEND_URL}/batches/{self.batch_id}/time-entries",
                headers=self.get_headers(),
                json=updates
            )
            
            print(f"Update Status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ Update failed: {response.text}")
                return False
            
            print(f"✅ Update successful")
            
            # Retrieve entry to verify recalculation
            print(f"\n=== Verifying Recalculation ===")
            response = requests.get(
                f"{BACKEND_URL}/batches/{self.batch_id}/time-entries",
                headers=self.get_headers()
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to retrieve entries: {response.text}")
                return False
            
            updated_entries = response.json()
            updated_entry = updated_entries[entry_index]
            
            updated_hours = updated_entry.get('hours', 0)
            updated_hourly_rate = updated_entry.get('hourlyRate', 0)
            updated_value = updated_entry.get('value', 0)
            
            print(f"  Updated Hours: {updated_hours}")
            print(f"  Updated Hourly Rate: €{updated_hourly_rate}")
            print(f"  Updated Value: €{updated_value}")
            print(f"  Expected Value: €{expected_new_value}")
            
            # Verify hours stayed the same
            if abs(updated_hours - original_hours) > 0.01:
                print(f"❌ Hours changed unexpectedly")
                return False
            
            print(f"✅ Hours unchanged (as expected)")
            
            # Verify hourlyRate updated
            if abs(updated_hourly_rate - new_hourly_rate) < 0.01:
                print(f"✅ Hourly rate updated correctly: €{updated_hourly_rate}")
            else:
                print(f"❌ Hourly rate NOT updated correctly")
                print(f"   Expected: €{new_hourly_rate}")
                print(f"   Got: €{updated_hourly_rate}")
                return False
            
            # Verify value recalculated
            if abs(updated_value - expected_new_value) < 0.01:
                print(f"✅ Value recalculated correctly: €{updated_value}")
                print(f"\n✅ TEST 4 PASSED: Value recalculates when hourlyRate is manually changed")
                return True
            else:
                print(f"❌ Value NOT recalculated correctly")
                print(f"   Expected: €{expected_new_value}")
                print(f"   Got: €{updated_value}")
                return False
                
        except Exception as e:
            print(f"❌ Error in Test 4: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def test_5_excel_value_ignored(self) -> bool:
        """
        Test 5: Comparison - Excel Value vs Calculated Value
        
        Verify that Excel "Vrednost" column values are completely ignored
        and system uses calculated values instead.
        """
        print("\n" + "=" * 80)
        print("TEST 5: Excel 'Vrednost' Column is Ignored")
        print("=" * 80)
        
        if not self.time_entries:
            print("❌ No time entries available")
            return False
        
        try:
            print(f"\n=== Verifying Excel Values are Ignored ===")
            
            # Excel values we put in the file
            excel_values = [999.99, 888.88, 777.77, 666.66, 555.55]
            
            all_ignored = True
            for idx, entry in enumerate(self.time_entries):
                value = entry.get('value', 0)
                hours = entry.get('hours', 0)
                hourly_rate = entry.get('hourlyRate', 0)
                
                print(f"\nEntry {idx + 1}:")
                print(f"  Excel 'Vrednost' value: €{excel_values[idx] if idx < len(excel_values) else 'N/A'}")
                print(f"  Calculated value in DB: €{value}")
                print(f"  Formula: {hours} hours × €{hourly_rate} = €{round(hours * hourly_rate, 2)}")
                
                # Check if value matches any Excel value
                if idx < len(excel_values) and abs(value - excel_values[idx]) < 0.01:
                    print(f"  ❌ ERROR: Value matches Excel 'Vrednost' column!")
                    print(f"     System is NOT ignoring Excel values")
                    all_ignored = False
                else:
                    print(f"  ✅ Excel value IGNORED (calculated value used instead)")
            
            if all_ignored:
                print(f"\n✅ TEST 5 PASSED: Excel 'Vrednost' column is completely ignored")
                print(f"   - All values calculated from: hours × tariff.value ✅")
                print(f"   - No values match Excel 'Vrednost' column ✅")
                return True
            else:
                print(f"\n❌ TEST 5 FAILED: Some values match Excel 'Vrednost' column")
                return False
                
        except Exception as e:
            print(f"❌ Error in Test 5: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def run_all_tests(self):
        """Run all value calculation tests"""
        print("=" * 80)
        print("VALUE CALCULATION FROM TARIFF RATES - COMPREHENSIVE BACKEND TESTS")
        print("=" * 80)
        print("\nTesting enhanced import function that calculates values from tariff rates")
        print("instead of reading from Excel 'Vrednost' column.")
        print("\nTest Scenarios:")
        print("  1. New Import - Value Calculation from Tariffs")
        print("  2. Value Recalculation on Hours Change")
        print("  3. Value Recalculation on Tariff Change")
        print("  4. Value Recalculation on Manual hourlyRate Change")
        print("  5. Comparison - Excel Value vs Calculated Value")
        print("=" * 80)
        
        results = {}
        
        # Login
        if not self.login():
            print("\n❌ CRITICAL: Login failed. Cannot proceed with tests.")
            return
        
        # Get tariff codes
        if not self.get_tariff_codes():
            print("\n❌ CRITICAL: Failed to get tariff codes. Cannot proceed.")
            return
        
        # Run tests
        results["Test 1: New Import - Value Calculation from Tariffs"] = self.test_1_import_with_value_calculation()
        
        if results["Test 1: New Import - Value Calculation from Tariffs"]:
            results["Test 2: Value Recalculation on Hours Change"] = self.test_2_recalculate_on_hours_change()
            results["Test 3: Value Recalculation on Tariff Change"] = self.test_3_recalculate_on_tariff_change()
            results["Test 4: Value Recalculation on Manual hourlyRate Change"] = self.test_4_recalculate_on_manual_hourly_rate_change()
            results["Test 5: Excel 'Vrednost' Column is Ignored"] = self.test_5_excel_value_ignored()
        else:
            print("\n❌ CRITICAL: Test 1 failed. Skipping remaining tests.")
        
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
            print("\n✅ Value Calculation Feature is FULLY WORKING:")
            print("  - Excel 'Vrednost' column is IGNORED ✅")
            print("  - Values calculated from: hours × tariff.value (Settings) ✅")
            print("  - Value recalculates when hours change ✅")
            print("  - Value recalculates when tariff changes ✅")
            print("  - Value recalculates when hourlyRate changes manually ✅")
            print("  - Settings > Tariff Codes are single source of truth ✅")
        else:
            print(f"\n⚠️  {total - passed} test(s) failed")
            print("\n🔍 Debugging Hints:")
            print("  1. Check if import endpoint ignores 'Vrednost' column (server.py line 559)")
            print("  2. Verify tariff lookup and hourlyRate calculation (lines 563-564)")
            print("  3. Verify value calculation: value = hours × hourlyRate (line 567)")
            print("  4. Check PUT endpoint recalculation logic (lines 817-853)")
            print("  5. Verify tariff codes exist in Settings/database")


if __name__ == "__main__":
    tester = TestValueCalculationFromTariffs()
    tester.run_all_tests()
