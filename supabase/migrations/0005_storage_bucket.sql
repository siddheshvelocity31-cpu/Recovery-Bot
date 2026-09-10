-- Create a private Storage bucket for ledger imports
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ledger-imports',
  'ledger-imports',
  false,
  52428800,  -- 50 MB
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do nothing;
