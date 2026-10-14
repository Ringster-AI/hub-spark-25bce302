-- Stage 6: partner reporting (collected revenue, customer retention, commission-to-revenue ratio)

-- Summary, one row per partner. Partners see only their own row; admins see all
-- (p_partner NULL = every partner) or filter to one.
CREATE OR REPLACE FUNCTION public.partner_report(p_partner uuid DEFAULT NULL)
RETURNS TABLE (
  partner_id uuid,
  business_name text,
  currency text,
  credited_customers bigint,
  active_customers bigint,
  churned_customers bigint,
  retention_rate numeric,
  collected_revenue_cents bigint,
  net_commission_cents bigint,
  pending_commission_cents bigint,
  commission_ratio numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH me AS (SELECT public.current_partner_id() AS own),
scope AS (
  SELECT p.id AS partner_id, coalesce(p.display_name, p.invite_email) AS business_name
  FROM public.partners p, me
  WHERE (p_partner IS NULL OR p.id = p_partner)
    AND (public.is_partner_admin(auth.uid()) OR p.id = me.own)
),
cust AS (
  SELECT a.partner_id,
         count(DISTINCT a.account_id) AS credited,
         count(DISTINCT a.account_id) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.user_subscriptions s
              WHERE s.user_id = a.account_id AND s.status = 'active'
           )
         ) AS active
  FROM public.partner_attributions a
  JOIN scope sc ON sc.partner_id = a.partner_id
  WHERE a.status IN ('active','ended') AND a.eligibility_starts_at IS NOT NULL
  GROUP BY a.partner_id
),
led AS (
  SELECT c.partner_id,
         max(c.currency) AS currency,
         sum(c.eligible_cents) AS collected_net,
         sum(c.amount_cents) AS net_comm,
         sum(c.amount_cents) FILTER (WHERE c.status IN ('pending','held')) AS pending_comm
  FROM public.partner_commissions c
  JOIN scope sc ON sc.partner_id = c.partner_id
  GROUP BY c.partner_id
)
SELECT sc.partner_id, sc.business_name,
       coalesce(led.currency, 'usd'),
       coalesce(cust.credited, 0),
       coalesce(cust.active, 0),
       coalesce(cust.credited, 0) - coalesce(cust.active, 0),
       CASE WHEN coalesce(cust.credited, 0) > 0
            THEN round(coalesce(cust.active, 0)::numeric / cust.credited, 4) ELSE 0 END,
       coalesce(led.collected_net, 0),
       coalesce(led.net_comm, 0),
       coalesce(led.pending_comm, 0),
       CASE WHEN coalesce(led.collected_net, 0) > 0
            THEN round(led.net_comm::numeric / led.collected_net, 4) ELSE 0 END
FROM scope sc
LEFT JOIN cust ON cust.partner_id = sc.partner_id
LEFT JOIN led ON led.partner_id = sc.partner_id
$$;

-- Monthly series (last p_months calendar months). Same visibility rules as partner_report.
CREATE OR REPLACE FUNCTION public.partner_report_monthly(p_partner uuid DEFAULT NULL, p_months integer DEFAULT 12)
RETURNS TABLE (month text, collected_revenue_cents bigint, commission_cents bigint, new_customers bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH me AS (SELECT public.current_partner_id() AS own),
scope AS (
  SELECT p.id AS partner_id
  FROM public.partners p, me
  WHERE (p_partner IS NULL OR p.id = p_partner)
    AND (public.is_partner_admin(auth.uid()) OR p.id = me.own)
),
series AS (
  SELECT generate_series(
           date_trunc('month', now()) - make_interval(months => GREATEST(p_months, 1) - 1),
           date_trunc('month', now()),
           interval '1 month'
         ) AS m
),
led AS (
  SELECT date_trunc('month', c.occurred_at) AS m,
         sum(c.eligible_cents) AS rev,
         sum(c.amount_cents) AS comm
  FROM public.partner_commissions c
  JOIN scope sc ON sc.partner_id = c.partner_id
  GROUP BY 1
),
newc AS (
  SELECT date_trunc('month', a.eligibility_starts_at) AS m, count(*) AS n
  FROM public.partner_attributions a
  JOIN scope sc ON sc.partner_id = a.partner_id
  WHERE a.eligibility_starts_at IS NOT NULL
  GROUP BY 1
)
SELECT to_char(s.m, 'YYYY-MM'),
       coalesce(led.rev, 0),
       coalesce(led.comm, 0),
       coalesce(newc.n, 0)
FROM series s
LEFT JOIN led ON led.m = s.m
LEFT JOIN newc ON newc.m = s.m
ORDER BY s.m
$$;

REVOKE ALL ON FUNCTION public.partner_report(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.partner_report_monthly(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_report(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_report_monthly(uuid, integer) TO authenticated, service_role;