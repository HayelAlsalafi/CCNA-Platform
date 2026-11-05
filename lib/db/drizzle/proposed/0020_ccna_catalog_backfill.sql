-- SOURCE PROPOSAL ONLY. Separate approval of exact metadata backfill is required.
-- Atomic DO block, no conflict-ignore, retry or adoption of partial state.
DO $$
DECLARE
  bp uuid;
  changed integer;
  expected jsonb := '[{"id":"9d8bd104-2bc5-59c8-a417-367996c7d8b9","code":"CCNA-V1-01","volume":"V1","number":1,"domain":"1.0","slug":"ocg-v1-1"},{"id":"6d0123a3-51bc-5740-a757-90d18f072691","code":"CCNA-V1-02","volume":"V1","number":2,"domain":"1.0","slug":"ocg-v1-2"},{"id":"ec4f0e28-8827-503c-ba8e-5ae6b7fc7bcf","code":"CCNA-V1-03","volume":"V1","number":3,"domain":"1.0","slug":"ocg-v1-3"},{"id":"a5c44824-b9be-5edd-890b-f92ed634aac4","code":"CCNA-V1-11","volume":"V1","number":11,"domain":"1.0","slug":"ocg-v1-11"},{"id":"7131b37d-5eea-5e75-b6f2-f32d5551ccf0","code":"CCNA-V1-12","volume":"V1","number":12,"domain":"1.0","slug":"ocg-v1-12"},{"id":"7ac614cc-4560-55ed-868d-21c4a304cad4","code":"CCNA-V1-13","volume":"V1","number":13,"domain":"1.0","slug":"ocg-v1-13"},{"id":"0772d361-735d-5226-8219-234a664d15b5","code":"CCNA-V1-14","volume":"V1","number":14,"domain":"1.0","slug":"ocg-v1-14"},{"id":"b6cc208c-755c-50de-b6a2-56369a67be32","code":"CCNA-V1-22","volume":"V1","number":22,"domain":"1.0","slug":"ocg-v1-22"},{"id":"42bbf3b3-63b9-5080-b004-9e253cc11936","code":"CCNA-V1-23","volume":"V1","number":23,"domain":"1.0","slug":"ocg-v1-23"},{"id":"da7a9f7f-0476-55ce-a7f9-9e73efd05210","code":"CCNA-V1-26","volume":"V1","number":26,"domain":"1.0","slug":"ocg-v1-26"},{"id":"7b2bdeeb-8f62-5225-ac19-4301f69e9b71","code":"CCNA-V2-14","volume":"V2","number":14,"domain":"1.0","slug":"ocg-v2-14"},{"id":"91092882-ceef-5d7e-b767-6ff2a2dbf893","code":"CCNA-V2-15","volume":"V2","number":15,"domain":"1.0","slug":"ocg-v2-15"},{"id":"4f8ef146-fc47-54a1-abd2-72de8847790f","code":"CCNA-V1-04","volume":"V1","number":4,"domain":"2.0","slug":"ocg-v1-4"},{"id":"df66d0bb-2a56-5ca3-a4e3-de1c68952fed","code":"CCNA-V1-05","volume":"V1","number":5,"domain":"2.0","slug":"ocg-v1-5"},{"id":"df86e7be-eddf-51c2-ab69-28e68d8877eb","code":"CCNA-V1-06","volume":"V1","number":6,"domain":"2.0","slug":"ocg-v1-6"},{"id":"2bb7f503-d298-5a77-a705-cabfc7442b54","code":"CCNA-V1-07","volume":"V1","number":7,"domain":"2.0","slug":"ocg-v1-7"},{"id":"8c394280-e569-5932-87a5-44e35364dfc2","code":"CCNA-V1-08","volume":"V1","number":8,"domain":"2.0","slug":"ocg-v1-8"},{"id":"8b582547-9477-55d9-bf5e-83e00fd170be","code":"CCNA-V1-09","volume":"V1","number":9,"domain":"2.0","slug":"ocg-v1-9"},{"id":"8b706c59-6619-5248-9f45-78327c252c6c","code":"CCNA-V1-10","volume":"V1","number":10,"domain":"2.0","slug":"ocg-v1-10"},{"id":"24e9e02d-b0e5-5e48-a889-76cc636b90df","code":"CCNA-V1-27","volume":"V1","number":27,"domain":"2.0","slug":"ocg-v1-27"},{"id":"b55745f2-eeb9-55c5-929d-661a5d9d45ba","code":"CCNA-V1-29","volume":"V1","number":29,"domain":"2.0","slug":"ocg-v1-29"},{"id":"fb642283-94ba-5035-b840-babeae13c37c","code":"CCNA-V2-13","volume":"V2","number":13,"domain":"2.0","slug":"ocg-v2-13"},{"id":"526d3656-ce63-5b0c-8073-6b5ae99af0da","code":"CCNA-V1-15","volume":"V1","number":15,"domain":"3.0","slug":"ocg-v1-15"},{"id":"d55a2e6b-2393-50f8-bb2a-7619ccd1f5a4","code":"CCNA-V1-16","volume":"V1","number":16,"domain":"3.0","slug":"ocg-v1-16"},{"id":"234c7939-bfc2-584e-bf56-ac8b6c82e720","code":"CCNA-V1-17","volume":"V1","number":17,"domain":"3.0","slug":"ocg-v1-17"},{"id":"8c255b51-5d2f-5b23-af77-61ba3382e21d","code":"CCNA-V1-18","volume":"V1","number":18,"domain":"3.0","slug":"ocg-v1-18"},{"id":"e00d1796-d454-51bb-87a9-32a4230d5b48","code":"CCNA-V1-19","volume":"V1","number":19,"domain":"3.0","slug":"ocg-v1-19"},{"id":"1aa322d5-4f68-503f-88c6-49e40397dfcc","code":"CCNA-V1-20","volume":"V1","number":20,"domain":"3.0","slug":"ocg-v1-20"},{"id":"bde56020-91ff-5d33-a515-b5ad3f93c2ff","code":"CCNA-V1-21","volume":"V1","number":21,"domain":"3.0","slug":"ocg-v1-21"},{"id":"f474f4fa-9de6-5342-be35-0a486b71aa0a","code":"CCNA-V1-24","volume":"V1","number":24,"domain":"3.0","slug":"ocg-v1-24"},{"id":"e18f0c13-697f-57d0-bd29-a535a0f0fc42","code":"CCNA-V1-25","volume":"V1","number":25,"domain":"3.0","slug":"ocg-v1-25"},{"id":"7ea5004b-4348-50e7-b5a5-5336a4a22fa0","code":"CCNA-V2-01","volume":"V2","number":1,"domain":"4.0","slug":"ocg-v2-1"},{"id":"87c0a77b-89e8-51d0-9418-164b2d17c3a6","code":"CCNA-V2-07","volume":"V2","number":7,"domain":"4.0","slug":"ocg-v2-7"},{"id":"11dd687d-ee4a-5dba-b3ea-e371037f45c5","code":"CCNA-V2-09","volume":"V2","number":9,"domain":"4.0","slug":"ocg-v2-9"},{"id":"cc6b5fb5-e208-5e25-a0d7-55345b8444c0","code":"CCNA-V2-10","volume":"V2","number":10,"domain":"4.0","slug":"ocg-v2-10"},{"id":"782f69c3-f3df-5946-8053-b6efe9011e65","code":"CCNA-V2-11","volume":"V2","number":11,"domain":"4.0","slug":"ocg-v2-11"},{"id":"5dda42f8-5284-5084-a6f5-d0fd087fc3b2","code":"CCNA-V2-12","volume":"V2","number":12,"domain":"4.0","slug":"ocg-v2-12"},{"id":"9cd73c60-be76-5021-93fb-0b02e494d191","code":"CCNA-V1-28","volume":"V1","number":28,"domain":"5.0","slug":"ocg-v1-28"},{"id":"d96748da-cf21-5545-825d-a8247af609da","code":"CCNA-V2-02","volume":"V2","number":2,"domain":"5.0","slug":"ocg-v2-2"},{"id":"e2cd9056-fa36-5bd6-bc38-7381d8cebacd","code":"CCNA-V2-03","volume":"V2","number":3,"domain":"5.0","slug":"ocg-v2-3"},{"id":"febe43ab-71df-5b53-affd-2e2f7713529a","code":"CCNA-V2-04","volume":"V2","number":4,"domain":"5.0","slug":"ocg-v2-4"},{"id":"c502194f-5b71-5a8c-abbb-7ac26d32e7b4","code":"CCNA-V2-05","volume":"V2","number":5,"domain":"5.0","slug":"ocg-v2-5"},{"id":"b53763c4-c5e3-5ca1-9a7b-b0caae27cdb5","code":"CCNA-V2-06","volume":"V2","number":6,"domain":"5.0","slug":"ocg-v2-6"},{"id":"b6e2c220-4f3f-540c-9272-d059bd0123ab","code":"CCNA-V2-08","volume":"V2","number":8,"domain":"5.0","slug":"ocg-v2-8"},{"id":"0b420fca-11f5-5e9d-8ae5-e49061846319","code":"CCNA-V2-16","volume":"V2","number":16,"domain":"6.0","slug":"ocg-v2-16"},{"id":"c6844fdc-169f-5fe5-b32b-b0fbbc64b49a","code":"CCNA-V2-17","volume":"V2","number":17,"domain":"6.0","slug":"ocg-v2-17"},{"id":"fbe6cd90-ca47-5568-ace7-cfdd3dfe9c68","code":"CCNA-V2-18","volume":"V2","number":18,"domain":"6.0","slug":"ocg-v2-18"},{"id":"73e0393e-0580-51e5-9a4b-3536d21fff5d","code":"CCNA-V2-19","volume":"V2","number":19,"domain":"6.0","slug":"ocg-v2-19"}]'::jsonb;
BEGIN
  IF current_user <> 'ccna_phase6a_migrator' THEN
    RAISE EXCEPTION 'Catalog backfill requires reviewed migrator' USING ERRCODE='42501';
  END IF;
  -- Freeze only tables relevant to the identity comparison/backfill, in maintenance.
  LOCK TABLE public.exam_blueprints, public.exam_domains, public.topics,
    public.curriculum_chapters, public.tracks, public.courses, public.course_versions IN SHARE ROW EXCLUSIVE MODE;
  SELECT id INTO STRICT bp FROM public.exam_blueprints WHERE exam_code='200-301' AND version='1.1';
  IF jsonb_array_length(expected)<>48 OR (SELECT count(*) FROM public.curriculum_chapters)<>48 OR
    EXISTS(SELECT 1 FROM public.curriculum_chapters WHERE course_version_id IS NOT NULL) OR
    EXISTS(
      SELECT 1 FROM jsonb_to_recordset(expected) AS e(id uuid,code text,volume text,number integer,domain text,slug text)
      LEFT JOIN public.curriculum_chapters c ON c.id=e.id
      LEFT JOIN public.topics t ON t.id=c.id
      LEFT JOIN public.exam_domains d ON d.id=c.domain_id
      WHERE c.id IS NULL OR c.code<>e.code OR c.volume<>e.volume OR c.chapter_number<>e.number OR
        c.domain_code<>e.domain OR c.blueprint_id<>bp OR t.id IS NULL OR t.slug<>e.slug OR
        d.id IS NULL OR d.blueprint_id<>bp OR d.code<>e.domain
    ) THEN
    RAISE EXCEPTION 'Canonical chapter baseline mismatch; stop without retry' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tracks) OR EXISTS(SELECT 1 FROM public.courses) OR
     EXISTS(SELECT 1 FROM public.course_versions) THEN
    RAISE EXCEPTION 'Catalog must be empty for initial backfill' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.tracks(id,slug,title,status)
    VALUES ('8cfe0dc8-d1cc-59db-9371-976bddd2e7ee','networking','Networking','DRAFT');
  INSERT INTO public.courses(id,track_id,slug,title,status)
    VALUES ('2b3e6111-ecf2-5653-ae40-1053dbf7d032','8cfe0dc8-d1cc-59db-9371-976bddd2e7ee','ccna-200-301','CCNA 200-301','DRAFT');
  INSERT INTO public.course_versions(id,course_id,blueprint_id,version_key,catalog_key,title,status)
    VALUES ('205da5ff-bb7e-5ebb-bb5b-b9407030bfa1','2b3e6111-ecf2-5653-ae40-1053dbf7d032',bp,
      '1.1','ccna-200-301-v1.1-book-48','CCNA 200-301 v1.1','DRAFT');
  UPDATE public.curriculum_chapters SET course_version_id='205da5ff-bb7e-5ebb-bb5b-b9407030bfa1'
    WHERE blueprint_id=bp AND course_version_id IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed<>48 THEN RAISE EXCEPTION 'Backfill count mismatch' USING ERRCODE='23514'; END IF;
END $$;
-- Does not publish metadata/content or change chapter/topic IDs, titles/status,
-- questions/options/revisions, lessons/media/study, exams/practice or users.
