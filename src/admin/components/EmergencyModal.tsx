import { useState, useEffect } from 'react';
import { AlertTriangle, MapPin, X, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import Button from '../../ui/components/Button';

interface EmergencyRequest {
  id: string;
  driver_name: string;
  driver_id?: string;
  driver_avatar_url?: string;
  address: string;
  latitude: number;
  longitude: number;
  requested_at: string;
  message?: string;
}

interface EmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: EmergencyRequest | null;
  onAcknowledge?: (requestId: string) => void;
  onResolve?: (requestId: string) => void;
}

// Helper function to get initials from name
const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export default function EmergencyModal({ 
  isOpen, 
  onClose, 
  request, 
  onAcknowledge, 
  onResolve 
}: EmergencyModalProps) {
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    if (request) {
      setIsAcknowledged(false);
      setIsResolved(false);
    }
  }, [request]);

  if (!isOpen || !request) return null;

  const handleAcknowledge = () => {
    setIsAcknowledged(true);
    onAcknowledge?.(request.id);
  };

  const handleResolve = () => {
    setIsResolved(true);
    onResolve?.(request.id);
  };

  const getStatusColor = () => {
    if (isResolved) return 'bg-green-100 text-green-800 border-green-200';
    if (isAcknowledged) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getStatusIcon = () => {
    if (isResolved) return <CheckCircle className="h-5 w-5" />;
    if (isAcknowledged) return <Clock className="h-5 w-5" />;
    return <AlertTriangle className="h-5 w-5" />;
  };

  const getStatusText = () => {
    if (isResolved) return 'RESOLVED';
    if (isAcknowledged) return 'ACKNOWLEDGED';
    return 'PENDING';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />
        
        {/* Modal */}
        <div className="relative w-full max-w-xl transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
          {/* Header */}
          <div className={`px-6 py-4 border-l-4 ${getStatusColor().split(' ')[2]}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon()}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    🚨 Emergency Request
                  </h3>
                  <p className="text-sm text-gray-600">
                    {new Date(request.requested_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-8 py-6">
            <div className="mb-4">
              <div className="flex items-center gap-4 mb-4">
                {request.driver_avatar_url ? (
                  <img
                    src={request.driver_avatar_url}
                    alt={request.driver_name}
                    className="h-20 w-20 rounded-full object-cover border-3 border-gray-200 shadow-md"
                    style={{
                      imageRendering: 'high-quality',
                      imageRendering: '-webkit-optimize-contrast',
                      imageRendering: 'crisp-edges'
                    }}
                    onError={(e) => {
                      // Fallback to initials if image fails to load
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div 
                  className={`h-20 w-20 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-medium text-2xl border-3 border-gray-200 shadow-md ${
                    request.driver_avatar_url ? 'hidden' : 'flex'
                  }`}
                >
                  {getInitials(request.driver_name)}
                </div>
                <div>
                  <h4 className="text-2xl font-bold text-gray-900 mb-1">
                    {request.driver_name}
                  </h4>
                  {request.driver_id && (
                    <p className="text-sm text-gray-500">
                      Driver ID: {request.driver_id.slice(0, 8)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-700 mb-2">
                <MapPin className="h-4 w-4" />
                <span className="font-medium">Location:</span>
              </div>
              <p className="text-gray-600 ml-6 mb-2">{request.address}</p>
              <p className="text-sm text-gray-500 ml-6 font-mono">
                {request.latitude.toFixed(6)}, {request.longitude.toFixed(6)}
              </p>
            </div>

            {request.message && (
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Message:</span> {request.message}
                </p>
              </div>
            )}

            <div className="mb-4">
              <a
                href={`https://www.google.com/maps?q=${request.latitude},${request.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
              >
                <ExternalLink className="h-4 w-4" />
                View on Google Maps
              </a>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor()}`}>
                {getStatusText()}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="px-8 py-6 bg-gray-50 flex gap-3">
            {!isAcknowledged && !isResolved && (
              <Button
                onClick={handleAcknowledge}
                variant="outline"
                className="flex-1 text-yellow-600 border-yellow-300 hover:bg-yellow-50"
              >
                <Clock className="h-4 w-4 mr-2" />
                Acknowledge
              </Button>
            )}
            
            {isAcknowledged && !isResolved && (
              <Button
                onClick={handleResolve}
                variant="outline"
                className="flex-1 text-green-600 border-green-300 hover:bg-green-50"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark Resolved
              </Button>
            )}

            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              {isResolved ? 'Close' : 'Dismiss'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

