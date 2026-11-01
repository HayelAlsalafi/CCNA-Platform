# CCNA Curriculum Explorer

The `/topics` route now displays CCNA 200-301 → Domain → Section → Chapter → existing Topics → Practice. Its six domains and 33 chapter titles/order are the Phase 8A requested learning-navigation hierarchy. Section names are local navigation labels. This is not attribution to a particular book edition or a replacement for Cisco exam objectives. The existing versioned exam taxonomy and question-objective mappings remain separate and unchanged.

`artifacts/api-server/src/lib/curriculum-config.ts` defines version `ccna-navigation-2026-10-v1`, stable domain/section/chapter IDs and explicit topic-slug bindings. No records, chapters or duplicate topics are inserted into PostgreSQL. Exact slugs resolve to the database's actual topic UUIDs at read time. Editing a topic's slug requires an explicit configuration review.

`GET /api/curriculum` requires the existing authenticated, active-account middleware. One aggregate query selects topic metadata and counts ACTIVE questions on ACTIVE topics; it never selects question bodies/options/answers. Only mapped active topics enter the learner response. Six cards remain visible even with an empty database; their chapters show empty states and disabled practice actions. Domain question counts deduplicate shared topic UUIDs; chapter counts can overlap where one topic is explicitly referenced twice.

Domain buttons expand a same-page, bounded chapter/details panel. Buttons support keyboard activation, Escape collapses and restores focus, and reduced-motion preferences suppress animation. Desktop uses three columns/two rows, tablet two columns, and mobile one column. The sidebar and authentication stay intact. `/practice?topicId=<original UUID>` retains the existing practice experience. ADMIN-only View Questions links open the existing question manager with its topic filter initialized from that UUID.

Learner progress is fetched through the existing private progress API only after chapter selection. Coverage is labeled as questions attempted, not mastery or course completion. Requests/cache keys include the existing user/session identity; no user ID is sent as an API override. Unknown progress is displayed as unavailable. There is no lab-record schema/provider in the inspected project, so the interface says “Labs coming soon”; it does not invent lab records or links.

To extend the hierarchy, edit the versioned configuration, preserve existing IDs, increment the version for navigation changes, add exact reviewed slug bindings, and run the curriculum tests. Review the Admin mapping report before adding bindings. Do not infer a chapter from a topic name, official objective code, or fuzzy matching. Future lab support needs a real read model/provider and validation before replacing the unavailable state.

No migration, content import/publication, role change, question edit or Practice/Exam redesign is part of this feature.
