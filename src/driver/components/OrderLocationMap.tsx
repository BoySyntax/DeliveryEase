import { useState, useEffect } from 'react';
import { MapPin, Navigation, Clock, Users, Package, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '../../ui/components/Card';
import { formatCurrency } from '../../lib/utils';
import { GeneticRouteOptimizer, DeliveryLocation, DepotLocation } from '../../lib/genetic-route-optimizer';
import { toast } from 'react-hot-toast';

interface OrderLocation {
  id: string;
  customer_name: string;
  address: string;
  barangay: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  total: number;
  delivery_status: string;
  estimated_time: string;
}

interface LocationGroup {
  barangay: string;
  orders: OrderLocation[];
  totalRevenue: number;
  estimatedTime: string;
  center?: { lat: number; lng: number };
}

interface OrderLocationMapProps {
  orders: OrderLocation[];
  onOrderSelect?: (orderId: string) => void;
  onRouteOptimize?: (orders: OrderLocation[]) => void;
}

// Convert OrderLocation to DeliveryLocation for genetic algorithm
function convertToDeliveryLocation(order: OrderLocation): DeliveryLocation {
  return {
    id: order.id,
    order_id: order.id,
    customer_name: order.customer_name,
    address: order.address,
    barangay: order.barangay,
    latitude: order.latitude,
    longitude: order.longitude,
    phone: order.phone,
    total: order.total,
    delivery_status: order.delivery_status,
    priority: 3 // Default priority
  };
}

export default function OrderLocationMap({ 
  orders, 
  onOrderSelect, 
  onRouteOptimize 
}: OrderLocationMapProps) {
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [locationGroups, setLocationGroups] = useState<LocationGroup[]>([]);
  const [optimizingGroup, setOptimizingGroup] = useState<string | null>(null);

  useEffect(() => {
    groupOrdersByLocation();
  }, [orders]);

  function groupOrdersByLocation() {
    const groups: Record<string, OrderLocation[]> = {};
    
    orders.forEach(order => {
      const barangay = order.barangay || 'Unknown Area';
      if (!groups[barangay]) {
        groups[barangay] = [];
      }
      groups[barangay].push(order);
    });

    const locationGroups: LocationGroup[] = Object.entries(groups).map(([barangay, orders]) => {
      const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
      const totalTime = orders.length * 20; // 20 minutes per delivery
      const estimatedTime = totalTime > 60 
        ? `${Math.floor(totalTime / 60)}h ${totalTime % 60}m` 
        : `${totalTime}m`;

      // Calculate center point if coordinates are available
      const ordersWithCoords = orders.filter(o => o.latitude && o.longitude);
      const center = ordersWithCoords.length > 0 ? {
        lat: ordersWithCoords.reduce((sum, o) => sum + o.latitude!, 0) / ordersWithCoords.length,
        lng: ordersWithCoords.reduce((sum, o) => sum + o.longitude!, 0) / ordersWithCoords.length
      } : undefined;

      return {
        barangay,
        orders,
        totalRevenue,
        estimatedTime,
        center
      };
    });

    // Sort by number of orders (largest clusters first)
    locationGroups.sort((a, b) => b.orders.length - a.orders.length);
    setLocationGroups(locationGroups);
  }

  const handleOptimizeRoute = async (group: LocationGroup) => {
    setOptimizingGroup(group.barangay);
    
    try {
      // Convert orders to delivery locations
      const deliveryLocations = group.orders.map(convertToDeliveryLocation);
      
      // Initialize genetic algorithm optimizer with depot
      const depot: DepotLocation = {
        latitude: 8.4542,
        longitude: 124.6319,
        name: "DeliveryEase Depot",
        address: "Cagayan de Oro City, Philippines"
      };
      
      const optimizer = new GeneticRouteOptimizer({
        population_size: 50, // Smaller for UI responsiveness
        max_generations: 200,
        mutation_rate: 0.03
      }, depot);
      
      toast.loading(`🧬 Optimizing route for ${group.barangay}...`, { id: 'optimization' });
      
      // Run genetic algorithm
      const optimizedRoute = await optimizer.optimizeRoute(deliveryLocations);
      
      toast.success(
        `🎯 Route optimized for ${group.barangay}! Score: ${optimizedRoute.optimization_score.toFixed(1)}% | Distance: ${optimizedRoute.total_distance_km.toFixed(1)}km | Fuel: ₱${optimizedRoute.fuel_cost_estimate.toFixed(0)}`,
        { 
          id: 'optimization',
          duration: 8000 
        }
      );
      
      // Update the group with optimized order
      setLocationGroups(prev => prev.map(g => 
        g.barangay === group.barangay 
          ? { 
              ...g, 
              orders: optimizedRoute.locations.map(loc => 
                group.orders.find(order => order.id === loc.id)!
              ) 
            }
          : g
      ));
      
      if (onRouteOptimize) {
        onRouteOptimize(optimizedRoute.locations.map(loc => 
          group.orders.find(order => order.id === loc.id)!
        ));
      }
      
    } catch (error) {
      console.error('Route optimization failed:', error);
      toast.error('Route optimization failed', { id: 'optimization' });
    } finally {
      setOptimizingGroup(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'delivering': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'delivered': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Delivery Locations ({orders.length} orders)
        </h3>
        
        <div className="bg-gray-100 rounded-lg p-1 flex">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              viewMode === 'list' 
                ? 'bg-white text-blue-600 shadow' 
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            📋 List View
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              viewMode === 'map' 
                ? 'bg-white text-blue-600 shadow' 
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            🗺️ Map View
          </button>
        </div>
      </div>

      {/* Location Groups */}
      <div className="space-y-4">
        {locationGroups.map((group, index) => (
          <Card key={group.barangay} className="border-2 border-gray-200 hover:border-blue-300 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-blue-500" />
                    {group.barangay}
                  </h4>
                  <p className="text-sm text-gray-600">
                    {group.orders.length} delivery stop{group.orders.length !== 1 ? 's' : ''}
                  </p>
                </div>
                
                <div className="text-right">
                  <p className="font-semibold text-green-600">{formatCurrency(group.totalRevenue)}</p>
                  <p className="text-sm text-gray-500">{group.estimatedTime}</p>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">{group.orders.length} orders</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">{group.estimatedTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Navigation className="h-4 w-4 text-gray-500" />
                  {group.center ? (
                    <span className="text-sm">📍 Located</span>
                  ) : (
                    <span className="text-sm text-gray-400">No GPS</span>
                  )}
                </div>
              </div>

              {/* Orders in this location */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {group.orders.map((order, orderIndex) => (
                  <div 
                    key={order.id}
                    onClick={() => onOrderSelect?.(order.id)}
                    className="flex items-center justify-between bg-gray-50 rounded-lg p-3 hover:bg-gray-100 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                        {orderIndex + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{order.customer_name}</p>
                        <p className="text-xs text-gray-500 truncate max-w-48">{order.address}</p>
                        {order.latitude && order.longitude && (
                          <p className="text-xs text-green-600">
                            📍 {order.latitude.toFixed(4)}, {order.longitude.toFixed(4)}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(order.total)}</p>
                      <div className={`px-2 py-1 rounded text-xs ${getStatusColor(order.delivery_status)}`}>
                        {order.delivery_status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handleOptimizeRoute(group)}
                  disabled={optimizingGroup === group.barangay}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  {optimizingGroup === group.barangay ? (
                    <>
                      <RotateCcw className="h-4 w-4 animate-spin" />
                      Optimizing...
                    </>
                  ) : (
                    <>
                      <Navigation className="h-4 w-4" />
                      🧬 Genetic Algorithm
                    </>
                  )}
                </button>
                {group.center && (
                  <button
                    onClick={() => {
                      const url = `https://maps.google.com/maps?q=${group.center!.lat},${group.center!.lng}`;
                      window.open(url, '_blank');
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <MapPin className="h-4 w-4" />
                    View on Map
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {locationGroups.length === 0 && (
        <Card className="border-2 border-gray-200">
          <CardContent className="p-8 text-center">
            <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Order Locations</h3>
            <p className="text-gray-600">Orders will appear here when assigned to your batch.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 