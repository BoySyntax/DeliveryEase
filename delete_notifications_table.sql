-- Delete the notifications table and all related functions
-- Run this in your Supabase SQL Editor

-- Drop functions first
DROP FUNCTION IF EXISTS create_notification(text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS mark_notification_read(uuid);
DROP FUNCTION IF EXISTS mark_all_notifications_read();
DROP FUNCTION IF EXISTS get_unread_notification_count();

-- Drop the notifications table
DROP TABLE IF EXISTS notifications CASCADE;

-- Drop any related policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;

-- Clean up any remaining references
DROP INDEX IF EXISTS idx_notifications_user_id;
DROP INDEX IF EXISTS idx_notifications_read;
DROP INDEX IF EXISTS idx_notifications_created_at; 