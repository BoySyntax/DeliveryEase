import { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, X, ArrowLeft } from 'lucide-react';
import Button from '../../ui/components/Button';

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
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
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

    // Default to Philippines coordinates
    const defaultCenter = { lat: 14.5995, lng: 120.9842 };
    
    const map = new google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 15,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }]
        }
      ],
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
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
          alert(errorMessage);
          setIsLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    } else {
      alert('Geolocation is not supported by this browser. Please enter your address manually or click on the map to select your location.');
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
        alert(`Could not find address: "${address}". Please check the spelling or try clicking directly on the map. Error: ${status}`);
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
    <div className="fixed inset-0 z-50 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Map Container */}
      <div className="relative flex-1 h-64">
        <div ref={mapRef} className="w-full h-full" />
        
        {/* Center Pin Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <MapPin className="w-8 h-8 text-red-500 mb-8" />
        </div>
      </div>

      {/* Address Input Section */}
      <div className="p-4 bg-white border-t">
        <div className="relative mb-4">
          <input
            type="text"
            value={address}
            onChange={handleAddressInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Enter your address"
            className="w-full p-4 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {address && (
            <button
              onClick={() => setAddress('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>

        <p className="text-center text-gray-600 mb-4">
          Enter an address or click on the map to select your location
          {/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && 
           location.protocol === 'http:' && (
            <span className="block text-sm text-orange-600 mt-1">
              📱 Mobile tip: Tap directly on the map to select your location
            </span>
          )}
        </p>

        <Button
          onClick={getCurrentLocation}
          variant="outline"
          fullWidth
          className="mb-4 flex items-center justify-center gap-2 py-3"
          disabled={isLoading}
        >
          <Navigation className="w-5 h-5" />
          {isLoading ? 'Getting location...' : 
           /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && 
           location.protocol === 'http:' 
             ? 'Try current location (may not work on mobile HTTP)'
             : 'Use my current location'}
        </Button>

        {address && (
          <Button
            onClick={handleConfirmAddress}
            fullWidth
            className="py-3"
          >
            Confirm Address
          </Button>
        )}
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