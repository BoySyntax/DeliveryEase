import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { Truck, Hash, Weight, DollarSign, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';

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
}

export default function VehicleForm({ driverId, onVehicleSaved }: VehicleFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<VehicleFormData>();

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
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <Input
              label="Plate Number"
              icon={<Hash size={18} />}
              placeholder="ABC-1234"
              error={errors.plate_number?.message}
              {...register('plate_number', { 
                required: 'Plate number is required',
                pattern: {
                  value: /^[A-Z0-9-]{3,8}$/,
                  message: 'Invalid plate number format'
                }
              })}
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Vehicle Type *
              </label>
              <select
                {...register('vehicle_type', { required: 'Vehicle type is required' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select vehicle type</option>
                <option value="motorcycle">Motorcycle</option>
                <option value="tricycle">Tricycle</option>
                <option value="pickup">Pickup</option>
                <option value="van">Van</option>
                <option value="truck">Truck</option>
              </select>
              {errors.vehicle_type && (
                <p className="text-sm text-red-600">{errors.vehicle_type.message}</p>
              )}
            </div>

            <Input
              label="Brand"
              placeholder="Toyota, Ford, Honda"
              {...register('brand')}
            />

            <Input
              label="Model"
              placeholder="Hilux, Ranger, Wave"
              {...register('model')}
            />

            <Input
              label="Year"
              placeholder="2020"
              type="number"
              min="1900"
              max="2030"
              {...register('year', {
                min: { value: 1900, message: 'Year must be 1900 or later' },
                max: { value: 2030, message: 'Year must be 2030 or earlier' }
              })}
            />

            <Input
              label="Capacity (kg)"
              icon={<Weight size={18} />}
              placeholder="1000"
              type="number"
              error={errors.capacity_kg?.message}
              {...register('capacity_kg', { 
                min: { value: 1, message: 'Capacity must be at least 1 kg' },
                max: { value: 50000, message: 'Capacity cannot exceed 50,000 kg' }
              })}
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Fuel Type
              </label>
              <select
                {...register('fuel_type')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                Vehicle is active for deliveries
              </label>
            </div>
          </div>

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
        </form>

        {vehicle && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800">
              ✓ Vehicle information is saved and active
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
