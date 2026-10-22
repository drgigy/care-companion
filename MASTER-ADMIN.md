# Master Admin

Open `master-admin.html` from the Staff dashboard or directly at the production URL.

The page creates staff and room/tablet Firebase Authentication accounts and their Firestore profiles, edits names and room/role assignments, enables/disables access, and generates password setup/reset links. Links are shown once for private sharing; this page does not send email. Search and filters apply to loaded accounts; use Load more for additional accounts. Disabling preserves requests.

## Staff room/tablet assignments

Each staff row has an **Assign rooms / tablets** button. Its searchable checkbox list loads room/tablet accounts across all account pages, independent of the main table's pagination. Save selected accounts or clear the selection to remove request access. Disabled tablet accounts remain selectable for their existing request history; selection does not enable their login.

Staff profiles store up to 100 unique `assignedRoomUids`. An absent or empty list grants no request access, including for existing staff accounts. Master Admin must assign accounts before staff can view the dashboard/log or accept requests. Assignments refer to tablet account UIDs and follow those accounts when their room number changes, including their request history. Master Admin accounts remain protected from this page's account changes.

Both Firestore reads and staff acknowledgement require the request's `ownerUid` to be assigned. Client-side filtering alone is not used for access control. The dashboard and request log query assigned UIDs in groups of 30, merge live results, and discard results from superseded listeners when access changes. Assignment saves and audit records commit together. Name edits preserve assignments; changing an account's role clears them.

## First administrator

The project owner must authorise the exact existing Firebase Authentication UID by creating the server-managed document `adminAccess/{uid}` with `enabled: true`. Confirm the person's email and resolve it through Firebase Authentication before provisioning. Do not grant access to an email guessed from a CLI login, and do not add a public bootstrap route. This initial authorisation is performed once; routine room/staff accounts are then managed in the page. Setting the access record to `enabled: false` removes admin permission on the next call.

Master Admin access does not depend on a tablet PIN or a client-editable role. Every backend action checks the private access record and whether the Auth account is disabled. The admin sign-in has separate session persistence and does not replace room/staff sessions. Master Admin accounts cannot be changed by this page. Additional master administrators remain a project-owner operation.

## Deployment

Publish all four admin frontend files through the existing Pages workflow. Deploy `functions:masterAdmin`, `functions:liveToken`, and `firestore:rules` to the existing project. The runtime service account needs Firebase Authentication user-management permissions and Firestore document access. The callable uses the existing exact `ALLOWED_ORIGINS` allowlist.

Room profiles are watched live. Reassignment ends the current conversation and clears local patient name/UHID when the tablet changes account or room. Firestore queries and completion rules restrict tablets to their current assigned room. Disabled profiles lose request access immediately through rules; the backend also disables Auth and revokes refresh tokens.

## Checks

Run `./CHECK.command` for syntax, existing patient/voice regressions, and admin handler tests. The handler tests cover unauthorised accounts, origins, protected administrators, role validation, creation/retries, reassignment, enable/disable, password links, audit privacy, staff assignment validation and failed creation.

`tests/admin-rules.mjs` additionally exercises rules through a local Firestore emulator on 127.0.0.1:8088, project `demo-aster-admin`. Start the emulator with this repository's rules before running it. Its fixtures use only that emulator. This verifies legacy profiles, assigned-room queries, reassignment privacy, disabled access, private admin records, client write denial, scoped staff queries through 100 assignments, unassigned/removed access denial, staff acknowledgement and bedside completion.
