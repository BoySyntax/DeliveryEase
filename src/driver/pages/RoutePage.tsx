import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { formatCurrency } from '../../lib/utils';
import { 
  Route, 
  MapPin, 
  Clock, 
  Truck, 
  Target,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useProfile } from '../../lib/auth';
import { toast } from 'react-hot-toast';
import Button from '../../ui/components/Button';
import { OptimizedRoute } from '../../lib/genetic-route-optimizer';
import RealTimeDeliveryMap from '../components/RealTimeDeliveryMap';

interface BatchInfo {
  id: string;
  created_at: string;
  status: string;
  total_weight: number;
  order_count: number;
}

export default function RoutePage() {
  const { profile } = useProfile();
  const [activeBatches, setActiveBatches] = useState<BatchInfo[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      loadActiveBatches();
    }
  }, [profile?.id]);

  async function loadActiveBatches() {
    try {
      if (!profile?.id) return;

      // Get batches assigned to this driver
      const { data: batches, error: batchError } = await supabase
        .from('order_batches')
        .select(`
          id,
          created_at,
          status,
          total_weight
        `)
        .eq('driver_id', profile.id)
        .in('status', ['assigned', 'delivering'])
        .order('created_at', { ascending: false });

      if (batchError) throw batchError;

      if (!batches || batches.length === 0) {
        setActiveBatches([]);
        return;
      }

      // Get order counts for each batch
      const batchesWithCounts = await Promise.all(
        batches.map(async (batch) => {
          const { count } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('batch_id', batch.id)
            .eq('approval_status', 'approved');

          return {
            ...batch,
            order_count: count || 0
          };
        })
      );

      setActiveBatches(batchesWithCounts);
      
      // Auto-select the first batch if none selected
      if (!selectedBatch && batchesWithCounts.length > 0) {
        setSelectedBatch(batchesWithCounts[0].id);
      }
    } catch (error) {
      toast.error('Failed to load active batches');
    } finally {
      setLoading(false);
    }
  }

  const handleRouteOptimized = (optimizedRoute: OptimizedRoute) => {
    toast.success(
      `🎯 Route optimized! Distance reduced by ${(100 - optimizedRoute.optimization_score).toFixed(1)}%`,
      { duration: 6000 }
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'assigned':
        return <Target className="h-5 w-5 text-blue-500" />;
      case 'delivering':
        return <Truck className="h-5 w-5 text-orange-500" />;
      default:
        return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'delivering':
        return 'bg-orange-50 border-orange-200 text-orange-800';
      default:
        return 'bg-green-50 border-green-200 text-green-800';
    }
  };

  if (loading) {
    return <Loader label="Loading delivery routes..." />;
  }

  if (activeBatches.length === 0) {
    return (
      <div className="text-center py-12">
        <Truck className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Batches</h3>
        <p className="text-gray-600 mb-6">You don't have any delivery batches assigned at the moment.</p>
        <Button onClick={loadActiveBatches} variant="outline">
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🗺️ Delivery Routes</h1>
        <p className="text-gray-600 mt-1">Routes are optimized to start from the nearest delivery location to the depot for maximum efficiency</p>
      </div>

      {/* Batch Selection */}
      {activeBatches.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-4">Select Active Batch</h3>
            <div className="grid gap-3">
              {activeBatches.map((batch) => (
                <div
                  key={batch.id}
                  onClick={() => setSelectedBatch(batch.id)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                    selectedBatch === batch.id
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(batch.status)}
                      <div>
                        <h4 className="font-semibold">
                          Batch #{batch.id.slice(0, 8)}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {batch.order_count} orders • {batch.total_weight.toFixed(1)}kg
                        </p>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(batch.status)}`}>
                      {batch.status === 'assigned' ? '📋 Ready' : '🚚 Active'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      {selectedBatch ? (
        <RealTimeDeliveryMap
          batchId={selectedBatch}
          driverId={profile?.id || ''}
          onRouteOptimized={handleRouteOptimized}
        />
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-12">
              <Target className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Select a Batch</h3>
              <p className="text-gray-600">Choose a delivery batch to view the optimized route.</p>
            </div>
          </CardContent>
        </Card>
      )}


    </div>
  );
} 