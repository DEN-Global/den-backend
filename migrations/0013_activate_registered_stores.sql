-- Registration no longer needs manual approval. Preserve explicit rejection/suspension decisions.
UPDATE den_organizations SET status='approved' WHERE status='pending';
