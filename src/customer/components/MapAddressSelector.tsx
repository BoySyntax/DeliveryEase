import { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, X, ArrowLeft } from 'lucide-react';
import Button from '../../ui/components/Button';
import { toast } from 'react-hot-toast';

// Google Maps type declarations
declare global {
  interface Window {
    google: typeof google;
    gm_authFailure: () => void;
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
  onAddressSelect: (address: string, coordinates?: { lat: number; lng: number }) => void;
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
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#ef4444',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
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

  const reverseGeocode = (latLng: google.maps.LatLng) => {
    const geocoder = new google.maps.Geocoder();
    
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

  const handleAddressInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value);
  };

  const handleAddressSearch = () => {
    if (!address.trim() || !mapInstanceRef.current) return;

    const geocoder = new google.maps.Geocoder();
    
    geocoder.geocode({ address: address }, (results, status) => {
      if (status === 'OK' && results && results[0] && results[0].geometry) {
        const latLng = results[0].geometry.location;
        updateMarkerPosition(latLng);
        setAddress(results[0].formatted_address);
      } else {
        // Show error message if geocoding fails
        toast.error(`Could not find address: "${address}". Please check the spelling or try clicking directly on the map. Error: ${status}`);
        console.error('Geocoding failed:', status, results);
      }
    });
  };

  const handleConfirmAddress = () => {
    if (address.trim()) {
      const coordinates = markerRef.current ? {
        lat: markerRef.current.getPosition()?.lat() || 0,
        lng: markerRef.current.getPosition()?.lng() || 0,
      } : undefined;
      
      onAddressSelect(address, coordinates);
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddressSearch();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Enhanced Header */}
      <div className="bg-white shadow-lg border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between p-3 sm:p-4 lg:p-6">
          <button
            onClick={onClose}
            className="p-2 sm:p-3 hover:bg-gray-50 rounded-lg transition-all duration-200 text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <div className="text-center flex-1 px-2">
            <h1 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900">{title}</h1>
            <p className="text-xs sm:text-sm text-gray-600">📍 Region 10 (Northern Mindanao)</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 sm:p-3 hover:bg-gray-50 rounded-lg transition-all duration-200 text-gray-600 hover:text-gray-800"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
        
        {/* Instructions Banner */}
        <div className="bg-gray-800 text-white px-3 sm:px-4 lg:px-6 py-2 sm:py-3">
          <p className="text-center text-xs sm:text-sm font-medium">
            🗺️ <span className="hidden sm:inline">Click anywhere on the map to pin your location • Map restricted to Region 10 for precise delivery</span>
            <span className="sm:hidden">Tap on map to pin location</span>
          </p>
        </div>
      </div>

      {/* Enhanced Map Container */}
      <div className="relative flex-1 min-h-0">
        <div ref={mapRef} className="w-full h-full" />
        
        {/* Enhanced Center Pin Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <MapPin className="w-8 h-8 sm:w-10 sm:h-10 text-red-500 drop-shadow-lg mb-8 sm:mb-10" />
            <div className="absolute top-10 sm:top-12 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-2 sm:px-3 py-1 rounded-full text-xs font-semibold">
              Tap here
            </div>
          </div>
        </div>
        

      </div>

      {/* Enhanced Address Input Section */}
      <div className="bg-white border-t border-gray-200 shadow-lg flex-shrink-0">
        <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4 lg:space-y-6 max-h-[50vh] overflow-y-auto">
          {/* Address Input */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
              📍 Type or Select Address
            </label>
            <div className="relative">
              <input
                type="text"
                value={address}
                onChange={handleAddressInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Type your address here or click on map... (Press Enter to search)"
                className="w-full p-3 sm:p-4 border border-gray-200 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-all duration-200"
              />
              <div className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                {address && (
                  <button
                    onClick={() => setAddress('')}
                    className="p-1 sm:p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                  </button>
                )}
                <button
                  onClick={handleAddressSearch}
                  className="p-1 sm:p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600 hover:text-gray-800"
                  title="Search address"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm sm:text-base font-semibold text-gray-800 mb-2">📋 How to select your location:</h3>
            <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span>Type your address and press Enter to search</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <span>Click anywhere on the map to pin your location</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                <span>Or use GPS to find your current position</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-600 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                <span>Confirm your address when ready</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 sm:space-y-3">
            <Button
              onClick={getCurrentLocation}
              variant="outline"
              fullWidth
              className="flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-4 text-sm sm:text-base lg:text-lg border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-semibold transition-all duration-200"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-gray-600"></div>
                  <span className="break-words">Getting your location...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
                  <span className="break-words">🎯 Use My Current Location</span>
                </>
              )}
            </Button>

            {address && (
              <Button
                onClick={handleConfirmAddress}
                fullWidth
                className="py-3 sm:py-4 text-sm sm:text-base lg:text-lg bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-semibold transition-all duration-200"
              >
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                  <MapPin className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
                  <span className="break-words">✅ Confirm This Location</span>
                </div>
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

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      // Check if Google Maps loaded successfully
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
    
    document.head.appendChild(script);
  });
}; 