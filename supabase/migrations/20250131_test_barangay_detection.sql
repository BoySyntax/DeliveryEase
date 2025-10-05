-- Test the barangay detection function
-- This will help verify that the extraction is working correctly

-- Test function to check barangay extraction
CREATE OR REPLACE FUNCTION test_barangay_extraction()
RETURNS TABLE(
    test_address text,
    extracted_barangay text,
    is_correct boolean
) AS $$
BEGIN
    -- Test various address formats
    RETURN QUERY
    SELECT 
        'FJQ9+J7X, Cagayan De Oro City, • Misamis Oriental, Philippines, Patag, Misamis Oriental'::text as test_address,
        extract_barangay_from_address('{"address": "FJQ9+J7X, Cagayan De Oro City, • Misamis Oriental, Philippines, Patag, Misamis Oriental"}'::jsonb) as extracted_barangay,
        (extract_barangay_from_address('{"address": "FJQ9+J7X, Cagayan De Oro City, • Misamis Oriental, Philippines, Patag, Misamis Oriental"}'::jsonb) = 'Patag, Misamis Oriental') as is_correct;
    
    RETURN QUERY
    SELECT 
        'Zone 2 lower tabok, Cagayan De Oro City, Misamis Oriental, Philippines, Bulua, Misamis Oriental'::text as test_address,
        extract_barangay_from_address('{"address": "Zone 2 lower tabok, Cagayan De Oro City, Misamis Oriental, Philippines, Bulua, Misamis Oriental"}'::jsonb) as extracted_barangay,
        (extract_barangay_from_address('{"address": "Zone 2 lower tabok, Cagayan De Oro City, Misamis Oriental, Philippines, Bulua, Misamis Oriental"}'::jsonb) = 'Bulua, Misamis Oriental') as is_correct;
    
    RETURN QUERY
    SELECT 
        'Barangay Carmen, Cagayan De Oro City'::text as test_address,
        extract_barangay_from_address('{"address": "Barangay Carmen, Cagayan De Oro City"}'::jsonb) as extracted_barangay,
        (extract_barangay_from_address('{"address": "Barangay Carmen, Cagayan De Oro City"}'::jsonb) = 'Carmen') as is_correct;
    
    RETURN QUERY
    SELECT 
        'Brgy. Kauswagan, CDO'::text as test_address,
        extract_barangay_from_address('{"address": "Brgy. Kauswagan, CDO"}'::jsonb) as extracted_barangay,
        (extract_barangay_from_address('{"address": "Brgy. Kauswagan, CDO"}'::jsonb) = 'Kauswagan') as is_correct;
    
    RETURN QUERY
    SELECT 
        'Test with barangay field'::text as test_address,
        extract_barangay_from_address('{"barangay": "Patag, Misamis Oriental", "address": "Some address"}'::jsonb) as extracted_barangay,
        (extract_barangay_from_address('{"barangay": "Patag, Misamis Oriental", "address": "Some address"}'::jsonb) = 'Patag, Misamis Oriental') as is_correct;
END;
$$ LANGUAGE plpgsql;

-- Run the test
SELECT * FROM test_barangay_extraction();






