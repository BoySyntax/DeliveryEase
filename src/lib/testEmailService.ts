import { supabase } from './supabase'

export const testEmailService = {
  async testFunction() {
    try {
      console.log('Testing function call...')
      
      const { data, error } = await supabase.functions.invoke('test-function', {
        body: {
          test: 'Hello from frontend',
          timestamp: new Date().toISOString()
        }
      })

      if (error) {
        console.error('❌ Test function error:', error)
        return { success: false, error }
      }

      console.log('✅ Test function success:', data)
      return { success: true, data }
      
    } catch (error) {
      console.error('❌ Test function exception:', error)
      return { success: false, error }
    }
  }
} 