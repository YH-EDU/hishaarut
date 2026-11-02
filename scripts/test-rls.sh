#!/usr/bin/env bash
# Applies the migration on a throwaway database and checks row level security.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! pg_lsclusters --no-header | awk '{print $4}' | grep -qx online; then
  sudo pg_ctlcluster 16 main start
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists hishaarut_rls;"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres -c "create database hishaarut_rls;"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d hishaarut_rls -f scripts/prelude.sql
for migration in supabase/migrations/*.sql; do
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d hishaarut_rls -f "$migration"
done
# The follow-up migration is what an existing project pastes. Run it twice.
sudo -u postgres psql -v ON_ERROR_STOP=1 -d hishaarut_rls -f supabase/migrations/20260302000000_secretary_management.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d hishaarut_rls -f supabase/migrations/20260304000000_archive_delete.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d hishaarut_rls -f supabase/migrations/20260305000000_parent_phones.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d hishaarut_rls -f supabase/migrations/20260306000000_release_and_delete.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d hishaarut_rls -f supabase/migrations/20260307000000_onboarding_owner.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d hishaarut_rls -f supabase/migrations/20260308000000_open_signin.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d hishaarut_rls -f supabase/migrations/20260309000000_school_day_ends.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d hishaarut_rls -f supabase/seed.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d hishaarut_rls -f scripts/test-rls.sql
echo "RLS checks passed"
