-- SQLite INTEGER fields store signed 64-bit values. DEN records epoch milliseconds,
-- so PostgreSQL timestamp integer columns must also use BIGINT to avoid 2038/overflow.
DO $$
DECLARE column_record record;
BEGIN
  -- PostgreSQL locks columns used in a trigger's UPDATE OF clause.
  DROP TRIGGER IF EXISTS den_business_activation_immutable ON den_warehouse_businesses;
  FOR column_record IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'integer'
      AND right(column_name, 3) = '_at'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE BIGINT', column_record.table_name, column_record.column_name);
  END LOOP;
  CREATE TRIGGER den_business_activation_immutable
    BEFORE UPDATE OF first_approved_at ON den_warehouse_businesses
    FOR EACH ROW EXECUTE FUNCTION den_business_activation_immutable_fn();
END $$;
