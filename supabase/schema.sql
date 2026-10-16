-- HHD Inventory: run once in Supabase > SQL Editor. Safe to re-run.
create table if not exists sites   ("Site" text primary key);
create table if not exists users   ("Username" text primary key, "Name" text, "Role" text, "Site" text, "PasswordHash" text);
create table if not exists devices ("Serial" text primary key, "Make" text, "Model" text, "Status" text, "Location" text, "LastUpdated" timestamptz);
create table if not exists tickets (
  "TicketID" text primary key, "SenderSite" text, "ReceiverSite" text, "SenderName" text, "RecipientName" text,
  "Action" text, "Devices" text, "Status" text, "DispatchDate" timestamptz, "AckDate" timestamptz,
  "AckBy" text, "Remarks" text, "RecipientUser" text);

-- status a device had before dispatch; restored on acknowledgement
alter table devices add column if not exists "PrevStatus" text;

-- status change audit log
create table if not exists status_log (
  id bigint generated always as identity primary key,
  "Serial" text not null, "Location" text, "OldStatus" text, "NewStatus" text,
  "ChangedAt" timestamptz not null default now(), "ChangedBy" text);
create index if not exists status_log_changed_at on status_log ("ChangedAt" desc);

-- only the service key (used by Apps Script) may touch the data; the browser never talks to Supabase
alter table sites      enable row level security;
alter table users      enable row level security;
alter table devices    enable row level security;
alter table tickets    enable row level security;
alter table status_log enable row level security;

-- IMEI is NOT unique on purpose (several devices may share one)
alter table devices add column if not exists imei_number text;
create index if not exists devices_imei_idx on devices (imei_number);

notify pgrst, 'reload schema';
