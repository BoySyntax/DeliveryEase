import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { getInitials } from '../../lib/utils';
import { toast } from 'react-hot-toast';

type Driver = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  active_orders: number;
  total_orders: number;
};

export default function DriversPage() {
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

      // Get orders count for each driver
      const driversWithStats = await Promise.all(
        (driversData || []).map(async (driver) => {
          // Get active orders (assigned or delivering)
          const { count: activeOrders } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('driver_id', driver.id)
            .in('delivery_status', ['assigned', 'delivering']);

          // Get total completed orders
          const { count: totalOrders } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('driver_id', driver.id)
            .eq('delivery_status', 'delivered');

          return {
            ...driver,
            active_orders: activeOrders || 0,
            total_orders: totalOrders || 0,
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
          <Card key={driver.id}>
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                {driver.avatar_url ? (
                  <img
                    src={driver.avatar_url}
                    alt={driver.name}
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
                  <p className="text-sm text-gray-500">Total Deliveries</p>
                  <p className="mt-1 text-2xl font-semibold text-primary-600">
                    {driver.total_orders}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
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