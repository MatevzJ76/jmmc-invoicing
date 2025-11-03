import requests

BACKEND_URL = "https://timentry-manager.preview.emergentagent.com/api"

# Login
login_response = requests.post(f"{BACKEND_URL}/auth/login", json={
    "email": "admin@local",
    "password": "Admin2025!"
})
token = login_response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Get October batch
batches_response = requests.get(f"{BACKEND_URL}/batches", headers=headers)
batches = batches_response.json()
october_batches = [b for b in batches if "October 2025" in b.get("title", "")]

if october_batches:
    batch_id = october_batches[0]["id"]
    print(f"Checking batch: {batch_id}")
    
    # Get time entries
    entries_response = requests.get(f"{BACKEND_URL}/batches/{batch_id}/time-entries", headers=headers)
    entries = entries_response.json()
    
    # Find ALEN ŠUTIĆ S.P. entries
    alen_entries = [e for e in entries if "ALEN ŠUTIĆ" in e.get("customerName", "")]
    
    print(f"\nTotal entries for ALEN ŠUTIĆ S.P.: {len(alen_entries)}")
    for i, entry in enumerate(alen_entries):
        print(f"\nEntry {i+1}:")
        print(f"  Customer: {entry.get('customerName')}")
        print(f"  Employee: {entry.get('employeeName')}")
        print(f"  Hours: {entry.get('hours')}")
        print(f"  Value: €{entry.get('value')}")
        print(f"  Status: {entry.get('status')}")
        print(f"  Entry Source: {entry.get('entrySource')}")
else:
    print("No October batches found")
