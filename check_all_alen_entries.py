import requests

BACKEND_URL = "https://invoice-workflow-2.preview.emergentagent.com/api"

# Login
login_response = requests.post(f"{BACKEND_URL}/auth/login", json={
    "email": "admin@local",
    "password": "Admin2025!"
})
token = login_response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Get all customers to find ALEN
customers_response = requests.get(f"{BACKEND_URL}/customers", headers=headers)
customers = customers_response.json()
alen_customers = [c for c in customers if "ALEN" in c.get("name", "").upper() and "ŠUTIĆ" in c.get("name", "")]

print(f"Found {len(alen_customers)} matching customers:")
for c in alen_customers:
    print(f"  - {c.get('name')} (ID: {c.get('id')})")
    print(f"    Invoicing Type: {c.get('invoicingType')}")
    print(f"    Fixed Forfait: €{c.get('fixedForfaitValue', 0)}")

if alen_customers:
    customer_id = alen_customers[0]['id']
    print(f"\nChecking entries for customer ID: {customer_id}")
    
    # Get October batch
    batches_response = requests.get(f"{BACKEND_URL}/batches", headers=headers)
    batches = batches_response.json()
    october_batches = [b for b in batches if "October 2025" in b.get("title", "")]
    
    if october_batches:
        batch_id = october_batches[0]["id"]
        print(f"Batch: {batch_id}")
        
        # Get ALL time entries for this batch
        entries_response = requests.get(f"{BACKEND_URL}/batches/{batch_id}/time-entries", headers=headers)
        all_entries = entries_response.json()
        
        # Filter by customer ID
        customer_entries = [e for e in all_entries if e.get("customerId") == customer_id]
        
        print(f"\nTotal entries for this customer in batch: {len(customer_entries)}")
        for i, entry in enumerate(customer_entries):
            print(f"\nEntry {i+1}:")
            print(f"  Employee: {entry.get('employeeName')}")
            print(f"  Hours: {entry.get('hours')}")
            print(f"  Value: €{entry.get('value')}")
            print(f"  Status: {entry.get('status')}")
            print(f"  Entry Source: {entry.get('entrySource')}")
            print(f"  Project: {entry.get('projectName')}")
