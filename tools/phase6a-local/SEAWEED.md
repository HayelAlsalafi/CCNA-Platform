# Local SeaweedFS media connection

The guarded API launcher reads `%USERPROFILE%\ccna-s3\s3.json` directly into process memory when present. Exactly one identity with one credential pair is required; ambiguous or malformed configuration stops startup. This file takes precedence over the older `.local/minio/api-credentials.xml`. No credentials are copied into this repository.

API-only configuration: provider `s3`, endpoint `http://127.0.0.1:9000`, region `us-east-1`, bucket `ccna-lesson-media`. The two launcher allowlists forward only these four settings and the access/secret pair. Web mode receives none of them. Existing S3 path-style addressing and private application delivery remain unchanged.

Object-only smoke check (no PostgreSQL connection):

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/check-seaweed.ps1
```

Each invocation writes and reads one new 68-byte opaque test PNG through the existing adapter. It prints the retained object key, never credentials. It does not create buckets, delete objects, start services or modify database records. The isolated harness replaces only application dependency imports, preventing database initialization; actual S3 adapter and SDK operations are unchanged.

Verified 2026-10-31: PUT/GET bytes matched in `ccna-lesson-media`; retained test object `ccna-lessons/71f0201c-80e7-48de-a601-9bb945d05a23.png`. Two focused credential/forwarding tests passed. No live application upload, publication or restart was performed.

Operational uploads remain blocked by the existing unactivated 0015 metadata proposal. Its reviewed rehearsal/activation and corresponding startup-guard integration require separate authorization. No migration was applied here. After those prerequisites pass, an approved API restart through the existing guarded launcher loads this configuration. Do not rerun old migrations or weaken the guard.
