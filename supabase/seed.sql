-- =============================================================================
-- seed.sql — Reference categories, policies, personas, thresholds, test client
-- Idempotent: safe to run via `supabase db reset` on an already-seeded database.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Categories
--    Each (relationship_tier, behaviour_band) pair must be unique.
--    All seeded with behaviour_band = 'unknown' (derivation is a later phase).
--    Only 'standard' is the default.
-- -----------------------------------------------------------------------------

with
cat_strategic as (
  insert into category (code, display_name, relationship_tier, behaviour_band, is_default)
  values ('strategic', 'Strategic Accounts', 'strategic', 'unknown', false)
  on conflict (code) do update set display_name = excluded.display_name
  returning id
),
cat_standard as (
  insert into category (code, display_name, relationship_tier, behaviour_band, is_default)
  values ('standard', 'Standard Accounts', 'standard', 'unknown', true)
  on conflict (code) do update set display_name = excluded.display_name
  returning id
),
cat_watchlist as (
  insert into category (code, display_name, relationship_tier, behaviour_band, is_default)
  values ('watchlist', 'Watchlist Accounts', 'watchlist', 'unknown', false)
  on conflict (code) do update set display_name = excluded.display_name
  returning id
),
cat_new as (
  insert into category (code, display_name, relationship_tier, behaviour_band, is_default)
  values ('new', 'New Accounts', 'new', 'unknown', false)
  on conflict (code) do update set display_name = excluded.display_name
  returning id
),

-- -----------------------------------------------------------------------------
-- 2. Cadence policies
--    One per category. max_messages_per_week varies by urgency of the tier.
-- -----------------------------------------------------------------------------

pol_strategic as (
  insert into cadence_policy (category_id, max_messages_per_week)
  select id, 2 from cat_strategic
  on conflict (category_id) do update set max_messages_per_week = excluded.max_messages_per_week
  returning id
),
pol_standard as (
  insert into cadence_policy (category_id, max_messages_per_week)
  select id, 2 from cat_standard
  on conflict (category_id) do update set max_messages_per_week = excluded.max_messages_per_week
  returning id
),
pol_watchlist as (
  insert into cadence_policy (category_id, max_messages_per_week)
  select id, 3 from cat_watchlist
  on conflict (category_id) do update set max_messages_per_week = excluded.max_messages_per_week
  returning id
),
pol_new as (
  insert into cadence_policy (category_id, max_messages_per_week)
  select id, 1 from cat_new
  on conflict (category_id) do update set max_messages_per_week = excluded.max_messages_per_week
  returning id
),

-- -----------------------------------------------------------------------------
-- 3. Cadence steps — Strategic (4 steps, same timing as Standard)
-- -----------------------------------------------------------------------------

steps_strategic as (
  insert into cadence_step (cadence_policy_id, step_number, channel, offset_days_from_due, template_key, escalation_level)
  select p.id, v.step_number, v.channel::channel, v.offset_days_from_due, v.template_key, v.escalation_level
  from pol_strategic p
  cross join (values
    (1, 'email',    0,  'reminder_first',         1),
    (2, 'email',    7,  'reminder_second',         1),
    (3, 'whatsapp', 14, 'escalation_ap_manager',  2),
    (4, 'voice',    30, 'escalation_final',        3)
  ) as v(step_number, channel, offset_days_from_due, template_key, escalation_level)
  on conflict (cadence_policy_id, step_number)
    do update set
      channel               = excluded.channel,
      offset_days_from_due  = excluded.offset_days_from_due,
      template_key          = excluded.template_key,
      escalation_level      = excluded.escalation_level
  returning id
),

-- -----------------------------------------------------------------------------
-- 4. Cadence steps — Standard (4 steps, identical timing to Strategic)
-- -----------------------------------------------------------------------------

steps_standard as (
  insert into cadence_step (cadence_policy_id, step_number, channel, offset_days_from_due, template_key, escalation_level)
  select p.id, v.step_number, v.channel::channel, v.offset_days_from_due, v.template_key, v.escalation_level
  from pol_standard p
  cross join (values
    (1, 'email',    0,  'reminder_first',         1),
    (2, 'email',    7,  'reminder_second',         1),
    (3, 'whatsapp', 14, 'escalation_ap_manager',  2),
    (4, 'voice',    30, 'escalation_final',        3)
  ) as v(step_number, channel, offset_days_from_due, template_key, escalation_level)
  on conflict (cadence_policy_id, step_number)
    do update set
      channel               = excluded.channel,
      offset_days_from_due  = excluded.offset_days_from_due,
      template_key          = excluded.template_key,
      escalation_level      = excluded.escalation_level
  returning id
),

-- -----------------------------------------------------------------------------
-- 5. Cadence steps — Watchlist (4 steps, accelerated timing)
-- -----------------------------------------------------------------------------

steps_watchlist as (
  insert into cadence_step (cadence_policy_id, step_number, channel, offset_days_from_due, template_key, escalation_level)
  select p.id, v.step_number, v.channel::channel, v.offset_days_from_due, v.template_key, v.escalation_level
  from pol_watchlist p
  cross join (values
    (1, 'whatsapp', 0,  'reminder_first',         1),
    (2, 'email',    5,  'reminder_second',         1),
    (3, 'whatsapp', 10, 'escalation_ap_manager',  2),
    (4, 'voice',    21, 'escalation_final',        3)
  ) as v(step_number, channel, offset_days_from_due, template_key, escalation_level)
  on conflict (cadence_policy_id, step_number)
    do update set
      channel               = excluded.channel,
      offset_days_from_due  = excluded.offset_days_from_due,
      template_key          = excluded.template_key,
      escalation_level      = excluded.escalation_level
  returning id
),

-- -----------------------------------------------------------------------------
-- 6. Cadence steps — New (3 steps, gentle / infrequent)
-- -----------------------------------------------------------------------------

steps_new as (
  insert into cadence_step (cadence_policy_id, step_number, channel, offset_days_from_due, template_key, escalation_level)
  select p.id, v.step_number, v.channel::channel, v.offset_days_from_due, v.template_key, v.escalation_level
  from pol_new p
  cross join (values
    (1, 'email',    7,  'reminder_first',         1),
    (2, 'email',    21, 'reminder_second',         1),
    (3, 'whatsapp', 30, 'escalation_ap_manager',  2)
  ) as v(step_number, channel, offset_days_from_due, template_key, escalation_level)
  on conflict (cadence_policy_id, step_number)
    do update set
      channel               = excluded.channel,
      offset_days_from_due  = excluded.offset_days_from_due,
      template_key          = excluded.template_key,
      escalation_level      = excluded.escalation_level
  returning id
),

-- -----------------------------------------------------------------------------
-- 7. Personas
-- -----------------------------------------------------------------------------

persona_strategic as (
  insert into persona (category_id, tone, signature, requires_human_approval)
  select id, 'courteous'::tone, 'Warm regards, Recovery Team', false
  from cat_strategic
  on conflict (category_id) do update set
    tone                    = excluded.tone,
    signature               = excluded.signature,
    requires_human_approval = excluded.requires_human_approval
  returning id
),
persona_standard as (
  insert into persona (category_id, tone, signature, requires_human_approval)
  select id, 'neutral'::tone, 'Regards, Recovery Team', false
  from cat_standard
  on conflict (category_id) do update set
    tone                    = excluded.tone,
    signature               = excluded.signature,
    requires_human_approval = excluded.requires_human_approval
  returning id
),
persona_watchlist as (
  -- tone='firm' requires requires_human_approval=true (schema CHECK constraint)
  insert into persona (category_id, tone, signature, requires_human_approval)
  select id, 'firm'::tone, 'Recovery Team', true
  from cat_watchlist
  on conflict (category_id) do update set
    tone                    = excluded.tone,
    signature               = excluded.signature,
    requires_human_approval = excluded.requires_human_approval
  returning id
),
persona_new as (
  insert into persona (category_id, tone, signature, requires_human_approval)
  select id, 'neutral'::tone, 'Regards, Recovery Team', false
  from cat_new
  on conflict (category_id) do update set
    tone                    = excluded.tone,
    signature               = excluded.signature,
    requires_human_approval = excluded.requires_human_approval
  returning id
),

-- -----------------------------------------------------------------------------
-- 8. Threshold sets
--    quiet_hours_start='19:00', quiet_hours_end='10:00' for all categories
--    (IST: no messages between 7 pm and 10 am).
--    promise_grace_hours=24, silence_attempts=3 for all categories.
--
--    standard: amber_days=30, red_days=60 are PLACEHOLDERS — recalibrate once
--    real aging distribution is available (Q-05 resolution).
-- -----------------------------------------------------------------------------

threshold_strategic as (
  insert into threshold_set (
    category_id, amber_days, red_days,
    amber_amount_paise, red_amount_paise,
    quiet_hours_start, quiet_hours_end,
    promise_grace_hours, silence_attempts
  )
  select id, 45, 90, null, null, '19:00', '10:00', 24, 3
  from cat_strategic
  on conflict (category_id) do update set
    amber_days          = excluded.amber_days,
    red_days            = excluded.red_days,
    amber_amount_paise  = excluded.amber_amount_paise,
    red_amount_paise    = excluded.red_amount_paise,
    quiet_hours_start   = excluded.quiet_hours_start,
    quiet_hours_end     = excluded.quiet_hours_end,
    promise_grace_hours = excluded.promise_grace_hours,
    silence_attempts    = excluded.silence_attempts
  returning id
),
threshold_standard as (
  -- PLACEHOLDER: amber_days=30, red_days=60 — recalibrate after real aging
  -- distribution is available (Q-05, DECISIONS.md D-11).
  insert into threshold_set (
    category_id, amber_days, red_days,
    amber_amount_paise, red_amount_paise,
    quiet_hours_start, quiet_hours_end,
    promise_grace_hours, silence_attempts
  )
  select id, 30, 60, null, null, '19:00', '10:00', 24, 3
  from cat_standard
  on conflict (category_id) do update set
    amber_days          = excluded.amber_days,
    red_days            = excluded.red_days,
    amber_amount_paise  = excluded.amber_amount_paise,
    red_amount_paise    = excluded.red_amount_paise,
    quiet_hours_start   = excluded.quiet_hours_start,
    quiet_hours_end     = excluded.quiet_hours_end,
    promise_grace_hours = excluded.promise_grace_hours,
    silence_attempts    = excluded.silence_attempts
  returning id
),
threshold_watchlist as (
  insert into threshold_set (
    category_id, amber_days, red_days,
    amber_amount_paise, red_amount_paise,
    quiet_hours_start, quiet_hours_end,
    promise_grace_hours, silence_attempts
  )
  select id, 15, 30, null, null, '19:00', '10:00', 24, 3
  from cat_watchlist
  on conflict (category_id) do update set
    amber_days          = excluded.amber_days,
    red_days            = excluded.red_days,
    amber_amount_paise  = excluded.amber_amount_paise,
    red_amount_paise    = excluded.red_amount_paise,
    quiet_hours_start   = excluded.quiet_hours_start,
    quiet_hours_end     = excluded.quiet_hours_end,
    promise_grace_hours = excluded.promise_grace_hours,
    silence_attempts    = excluded.silence_attempts
  returning id
),
threshold_new as (
  insert into threshold_set (
    category_id, amber_days, red_days,
    amber_amount_paise, red_amount_paise,
    quiet_hours_start, quiet_hours_end,
    promise_grace_hours, silence_attempts
  )
  select id, 30, 60, null, null, '19:00', '10:00', 24, 3
  from cat_new
  on conflict (category_id) do update set
    amber_days          = excluded.amber_days,
    red_days            = excluded.red_days,
    amber_amount_paise  = excluded.amber_amount_paise,
    red_amount_paise    = excluded.red_amount_paise,
    quiet_hours_start   = excluded.quiet_hours_start,
    quiet_hours_end     = excluded.quiet_hours_end,
    promise_grace_hours = excluded.promise_grace_hours,
    silence_attempts    = excluded.silence_attempts
  returning id
)

-- CTE must end with a SELECT
select 'seed complete' as status;

-- -----------------------------------------------------------------------------
-- 9. Test client — Olectra Greentech Limited
--    Synthetic data only. Real contacts are blocked on Q-04.
-- -----------------------------------------------------------------------------

insert into client (client_code, name, credit_terms_days, relationship_tier)
values ('OL000001', 'OLECTRA GREENTECH LIMITED', 30, 'strategic')
on conflict (client_code) do update set name = excluded.name;

update client
set category_id = (select id from category where code = 'strategic')
where client_code = 'OL000001';

-- Synthetic contacts — phone numbers are clearly fake so no real person is ever
-- messaged even if is_dry_run is accidentally flipped to false.
--
-- Primary contact: the partial unique index on (client_id) WHERE is_primary=true
-- means on conflict do nothing covers re-runs cleanly.
insert into contact (client_id, full_name, role_title, phone_e164, email, is_primary, whatsapp_opt_in, email_opt_in)
select c.id,
       'Test Contact Primary',
       'Accounts Payable',
       '+919999900001',
       'test1@example.invalid',
       true,
       true,
       true
from client c
where c.client_code = 'OL000001'
on conflict (client_id) where is_primary = true do nothing;

-- Secondary contact: no unique constraint exists, so guard with NOT EXISTS to
-- prevent duplicate rows on re-run (WHERE NOT EXISTS is the idempotency guard).
insert into contact (client_id, full_name, role_title, phone_e164, email, escalation_level, email_opt_in)
select c.id,
       'Test Contact Secondary',
       'Finance Manager',
       '+919999900002',
       'test2@example.invalid',
       2,
       true
from client c
where c.client_code = 'OL000001'
  and not exists (
    select 1 from contact x
    where x.client_id = c.id and x.phone_e164 = '+919999900002'
  );
