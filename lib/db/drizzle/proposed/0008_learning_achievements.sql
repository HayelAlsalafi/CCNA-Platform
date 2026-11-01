-- Additive proposal; requires 0007. No historical events or learner awards seeded.
CREATE TABLE public.achievement_definitions (
 id varchar(80) PRIMARY KEY,
 name varchar(120) NOT NULL,
 description text NOT NULL,
 rule_key varchar(80) NOT NULL,
 rule_version integer NOT NULL DEFAULT 1,
 criteria jsonb NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT achievement_definitions_identity_ck CHECK (id ~ '^[a-z][a-z0-9-]*[.]v[1-9][0-9]*$' AND btrim(name)<>'' AND btrim(description)<>'' AND rule_version>0),
 CONSTRAINT achievement_definitions_criteria_ck CHECK (jsonb_typeof(criteria)='object')
);
CREATE TABLE public.learner_achievements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL CONSTRAINT learner_achievements_user_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
 achievement_id varchar(80) NOT NULL CONSTRAINT learner_achievements_definition_fk REFERENCES public.achievement_definitions(id) ON DELETE RESTRICT,
 awarded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence jsonb NOT NULL,
 CONSTRAINT learner_achievements_user_badge_uq UNIQUE(user_id,achievement_id),
 CONSTRAINT learner_achievements_evidence_ck CHECK (jsonb_typeof(evidence)='object')
);
CREATE INDEX learner_achievements_user_date_idx ON public.learner_achievements(user_id,awarded_at DESC NULLS LAST);
-- Versioned rule catalog only. Awards derive exclusively from real learner evidence.
INSERT INTO public.achievement_definitions(id,name,description,rule_key,criteria) VALUES
('first-packet.v1','First Packet','Complete one reliably tracked practice session.','completed-sessions','{"sessions":1}'),
('packet-explorer.v1','Packet Explorer','Submit answers to 50 distinct questions.','distinct-questions','{"unique":50}'),
('consistency-builder.v1','Consistency Builder','Record learning on seven consecutive local calendar days.','consecutive-days','{"streak":7}'),
('vlan-explorer.v1','VLAN Explorer','Answer at least five VLAN-objective questions across three distinct questions with 70% accuracy.','vlan-evidence','{"attempts":5,"unique":3,"accuracy":70}'),
('precision-90.v1','Precision 90','Reach 90% accuracy across at least 30 answers and ten distinct questions.','overall-accuracy','{"attempts":30,"unique":10,"accuracy":90}'),
('security-scout.v1','Security Scout','Record ten Security Fundamentals answers across five available questions with 70% accuracy.','security-evidence','{"attempts":10,"unique":5,"accuracy":70}'),
('ccna-pathfinder.v1','CCNA Pathfinder','Answer at least five questions across three distinct available questions in each of all six CCNA domains.','all-domains','{"domains":6,"attemptsPerDomain":5,"uniquePerDomain":3}');
-- No broad grants, data rewrites, inferred history or future lesson/lab tables.

REVOKE ALL ON public.achievement_definitions, public.learner_achievements FROM PUBLIC;
