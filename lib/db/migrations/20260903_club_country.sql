ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'AU';

UPDATE clubs
SET country_code = 'AU'
WHERE name = 'Riverside FC'
  AND country_code IS DISTINCT FROM 'AU';

WITH australian_placeholders AS (
  SELECT
    u.id,
    '040' || regexp_replace(u.phone, '[^0-9]', '', 'g') AS digits
  FROM users u
  INNER JOIN clubs c ON c.id = u.club_id
  WHERE c.name = 'Riverside FC'
    AND length(regexp_replace(u.phone, '[^0-9]', '', 'g')) = 7
    AND regexp_replace(u.phone, '[^0-9]', '', 'g') LIKE '555%'
)
UPDATE users u
SET phone =
  substring(p.digits, 1, 4) || ' ' ||
  substring(p.digits, 5, 3) || ' ' ||
  substring(p.digits, 8, 3)
FROM australian_placeholders p
WHERE u.id = p.id;
