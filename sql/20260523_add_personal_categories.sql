-- Add optional personal expense categories used by the daily ledger UI.
-- Safe to run multiple times: existing category names are skipped.

insert into personal_categories (name, icon, sort_order, is_default, is_active)
select v.name, v.icon, v.sort_order, true, true
from (values
  ('衣服・服飾', '👕', 11),
  ('交際費', '🍻', 12),
  ('旅行・レジャー', '✈️', 13),
  ('家電・家具', '🛋️', 14),
  ('車両整備', '🔧', 15),
  ('プレゼント・冠婚葬祭', '🎁', 16)
) as v(name, icon, sort_order)
where not exists (
  select 1
  from personal_categories pc
  where pc.name = v.name
);
