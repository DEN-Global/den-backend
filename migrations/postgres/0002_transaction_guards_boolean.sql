-- Reconcile the transaction guard invariant with the baseline.
-- The guard table stores a boolean predicate evaluated inside the batch transaction.
-- Safe to run on a database created from 0001_baseline (already boolean) or from the
-- earlier integer-based port.
DO $$
DECLARE
  guard_type text;
  constraint_name text;
BEGIN
  SELECT data_type INTO guard_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='den_transaction_guards' AND column_name='valid';

  IF guard_type IS NULL THEN
    RAISE EXCEPTION 'den_transaction_guards is missing; apply 0001_baseline first';
  END IF;

  IF guard_type <> 'boolean' THEN
    FOR constraint_name IN
      SELECT conname FROM pg_constraint
      WHERE conrelid='public.den_transaction_guards'::regclass AND contype='c'
    LOOP
      EXECUTE format('ALTER TABLE den_transaction_guards DROP CONSTRAINT %I', constraint_name);
    END LOOP;
    EXECUTE 'ALTER TABLE den_transaction_guards ALTER COLUMN valid TYPE boolean USING (valid <> 0)';
    EXECUTE 'ALTER TABLE den_transaction_guards ADD CONSTRAINT den_transaction_guards_valid_check CHECK (valid)';
  END IF;
END $$;
