-- PROPOSED ONLY. Not journaled; do not execute without separate approval.
-- Empty classification tables: no question/topic/attempt/revision backfill.
CREATE TYPE public.exam_blueprint_status AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
--> statement-breakpoint
CREATE TABLE public.exam_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_code varchar(40) NOT NULL,
  version varchar(30) NOT NULL,
  title varchar(180) NOT NULL,
  status public.exam_blueprint_status NOT NULL DEFAULT 'DRAFT',
  source_url varchar(2048),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_blueprints_code_version_uq UNIQUE(exam_code, version),
  CONSTRAINT exam_blueprints_identity_ck CHECK(btrim(exam_code) <> '' AND exam_code = btrim(exam_code) AND btrim(version) <> '' AND version = btrim(version) AND btrim(title) <> ''),
  CONSTRAINT exam_blueprints_source_ck CHECK(source_url IS NULL OR source_url ~* '^https?://[^[:space:]]+$'),
  CONSTRAINT exam_blueprints_verification_ck CHECK((verified_at IS NULL OR source_url IS NOT NULL) AND (status <> 'ACTIVE' OR verified_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX exam_blueprints_status_idx ON public.exam_blueprints(status);
--> statement-breakpoint
CREATE TABLE public.exam_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL CONSTRAINT exam_domains_blueprint_id_exam_blueprints_id_fk REFERENCES public.exam_blueprints(id) ON DELETE RESTRICT,
  code varchar(20) NOT NULL,
  name varchar(180) NOT NULL,
  weight_percent integer NOT NULL,
  display_order integer NOT NULL,
  CONSTRAINT exam_domains_blueprint_code_uq UNIQUE(blueprint_id, code),
  CONSTRAINT exam_domains_binding_uq UNIQUE(id, blueprint_id, code),
  CONSTRAINT exam_domains_code_ck CHECK(code ~ '^[1-9][0-9]*[.]0$'),
  CONSTRAINT exam_domains_name_ck CHECK(btrim(name) <> ''),
  CONSTRAINT exam_domains_weight_ck CHECK(weight_percent BETWEEN 1 AND 100),
  CONSTRAINT exam_domains_order_ck CHECK(display_order >= 0)
);
--> statement-breakpoint
CREATE INDEX exam_domains_blueprint_order_idx ON public.exam_domains(blueprint_id, display_order);
--> statement-breakpoint
CREATE TABLE public.exam_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id uuid NOT NULL,
  blueprint_id uuid NOT NULL,
  domain_code varchar(20) NOT NULL,
  code varchar(30) NOT NULL,
  description text NOT NULL,
  display_order integer NOT NULL,
  CONSTRAINT exam_objectives_domain_code_uq UNIQUE(domain_id, code),
  CONSTRAINT exam_objectives_blueprint_code_uq UNIQUE(blueprint_id, code),
  CONSTRAINT exam_objectives_binding_uq UNIQUE(id, blueprint_id),
  CONSTRAINT exam_objectives_domain_fk FOREIGN KEY(domain_id, blueprint_id, domain_code) REFERENCES public.exam_domains(id, blueprint_id, code) ON DELETE RESTRICT,
  CONSTRAINT exam_objectives_code_ck CHECK(code ~ '^[1-9][0-9]*[.][1-9][0-9]*([.][a-z])?$' AND domain_code = split_part(code, '.', 1) || '.0'),
  CONSTRAINT exam_objectives_description_ck CHECK(btrim(description) <> ''),
  CONSTRAINT exam_objectives_order_ck CHECK(display_order >= 0)
);
--> statement-breakpoint
CREATE INDEX exam_objectives_domain_order_idx ON public.exam_objectives(domain_id, blueprint_id, domain_code, display_order);
--> statement-breakpoint
CREATE TABLE public.question_objectives (
  question_id uuid NOT NULL CONSTRAINT question_objectives_question_id_questions_id_fk REFERENCES public.questions(id) ON DELETE RESTRICT,
  objective_id uuid NOT NULL,
  blueprint_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  CONSTRAINT question_objectives_question_id_objective_id_pk PRIMARY KEY(question_id, objective_id),
  CONSTRAINT question_objectives_objective_fk FOREIGN KEY(objective_id, blueprint_id) REFERENCES public.exam_objectives(id, blueprint_id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX question_objectives_primary_uq ON public.question_objectives(question_id, blueprint_id) WHERE is_primary;
--> statement-breakpoint
CREATE INDEX question_objectives_objective_idx ON public.question_objectives(objective_id, blueprint_id);
--> statement-breakpoint
CREATE INDEX question_objectives_question_blueprint_idx ON public.question_objectives(question_id, blueprint_id);
