-- Consolidate batches from the same barangay that can fit within weight limits
-- This will merge multiple batches from the same barangay into a single batch

-- First, let's see what batches we have
SELECT 'Current batches:' as status;
SELECT 
    id,
    barangay,
    total_weight,
    max_weight,
    status,
    created_at,
    (SELECT COUNT(*) FROM orders WHERE batch_id = ob.id) as order_count
FROM order_batches ob
WHERE status = 'pending'
ORDER BY barangay, created_at;

-- Find batches that can be consolidated
WITH batch_groups AS (
    SELECT 
        barangay,
        id as batch_id,
        total_weight,
        max_weight,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY barangay ORDER BY created_at) as rn
    FROM order_batches 
    WHERE status = 'pending'
),
consolidation_candidates AS (
    SELECT 
        bg1.barangay,
        bg1.batch_id as primary_batch_id,
        bg1.total_weight as primary_weight,
        bg1.created_at as primary_created,
        bg2.batch_id as secondary_batch_id,
        bg2.total_weight as secondary_weight,
        bg2.created_at as secondary_created,
        (bg1.total_weight + bg2.total_weight) as combined_weight,
        bg1.max_weight as max_weight
    FROM batch_groups bg1
    JOIN batch_groups bg2 ON bg1.barangay = bg2.barangay 
        AND bg1.rn < bg2.rn
        AND bg1.batch_id != bg2.batch_id
    WHERE (bg1.total_weight + bg2.total_weight) <= bg1.max_weight
)
SELECT 'Batches that can be consolidated:' as status;
SELECT 
    barangay,
    primary_batch_id,
    primary_weight,
    secondary_batch_id,
    secondary_weight,
    combined_weight,
    max_weight
FROM consolidation_candidates
ORDER BY barangay, primary_created;

-- Consolidate the batches
-- For each barangay, keep the oldest batch and move all orders to it
WITH batch_groups AS (
    SELECT 
        barangay,
        id as batch_id,
        total_weight,
        max_weight,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY barangay ORDER BY created_at) as rn
    FROM order_batches 
    WHERE status = 'pending'
),
consolidation_candidates AS (
    SELECT 
        bg1.barangay,
        bg1.batch_id as primary_batch_id,
        bg1.total_weight as primary_weight,
        bg2.batch_id as secondary_batch_id,
        bg2.total_weight as secondary_weight,
        (bg1.total_weight + bg2.total_weight) as combined_weight,
        bg1.max_weight as max_weight
    FROM batch_groups bg1
    JOIN batch_groups bg2 ON bg1.barangay = bg2.barangay 
        AND bg1.rn < bg2.rn
        AND bg1.batch_id != bg2.batch_id
    WHERE (bg1.total_weight + bg2.total_weight) <= bg1.max_weight
)
-- Move orders from secondary batches to primary batches
UPDATE orders 
SET batch_id = cc.primary_batch_id
FROM consolidation_candidates cc
WHERE orders.batch_id = cc.secondary_batch_id;

-- Update the total weight of the primary batches
WITH batch_groups AS (
    SELECT 
        barangay,
        id as batch_id,
        total_weight,
        max_weight,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY barangay ORDER BY created_at) as rn
    FROM order_batches 
    WHERE status = 'pending'
),
consolidation_candidates AS (
    SELECT 
        bg1.barangay,
        bg1.batch_id as primary_batch_id,
        bg1.total_weight as primary_weight,
        bg2.batch_id as secondary_batch_id,
        bg2.total_weight as secondary_weight,
        (bg1.total_weight + bg2.total_weight) as combined_weight,
        bg1.max_weight as max_weight
    FROM batch_groups bg1
    JOIN batch_groups bg2 ON bg1.barangay = bg2.barangay 
        AND bg1.rn < bg2.rn
        AND bg1.batch_id != bg2.batch_id
    WHERE (bg1.total_weight + bg2.total_weight) <= bg1.max_weight
)
UPDATE order_batches 
SET total_weight = cc.combined_weight
FROM consolidation_candidates cc
WHERE order_batches.id = cc.primary_batch_id;

-- Delete the empty secondary batches
WITH batch_groups AS (
    SELECT 
        barangay,
        id as batch_id,
        total_weight,
        max_weight,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY barangay ORDER BY created_at) as rn
    FROM order_batches 
    WHERE status = 'pending'
),
consolidation_candidates AS (
    SELECT 
        bg1.barangay,
        bg1.batch_id as primary_batch_id,
        bg1.total_weight as primary_weight,
        bg2.batch_id as secondary_batch_id,
        bg2.total_weight as secondary_weight,
        (bg1.total_weight + bg2.total_weight) as combined_weight,
        bg1.max_weight as max_weight
    FROM batch_groups bg1
    JOIN batch_groups bg2 ON bg1.barangay = bg2.barangay 
        AND bg1.rn < bg2.rn
        AND bg1.batch_id != bg2.batch_id
    WHERE (bg1.total_weight + bg2.total_weight) <= bg1.max_weight
)
DELETE FROM order_batches 
WHERE id IN (
    SELECT secondary_batch_id 
    FROM consolidation_candidates
);

-- Show the result
SELECT 'After consolidation:' as status;
SELECT 
    id,
    barangay,
    total_weight,
    max_weight,
    status,
    created_at,
    (SELECT COUNT(*) FROM orders WHERE batch_id = ob.id) as order_count
FROM order_batches ob
WHERE status = 'pending'
ORDER BY barangay, created_at; 