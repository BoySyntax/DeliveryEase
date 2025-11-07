import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { AlertTriangle, MapPin, Clock, RefreshCw, CheckCircle, XCircle, Phone } from 'lucide-react';
import Button from '../../ui/components/Button';
import EmergencyModal from '../components/EmergencyModal';

// Helper function to get initials from name
const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

interface EmergencyRequest {
  id: string;
  driver_name: string;
  driver_id?: string;
  driver_avatar_url?: string;
  driver_phone?: string;
  address: string;
  latitude: number;
  longitude: number;
  requested_at: string;
  status: 'pending' | 'acknowledged' | 'resolved';
  message?: string;
}

export default function EmergencyRequestsPage() {
  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<EmergencyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'acknowledged' | 'resolved'>('all');
  const [selectedRequest, setSelectedRequest] = useState<EmergencyRequest | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleRequestClick = (request: EmergencyRequest) => {
    setSelectedRequest(request);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedRequest(null);
  };

  const loadEmergencyRequests = useCallback(async () => {
    setRefreshing(true);
    try {
      // Load all rescue requests (both read and unread) to show the full history
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('type', 'info')
        .ilike('title', '%rescue%')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading emergency requests:', error);
        setRequests([]);
        return;
      }

      // Get unique driver IDs to fetch phone numbers
      const driverIds = [...new Set((data || [])
        .map(notification => (notification.data as any)?.driver_id)
        .filter(Boolean))];

      // Fetch phone numbers for all drivers
      let driverPhones: { [key: string]: string } = {};
      if (driverIds.length > 0) {
        try {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, phone')
            .in('id', driverIds);
          
          if (profiles) {
            driverPhones = profiles.reduce((acc, profile) => {
              if ((profile as any).phone) {
                acc[profile.id] = (profile as any).phone;
              }
              return acc;
            }, {} as { [key: string]: string });
          }
        } catch (phoneError) {
          console.log('Could not fetch phone numbers:', phoneError);
        }
      }

      const emergencyRequests = (data || []).map(notification => {
        const data = notification.data as any;
        // Check if there's a resolved_at timestamp in the data
        const isResolved = data?.resolved_at || notification.resolved_at;
        const isAcknowledged = notification.read;
        
        let status: 'pending' | 'acknowledged' | 'resolved' = 'pending';
        if (isResolved) {
          status = 'resolved';
        } else if (isAcknowledged) {
          status = 'acknowledged';
        }
        
        return {
          id: notification.id,
          driver_name: data?.driver_name || 'Unknown Driver',
          driver_id: data?.driver_id,
          driver_avatar_url: data?.driver_avatar_url,
          driver_phone: data?.driver_phone || (data?.driver_id ? driverPhones[data.driver_id] : undefined),
          address: data?.address || 'Unknown Location',
          latitude: data?.latitude || 0,
          longitude: data?.longitude || 0,
          requested_at: notification.created_at,
          status,
          message: notification.message
        };
      });

      setRequests(emergencyRequests);
    } catch (error) {
      console.error('Error loading emergency requests:', error);
      setRequests([]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  // Filter requests based on status
  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredRequests(requests);
    } else {
      setFilteredRequests(requests.filter(request => request.status === statusFilter));
    }
  }, [requests, statusFilter]);

  useEffect(() => {
    loadEmergencyRequests();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadEmergencyRequests, 30000);
    return () => clearInterval(interval);
  }, [loadEmergencyRequests]);

  const handleAcknowledge = async (requestId: string) => {
    try {
      console.log('Acknowledging request:', requestId);
      
      // Mark notification as read (acknowledged)
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', requestId);

      if (error) {
        console.error('Error acknowledging request:', error);
        return;
      }

      console.log('✅ Request acknowledged successfully');
      
      // Refresh the list to show updated status
      loadEmergencyRequests();
    } catch (error) {
      console.error('Error acknowledging request:', error);
    }
  };

  const handleResolve = async (requestId: string) => {
    try {
      console.log('Resolving request:', requestId);
      
      // Get the current notification data first
      const { data: currentNotification, error: fetchError } = await supabase
        .from('notifications')
        .select('data')
        .eq('id', requestId)
        .single();

      if (fetchError) {
        console.error('Error fetching notification data:', fetchError);
        return;
      }

      // Update the notification with resolved status
      const updatedData = {
        ...currentNotification.data,
        resolved_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('notifications')
        .update({ 
          read: true,
          data: updatedData
        })
        .eq('id', requestId);

      if (error) {
        console.error('Error resolving request:', error);
        return;
      }

      console.log('✅ Request resolved successfully');
      
      // Refresh the list to show updated status
      loadEmergencyRequests();
    } catch (error) {
      console.error('Error resolving request:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'acknowledged':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'resolved':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <AlertTriangle className="h-4 w-4" />;
      case 'acknowledged':
        return <Clock className="h-4 w-4" />;
      case 'resolved':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <XCircle className="h-4 w-4" />;
    }
  };

  if (loading) {
    return <Loader fullScreen />;
  }

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 text-red-500" />
              Emergency Requests History
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              View and manage all driver emergency requests (acknowledged and pending)
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'acknowledged' | 'resolved')}
              className="px-2 sm:px-3 py-2 border border-gray-300 rounded-md text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 flex-1 sm:flex-none"
            >
              <option value="all">All Requests</option>
              <option value="pending">Pending</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
            
            <Button
              onClick={loadEmergencyRequests}
              disabled={refreshing}
              variant="outline"
              icon={<RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />}
              className="text-xs sm:text-sm px-2 sm:px-3"
            >
              <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              <span className="sm:hidden">{refreshing ? '...' : '↻'}</span>
            </Button>
          </div>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <AlertTriangle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {requests.length === 0 ? 'No Emergency Requests' : 'No Requests Found'}
            </h3>
            <p className="text-gray-500">
              {requests.length === 0 
                ? 'No emergency requests have been made yet.' 
                : `No ${statusFilter === 'all' ? '' : statusFilter} requests found.`
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:gap-6">
          {filteredRequests.map((request) => (
            <Card key={request.id} className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleRequestClick(request)}>
              <CardContent className="p-0">
                <div className={`p-4 sm:p-6 border-l-4 ${getStatusColor(request.status).split(' ')[2]}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 gap-3">
                    <div className="flex items-center gap-3 sm:gap-4">
                      {request.driver_avatar_url ? (
                        <img
                          src={request.driver_avatar_url}
                          alt={request.driver_name}
                          className="h-12 w-12 sm:h-16 sm:w-16 rounded-full object-cover border-2 sm:border-3 border-gray-200 shadow-md flex-shrink-0"
                          style={{
                            imageRendering: 'crisp-edges, -webkit-optimize-contrast, high-quality'
                          }}
                          onError={(e) => {
                            // Fallback to initials if image fails to load
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className={`h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-medium text-lg sm:text-xl border-2 sm:border-3 border-gray-200 shadow-md flex-shrink-0 ${
                          request.driver_avatar_url ? 'hidden' : 'flex'
                        }`}
                      >
                        {getInitials(request.driver_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                          {request.driver_name}
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-600">
                          {new Date(request.requested_at).toLocaleString()}
                        </p>
                        {request.driver_id && (
                          <p className="text-xs text-gray-500">
                            ID: {request.driver_id.slice(0, 8)}
                          </p>
                        )}
                        {request.driver_phone && (
                          <div className="flex items-center gap-1 mt-1">
                            <Phone className="h-3 w-3 text-gray-500" />
                            <p className="text-xs text-gray-600 font-medium">
                              {request.driver_phone}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getStatusColor(request.status)} self-start sm:self-auto`}>
                      {request.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center gap-2 text-gray-700 mb-2">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span className="font-medium text-sm sm:text-base">Location:</span>
                    </div>
                    <p className="text-sm sm:text-base text-gray-600 ml-6 mb-2 break-words">{request.address}</p>
                    <p className="text-xs sm:text-sm text-gray-500 ml-6 font-mono break-all">
                      {request.latitude.toFixed(6)}, {request.longitude.toFixed(6)}
                    </p>
                  </div>

                  {request.message && (
                    <div className="mb-4">
                      <p className="text-xs sm:text-sm text-gray-600 break-words">
                        <span className="font-medium">Message:</span> {request.message}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <a
                      href={`https://www.google.com/maps?q=${request.latitude},${request.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium text-xs sm:text-sm w-fit"
                    >
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      View on Google Maps
                    </a>

                    <div className="flex flex-col sm:flex-row gap-2">
                      {request.status === 'pending' && (
                        <Button
                          onClick={() => handleAcknowledge(request.id)}
                          variant="outline"
                          size="sm"
                          className="text-yellow-600 border-yellow-300 hover:bg-yellow-50 text-xs sm:text-sm"
                        >
                          Acknowledge
                        </Button>
                      )}
                      
                      {request.status === 'acknowledged' && (
                        <Button
                          onClick={() => handleResolve(request.id)}
                          variant="outline"
                          size="sm"
                          className="text-green-600 border-green-300 hover:bg-green-50 text-xs sm:text-sm"
                        >
                          Mark Resolved
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Emergency Modal */}
      <EmergencyModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        request={selectedRequest}
      />
    </div>
  );
}

