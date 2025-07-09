-- Update storage bucket CORS settings
UPDATE storage.buckets
SET cors_origins = ARRAY['*'],
    cors_methods = ARRAY['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    cors_headers = ARRAY['*'],
    cors_exposed_headers = ARRAY['Content-Range', 'Range'],
    cors_max_age = 3600
WHERE id IN ('profile-images', 'payment-proof'); 