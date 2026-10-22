# Master Admin

Open `master-admin.html` from the Staff dashboard or directly at the production URL.

The page creates staff and room/tablet Firebase Authentication accounts and their Firestore profiles, edits names and room/role assignments, enables/disables access, and generates password setup/reset links. Links are shown once for private sharing; this page does not send email. Search and filters apply to loaded accounts; use Load more for additional accounts. Disabling preserves requests.

## First administrator

The project owner must authorise the exact existing Firebase Authentication UID by creating the server-managed document `adminAccess/{uid}` with `enabled: true`. Confirm the person's email and resolve it through Firebase Authentication before provisioning. Do not grant access to an email guessed from a CLI login, and do not add a public bootstrap route. This initial authorisation is performed once; routine room/staff accounts are then managed in the page. Setting the access record to `enabled: false` removes admin permission on the next call.

Master Admin access does not depend on a tablet PIN or a client-editable role. Every backend action checks the private access record and whether the Auth account is disabled. The admin sign-in has separate session persistence and does not replace room/staff sessions. Master Admin accounts cannot be changed by this page. Additional master administrators remain a project-owner operation.

## Deployment

Publish all four admin frontend files through the existing Pages workflow. Deploy `functions:masterAdmin`, `functions:liveToken`, and `firestore:rules` to the existing project. The runtime service account needs Firebase Authentication user-management permissions and Firestore document access. The callable uses the existing exact `ALLOWED_ORIGINS` allowlist.

Room profiles are watched live. Reassignment ends the current conversation and clears local patient name/UHID when the tablet changes account or room. Firestore queries and completion rules restrict tablets to their current assigned room. Disabled profiles lose request access immediately through rules; the backend also disables Auth and revokes refresh tokens.

## Checks

Run `./CHECK.command` for syntax, existing patient/voice regressions, and admin handler tests. The handler tests cover unauthorised accounts, origins, protected administrators, role validation, creation/retries, reassignment, enable/disable, password links, audit privacy, and failed creation.

`tests/admin-rules.mjs` additionally exercises rules through a local Firestore emulator on 127.0.0.1:8088, project `demo-aster-admin`. Start the emulator with this repository's rules before running it. Its fixtures use only that emulator. This verifies legacy profiles, assigned-room queries, reassignment privacy, disabled access, private admin records, client write denial, staff acknowledgement and bedside completion.
