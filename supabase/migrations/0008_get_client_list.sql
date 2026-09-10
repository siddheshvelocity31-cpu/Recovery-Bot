-- T-012: Postgres helper for client list with aggregated balance
create or replace function get_client_list(
  p_search text default null,
  p_tier text default null,
  p_page int default 1,
  p_page_size int default 50
)
returns table (
  id uuid,
  client_code text,
  name text,
  cost_center text,
  credit_terms_days int,
  relationship_tier text,
  behaviour_band text,
  category_id uuid,
  assigned_collector_id uuid,
  is_muted boolean,
  mute_reason text,
  muted_until timestamptz,
  tier_changed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  balance_paise bigint,
  last_import_date date
)
language sql stable
as $$
  select
    c.id,
    c.client_code,
    c.name,
    c.cost_center,
    c.credit_terms_days,
    c.relationship_tier::text,
    c.behaviour_band::text,
    c.category_id,
    c.assigned_collector_id,
    c.is_muted,
    c.mute_reason,
    c.muted_until,
    c.tier_changed_at,
    c.created_at,
    c.updated_at,
    coalesce(sum(le.bill_amount_paise), 0)::bigint as balance_paise,
    max(li.period_to) as last_import_date
  from client c
  left join ledger_entry le on le.client_id = c.id
  left join ledger_import li on li.client_id = c.id and li.status = 'imported'
  where
    (p_search is null or c.name ilike '%' || p_search || '%' or c.client_code ilike '%' || p_search || '%')
    and (p_tier is null or c.relationship_tier::text = p_tier)
  group by
    c.id, c.client_code, c.name, c.cost_center,
    c.credit_terms_days, c.relationship_tier, c.behaviour_band,
    c.category_id, c.assigned_collector_id, c.is_muted,
    c.mute_reason, c.muted_until, c.tier_changed_at, c.created_at, c.updated_at
  order by c.name
  limit p_page_size
  offset (p_page - 1) * p_page_size
$$;
