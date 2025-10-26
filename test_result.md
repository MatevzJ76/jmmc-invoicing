#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Fix e-računi API integration - no new invoices being created in e-računi system"

backend:
  - task: "GET /api/customers endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "Endpoint returns all customers with id and name fields. Tested with admin@local token. Retrieved 286 customers successfully."

  - task: "POST /api/time-entries/{entry_id}/move-customer endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "Move time entry feature fully functional. All test scenarios passed: (a) Move from No Client to JMMC HP - PASSED, (b) Move from JMMC HP to JMMC Finance - PASSED, (c) Invalid entry_id returns 404 - PASSED, (d) Invalid customer_id returns 404 - PASSED. Verified: time entry customerId updated in database, old invoice lines no longer contain moved entry, new invoice lines include moved entry, no duplications exist, invoice totals recalculated correctly."

  - task: "POST /api/invoices/{invoice_id}/post - e-računi integration"
    implemented: true
    working: "testing"
    file: "/app/backend/server.py"
    stuck_count: 1
    priority: "high"
    needs_retesting: true
    status_history:
        - working: false
          agent: "main"
          comment: "User reports no invoices being created in e-računi system. Investigation reveals: (1) ERACUNI_MODE is set to 'stub' in backend/.env, preventing real API calls. (2) Real integration exists but requires user credentials in Settings. (3) Frontend shows hardcoded demo credentials in 'View API' modal which is misleading."
        - agent: "user"
          comment: "Confirmed: no new invoices in e-računi, API calls not working. Provided credentials via screenshot."
        - working: "testing"
          agent: "main"
          comment: "Fixed configuration: (1) Extracted e-računi credentials from user's screenshot (username: ERACUNIAPI, token, secretKey). (2) Saved credentials to database for admin@local user. (3) Changed ERACUNI_MODE from 'stub' to 'real' in backend/.env. (4) Restarted backend service. (5) All previously posted invoices were done in stub mode (ER-STUB-* numbers). Ready to test real API posting with draft invoice."

frontend:

metadata:
  created_by: "testing_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "GET /api/customers endpoint"
    - "POST /api/time-entries/{entry_id}/move-customer endpoint"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "testing"
      message: "Completed comprehensive testing of move time entry feature. All 5 test cases passed successfully. Feature is production-ready."
    - agent: "main"
      message: "Investigating e-računi API integration issue. Found ERACUNI_MODE=stub in .env. Need user's real credentials to test actual API integration. Will guide user through Settings configuration and switch to real mode."