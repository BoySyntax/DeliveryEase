# 3. Assign and Schedule Deliveries

## Parameters:
- **Batch Orders**: Orders grouped by barangay (location) and weight
- **Available Drivers**: Drivers who aren't currently delivering
- **Driver Status**: 'available' (not assigned to any active batch)
- **Batch Status**: Changes from 'pending' to 'assigned' when driver assigned
- **8:00 PM Cutoff**: Time-based delivery scheduling parameter

## How It Works:

Once batches are created and reach the required weight (at least 3,500kg), the system automatically assigns them to available drivers and schedules delivery based on the 8:00 PM cutoff time.

### Schedule Rules:
- **Before 8:00 PM**: Batch gets scheduled for next-day delivery
- **After 8:00 PM**: Batch gets scheduled for the following day
- **No Available Drivers**: System schedules batch to next available delivery day

### Driver Assignment:
- System checks available drivers (not assigned to any active batch)
- Assigns first available driver to the batch
- Updates batch status to "assigned" and sets delivery_scheduled_date
- Sends notification to driver about new assignment

## Simple Process:
1. **Batch Ready**: When batch reaches 3,500kg weight
2. **Check Time**: Determine if batch created before or after 8:00 PM
3. **Find Driver**: Look for available driver (not currently delivering)
4. **Assign**: Give batch to first available driver
5. **Schedule**: Set delivery date based on 8:00 PM rule
6. **Notify**: Driver gets notified about new assignment

## Technical Implementation:
- **Location**: `src/lib/batch-auto-assignment.ts` and database functions
- **Functions**: `autoAssignBatch()` and `calculateDeliverySchedule()`
- **Database**: `delivery_scheduled_date` field in `order_batches` table
- **Automatic**: No manual work needed - system handles everything
