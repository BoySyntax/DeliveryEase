import { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, X, ArrowLeft } from 'lucide-react';
import Button from '../../ui/components/Button';
import { toast } from 'react-hot-toast';
import { detectBarangayFromCoordinates, type DetectedBarangay } from '../../lib/utils';
import redPinGif from '../../assets/red pin map.gif';

// Google Maps type declarations
declare global {
  interface Window {
    google: typeof google;
    gm_authFailure: () => void;
    [key: string]: any; // Allow dynamic properties for callbacks
  }
}

declare namespace google {
  namespace maps {
    class Map {
      constructor(mapDiv: HTMLElement, opts?: MapOptions);
      addListener(eventName: string, handler: (event?: any) => void): void;
      panTo(latLng: LatLng): void;
    }
    
    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }
    
    class LatLngBounds {
      constructor(sw?: LatLng | { lat: number; lng: number }, ne?: LatLng | { lat: number; lng: number });
    }
    
    // Minimal types for marker icon sizing/anchor
    class Size {
      constructor(width: number, height: number);
    }
    class Point {
      constructor(x: number, y: number);
    }
    
    class Marker {
      constructor(opts: MarkerOptions);
      setMap(map: Map | null): void;
      getPosition(): LatLng | undefined;
      addListener(eventName: string, handler: (event?: any) => void): void;
    }
    
    class Geocoder {
      geocode(request: GeocoderRequest, callback: (results: GeocoderResult[] | null, status: string) => void): void;
    }
    
    interface MapOptions {
      center?: LatLng | { lat: number; lng: number };
      zoom?: number;
      minZoom?: number;
      maxZoom?: number;
      restriction?: {
        latLngBounds: LatLngBounds;
        strictBounds?: boolean;
      };
      styles?: any[];
      disableDefaultUI?: boolean;
      zoomControl?: boolean;
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
    }
    
    interface MarkerOptions {
      position: LatLng | { lat: number; lng: number };
      map: Map;
      icon?: any;
      draggable?: boolean;
    }
    
    interface GeocoderRequest {
      address?: string;
      location?: LatLng;
    }
    
    interface GeocoderResult {
      formatted_address: string;
      geometry: {
        location: LatLng;
      };
    }
    
    interface MapMouseEvent {
      latLng: LatLng | null;
    }
    
    enum SymbolPath {
      CIRCLE = 0
    }
  }
}

interface MapAddressSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onAddressSelect: (address: string, coordinates?: { lat: number; lng: number }, detectedBarangay?: DetectedBarangay) => void;
  initialAddress?: string;
  title?: string;
}

export default function MapAddressSelector({ 
  isOpen, 
  onClose, 
  onAddressSelect, 
  initialAddress = '',
  title = 'Select Address'
}: MapAddressSelectorProps) {
  const [address, setAddress] = useState(initialAddress);
  const [isLoading, setIsLoading] = useState(false);
  const [detectedBarangay, setDetectedBarangay] = useState<DetectedBarangay | null>(null);
  const [isDetectingBarangay, setIsDetectingBarangay] = useState(false);
  const [, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAddress(initialAddress);
      initializeMap();
    }
  }, [isOpen, initialAddress]);

  const initializeMap = () => {
    if (!mapRef.current) return;

    // Center on Region 10 (Northern Mindanao) - Cagayan de Oro City
    const region10Center = { lat: 8.4542, lng: 124.6319 };
    
    // Define Region 10 bounds
    const region10Bounds = new google.maps.LatLngBounds(
      { lat: 7.5, lng: 123.0 }, // Southwest bound
      { lat: 9.0, lng: 126.0 }  // Northeast bound
    );
    
    const map = new google.maps.Map(mapRef.current, {
      center: region10Center,
      zoom: 11, // Zoom level to show Region 10 cities
      minZoom: 10, // Prevent zooming out too far
      maxZoom: 18, // Allow detailed view
      restriction: {
        latLngBounds: region10Bounds,
        strictBounds: true, // Restrict panning outside Region 10
      },
      styles: [
        // Enhanced map styling for Region 10
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }]
        },
        {
          featureType: 'administrative.locality',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#1e40af' }, { weight: 'bold' }]
        },
        {
          featureType: 'road.highway',
          elementType: 'geometry',
          stylers: [{ color: '#f59e0b' }]
        },
        {
          featureType: 'water',
          elementType: 'geometry',
          stylers: [{ color: '#0ea5e9' }]
        }
      ],
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
    });

    mapInstanceRef.current = map;

    // Add click listener to map
    map.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (event.latLng) {
        updateMarkerPosition(event.latLng);
        reverseGeocode(event.latLng);
      }
    });

    // Try to get user's current location
    getCurrentLocation();
  };

  const updateMarkerPosition = (latLng: google.maps.LatLng) => {
    if (!mapInstanceRef.current) return;

    // Remove existing marker
    if (markerRef.current) {
      markerRef.current.setMap(null);
    }

    // Add new marker
    markerRef.current = new google.maps.Marker({
      position: latLng,
      map: mapInstanceRef.current,
      icon: {
        url: redPinGif as unknown as string,
        scaledSize: new google.maps.Size(48, 48),
        anchor: new google.maps.Point(24, 48),
      } as any,
      draggable: true,
    });

    // Add drag listener to marker
    markerRef.current.addListener('dragend', (event: google.maps.MapMouseEvent) => {
      if (event.latLng) {
        reverseGeocode(event.latLng);
      }
    });

    mapInstanceRef.current.panTo(latLng);
  };

  const reverseGeocode = async (latLng: google.maps.LatLng) => {
    const geocoder = new google.maps.Geocoder();
    
    // Start barangay detection
    setIsDetectingBarangay(true);
    
    try {
      // Detect barangay from coordinates
      const barangayInfo = await detectBarangayFromCoordinates(latLng.lat(), latLng.lng());
      if (barangayInfo) {
        setDetectedBarangay(barangayInfo);
        toast.success(`📍 Detected: ${barangayInfo.barangay}, ${barangayInfo.city}`);
      } else {
        setDetectedBarangay(null);
        toast('📍 Location detected, but barangay could not be determined', { icon: 'ℹ️' });
      }
    } catch (error) {
      console.error('Error detecting barangay:', error);
      setDetectedBarangay(null);
    } finally {
      setIsDetectingBarangay(false);
    }
    
    // Continue with regular reverse geocoding for address
    geocoder.geocode({ location: latLng }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        setAddress(results[0].formatted_address);
      } else {
        // Fallback: Use coordinates if geocoding fails
        const lat = latLng.lat().toFixed(6);
        const lng = latLng.lng().toFixed(6);
        setAddress(`Location: ${lat}, ${lng}`);
        console.warn('Geocoding failed, using coordinates instead:', status);
      }
    });
  };

  const getCurrentLocation = () => {
    setIsLoading(true);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          
          setCurrentLocation(coords);
          
          if (mapInstanceRef.current) {
            const latLng = new google.maps.LatLng(coords.lat, coords.lng);
            updateMarkerPosition(latLng);
            reverseGeocode(latLng);
          }
          
          setIsLoading(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          
          // Handle different error types with mobile-specific messaging
          let errorMessage = 'Could not get your location. ';
          let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          
          switch(error.code) {
            case error.PERMISSION_DENIED:
              if (isMobile && location.protocol === 'http:') {
                errorMessage += 'Mobile devices require HTTPS for location access. Please use HTTPS or manually select your location on the map.';
              } else {
                errorMessage += 'Location access was denied. Please allow location access and try again.';
              }
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage += 'Location information is unavailable.';
              break;
            case error.TIMEOUT:
              errorMessage += 'Location request timed out.';
              break;
            default:
              if (isMobile && location.protocol === 'http:') {
                errorMessage += 'For mobile devices, please access via HTTPS (https://...) for location features, or manually tap on the map to select your location.';
              } else {
                errorMessage += 'Please manually enter your address or click on the map to select your location.';
              }
              break;
          }
          
          // Show user-friendly error
          toast.error(errorMessage);
          setIsLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    } else {
              toast.error('Geolocation is not supported by this browser. Please enter your address manually or click on the map to select your location.');
      setIsLoading(false);
    }
  };

  const handleAddressSearch = () => {
    if (!address.trim() || !mapInstanceRef.current) return;

    const geocoder = new google.maps.Geocoder();
    
    geocoder.geocode({ address: address }, (results, status) => {
      if (status === 'OK' && results && results[0] && results[0].geometry) {
        const latLng = results[0].geometry.location;
        updateMarkerPosition(latLng);
        reverseGeocode(latLng);
        setAddress(results[0].formatted_address);
      } else {
        toast.error(`Could not find "${address}". Please try clicking on the map instead.`);
      }
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddressSearch();
    }
  };

  const handleClearSearch = () => {
    setAddress('');
    setDetectedBarangay(null);
    // Remove marker from the map if present
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
  };

  const handleConfirmAddress = () => {
    if (address.trim()) {
      const coordinates = markerRef.current ? {
        lat: markerRef.current.getPosition()?.lat() || 0,
        lng: markerRef.current.getPosition()?.lng() || 0,
      } : undefined;
      
      onAddressSelect(address, coordinates, detectedBarangay || undefined);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Simplified Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center flex-1">
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
            <p className="text-sm text-blue-600 font-medium">📍 Tap on map to pin location</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Larger Map Container */}
      <div className="relative flex-1">
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {/* Simplified Bottom Panel */}
      <div className="bg-white border-t border-gray-200 flex-shrink-0">
        <div className="p-4 space-y-4">
          {/* Search Address Input */}
          <div className="relative">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Search address or tap on map..."
              className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-20"
            />
            {address && (
              <button
                onClick={handleClearSearch}
                className="absolute right-9 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700"
                title="Clear search"
                aria-label="Clear search"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <button
              onClick={handleAddressSearch}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700"
              title="Search address"
              aria-label="Search address"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>

          {/* Detected Barangay Display */}
          {(detectedBarangay || isDetectingBarangay) && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                {isDetectingBarangay ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                ) : (
                  <MapPin className="w-4 h-4 text-green-600" />
                )}
                <div className="flex-1">
                  {isDetectingBarangay ? (
                    <p className="text-sm text-green-700 font-medium">🔍 Detecting Barangay...</p>
                  ) : detectedBarangay ? (
                    <div>
                      <p className="text-sm text-green-800 font-medium">
                        Barangay {detectedBarangay.barangay}, {detectedBarangay.city}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}



          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={getCurrentLocation}
              variant="outline"
              disabled={isLoading}
              className="flex-1 py-3 text-sm border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              ) : (
                <>
                  <Navigation className="w-4 h-4 mr-2" />
                  Use GPS
                </>
              )}
            </Button>

            {address && (
              <Button
                onClick={handleConfirmAddress}
                className="flex-1 py-3 text-sm bg-blue-600 hover:bg-blue-700 text-white"
              >
                <MapPin className="w-4 h-4 mr-2" />
                Confirm Location
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Load Google Maps script
export const loadGoogleMapsScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    // Check if script already exists
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Wait for existing script to load
      const checkLoaded = () => {
        if (window.google && window.google.maps) {
          resolve();
        } else {
          setTimeout(checkLoaded, 100);
        }
      };
      checkLoaded();
      return;
    }

    // Get API key from environment or fallback
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyCw7RgxVpjSfIVB-XQe2dJG5U-ehYHYxFw';
    
    // Log for debugging (remove in production)
    console.log('Google Maps API Key loaded:', apiKey ? 'Yes' : 'No');
    
    if (!apiKey) {
      reject(new Error('Google Maps API key not found. Please check your environment configuration.'));
      return;
    }

    // Simple script loading approach
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      if (window.google && window.google.maps) {
        resolve();
      } else {
        reject(new Error('Google Maps failed to load properly'));
      }
    };
    
    script.onerror = () => {
      reject(new Error('Failed to load Google Maps script. Please check your API key and internet connection.'));
    };
    
    // Listen for Google Maps API errors
    window.gm_authFailure = () => {
      reject(new Error('Google Maps API authentication failed. Please check your API key, billing, and enabled APIs in Google Cloud Console.'));
    };
    
    // Append to head
    document.head.appendChild(script);
  });
}; 