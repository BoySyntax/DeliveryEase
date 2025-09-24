import { useState, useEffect } from 'react';
import { Truck, Hash, Weight, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';

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

interface VehicleDisplayProps {
  driverId: string;
}

// Helper function to format vehicle type display
const formatVehicleType = (vehicleType: string): string => {
  switch (vehicleType) {
    case 'motorcycle':
      return 'Motorcycle';
    case 'tricycle':
      return 'Tricycle';
    case 'pickup':
      return 'Pickup Truck';
    case 'van':
      return 'Van';
    case 'truck_4w':
      return '4-Wheeler Truck';
    case 'truck_6w':
      return '6-Wheeler Truck';
    case 'truck_8w':
      return '8-Wheeler Truck';
    case 'truck_10w':
      return '10-Wheeler Truck';
    case 'jeepney':
      return 'Jeepney';
    case 'l300':
      return 'L300 Van';
    default:
      return vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1);
  }
};

export default function VehicleDisplay({ driverId }: VehicleDisplayProps) {
  const [loading, setLoading] = useState(true);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

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
      }
    } catch (error) {
      console.error('Error loading vehicle:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <Loader label="Loading vehicle information..." />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-blue-600" />
          Vehicle Information
          <Lock className="h-4 w-4 text-gray-500" />
        </CardTitle>
        <p className="text-sm text-gray-600 mt-2">
          Vehicle information can only be edited by administrators. Contact your admin to make changes.
        </p>
      </CardHeader>
      <CardContent>
        {vehicle ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-gray-400" />
              <span className="font-medium">#{vehicle.plate_number}</span>
              <span className={`ml-auto px-2 py-1 rounded-full text-xs font-medium ${
                vehicle.is_active 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {vehicle.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Type:</span>
                <span>{formatVehicleType(vehicle.vehicle_type)}</span>
              </div>
              {vehicle.brand && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Brand:</span>
                  <span>{vehicle.brand}</span>
                </div>
              )}
              {vehicle.model && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Model:</span>
                  <span>{vehicle.model}</span>
                </div>
              )}
              {vehicle.year && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Year:</span>
                  <span>{vehicle.year}</span>
                </div>
              )}
              {vehicle.capacity_kg && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Capacity:</span>
                  <span className="flex items-center gap-1">
                    <Weight className="h-3 w-3" />
                    {vehicle.capacity_kg} kg
                  </span>
                </div>
              )}
              {vehicle.fuel_type && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Fuel:</span>
                  <span className="capitalize">{vehicle.fuel_type}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <Truck className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No vehicle registered</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
