import { supabase } from './supabase'

export const testRejectedOrderEmail = {
  async testRejectedOrderEmail() {
    try {
      console.log('🧪 Testing rejected order email...')
      
      // Test data for rejected order email
      const testData = {
        orderId: 'test-order-' + Date.now(),
        customerName: 'Test Customer',
        customerEmail: 'test@example.com', // Change this to your email for testing
        status: 'rejected',
        orderItems: [
          {
            productName: 'Test Product 1',
            quantity: 2,
            price: 150.00,
            imageUrl: null
          },
          {
            productName: 'Test Product 2', 
            quantity: 1,
            price: 200.00,
            imageUrl: null
          }
        ],
        totalAmount: 500.00
      }
      
      const { data, error } = await supabase.functions.invoke('quick-processor', {
        body: testData
      })

      if (error) {
        console.error('❌ Rejected order email test error:', error)
        return { success: false, error }
      }

      console.log('✅ Rejected order email test success:', data)
      return { success: true, data }
      
    } catch (error) {
      console.error('❌ Rejected order email test exception:', error)
      return { success: false, error }
    }
  }
}
