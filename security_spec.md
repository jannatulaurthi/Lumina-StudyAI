# Security Specification - Lumina Study AI

## 1. Data Invariants
- Users can only read and write their own data (Profile, Goals, Notes, Quizzes, Sessions).
- `userId` field in any document MUST match the authenticated user's UID.
- `createdAt` and `updatedAt` field must be strictly validated against `request.time`.
- `Profile` documents are identified by the user's UID.

## 2. The Dirty Dozen Payloads (Targeting common vulnerabilities)

1. **Identity Spoofing**: Attempt to create a note with someone else's `userId`.
2. **Ghost Field Injection**: Add `isAdmin: true` to a Profile creation payload.
3. **Resource Poisoning**: Use a 2MB string as a Goal title.
4. **State Shortcutting**: Directly update a Goal's `status` to 'completed' without being the owner.
5. **PII Blanket Leak**: Attempt to list all Profiles without a userId filter.
6. **Immutable Field Write**: Attempt to change `createdAt` of an existing Note.
7. **Cross-User Goal Delete**: Attempt to delete a Goal that belongs to another user.
8. **Junk ID Poisoning**: Use `../../proc/self` as a document ID.
9. **Role Escalation**: Attempt to create an 'admin' document in a hypothetical admin collection.
10. **Session Duration Injection**: Set a study session duration to `-100` minutes.
11. **Quiz Metadata Tamper**: Create a Quiz with 10 questions but set `totalQuestions` to 1.
12. **Timestamp Fraud**: Send a future timestamp as `createdAt` instead of using serverTime.

## 3. Test Runner (Draft)
A test suite will verify that all the above unauthorized operations return `PERMISSION_DENIED`.
