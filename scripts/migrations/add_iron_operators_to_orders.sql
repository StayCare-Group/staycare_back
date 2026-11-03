-- Migration: Add iron_operators column to orders
-- Stores the assigned ironing operators as a JSON array (e.g. ["Operator A", "Operator B"]).

ALTER TABLE `orders`
  ADD COLUMN `iron_operators` JSON NULL DEFAULT NULL AFTER `special_notes`;

-- Backfill: populate iron_operators from existing non-empty history notes
UPDATE `orders` o
JOIN (
  SELECT h.order_id, h.note
  FROM `order_status_history` h
  INNER JOIN (
    SELECT order_id, MAX(changed_at) AS max_changed_at
    FROM `order_status_history`
    WHERE (status = 'Ironing' OR status = 'ironing')
      AND note LIKE 'Operators:%'
    GROUP BY order_id
  ) latest ON h.order_id = latest.order_id AND h.changed_at = latest.max_changed_at
  WHERE TRIM(SUBSTRING(h.note, 11)) <> ''
) h_latest ON o.id = h_latest.order_id
SET o.iron_operators = CAST(
  CONCAT(
    '["',
    REPLACE(
      REGEXP_REPLACE(TRIM(SUBSTRING(h_latest.note, 11)), '\\s*,\\s*', '","'),
      '"',
      '\\"'
    ),
    '"]'
  ) AS JSON
)
WHERE o.iron_operators IS NULL;
