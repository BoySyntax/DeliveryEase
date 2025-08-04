// Automatic Email Service - Gets emails from Google Auth automatically
import { supabase } from './supabase';

export interface AutomaticEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: 'verified' | 'out_for_delivery';
  estimatedDeliveryDate?: string;
}

class AutomaticEmailService {
  private readonly RESEND_API_KEY = 're_9mbohhSC_8Qjsdd1R93WNED3NewD11f47';

  // Get customer email automatically from profiles table
  async getCustomerEmail(customerId: string): Promise<string | null> {
    try {
      console.log('🔍 Getting email for customer:', customerId);
      
      // Get email directly from profiles table (where it's stored automatically)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', customerId)
        .single();
      
      if (profileError) {
        console.log('❌ Error getting profile:', profileError);
        return null;
      }
      
      if (profileData && profileData.email) {
        console.log('✅ Found email in profiles:', profileData.email);
        return profileData.email;
      }
      
      if (profileData && !profileData.email) {
        console.log('⚠️ Profile found but no email stored');
        
        // Try to get email from auth.users as fallback
        try {
          const { data: emailData, error: emailError } = await supabase
            .rpc('get_user_email', { user_id: customerId });
          
          if (emailData && !emailError) {
            console.log('✅ Found email from auth.users fallback:', emailData);
            
            // Update the profile with the email for future use
            await supabase
              .from('profiles')
              .update({ email: emailData })
              .eq('id', customerId);
            
            return emailData;
          }
        } catch (rpcError) {
          console.log('⚠️ RPC function not available');
        }
      }
      
      console.log('❌ No email found for customer:', customerId);
      return null;
      
    } catch (error) {
      console.error('Error getting customer email:', error);
      return null;
    }
  }

  // Send email notification via Edge Function
  async sendOrderEmail(emailData: AutomaticEmailData): Promise<boolean> {
    try {
      console.log('📧 Sending email via Edge Function to:', emailData.customerEmail);

      // Call the Edge Function instead of direct API
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          orderId: emailData.orderId,
          customerName: emailData.customerName,
          customerEmail: emailData.customerEmail,
          status: emailData.status,
          estimatedDeliveryDate: emailData.estimatedDeliveryDate
        }
      });

      if (error) {
        console.error('❌ Edge Function error:', error);
        return false;
      }

      if (data && data.success) {
        console.log('✅ Email sent successfully via Edge Function!');
        return true;
      } else {
        console.error('❌ Edge Function returned failure:', data);
        return false;
      }

    } catch (error) {
      console.error('❌ Error calling Edge Function:', error);
      return false;
    }
  }

  // Send order verified email automatically
  async sendOrderVerifiedEmail(orderId: string, customerId: string, customerName: string): Promise<boolean> {
    console.log('🚀 Starting automatic email for order verification...');
    
    const customerEmail = await this.getCustomerEmail(customerId);
    
    if (!customerEmail) {
      console.log('❌ No email found for customer:', customerId);
      return false;
    }

    console.log('📧 Sending verification email to:', customerEmail);
    
    return this.sendOrderEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'verified'
    });
  }

  // Send order out for delivery email automatically
  async sendOrderOutForDeliveryEmail(
    orderId: string, 
    customerId: string,
    customerName: string, 
    estimatedDeliveryDate?: string
  ): Promise<boolean> {
    console.log('🚀 Starting automatic email for delivery notification...');
    
    const customerEmail = await this.getCustomerEmail(customerId);
    
    if (!customerEmail) {
      console.log('❌ No email found for customer:', customerId);
      return false;
    }

    console.log('📧 Sending delivery email to:', customerEmail);
    
    return this.sendOrderEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'out_for_delivery',
      estimatedDeliveryDate
    });
  }
}

export const automaticEmailService = new AutomaticEmailService(); 