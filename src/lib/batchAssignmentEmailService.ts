// Batch Assignment Email Service - Handles emails when batches are assigned to drivers
import { supabase } from './supabase';

export interface BatchAssignmentEmailData {
  batchId: string;
  batchNumber: number;
  driverName: string;
  barangay: string;
  estimatedDeliveryDate: string;
  orderCount: number;
  totalWeight: number;
  customerEmail: string;
  customerName: string;
  orderItems?: Array<{
    productName: string;
    quantity: number;
    price: number;
  }>;
  totalAmount?: number;
}

class BatchAssignmentEmailService {
  // Send batch assignment email via quick-processor
  async sendBatchAssignmentEmail(emailData: BatchAssignmentEmailData): Promise<boolean> {
    try {
      console.log('📧 Sending batch assignment email via quick-processor for batch:', emailData.batchNumber);

      const { data, error } = await supabase.functions.invoke('quick-processor', {
        body: {
          batchId: emailData.batchId,
          batchNumber: emailData.batchNumber,
          driverName: emailData.driverName,
          barangay: emailData.barangay,
          status: 'batch_assigned',
          estimatedDeliveryDate: emailData.estimatedDeliveryDate,
          orderCount: emailData.orderCount,
          totalWeight: emailData.totalWeight,
          customerEmail: emailData.customerEmail,
          customerName: emailData.customerName,
          orderItems: emailData.orderItems,
          totalAmount: emailData.totalAmount
        }
      });

      if (error) {
        console.error('❌ Batch assignment email error:', error);
        return false;
      }

      if (data && data.success) {
        console.log('✅ Batch assignment email sent successfully!');
        return true;
      } else {
        console.error('❌ Batch assignment email sending failed:', data);
        return false;
      }

    } catch (error) {
      console.error('❌ Error sending batch assignment email:', error);
      return false;
    }
  }

  // Send batch assignment email for a specific batch
  async sendBatchAssignmentEmailForBatch(batchId: string, driverId: string): Promise<boolean> {
    try {
      console.log('🚀 Sending batch assignment email for batch:', batchId);
      
      // Get batch details with orders and customers
      const { data: batchData, error: batchError } = await supabase
        .from('order_batches')
        .select(`
          id,
          created_at,
          barangay,
          total_weight,
          orders:orders(
            id,
            customer_id,
            total,
            items:order_items(
              quantity,
              price,
              product:products(
                name
              )
            )
          )
        `)
        .eq('id', batchId)
        .single();

      if (batchError) {
        console.error('❌ Error fetching batch:', batchError);
        return false;
      }

      // Get driver details
      const { data: driverData, error: driverError } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', driverId)
        .single();

      if (driverError || !driverData?.name) {
        console.error('❌ Error fetching driver or no name:', driverError);
        return false;
      }

      // Get customer details for all orders in the batch
      const customerIds = batchData.orders?.map((order: any) => order.customer_id).filter(Boolean) || [];
      
      if (customerIds.length === 0) {
        console.error('❌ No customers found in batch');
        return false;
      }

      const { data: customerData, error: customerError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', customerIds);

      if (customerError) {
        console.error('❌ Error fetching customers:', customerError);
        return false;
      }

      // Calculate estimated delivery date (1-2 days from now)
      const estimatedDeliveryDate = new Date();
      estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + 1);
      const formattedDate = estimatedDeliveryDate.toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'short', 
        day: 'numeric' 
      });

      // For now, use a simple batch number (could be enhanced later)
      const batchNumber = 1; // This could be calculated based on creation time or other logic

      // Send individual emails to each customer with their specific order items
      let successCount = 0;
      let totalEmails = 0;

      for (const order of batchData.orders || []) {
        const customer = customerData?.find(c => c.id === order.customer_id);
        if (!customer?.email || !customer?.name) {
          console.error('❌ Missing customer email or name for order:', order.id);
          continue;
        }

        // Prepare order items for this specific customer
        const customerOrderItems: Array<{ productName: string; quantity: number; price: number }> = [];
        order.items?.forEach((item: any) => {
          customerOrderItems.push({
            productName: item.product?.name || 'Unknown Product',
            quantity: item.quantity,
            price: item.price
          });
        });

        totalEmails++;

        // Send individual email to this customer
        const emailSent = await this.sendBatchAssignmentEmail({
          batchId: batchData.id,
          batchNumber: batchNumber,
          driverName: driverData.name,
          barangay: batchData.barangay || 'Unknown Area',
          estimatedDeliveryDate: formattedDate,
          orderCount: batchData.orders?.length || 0,
          totalWeight: batchData.total_weight,
          customerEmail: customer.email,
          customerName: customer.name,
          orderItems: customerOrderItems,
          totalAmount: order.total || 0
        });

        if (emailSent) {
          successCount++;
        }

        // Add a small delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`📧 Batch assignment emails sent: ${successCount}/${totalEmails} successful`);
      return successCount > 0; // Return true if at least one email was sent successfully

    } catch (error) {
      console.error('❌ Error in sendBatchAssignmentEmailForBatch:', error);
      return false;
    }
  }
}

export const batchAssignmentEmailService = new BatchAssignmentEmailService(); 