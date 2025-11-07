import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { getInitials } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { Truck, MapPin, Weight, Clock, Package } from 'lucide-react';

type Driver = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  active_orders: number;
  total_orders: number;
  assigned_batches: AssignedBatch[];
};

type AssignedBatch = {
  id: string;
  barangay: string | null;
  total_weight: number;
  status: string;
  created_at: string;
  orders_count: number;
};

export default function DriversPage() {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDrivers();
  }, []);

  async function loadDrivers() {
    try {
      // Get all drivers
      const { data: driversData, error: driversError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .eq('role', 'driver');

      if (driversError) throw driversError;

      // Get orders count and assigned batches for each driver
      const driversWithStats = await Promise.all(
        (driversData || []).map(async (driver) => {
          // Get active batches assigned to this driver with full details
          const { data: activeBatches, error: batchesError } = await supabase
            .from('order_batches')
            .select(`
              id,
              barangay,
              total_weight,
              status,
              created_at
            `)
            .eq('driver_id', driver.id)
            .in('status', ['assigned', 'delivering'])
            .order('created_at', { ascending: false });

          if (batchesError) {
            console.error('Error fetching batches:', batchesError);
          }

          // Get orders count for each batch
          const assignedBatches = await Promise.all(
            (activeBatches || []).map(async (batch) => {
              const { count: ordersCount } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('batch_id', batch.id);

              return {
                ...batch,
                orders_count: ordersCount || 0,
              };
            })
          );

          // Get total orders in active batches
          let activeOrders = 0;
          if (assignedBatches && assignedBatches.length > 0) {
            activeOrders = assignedBatches.reduce((sum, batch) => sum + batch.orders_count, 0);
          }

          // Get total completed batches (delivered batches) for this driver
          const { count: totalOrders } = await supabase
            .from('order_batches')
            .select('*', { count: 'exact', head: true })
            .eq('driver_id', driver.id)
            .eq('status', 'delivered');

          return {
            ...driver,
            active_orders: activeOrders,
            total_orders: totalOrders || 0,
            assigned_batches: assignedBatches,
          };
        })
      );

      setDrivers(driversWithStats);
    } catch (error) {
      console.error('Error loading drivers:', error);
      toast.error('Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <Loader label="Loading drivers..." />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Drivers</h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {drivers.map((driver) => (
          <div 
            key={driver.id}
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200"
            onClick={() => navigate(`/admin/drivers/${driver.id}`)}
          >
            <Card>
              <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                {driver.avatar_url ? (
                  <img
                    src={driver.avatar_url}
                    alt={driver.name || 'Driver'}
                    className="h-12 w-12 rounded-full"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-medium">
                    {getInitials(driver.name || 'Unknown Driver')}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    {driver.name || 'Unknown Driver'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    ID: {driver.id.slice(0, 8)}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <p className="text-sm text-gray-500">Active Orders</p>
                  <p className="mt-1 text-2xl font-semibold text-primary-600">
                    {driver.active_orders}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Delivered</p>
                  <p className="mt-1 text-2xl font-semibold text-primary-600">
                    {driver.total_orders}
                  </p>
                </div>
              </div>

              {/* Assigned Batches Section */}
              {driver.assigned_batches.length > 0 && (
                <div className="mt-6 border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Truck className="w-4 h-4 text-blue-500" />
                    <h4 className="text-sm font-medium text-gray-900">Assigned Batches</h4>
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                      {driver.assigned_batches.length}
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    {driver.assigned_batches.map((batch) => (
                      <div key={batch.id} className="bg-gray-50 rounded-lg p-3 border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-gray-500" />
                            <span className="text-sm font-medium text-gray-900">
                              {batch.barangay || 'Unknown Location'}
                            </span>
                          </div>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            batch.status === 'assigned' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {batch.status === 'assigned' ? 'Assigned' : 'Delivering'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                          <div className="flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            <span>{batch.orders_count} orders</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Weight className="w-3 h-3" />
                            <span>{batch.total_weight}kg</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-2">
                          <Clock className="w-3 h-3" />
                          <span>
                            Created: {new Date(batch.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Assigned Batches */}
              {driver.assigned_batches.length === 0 && (
                <div className="mt-6 border-t pt-4">
                  <div className="text-center py-4">
                    <Truck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No assigned batches</p>
                    <p className="text-xs text-gray-400">Driver is available for new assignments</p>
                  </div>
                </div>
              )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {drivers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No drivers found</p>
        </div>
      )}
    </div>
  );
}