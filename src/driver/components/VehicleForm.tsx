import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { Truck, Hash, Weight, DollarSign, CheckCircle, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { useProfile } from '../../lib/auth';

type VehicleFormData = {
  plate_number: string;
  vehicle_type: string;
  brand: string;
  model: string;
  year: string;
  capacity_kg: string;
  fuel_type: string;
  is_active: boolean;
};

interface Vehicle {
  id: string;
  driver_id: string;
  plate_number: string;
  vehicle_type: string;
  brand: string;
  model: string;
  year: number;
  capacity_kg: number;
  fuel_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface VehicleFormProps {
  driverId: string;
  onVehicleSaved?: () => void;
  readOnly?: boolean; // New prop to control if form is editable
}

// Helper function to suggest capacity based on vehicle type
const getCapacityPlaceholder = (vehicleType: string): string => {
  switch (vehicleType) {
    case 'motorcycle':
      return '50-100 kg';
    case 'tricycle':
      return '200-500 kg';
    case 'pickup':
      return '500-1000 kg';
    case 'van':
    case 'l300':
      return '800-1500 kg';
    case 'truck_4w':
      return '2000-5000 kg';
    case 'truck_6w':
      return '5000-10000 kg';
    case 'truck_8w':
      return '10000-20000 kg';
    case 'truck_10w':
      return '20000-30000 kg';
    case 'jeepney':
      return '300-800 kg';
    default:
      return 'Enter capacity in kg';
  }
};

// Helper function to get model suggestions based on vehicle type
const getModelSuggestions = (vehicleType: string): string[] => {
  switch (vehicleType) {
    case 'motorcycle':
      return ['Wave 125', 'TMX 155', 'XRM 125', 'RS 125', 'Raider 150'];
    case 'tricycle':
      return ['Standard Tricycle', 'Passenger Tricycle', 'Cargo Tricycle'];
    case 'pickup':
      return ['Hilux', 'Ranger', 'D-Max', 'Navara', 'Strada'];
    case 'van':
      return ['Hiace', 'Urvan', 'H-100', 'APV', 'Grandia'];
    case 'l300':
      return ['L300 FB', 'L300 Delica', 'L300 Exceed'];
    case 'truck_4w':
      return ['Canter', 'ELF', 'Forward', 'Condor', 'Truck'];
    case 'truck_6w':
      return ['Canter 6W', 'ELF 6W', 'Forward 6W', 'Fighter 6W', 'Condor 6W'];
    case 'truck_8w':
      return ['Fighter 8W', 'Super Great', 'Quon', 'Giga 8W', 'Prime Mover'];
    case 'truck_10w':
      return ['Super Great 10W', 'Quon 10W', 'Giga 10W', 'Prime Mover 10W'];
    case 'jeepney':
      return ['Traditional Jeepney', 'Modern Jeepney', 'E-Jeepney'];
    default:
      return [];
  }
};

// Helper function to get model placeholder based on vehicle type
const getModelPlaceholder = (vehicleType: string): string => {
  const suggestions = getModelSuggestions(vehicleType);
  if (suggestions.length > 0) {
    return suggestions.slice(0, 3).join(', ') + (suggestions.length > 3 ? '...' : '');
  }
  return 'Enter vehicle model';
};

// Helper function to get brand suggestions based on vehicle type
const getBrandSuggestions = (vehicleType: string): string[] => {
  switch (vehicleType) {
    case 'motorcycle':
      return ['Honda', 'Yamaha', 'Suzuki', 'Kawasaki'];
    case 'tricycle':
      return ['Honda', 'Yamaha', 'TVS', 'Bajaj'];
    case 'pickup':
      return ['Toyota', 'Ford', 'Isuzu', 'Nissan', 'Mitsubishi'];
    case 'van':
      return ['Toyota', 'Nissan', 'Hyundai', 'Suzuki'];
    case 'l300':
      return ['Mitsubishi'];
    case 'truck_4w':
      return ['Mitsubishi', 'Isuzu', 'Ford', 'Hino'];
    case 'truck_6w':
      return ['Mitsubishi', 'Isuzu', 'Ford', 'Hino'];
    case 'truck_8w':
      return ['Mitsubishi', 'Hino', 'UD Trucks', 'Isuzu'];
    case 'truck_10w':
      return ['Mitsubishi', 'Hino', 'UD Trucks', 'Isuzu'];
    case 'jeepney':
      return ['Isuzu', 'Toyota', 'Suzuki'];
    default:
      return ['Toyota', 'Ford', 'Honda', 'Mitsubishi', 'Isuzu'];
  }
};

// Helper function to get brand placeholder based on vehicle type
const getBrandPlaceholder = (vehicleType: string): string => {
  const suggestions = getBrandSuggestions(vehicleType);
  return suggestions.slice(0, 3).join(', ') + (suggestions.length > 3 ? '...' : '');
};

export default function VehicleForm({ driverId, onVehicleSaved, readOnly }: VehicleFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const { profile } = useProfile();
  
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<VehicleFormData>();
  const isActive = watch('is_active');

  // Determine if form should be read-only
  // Drivers cannot edit vehicle info, only admins can
  const isReadOnly = readOnly || (profile?.role === 'driver');

  useEffect(() => {
    loadVehicle();
  }, [driverId]);

  async function loadVehicle() {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('driver_id', driverId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      if (data) {
        setVehicle(data);
        setValue('plate_number', data.plate_number);
        setValue('vehicle_type', data.vehicle_type);
        setValue('brand', data.brand || '');
        setValue('model', data.model || '');
        setValue('year', data.year?.toString() || '');
        setValue('capacity_kg', data.capacity_kg?.toString() || '');
        setValue('fuel_type', data.fuel_type || '');
        setValue('is_active', data.is_active);
      }
    } catch (error) {
      console.error('Error loading vehicle:', error);
      toast.error('Failed to load vehicle information');
    } finally {
      setLoading(false);
    }
  }

  const onSubmit = async (data: VehicleFormData) => {
    try {
      setSaving(true);
      
      const vehicleData = {
        driver_id: driverId,
        plate_number: data.plate_number.toUpperCase().trim(),
        vehicle_type: data.vehicle_type,
        brand: data.brand.trim() || null,
        model: data.model.trim() || null,
        year: data.year ? parseInt(data.year) : null,
        capacity_kg: data.capacity_kg ? parseInt(data.capacity_kg) : null,
        fuel_type: data.fuel_type || null,
        is_active: data.is_active,
        updated_at: new Date().toISOString(),
      };

      if (vehicle) {
        // Update existing vehicle
        const { error } = await supabase
          .from('vehicles')
          .update(vehicleData)
          .eq('id', vehicle.id);

        if (error) throw error;
        toast.success('Vehicle information updated successfully');
      } else {
        // Create new vehicle
        const { error } = await supabase
          .from('vehicles')
          .insert(vehicleData);

        if (error) throw error;
        toast.success('Vehicle information saved successfully');
      }

      // Reload vehicle data
      await loadVehicle();
      onVehicleSaved?.();
    } catch (error) {
      console.error('Error saving vehicle:', error);
      toast.error('Failed to save vehicle information');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loader label="Loading vehicle information..." />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-blue-600" />
          Vehicle Information
          {isReadOnly && (
            <Lock className="h-4 w-4 text-gray-500" />
          )}
          <span
            className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-full ${isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}
          >
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </CardTitle>
        {isReadOnly && profile?.role === 'driver' && (
          <p className="text-sm text-gray-600 mt-2">
            Vehicle information can only be edited by administrators. Contact your admin to make changes.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <Input
              label="Plate Number"
              icon={<Hash size={18} />}
              placeholder="ABC-1234"
              error={errors.plate_number?.message}
              disabled={isReadOnly}
              {...register('plate_number', { 
                required: !isReadOnly ? 'Plate number is required' : false,
                pattern: !isReadOnly ? {
                  value: /^[A-Z0-9-]{3,8}$/,
                  message: 'Invalid plate number format'
                } : undefined
              })}
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Vehicle Type *
              </label>
              <select
                {...register('vehicle_type', { required: !isReadOnly ? 'Vehicle type is required' : false })}
                disabled={isReadOnly}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isReadOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
              >
                <option value="">Select vehicle type</option>
                <option value="motorcycle">Motorcycle</option>
                <option value="tricycle">Tricycle</option>
                <option value="pickup">Pickup Truck</option>
                <option value="van">Van</option>
                <option value="truck_4w">4-Wheeler Truck</option>
                <option value="truck_6w">6-Wheeler Truck</option>
                <option value="truck_8w">8-Wheeler Truck</option>
                <option value="truck_10w">10-Wheeler Truck</option>
                <option value="jeepney">Jeepney</option>
                <option value="l300">L300 Van</option>
              </select>
              {errors.vehicle_type && (
                <p className="text-sm text-red-600">{errors.vehicle_type.message}</p>
              )}
            </div>

            <Input
              label="Brand"
              placeholder={getBrandPlaceholder(watch('vehicle_type'))}
              disabled={isReadOnly}
              {...register('brand')}
            />

            <Input
              label="Model"
              placeholder={getModelPlaceholder(watch('vehicle_type'))}
              disabled={isReadOnly}
              {...register('model')}
            />

            <Input
              label="Year"
              placeholder="2020"
              type="number"
              min="1900"
              max="2030"
              disabled={isReadOnly}
              {...register('year', !isReadOnly ? {
                min: { value: 1900, message: 'Year must be 1900 or later' },
                max: { value: 2030, message: 'Year must be 2030 or earlier' }
              } : {})}
            />

            <Input
              label="Capacity (kg)"
              icon={<Weight size={18} />}
              placeholder={getCapacityPlaceholder(watch('vehicle_type'))}
              type="number"
              error={errors.capacity_kg?.message}
              disabled={isReadOnly}
              {...register('capacity_kg', !isReadOnly ? { 
                min: { value: 1, message: 'Capacity must be at least 1 kg' },
                max: { value: 50000, message: 'Capacity cannot exceed 50,000 kg' }
              } : {})}
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Fuel Type
              </label>
              <select
                {...register('fuel_type')}
                disabled={isReadOnly}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isReadOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
              >
                <option value="">Select fuel type</option>
                <option value="gasoline">Gasoline</option>
                <option value="diesel">Diesel</option>
                <option value="electric">Electric</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_active"
                {...register('is_active')}
                disabled={isReadOnly}
                className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ${isReadOnly ? 'cursor-not-allowed' : ''}`}
              />
              <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                Vehicle is active for deliveries
              </label>
            </div>
          </div>

          {!isReadOnly && (
            <div className="flex justify-end space-x-2 pt-4">
              <Button 
                type="submit" 
                disabled={saving}
                className="flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader size="sm" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    {vehicle ? 'Update Vehicle' : 'Save Vehicle'}
                  </>
                )}
              </Button>
            </div>
          )}
        </form>

        {vehicle && (
          <div
            className={`mt-4 p-3 rounded-md border ${
              isActive ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
            }`}
          >
            <p className={`text-sm ${isActive ? 'text-green-800' : 'text-yellow-800'}`}>
              {isActive
                ? '✓ Vehicle is active for deliveries'
                : '⏸ Vehicle is inactive. Toggle "Vehicle is active for deliveries" to accept assignments.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
