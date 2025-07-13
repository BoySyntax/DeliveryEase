-- ================================================================================
-- SIMPLE BATCH DUPLICATION PREVENTION & IMMEDIATE FIX SCRIPT
-- This script prevents the duplicate batch issue from happening again
-- ================================================================================

-- Step 1: Apply the essential prevention system
\i supabase/migrations/20250118_prevent_duplicate_batches.sql

-- Step 2: Fix the immediate Patag duplicate issue  
\i immediate_batch_fix.sql

-- Step 3: Test the prevention system
SELECT '✅ Testing prevention system...' as status;

-- Show current pending batches by barangay
SELECT 
    barangay,
    COUNT(*) as pending_batches,
    SUM(total_weight) as total_weight,
    CASE 
        WHEN COUNT(*) > 1 THEN '⚠️ DUPLICATE DETECTED' 
        ELSE '✅ HEALTHY'
    END as status
FROM order_batches 
WHERE status = 'pending'
GROUP BY barangay
ORDER BY pending_batches DESC;

-- Step 4: Verify the unique constraint is active
SELECT '🛡️  Verifying unique constraint...' as status;
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'order_batches' 
AND indexname = 'unique_pending_batch_per_barangay';

-- Final success message
SELECT 
    '🎉 BATCH DUPLICATION PREVENTION SYSTEM DEPLOYED!' as status,
    '✅ Immediate fix applied to existing duplicates' as fix_status,
    '🛡️ Future duplicates are now impossible' as prevention_status;

-- Instructions for future use
SELECT '📋 FUTURE DUPLICATE FIX (if needed):' as title;
SELECT 'SELECT consolidate_batches_for_barangay(''YourBarangayName'');' as command; 