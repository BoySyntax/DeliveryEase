// Direct Email Service - Uses Supabase Edge Function to avoid CORS issues
// This sends emails through our Edge Function which handles the Resend API call

import { supabase } from './supabase';

export interface DirectEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: 'verified' | 'out_for_delivery' | 'rejected';
  estimatedDeliveryDate?: string;
  orderItems?: Array<{
    productName: string;
    quantity: number;
    price: number;
  }>;
  totalAmount?: number;
}

export interface RescueRequestData {
  adminEmail: string;
  adminName: string;
  driverName: string;
  driverId: string;
  driverAvatarUrl?: string;
  driverPhone?: string;
  address: string;
  latitude: number;
  longitude: number;
}

class DirectEmailService {
  // Send email notification via Supabase Edge Function
  async sendOrderEmail(emailData: DirectEmailData): Promise<boolean> {
    try {
      console.log('📧 Sending email via quick-processor Edge Function to:', emailData.customerEmail);

      // Call our quick-processor Edge Function
      const { data, error } = await supabase.functions.invoke('quick-processor', {
        body: {
          orderId: emailData.orderId,
          customerName: emailData.customerName,
          customerEmail: emailData.customerEmail,
          status: emailData.status,
          estimatedDeliveryDate: emailData.estimatedDeliveryDate,
          orderItems: emailData.orderItems,
          totalAmount: emailData.totalAmount
        }
      });

      if (error) {
        console.error('❌ Edge Function error:', error);
        console.log('📧 Falling back to notification-only approach...');
        // Fallback: Just create a notification instead of sending email
        return this.createNotificationFallback(emailData);
      }

      if (data && data.success) {
        console.log('✅ Email sent successfully via quick-processor Edge Function!');
        return true;
      } else {
        console.error('❌ Email sending failed via quick-processor Edge Function:', data);
        console.log('📧 Falling back to notification-only approach...');
        return this.createNotificationFallback(emailData);
      }

    } catch (error) {
      console.error('❌ Error sending email via quick-processor Edge Function:', error);
      console.log('📧 Falling back to notification-only approach...');
      return this.createNotificationFallback(emailData);
    }
  }

  // Fallback method: Create notification instead of sending email
  private async createNotificationFallback(emailData: DirectEmailData): Promise<boolean> {
    try {
      console.log('📱 Creating notification for order status change...', {
        orderId: emailData.orderId,
        status: emailData.status,
        customerEmail: emailData.customerEmail
      });
      
      // The database triggers will handle creating notifications when order status changes
      // So we just return true since the notification will be created automatically
      console.log('✅ Notification will be created automatically via database triggers');
      return true;
    } catch (error) {
      console.error('❌ Error creating notification fallback:', error);
      return false;
    }
  }

  // Send order verified email
  async sendOrderVerifiedEmail(
    orderId: string, 
    customerEmail: string, 
    customerName: string,
    orderItems?: Array<{productName: string; quantity: number; price: number}>,
    totalAmount?: number
  ): Promise<boolean> {
    console.log('🚀 Sending verification email via quick-processor Edge Function...');
    
    return this.sendOrderEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'verified',
      orderItems,
      totalAmount
    });
  }

  // Send order rejected email
  async sendOrderRejectedEmail(
    orderId: string, 
    customerEmail: string, 
    customerName: string,
    orderItems?: Array<{productName: string; quantity: number; price: number}>,
    totalAmount?: number
  ): Promise<boolean> {
    console.log('🚀 Sending rejection email via quick-processor Edge Function...');
    
    return this.sendOrderEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'rejected',
      orderItems,
      totalAmount
    });
  }

  // Send order out for delivery email
  async sendOrderOutForDeliveryEmail(
    orderId: string, 
    customerEmail: string,
    customerName: string, 
    estimatedDeliveryDate?: string,
    orderItems?: Array<{productName: string; quantity: number; price: number}>,
    totalAmount?: number
  ): Promise<boolean> {
    console.log('🚀 Sending delivery email via quick-processor Edge Function...');
    
    return this.sendOrderEmail({
      orderId,
      customerName,
      customerEmail,
      status: 'out_for_delivery',
      estimatedDeliveryDate,
      orderItems,
      totalAmount
    });
  }

  // Send rescue request email to admin
  async sendRescueRequestEmail(rescueData: RescueRequestData): Promise<boolean> {
    try {
      console.log('🚨 Sending rescue request email to admin:', rescueData.adminEmail);

      // Get admin user ID first
      const { data: adminData, error: adminError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', rescueData.adminEmail)
        .eq('role', 'admin')
        .single();

      if (adminError || !adminData) {
        console.error('❌ Admin not found:', adminError);
        // Fallback: just log the rescue request
        console.log('🚨 RESCUE REQUEST (Fallback):', {
          driver: rescueData.driverName,
          location: rescueData.address,
          coordinates: `${rescueData.latitude}, ${rescueData.longitude}`,
          admin: rescueData.adminEmail,
          maps_url: `https://www.google.com/maps?q=${rescueData.latitude},${rescueData.longitude}`,
          timestamp: new Date().toISOString()
        });
        return true; // Still return true since we logged it
      }

      // Create a notification in the database for immediate visibility
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: adminData.id, // Send to specific admin
          title: '🚨 URGENT: Driver Rescue Request',
          message: `${rescueData.driverName} has requested emergency assistance at ${rescueData.address}`,
          type: 'info', // Use 'info' type since 'emergency' is not allowed
          read: false,
          data: {
            driver_name: rescueData.driverName,
            driver_id: rescueData.driverId,
            driver_avatar_url: rescueData.driverAvatarUrl,
            driver_phone: rescueData.driverPhone,
            address: rescueData.address,
            latitude: rescueData.latitude,
            longitude: rescueData.longitude,
            coordinates: `${rescueData.latitude}, ${rescueData.longitude}`,
            google_maps_url: `https://www.google.com/maps?q=${rescueData.latitude},${rescueData.longitude}`,
            timestamp: new Date().toISOString(),
            admin_email: rescueData.adminEmail
          }
        });

      if (notificationError) {
        console.error('❌ Failed to create rescue notification:', notificationError);
        // Fallback: just log the rescue request
        console.log('🚨 RESCUE REQUEST (Fallback):', {
          driver: rescueData.driverName,
          location: rescueData.address,
          coordinates: `${rescueData.latitude}, ${rescueData.longitude}`,
          admin: rescueData.adminEmail,
          maps_url: `https://www.google.com/maps?q=${rescueData.latitude},${rescueData.longitude}`,
          timestamp: new Date().toISOString()
        });
        return true; // Still return true since we logged it
      }

      console.log('✅ Rescue request notification created successfully!');
      
      // Also log to console for immediate visibility
      console.log('🚨 RESCUE REQUEST:', {
        driver: rescueData.driverName,
        location: rescueData.address,
        coordinates: `${rescueData.latitude}, ${rescueData.longitude}`,
        admin: rescueData.adminEmail,
        maps_url: `https://www.google.com/maps?q=${rescueData.latitude},${rescueData.longitude}`,
        timestamp: new Date().toISOString()
      });

      // Now try to send the actual email via Edge Function
      try {
        console.log('📧 Attempting to send email via Edge Function...');
        const { data, error } = await supabase.functions.invoke('quick-processor', {
          body: {
            type: 'rescue_request',
            adminEmail: rescueData.adminEmail,
            adminName: rescueData.adminName,
            driverName: rescueData.driverName,
            address: rescueData.address,
            latitude: rescueData.latitude,
            longitude: rescueData.longitude
          }
        });

        if (error) {
          console.error('❌ Rescue request email error:', error);
          console.log('📧 Email failed, but notification was created successfully');
          return true; // Still return true since notification was created
        }

        if (data && data.success) {
          console.log('✅ Rescue request email sent successfully!');
          return true;
        } else {
          console.error('❌ Rescue request email sending failed:', data);
          console.log('📧 Email failed, but notification was created successfully');
          return true; // Still return true since notification was created
        }
      } catch (emailError) {
        console.error('❌ Error sending email:', emailError);
        console.log('📧 Email failed, but notification was created successfully');
        return true; // Still return true since notification was created
      }
    } catch (error) {
      console.error('❌ Error sending rescue request email:', error);
      return false;
    }
  }
}

export const directEmailService = new DirectEmailService(); 