# Email Notification System Setup Guide

This guide will help you set up automatic email notifications for order status updates in your DeliveryEase application.

## Overview

The system automatically sends email notifications when:
- An order's status is updated to "verified" (when approved by admin)
- An order's status is updated to "out_for_delivery" (when delivery starts)

## Features

- **Automatic Triggers**: Database triggers automatically send emails when order statuses change
- **Resend API Integration**: Uses Resend for reliable email delivery
- **Beautiful HTML Templates**: Professional-looking email templates with your branding
- **Fallback System**: Multiple layers of email sending for reliability
- **TypeScript Support**: Fully typed for better development experience

## Setup Instructions

### 1. Set up Resend API

1. Go to [resend.com](https://resend.com) and create a free account
2. Verify your email address
3. Go to "API Keys" in your dashboard
4. Create a new API key (starts with `re_`)
5. Copy the API key for the next step

### 2. Configure Supabase Edge Functions

1. Go to your Supabase project dashboard
2. Navigate to Settings > Edge Functions
3. Add the following environment variable:
   - **Name**: `RESEND_API_KEY`
   - **Value**: Your Resend API key (e.g., `re_123456789...`)

### 3. Deploy the Edge Function

```bash
# In your project directory
supabase functions deploy send-order-notification
```

### 4. Run Database Migration

```bash
# Apply the database trigger
supabase db push
```

### 5. Verify Domain (Optional but Recommended)

For production, you should verify your domain with Resend:
1. In your Resend dashboard, go to "Domains"
2. Add your domain (e.g., `deliveryease.com`)
3. Follow the DNS verification steps
4. Update the `from` email in the edge function to use your verified domain

## How It Works

### Database Trigger
The system uses a PostgreSQL trigger that automatically fires when an order's status changes:

```sql
-- Trigger fires when approval_status changes to 'approved' (verified)
-- or when delivery_status changes to 'delivering' (out_for_delivery)
CREATE TRIGGER order_status_email_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION send_order_status_email_notification();
```

### Email Templates

#### Verified Order Email
- **Subject**: "Your Order is Verified"
- **Body**: "Hi [Name], your order #[orderId] has been verified."

#### Out for Delivery Email
- **Subject**: "Your Order is Out for Delivery"
- **Body**: "Hi [Name], your order #[orderId] is out for delivery and will arrive on [estimated_delivery_date]."

### Frontend Integration

The system includes both automatic and manual email sending:

1. **Automatic**: Database triggers handle most cases
2. **Manual**: Admin panel can manually trigger emails if needed
3. **Fallback**: Local email service as backup

## Testing

### Test the Edge Function

```bash
# Test locally
supabase functions serve send-order-notification

# Then make a POST request:
curl -X POST http://localhost:54321/functions/v1/send-order-notification \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-order-123",
    "customerName": "Test Customer",
    "customerEmail": "your-email@example.com",
    "status": "verified"
  }'
```

### Test with Node.js Script

```bash
# Update the email in test_email_notification.js
node test_email_notification.js
```

### Test in Admin Panel

1. Place a test order in your application
2. Go to Admin > Verify Orders
3. Approve the order
4. Check your email for the notification

## File Structure

```
src/
├── lib/
│   ├── emailService.ts          # Email service with Resend integration
│   └── notificationService.ts   # Updated with email functionality
├── admin/pages/
│   └── VerifyOrdersPage.tsx     # Updated to trigger emails on approval
└── supabase/
    ├── functions/
    │   └── send-order-notification/
    │       └── index.ts         # Edge function for sending emails
    └── migrations/
        └── 20250131_add_order_status_email_trigger.sql  # Database trigger
```

## Configuration Options

### Customize Email Templates

Edit the HTML template in `supabase/functions/send-order-notification/index.ts`:

```typescript
html: `
  <!DOCTYPE html>
  <html>
  <head>
    <title>${subject}</title>
    <style>
      /* Customize your styles here */
    </style>
  </head>
  <body>
    <!-- Customize your template here -->
  </body>
  </html>
`
```

### Change Sender Email

Update the `from` field in the edge function:

```typescript
from: 'noreply@yourdomain.com', // Replace with your verified domain
```

### Modify Trigger Conditions

Edit the trigger function in the migration file to change when emails are sent:

```sql
-- Example: Only send emails for orders above a certain amount
IF NEW.total > 1000 AND NEW.approval_status = 'approved' THEN
    -- Send email
END IF;
```

## Troubleshooting

### Email Not Sending

1. **Check Resend API Key**: Verify it's correctly set in Supabase Edge Functions
2. **Check Function Logs**: View logs in Supabase dashboard under Edge Functions
3. **Verify Domain**: Make sure your sender domain is verified with Resend
4. **Check Email Limits**: Resend free tier has 3,000 emails/month limit

### Function Not Deployed

```bash
# Check if function exists
supabase functions list

# Redeploy if needed
supabase functions deploy send-order-notification
```

### Database Trigger Issues

```sql
-- Check if trigger exists
SELECT * FROM information_schema.triggers 
WHERE trigger_name = 'order_status_email_trigger';

-- Check function exists
SELECT * FROM information_schema.routines 
WHERE routine_name = 'send_order_status_email_notification';
```

### Common Errors

1. **"No email found for customer"**: Customer doesn't have an email in auth.users
2. **"Resend API key not found"**: Environment variable not set correctly
3. **"Failed to send email"**: Check Resend dashboard for delivery status

## Security Considerations

- ✅ API keys are stored as environment variables
- ✅ Edge functions run in isolated environment
- ✅ Database triggers use SECURITY DEFINER
- ✅ Email addresses are validated before sending
- ⚠️ Consider rate limiting for production use
- ⚠️ Monitor email sending costs and limits

## Production Checklist

- [ ] Set up verified domain with Resend
- [ ] Configure proper sender email address
- [ ] Set up email monitoring and alerts
- [ ] Test with real customer emails
- [ ] Monitor email delivery rates
- [ ] Set up email templates for your brand
- [ ] Configure email analytics if needed

## Support

If you encounter issues:

1. Check the Supabase Edge Function logs
2. Verify your Resend API key and domain setup
3. Test with the provided test scripts
4. Check the database trigger is properly installed

## Cost Considerations

- **Resend**: 3,000 free emails/month, then $0.80 per 1,000 emails
- **Supabase Edge Functions**: Included in your Supabase plan
- **Database**: No additional cost for triggers

For most small to medium applications, the free tier should be sufficient. 