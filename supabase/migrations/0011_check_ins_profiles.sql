-- Let the app read the name of whoever checked an item in.
alter table public.check_ins
  add constraint check_ins_user_profile_fk
  foreign key (user_id) references public.profiles (id) on delete cascade;
