# Email Notification Setup Guide

This guide will help you set up email notifications for order status updates in your DeliveryEase application.

## Option 1: Using Resend (Recommended - Free)

Resend is a modern email API that offers 3,000 free emails per month.

### Step 1: Sign up for Resend
1. Go to [resend.com](https://resend.com)
2. Sign up for a free account
3. Verify your email address

### Step 2: Get your API Key
1. In your Resend dashboard, go to "API Keys"
2. Create a new API key
3. Copy the API key (starts with `re_`)

### Step 3: Configure Supabase
1. Go to your Supabase project dashboard
2. Navigate to Settings > Edge Functions
3. Add the following environment variable:
   - Name: `RESEND_API_KEY`
   - Value: Your Resend API key (e.g., `re_123456789...`)

### Step 4: Deploy the Edge Function
```bash
# In your project directory
supabase functions deploy send-order-notification
```

## Option 2: Using Gmail SMTP

### Step 1: Enable 2-Factor Authentication
1. Go to your Google Account settings
2. Enable 2-Factor Authentication

### Step 2: Generate App Password
1. Go to Security settings
2. Under "2-Step Verification", click "App passwords"
3. Generate a new app password for "Mail"
4. Copy the 16-character password

### Step 3: Configure Environment Variables
Add these to your Supabase Edge Function environment:
- `SMTP_HOST`: `smtp.gmail.com`
- `SMTP_PORT`: `587`
- `SMTP_USER`: Your Gmail address
- `SMTP_PASS`: Your app password (16-character)
- `FROM_EMAIL`: Your Gmail address

## Option 3: Using SendGrid

### Step 1: Sign up for SendGrid
1. Go to [sendgrid.com](https://sendgrid.com)
2. Sign up for a free account (100 emails/day)

### Step 2: Get API Key
1. Go to Settings > API Keys
2. Create a new API key with "Mail Send" permissions
3. Copy the API key

### Step 3: Configure Supabase
Add this environment variable:
- Name: `SENDGRID_API_KEY`
- Value: Your SendGrid API key

## Testing Email Notifications

### Method 1: Test via Admin Panel
1. Place a test order in your application
2. Go to Admin > Verify Orders
3. Approve or reject the order
4. Check your email for the notification

### Method 2: Test the Edge Function Directly
```bash
# Test the function locally
supabase functions serve send-order-notification

# Then make a POST request to:
curl -X POST http://localhost:54321/functions/v1/send-order-notification \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "orderId": "test-order-id",
    "customerName": "Test Customer",
    "status": "approved",
    "orderTotal": 1500,
    "items": [
      {
        "name": "Test Product",
        "quantity": 2,
        "price": 750
      }
    ],
    "deliveryAddress": "123 Test St, Test City"
  }'
```

## Troubleshooting

### Email Not Sending
1. Check Supabase Edge Function logs in the dashboard
2. Verify your API keys are correct
3. Check if your email service has sending limits
4. Ensure your "from" email is verified (for some services)

### Function Not Deployed
1. Make sure you're logged into Supabase CLI
2. Check that the function exists in `supabase/functions/send-order-notification/`
3. Try redeploying: `supabase functions deploy send-order-notification`

### Database Trigger Issues
1. Check if the migration ran successfully
2. Verify the trigger exists: `SELECT * FROM information_schema.triggers WHERE trigger_name = 'order_status_email_trigger';`

## Email Templates

The email notifications include:
- Beautiful HTML template with your branding
- Order details (items, quantities, prices)
- Delivery address
- Status-specific messaging
- Link to view order details

## Customization

You can customize the email template by editing the `createEmailTemplate` function in `supabase/functions/send-order-notification/index.ts`.

## Security Notes

- Never commit API keys to your repository
- Use environment variables for all sensitive data
- Consider using a dedicated email domain for production
- Monitor your email sending limits and costs 