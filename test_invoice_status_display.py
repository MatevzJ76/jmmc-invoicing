import requests
import json

BACKEND_URL = "https://timentry-manager.preview.emergentagent.com/api"

# Login
login_response = requests.post(f"{BACKEND_URL}/auth/login", json={
    "email": "admin@local",
    "password": "Admin2025!"
})
token = login_response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Get the second Invoice Composition Status Test batch ID (with 3 invoices)
batches_response = requests.get(f"{BACKEND_URL}/batches", headers=headers)
batches = batches_response.json()
test_batches = [b for b in batches if "Invoice Composition Status Test" in b.get("title", "")]
if len(test_batches) >= 2:
    batch_id = test_batches[1]["id"]
    print(f"Testing batch: {batch_id}")
    
    # Get time entries
    entries_response = requests.get(f"{BACKEND_URL}/batches/{batch_id}/time-entries", headers=headers)
    entries = entries_response.json()
    
    print(f"\nTotal entries: {len(entries)}")
    print("\nFirst 3 entries:")
    for i, entry in enumerate(entries[:3]):
        print(f"\nEntry {i+1}:")
        print(f"  Customer: {entry.get('customerName', 'N/A')}")
        print(f"  Employee: {entry.get('employeeName', 'N/A')}")
        print(f"  Status: {entry.get('status', 'N/A')}")
        print(f"  Invoice Status: {entry.get('invoiceStatus', 'NOT PRESENT')}")
        print(f"  Invoice Number: {entry.get('invoiceNumber', 'NOT PRESENT')}")
        print(f"  Invoice ID: {entry.get('invoiceId', 'NOT PRESENT')}")
else:
    print("Could not find test batches")
