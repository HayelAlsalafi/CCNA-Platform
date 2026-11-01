-- Guarded development reset prerequisite: questions must be empty.
CREATE TABLE "curriculum_chapters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"domain_code" varchar(20) NOT NULL,
	"code" varchar(20) NOT NULL,
	"volume" varchar(2) NOT NULL,
	"chapter_number" integer NOT NULL,
	CONSTRAINT "curriculum_chapters_code_uq" UNIQUE("blueprint_id","code"),
	CONSTRAINT "curriculum_chapters_number_uq" UNIQUE("blueprint_id","volume","chapter_number"),
	CONSTRAINT "curriculum_chapters_canonical_ck" CHECK ((id,volume,chapter_number,domain_code) IN (('9d8bd104-2bc5-59c8-a417-367996c7d8b9'::uuid,'V1',1,'1.0'),('6d0123a3-51bc-5740-a757-90d18f072691'::uuid,'V1',2,'1.0'),('ec4f0e28-8827-503c-ba8e-5ae6b7fc7bcf'::uuid,'V1',3,'1.0'),('a5c44824-b9be-5edd-890b-f92ed634aac4'::uuid,'V1',11,'1.0'),('7131b37d-5eea-5e75-b6f2-f32d5551ccf0'::uuid,'V1',12,'1.0'),('7ac614cc-4560-55ed-868d-21c4a304cad4'::uuid,'V1',13,'1.0'),('0772d361-735d-5226-8219-234a664d15b5'::uuid,'V1',14,'1.0'),('b6cc208c-755c-50de-b6a2-56369a67be32'::uuid,'V1',22,'1.0'),('42bbf3b3-63b9-5080-b004-9e253cc11936'::uuid,'V1',23,'1.0'),('da7a9f7f-0476-55ce-a7f9-9e73efd05210'::uuid,'V1',26,'1.0'),('7b2bdeeb-8f62-5225-ac19-4301f69e9b71'::uuid,'V2',14,'1.0'),('91092882-ceef-5d7e-b767-6ff2a2dbf893'::uuid,'V2',15,'1.0'),('4f8ef146-fc47-54a1-abd2-72de8847790f'::uuid,'V1',4,'2.0'),('df66d0bb-2a56-5ca3-a4e3-de1c68952fed'::uuid,'V1',5,'2.0'),('df86e7be-eddf-51c2-ab69-28e68d8877eb'::uuid,'V1',6,'2.0'),('2bb7f503-d298-5a77-a705-cabfc7442b54'::uuid,'V1',7,'2.0'),('8c394280-e569-5932-87a5-44e35364dfc2'::uuid,'V1',8,'2.0'),('8b582547-9477-55d9-bf5e-83e00fd170be'::uuid,'V1',9,'2.0'),('8b706c59-6619-5248-9f45-78327c252c6c'::uuid,'V1',10,'2.0'),('24e9e02d-b0e5-5e48-a889-76cc636b90df'::uuid,'V1',27,'2.0'),('b55745f2-eeb9-55c5-929d-661a5d9d45ba'::uuid,'V1',29,'2.0'),('fb642283-94ba-5035-b840-babeae13c37c'::uuid,'V2',13,'2.0'),('526d3656-ce63-5b0c-8073-6b5ae99af0da'::uuid,'V1',15,'3.0'),('d55a2e6b-2393-50f8-bb2a-7619ccd1f5a4'::uuid,'V1',16,'3.0'),('234c7939-bfc2-584e-bf56-ac8b6c82e720'::uuid,'V1',17,'3.0'),('8c255b51-5d2f-5b23-af77-61ba3382e21d'::uuid,'V1',18,'3.0'),('e00d1796-d454-51bb-87a9-32a4230d5b48'::uuid,'V1',19,'3.0'),('1aa322d5-4f68-503f-88c6-49e40397dfcc'::uuid,'V1',20,'3.0'),('bde56020-91ff-5d33-a515-b5ad3f93c2ff'::uuid,'V1',21,'3.0'),('f474f4fa-9de6-5342-be35-0a486b71aa0a'::uuid,'V1',24,'3.0'),('e18f0c13-697f-57d0-bd29-a535a0f0fc42'::uuid,'V1',25,'3.0'),('7ea5004b-4348-50e7-b5a5-5336a4a22fa0'::uuid,'V2',1,'4.0'),('87c0a77b-89e8-51d0-9418-164b2d17c3a6'::uuid,'V2',7,'4.0'),('11dd687d-ee4a-5dba-b3ea-e371037f45c5'::uuid,'V2',9,'4.0'),('cc6b5fb5-e208-5e25-a0d7-55345b8444c0'::uuid,'V2',10,'4.0'),('782f69c3-f3df-5946-8053-b6efe9011e65'::uuid,'V2',11,'4.0'),('5dda42f8-5284-5084-a6f5-d0fd087fc3b2'::uuid,'V2',12,'4.0'),('9cd73c60-be76-5021-93fb-0b02e494d191'::uuid,'V1',28,'5.0'),('d96748da-cf21-5545-825d-a8247af609da'::uuid,'V2',2,'5.0'),('e2cd9056-fa36-5bd6-bc38-7381d8cebacd'::uuid,'V2',3,'5.0'),('febe43ab-71df-5b53-affd-2e2f7713529a'::uuid,'V2',4,'5.0'),('c502194f-5b71-5a8c-abbb-7ac26d32e7b4'::uuid,'V2',5,'5.0'),('b53763c4-c5e3-5ca1-9a7b-b0caae27cdb5'::uuid,'V2',6,'5.0'),('b6e2c220-4f3f-540c-9272-d059bd0123ab'::uuid,'V2',8,'5.0'),('0b420fca-11f5-5e9d-8ae5-e49061846319'::uuid,'V2',16,'6.0'),('c6844fdc-169f-5fe5-b32b-b0fbbc64b49a'::uuid,'V2',17,'6.0'),('fbe6cd90-ca47-5568-ace7-cfdd3dfe9c68'::uuid,'V2',18,'6.0'),('73e0393e-0580-51e5-9a4b-3536d21fff5d'::uuid,'V2',19,'6.0'))),
	CONSTRAINT "curriculum_chapters_number_ck" CHECK (("curriculum_chapters"."volume"='V1' AND "curriculum_chapters"."chapter_number" BETWEEN 1 AND 29) OR ("curriculum_chapters"."volume"='V2' AND "curriculum_chapters"."chapter_number" BETWEEN 1 AND 19)),
	CONSTRAINT "curriculum_chapters_code_ck" CHECK ("curriculum_chapters"."code" = 'CCNA-' || "curriculum_chapters"."volume" || '-' || lpad("curriculum_chapters"."chapter_number"::text,2,'0'))
);

--> statement-breakpoint
ALTER TABLE "curriculum_chapters" ADD CONSTRAINT "curriculum_chapters_id_topics_id_fk" FOREIGN KEY ("id") REFERENCES "public"."topics"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_chapters" ADD CONSTRAINT "curriculum_chapters_domain_fk" FOREIGN KEY ("domain_id","blueprint_id","domain_code") REFERENCES "public"."exam_domains"("id","blueprint_id","code") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "curriculum_chapters_domain_idx" ON "curriculum_chapters" USING btree ("domain_id","id");
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_chapter_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_chapters"("id") ON DELETE restrict ON UPDATE no action;
