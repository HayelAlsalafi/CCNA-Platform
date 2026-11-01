# Phase 2B media storage readiness — not activated

28 October 2026. Reviewed `lesson-media.ts`, its routes/tests, lesson revision
references, authoring preview and the guarded launcher's environment policy.
No media root was created/configured, no upload was activated and no production
storage was modified.

## Existing minimal local adapter

Use the existing `LocalLessonMedia` adapter for an explicitly approved,
single-machine development deployment. A candidate persistent private root is
`%LOCALAPPDATA%/CCNA-NEXUS\lesson-media`. This path is a proposal,
not a verified directory. Do not put it in Vite public assets, a temporary build
folder, repository backups or an unrestricted static route.

| Requirement | Source implementation / readiness |
| --- | --- |
| Authenticated administrator uploads | POST `/api/admin/lesson-media`: active authenticated database user, ADMIN role and current Admin mutation session checked before parsing upload bytes |
| Type / size | Raw PNG, JPEG or WebP only; at most 5 MiB; signature/MIME and header dimensions checked; dimensions at most 8192 each and 32 megapixels; SVG/HTML not accepted |
| Safe names | Server-generated UUID plus approved extension; exclusive `wx` creation; user filename/path not used |
| Persistent references | `lesson_media` records key/MIME/length/SHA-256/creator; blocks store authenticated `/api/lesson-media/<UUID>` references |
| Previews / reads | Authenticated GET; ADMIN preview or exact current published-revision reference, active chapter topic/blueprint; hash checked before serving |
| Serving | `private, no-store`, `nosniff`, CSP sandbox; no public file mount |
| Revision retention | No deletion API or automatic unlink; replaced/unpublished images and old immutable revisions retain their objects |
| Failed metadata save | Retain possible orphan on failed/unknown DB commit; report failure, never assume successful insertion or delete an ambiguously committed object |
| Missing activation | Table/root checks fail with not-ready errors rather than simulate an upload |

The root must already exist and be a canonical directory without symlink/reparse
redirection; reads reject symlinks/non-files/oversized objects. NTFS ACLs are
essential because Node's POSIX mode argument alone does not enforce Windows ACLs.
Only the trusted runtime/operator and approved backup identity should modify the
root or its parents, preventing replacement races and unauthorized file injection.
Verify actual ACLs, ownership, disk capacity, monitoring and restore rights before
configuration. Do not grant broad filesystem or PostgreSQL rights.

`LESSON_MEDIA_ROOT` is currently optional and unset by default. The guarded launcher
constructs an allowlisted environment and **does not forward this variable**. A
simple `Set-Item Env:LESSON_MEDIA_ROOT` would not activate storage through that
launcher. A separately reviewed, exact-path configuration/allowlist change is
required; do not replace the safe environment with inherited environment files.

## Limits and remaining verification

Current validation examines image structure/header dimensions, not a complete
pixel decode/re-encode. Do not describe it as a full image-decoder integrity check
or malware scanner. Tests cover type/signature mismatch, size/dimensions, exclusive
objects, traversal, retained files and unauthorized/not-ready behavior. They do
not prove production storage, crash durability or application/database commit
atomicity. File writes and metadata insertion span two systems; orphan retention
is intentional. Quotas/rate limits and production object storage are separate
capacity decisions, not implemented activation features.

Before GO, use test-only data in isolation to verify: upload/preview; save/reopen
draft; publish and authenticated learner read; unpublish and denied learner read;
ADMIN access; shared object retained after replacement; old revision retained;
metadata failure/unknown outcome; restart persistence; forbidden upload; bad hash;
and coordinated database+binary restoration. These real integrated checks were
**NOT RUN** because the private PostgreSQL cluster is stopped and no persistent
media directory/configuration has been approved/provisioned.

## Backup, deletion and recovery procedure

Back up the database and a complete media object manifest (opaque key, bytes,
SHA-256) plus corresponding binaries. Include all objects referenced by drafts and
**any** immutable revision, not only the current published pointer. Restore both
into isolation and verify hashes/authenticated reads before calling recovery
verified. The fresh Phase 2B database archive cannot contain image binaries, and
`lesson_media` is currently absent, so it does not prove future media recovery.

No physical media deletion is offered. A future cleanup must prove zero references
across drafts/all revisions, enforce canonical root/key/hash and age, account for
in-flight saves and unknown commits, and receive explicit cleanup approval. Do not
unlink automatically when a block is removed or a lesson is unpublished.

**NO-GO for uploads.** Keep existing not-activated feedback. Approval of migration
0014 alone must not silently provision storage, activate uploads or authorize
production storage changes.
