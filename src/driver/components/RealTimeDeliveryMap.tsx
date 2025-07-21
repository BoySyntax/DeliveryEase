import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { GeneticRouteOptimizer, DeliveryLocation, OptimizedRoute, DepotLocation } from '../../lib/genetic-route-optimizer';
import { Card, CardContent } from '../../ui/components/Card';
import Button from '../../ui/components/Button';
import { toast } from 'react-hot-toast';
import { 
  MapPin, 
  Route as RouteIcon, 
  Truck, 
  Target,
  RotateCcw,
  Play,
  Pause,
  CheckCircle,
  Clock,
  TrendingUp,
  Maximize,
  Minimize
} from 'lucide-react';
import truckIcon from '../../assets/truck-icon.png';

// Default fallback location (Manila)
const DEFAULT_LOCATION = {
  lat: 14.6042,
  lng: 120.9822,
  name: "Manila",
  address: "Philippines"
};

interface DeliveryMapProps {
  batchId: string;
  driverId: string;
  onRouteOptimized?: (route: OptimizedRoute) => void;
}

interface RouteMetrics {
  totalDistance: number;
  totalDuration: number;
  optimizationScore: number;
  fuelCostEstimate: number;
  fitnessScore?: number;
  routeComparisonData?: any;
}

// Extended DeliveryLocation with order items
interface ExtendedDeliveryLocation extends DeliveryLocation {
  order_items?: {
    quantity: number;
    price: number;
    product: {
      name: string;
      image_url?: string;
    };
  }[];
}

// Google Maps types
interface GoogleMapsWindow extends Window {
  google: any;
  initGoogleMaps: () => void;
}

declare const window: GoogleMapsWindow;

export default function RealTimeDeliveryMap({ batchId, onRouteOptimized }: DeliveryMapProps) {
  console.log('🎯 RealTimeDeliveryMap component rendered with batchId:', batchId);
  
  const [deliveryLocations, setDeliveryLocations] = useState<ExtendedDeliveryLocation[]>([]);
  const [optimizedOrder, setOptimizedOrder] = useState<string[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [completedStops, setCompletedStops] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(true);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{lat: number, lng: number, name: string, address: string} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [routeMetrics, setRouteMetrics] = useState<RouteMetrics>({
    totalDistance: 0,
    totalDuration: 0,
    optimizationScore: 0,
    fuelCostEstimate: 0,
    fitnessScore: 0,
    routeComparisonData: null
  });

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeRendererRef = useRef<any>(null);
  const directionsServiceRef = useRef<any>(null);
  const locationWatchIdRef = useRef<number | null>(null);
  const driverMarkerRef = useRef<any>(null);

  // Enhanced real-time location tracking with better error handling
  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      console.log('🚫 Geolocation not supported for tracking');
      setLocationError('Real-time tracking not supported');
      return;
    }

    console.log('🎯 Starting enhanced real-time location tracking...');
    setIsTrackingLocation(true);

    // Show tracking start toast
    toast.success('🔄 Real-time GPS tracking started!', {
      duration: 3000,
      id: 'tracking-start'
    });

    // Get initial position
    getCurrentLocation();

    // Enhanced tracking with better timeout and error handling
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        
        const newLocation = {
          lat: latitude,
          lng: longitude,
          name: "Driver Current Location",
          address: "Your current position"
        };

        setDriverLocation(newLocation);
        setLocationError(null);

        // Update only the driver marker if map is already initialized
        if (mapInstanceRef.current && window.google && driverMarkerRef.current) {
          driverMarkerRef.current.setPosition({ lat: latitude, lng: longitude });
          
          // Optional: Center map on new location if accuracy is good
          if (accuracy < 50) { // If accuracy is within 50 meters
            // mapInstanceRef.current.panTo({ lat: latitude, lng: longitude });
          }
        }
      },
      (error) => {
        console.error('❌ Location tracking error:', error);
        let errorMessage = 'Real-time tracking failed';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            console.error('   - Tracking permission denied');
            errorMessage = 'Location access denied for real-time tracking.';
            setIsTrackingLocation(false);
            break;
          case error.POSITION_UNAVAILABLE:
            console.error('   - Tracking position unavailable');
            errorMessage = 'Location information unavailable for tracking.';
            // Continue tracking, might recover
            break;
          case error.TIMEOUT:
            console.error('   - Tracking timeout (continuing...)');
            errorMessage = 'Location update delayed. Continuing tracking...';
            // Don't stop tracking on timeout, just log it
            break;
        }
        
        console.log('⚠️ Real-time tracking issue:', errorMessage);
        setLocationError(errorMessage);
        
        // Auto-clear timeout errors after 10 seconds
        if (error.code === error.TIMEOUT) {
          setTimeout(() => {
            setLocationError(null);
          }, 10000);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 60000, // 60 seconds timeout (much more generous)
        maximumAge: 30000 // Accept positions up to 30 seconds old
      }
    );

    locationWatchIdRef.current = watchId;
  }, []);

  const stopLocationTracking = useCallback(() => {
    if (locationWatchIdRef.current !== null) {
      console.log('🛑 Stopping location tracking...');
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
      setIsTrackingLocation(false);
      toast.success('🛑 Real-time GPS tracking stopped!', {
        duration: 3000,
        id: 'tracking-stop'
      });
    }
  }, []);

  // Check if device is online before making geolocation requests
  const isOnline = navigator.onLine;

  // Retry geolocation with exponential backoff
  const retryGeolocation = useCallback((retryCount = 0) => {
    const maxRetries = 3;
    const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10 second delay
    
    if (retryCount >= maxRetries) {
      console.log('❌ Max geolocation retries reached, using fallback');
      setLocationError('Location unavailable. Using approximate location.');
      setDriverLocation({
        lat: DEFAULT_LOCATION.lat,
        lng: DEFAULT_LOCATION.lng,
        name: "Driver Location (Fallback)",
        address: DEFAULT_LOCATION.address
      });
      return;
    }

    console.log(`🔄 Retrying geolocation in ${backoffDelay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
    
    setTimeout(() => {
      getCurrentLocation();
    }, backoffDelay);
  }, []);

  // Enhanced error handling with connection checking
  const handleGeolocationError = useCallback((error: GeolocationPositionError) => {
    if (!isOnline) {
      setLocationError('No internet connection. Using cached location.');
      return;
    }

    switch (error.code) {
      case error.PERMISSION_DENIED:
        setLocationError('Location access denied. Please enable location services.');
        break;
      case error.POSITION_UNAVAILABLE:
        setLocationError('GPS signal unavailable. Trying again...');
        retryGeolocation();
        break;
      case error.TIMEOUT:
        setLocationError('Location request timed out. Retrying...');
        retryGeolocation();
        break;
      default:
        setLocationError('Location error occurred. Using fallback.');
        break;
    }
  }, [isOnline, retryGeolocation]);

  // Enhanced geolocation with progressive timeout and retry
  const getCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      console.log('🚫 Geolocation not supported, using fallback location');
      setDriverLocation({
        lat: DEFAULT_LOCATION.lat,
        lng: DEFAULT_LOCATION.lng,
        name: "Driver Location (Fallback)",
        address: DEFAULT_LOCATION.address
      });
      return;
    }

    setIsGpsLoading(true);
    setLocationError(null);
    console.log('🔄 Starting enhanced GPS location request...');
    
    // Progressive timeout strategy: try high accuracy first, then fall back
    const geolocationConfigs = [
      {
        enableHighAccuracy: true,
        timeout: 30000, // 30 seconds for high accuracy
        maximumAge: 60000, // 1 minute cache
        description: "High accuracy GPS"
      },
      {
        enableHighAccuracy: false,
        timeout: 15000, // 15 seconds for network-based location
        maximumAge: 300000, // 5 minutes cache
        description: "Network-based location"
      }
    ];

    try {
      for (let i = 0; i < geolocationConfigs.length; i++) {
        const config = geolocationConfigs[i];
        console.log(`🎯 Trying ${config.description} (timeout: ${config.timeout}ms)...`);
        
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('Manual timeout'));
            }, config.timeout);

            navigator.geolocation.getCurrentPosition(
              (pos) => {
                clearTimeout(timeoutId);
                resolve(pos);
              },
              (error) => {
                clearTimeout(timeoutId);
                reject(error);
              },
              {
                enableHighAccuracy: config.enableHighAccuracy,
                timeout: config.timeout,
                maximumAge: config.maximumAge
              }
            );
          });

          const { latitude, longitude, accuracy } = position.coords;
          console.log(`✅ ${config.description} successful:`, { latitude, longitude, accuracy });
          
          setDriverLocation({
            lat: latitude,
            lng: longitude,
            name: "Driver Current Location",
            address: `Your current position (±${Math.round(accuracy || 0)}m)`
          });
          setLocationError(null);
          setIsGpsLoading(false);
          
          // Show success toast with accuracy info
          toast.success(`📍 GPS location acquired! Accuracy: ±${Math.round(accuracy || 0)}m`, {
            duration: 3000,
            id: 'gps-success'
          });
          
          return; // Success, exit the loop
          
        } catch (error: any) {
          console.log(`❌ ${config.description} failed:`, error.message);
          
          if (i === geolocationConfigs.length - 1) {
            // Last attempt failed, use fallback
            throw error;
          }
        }
      }
    } catch (error) {
      console.log('🔄 All GPS attempts failed, using fallback location:', DEFAULT_LOCATION);
      setLocationError('GPS unavailable. Using approximate location.');
      setDriverLocation({
        lat: DEFAULT_LOCATION.lat,
        lng: DEFAULT_LOCATION.lng,
        name: "Driver Location (Fallback)",
        address: DEFAULT_LOCATION.address
      });
      
      // Show fallback toast
      toast.error('GPS timeout. Using approximate location in CDO City.', {
        duration: 5000,
        id: 'gps-fallback'
      });
    } finally {
      setIsGpsLoading(false);
    }
  }, []);

  // Load Google Maps API
  const loadGoogleMaps = useCallback(() => {
    const API_KEY = 'AIzaSyCw7RgxVpjSfIVB-XQe2dJG5U-ehYHYxFw';
    console.log('🗺️ Loading Google Maps API with key:', API_KEY.substring(0, 20) + '...');

    if (window.google && window.google.maps) {
      console.log('✅ Google Maps already loaded, initializing map...');
      initializeMap();
      return;
    }

    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      console.log('⏳ Google Maps script already loading, waiting...');
      // Script already loading, wait for it
      window.initGoogleMaps = initializeMap;
      return;
    }

    console.log('🔄 Creating Google Maps script tag...');
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=geometry&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    
    // Add error handling for script loading
    script.onerror = (error) => {
      console.error('❌ Failed to load Google Maps API script:', error);
      setMapLoading(false);
      setLocationError('Failed to load Google Maps API. This could be due to: invalid API key, disabled APIs, network issues, or billing problems.');
      // toast.error('🗺️ Google Maps script failed to load');
    };
    
    script.onload = () => {
      console.log('✅ Google Maps API script loaded successfully');
    };
    
    window.initGoogleMaps = () => {
      console.log('🚀 Google Maps callback triggered');
      try {
        if (window.google && window.google.maps) {
          console.log('✅ Google Maps object available, initializing...');
          initializeMap();
        } else {
          console.error('❌ Google Maps object not available in callback');
          setMapLoading(false);
          setLocationError('Google Maps failed to initialize. Check API key permissions.');
          // toast.error('🗺️ Google Maps initialization failed');
        }
      } catch (error) {
        console.error('❌ Error in initGoogleMaps callback:', error);
        setMapLoading(false);
        setLocationError(`Google Maps initialization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // toast.error('🗺️ Google Maps initialization failed');
      }
    };
    
    console.log('📄 Adding script to document head...');
    document.head.appendChild(script);
    
    // Set a timeout to catch loading issues
    setTimeout(() => {
      if (!window.google && mapLoading) {
        console.error('⏰ Google Maps loading timeout - possible causes:');
        console.error('   - API key invalid or restricted');
        console.error('   - Maps JavaScript API not enabled');
        console.error('   - Billing not set up');
        console.error('   - Network connectivity issues');
        setMapLoading(false);
        setLocationError('Google Maps loading timeout. Check: API key validity, Maps JavaScript API enabled, billing setup, network connection.');
        // toast.error('🗺️ Google Maps loading timeout');
      }
    }, 15000);
  }, [mapLoading]);

  // Initialize the map
  const initializeMap = useCallback(() => {
    console.log('🎯 initializeMap called');
    console.log('   - mapRef.current:', !!mapRef.current);
    console.log('   - window.google:', !!window.google);
    console.log('   - window.google.maps:', !!(window.google && window.google.maps));
    console.log('   - driverLocation:', !!driverLocation);
    
    if (!mapRef.current) {
      console.log('⏳ mapRef.current is null, retrying in 100ms...');
      setTimeout(() => {
        if (mapRef.current) {
          console.log('✅ mapRef now available, retrying initialization...');
          initializeMap();
        } else {
          console.log('⏳ mapRef still null, retrying in 500ms...');
          setTimeout(() => {
            if (mapRef.current) {
              console.log('✅ mapRef now available after 500ms, retrying...');
              initializeMap();
            } else {
              console.error('❌ mapRef.current still null after retries');
              setMapLoading(false);
              setLocationError('Map container not ready. Please refresh the page.');
            }
          }, 500);
        }
      }, 100);
      return;
    }
    
    if (!window.google) {
      console.error('❌ window.google is not available');
      return;
    }
    
    if (!window.google.maps) {
      console.error('❌ window.google.maps is not available');
      return;
    }
    
    if (!driverLocation) {
      console.log('⏳ driverLocation is null, waiting for GPS...');
      // Don't return here, we'll initialize with fallback location
      console.log('🔄 Using fallback location for map initialization...');
    }

    try {
      console.log('✅ All dependencies available, creating map...');
      
      // Use driver location or fallback to default
      const mapCenter = driverLocation || DEFAULT_LOCATION;
      console.log('   - Map center:', mapCenter);
      
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: mapCenter.lat, lng: mapCenter.lng },
        zoom: 12,
        mapTypeId: 'roadmap',
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ]
      });

      console.log('✅ Map created successfully');
      mapInstanceRef.current = map;
      
      console.log('🧭 Creating DirectionsService...');
      directionsServiceRef.current = new window.google.maps.DirectionsService();
      
      console.log('🎨 Creating DirectionsRenderer...');
      routeRendererRef.current = new window.google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#2563eb',
          strokeWeight: 4,
          strokeOpacity: 0.8
        }
      });
      
      console.log('🔗 Setting renderer to map...');
      routeRendererRef.current.setMap(map);
      
      console.log('🏁 Map initialization complete, updating markers...');
      setMapLoading(false);
      updateMapMarkers();
    } catch (error) {
      console.error('❌ Error initializing map:', error);
      console.error('   - Error type:', error && typeof error === 'object' && 'constructor' in error ? (error as any).constructor.name : 'Unknown');
      console.error('   - Error message:', error instanceof Error ? error.message : 'Unknown error');
      setMapLoading(false);
      setLocationError(`Map initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  // Update map markers
  const updateMapMarkers = useCallback(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation) return;

    // Clear existing markers (except driver marker for real-time tracking)
    markersRef.current.forEach(marker => {
      if (marker !== driverMarkerRef.current) {
        marker.setMap(null);
      }
    });
    markersRef.current = [];

    // Add or update driver location marker with truck icon
    if (!driverMarkerRef.current) {
      // Create new driver marker with truck icon
      driverMarkerRef.current = new window.google.maps.Marker({
        position: { lat: driverLocation.lat, lng: driverLocation.lng },
        map: mapInstanceRef.current,
        title: driverLocation.name,
        icon: {
          // Use the actual truck image file
          url: truckIcon,
          scaledSize: { width: 40, height: 40 },
          anchor: { x: 20, y: 20 }
        },
        zIndex: 1000 // Ensure truck appears on top
      });

      const driverInfoWindow = new window.google.maps.InfoWindow({
        content: `
          <div class="p-2">
            <h3 class="font-bold text-red-800">🚚 ${driverLocation.name}</h3>
            <p class="text-sm text-gray-600">${driverLocation.address}</p>
            <p class="text-xs text-red-600 mt-1">${isTrackingLocation ? '📍 Live Tracking Active' : '📍 Current Position'}</p>
          </div>
        `
      });

      driverMarkerRef.current.addListener('click', () => {
        driverInfoWindow.open(mapInstanceRef.current, driverMarkerRef.current);
      });
    } else {
      // Update existing driver marker position
      driverMarkerRef.current.setPosition({ lat: driverLocation.lat, lng: driverLocation.lng });
    }

    markersRef.current.push(driverMarkerRef.current);

    // Add delivery location markers with correct optimized sequence numbers
    deliveryLocations.forEach((location, index) => {
      if (!location.latitude || !location.longitude) return;

      const isCompleted = completedStops.has(location.id);
      
      // Get the correct sequence number based on optimized order
      let sequenceNumber = index + 1; // Default to original order
      let optimizedIndex = index; // Default to original index
      if (optimizedOrder.length > 0) {
        const foundIndex = optimizedOrder.findIndex(id => id === location.id);
        if (foundIndex !== -1) {
          sequenceNumber = foundIndex + 1; // Use optimized sequence position
          optimizedIndex = foundIndex; // Use optimized index for highlighting
        }
      }
      
      // Use optimized index for current stop highlighting
      const isCurrent = optimizedIndex === currentStopIndex && !isCompleted;
      
      let markerColor = '#6b7280'; // gray for pending
      if (isCompleted) markerColor = '#10b981'; // green for completed
      else if (isCurrent) markerColor = '#f59e0b'; // yellow for current

      const marker = new window.google.maps.Marker({
        position: { lat: location.latitude, lng: location.longitude },
        map: mapInstanceRef.current,
        title: location.customer_name,
        label: {
          text: isCompleted ? '✓' : sequenceNumber.toString(),
          color: 'white',
          fontWeight: 'bold',
          fontSize: '12px'
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 15,
          fillColor: markerColor,
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2
        }
      });

      // Generate order items HTML from real database data
      const extendedLocation = location as ExtendedDeliveryLocation;
      console.log('📍 Creating popup for location:', location.customer_name);
      console.log('📍 Real order items data:', extendedLocation.order_items);
      
      let orderItemsHtml = '';
      if (extendedLocation.order_items && extendedLocation.order_items.length > 0) {
        console.log('📍 Generating order items HTML for', extendedLocation.order_items.length, 'items');
        orderItemsHtml = `
          <div class="mt-3 pt-2 border-t border-gray-200">
            <p class="text-xs font-medium text-gray-700 mb-2">📦 Order Items:</p>
            ${extendedLocation.order_items.map(item => `
              <div class="flex justify-between items-center text-xs mb-1">
                <span class="text-gray-600">${item.product.name} (${item.quantity}x)</span>
                <span class="text-gray-800 font-medium">₱${(item.price * item.quantity).toLocaleString()}</span>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        console.log('📍 No order items found, will fetch directly from database for order:', location.id);
        orderItemsHtml = `
          <div class="mt-3 pt-2 border-t border-gray-200">
            <p class="text-xs font-medium text-gray-700 mb-2">📦 Order Items:</p>
            <div class="text-xs text-gray-500" id="loading-items-${location.id}">Loading items...</div>
          </div>
        `;
      }

      const popupContent = `
        <div class="p-2 max-w-xs">
          <h3 class="font-bold text-gray-800">${location.customer_name}</h3>
          <p class="text-sm text-gray-600 mb-1">${location.address}</p>
          <p class="text-sm text-blue-600 font-medium mb-2">${location.barangay}</p>
          <div class="flex justify-between items-center">
            <span class="font-semibold text-green-600">₱${location.total.toLocaleString()}</span>
            <span class="text-xs ${isCompleted ? 'text-green-600' : isCurrent ? 'text-yellow-600' : 'text-gray-500'}">
              ${isCompleted ? '✅ Completed' : isCurrent ? '🟡 Current' : `⭕ Stop #${sequenceNumber}`}
            </span>
          </div>
          ${location.phone ? `<p class="text-xs text-gray-500 mt-1">📞 ${location.phone}</p>` : ''}
          ${orderItemsHtml}
        </div>
      `;

      console.log('📍 Final popup content:', popupContent);

      const infoWindow = new window.google.maps.InfoWindow({
        content: popupContent
      });

      marker.addListener('click', () => {
        infoWindow.open(mapInstanceRef.current, marker);
      });

      markersRef.current.push(marker);
    });
  }, [deliveryLocations, completedStops, currentStopIndex, driverLocation, isTrackingLocation, optimizedOrder]);

  // Draw route on map
  const drawRouteOnMap = useCallback(async () => {
    if (!mapInstanceRef.current || !directionsServiceRef.current || !routeRendererRef.current || !driverLocation) return;
    if (deliveryLocations.length === 0) return;

    const validLocations = deliveryLocations.filter(loc => loc.latitude && loc.longitude);
    if (validLocations.length === 0) return;

    try {
      let waypoints: any[] = [];
      let destination: any = { lat: driverLocation.lat, lng: driverLocation.lng };

      if (optimizedOrder.length > 0) {
        // Use optimized order
        const orderedLocations = optimizedOrder.map(id => 
          validLocations.find(loc => loc.id === id)
        ).filter(Boolean);

        if (orderedLocations.length > 0) {
          waypoints = orderedLocations.slice(0, -1).map(loc => ({
            location: { lat: loc!.latitude!, lng: loc!.longitude! },
            stopover: true
          }));
          
          const lastLocation = orderedLocations[orderedLocations.length - 1];
          destination = { lat: lastLocation!.latitude!, lng: lastLocation!.longitude! };
        }
      } else {
        // Use original order
        waypoints = validLocations.slice(0, -1).map(loc => ({
          location: { lat: loc.latitude!, lng: loc.longitude! },
          stopover: true
        }));
        
        if (validLocations.length > 0) {
          const lastLocation = validLocations[validLocations.length - 1];
          destination = { lat: lastLocation.latitude!, lng: lastLocation.longitude! };
        }
      }

      const request = {
        origin: { lat: driverLocation.lat, lng: driverLocation.lng },
        destination: destination,
        waypoints: waypoints,
        optimizeWaypoints: false,
        travelMode: window.google.maps.TravelMode.DRIVING,
        avoidHighways: false,
        avoidTolls: false
      };

      directionsServiceRef.current.route(request, (result: any, status: any) => {
        if (status === 'OK') {
          routeRendererRef.current.setDirections(result);
          
          // Calculate route metrics from Google's result
          const route = result.routes[0];
          let totalDistance = 0;
          let totalDuration = 0;

          route.legs.forEach((leg: any) => {
            totalDistance += leg.distance.value / 1000; // Convert to km
            totalDuration += leg.duration.value / 3600; // Convert to hours
          });

          setRouteMetrics(prev => ({
            ...prev,
            totalDistance,
            totalDuration
          }));
          
          // toast.success('🛣️ Route visualization loaded!');
        } else {
          console.error('Directions request failed:', status);
          
          if (status === 'REQUEST_DENIED') {
            console.error('❌ Directions API not enabled or billing issue');
            setLocationError('Directions API not enabled. Map markers work, but route lines need Directions API to be enabled in Google Cloud Console.');
            // toast.error('📍 Map works! Enable Directions API for route lines');
          } else {
            // toast.error(`Route calculation failed: ${status}`);
          }
        }
      });
    } catch (error) {
      console.error('Error drawing route:', error);
    }
  }, [deliveryLocations, optimizedOrder, driverLocation]);

  // Load delivery locations
  const loadDeliveryLocations = useCallback(async () => {
    if (!batchId) return;

    console.log('🚀 Starting loadDeliveryLocations with batchId:', batchId);

    try {
      setLoading(true);
      

      console.log('🔍 About to query orders for batchId:', batchId);
      
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          id,
          total,
          delivery_status,
          delivery_address,
          customer:profiles!orders_customer_id_fkey(name)
        `)
        .eq('batch_id', batchId)
        .eq('approval_status', 'approved');
        
      console.log('🔍 Supabase query completed. Orders:', orders);
      console.log('🔍 Supabase query error:', error);

      if (error) throw error;

      console.log('📦 Fetched orders with items:', orders);
      console.log('📦 Number of orders:', orders?.length);
      
      // Enhanced debugging for each order
      if (orders && orders.length > 0) {
        orders.forEach((order, index) => {
          console.log(`📦 Order ${index + 1}:`, {
            id: order.id,
            customer: order.customer?.name,
            total: order.total,
            delivery_status: order.delivery_status
          });
        });
      }

      // Fetch order items separately for better reliability
      let directOrderItems: any[] = [];
      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        console.log('🔍 Fetching order items for order IDs:', orderIds);
        
        const { data: directItems, error: directError } = await supabase
          .from('order_items')
          .select(`
            id,
            order_id,
            quantity,
            price,
            product:products(name, image_url)
          `)
          .in('order_id', orderIds);
        
        directOrderItems = directItems || [];
        console.log('🔍 Direct order_items query result:', directOrderItems);
        
        if (directError) {
          console.error('❌ Error fetching order items:', directError);
        }
      }

      // Group items by order_id
      const itemsByOrder = directOrderItems.reduce((acc: Record<string, any[]>, item: any) => {
        if (!acc[item.order_id]) {
          acc[item.order_id] = [];
        }
        acc[item.order_id].push(item);
        return acc;
      }, {} as Record<string, any[]>);

      console.log('📦 Items grouped by order:', itemsByOrder);

      const locations: ExtendedDeliveryLocation[] = (orders || []).map(order => {
        // Use the direct query results
        const orderItems = itemsByOrder[order.id] || [];
        
        console.log(`📍 Creating location for order ${order.id}:`, {
          orderId: order.id,
          customerName: order.customer?.name,
          itemsCount: orderItems.length,
          items: orderItems
        });

        return {
          id: order.id,
          order_id: order.id,
          customer_name: order.customer?.name || 'Customer',
          address: order.delivery_address?.street_address || '',
          barangay: order.delivery_address?.barangay || 'Unknown',
          latitude: (order.delivery_address as any)?.latitude || null,
          longitude: (order.delivery_address as any)?.longitude || null,
          phone: order.delivery_address?.phone || '',
          total: order.total,
          delivery_status: order.delivery_status,
          priority: order.delivery_status === 'pending' ? 5 : 3,
          order_items: orderItems
        };
      });

      setDeliveryLocations(locations);
      
      // Force refresh markers after data is loaded
      setTimeout(() => {
        console.log('🔄 Force refreshing markers after data load...');
        updateMapMarkers();
      }, 1000);
      
    } catch (error) {
      console.error('Error loading delivery locations:', error);
      // toast.error('Failed to load delivery locations');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

        // Route optimization with dual route comparison
  const optimizeRoute = async () => {
    if (!deliveryLocations.length) return;
    
    setIsOptimizing(true);
    try {
      const validLocations = deliveryLocations.filter(loc => loc.latitude && loc.longitude);
      if (validLocations.length === 0) {
        // toast.error('No valid delivery locations found');
        return;
      }

      console.log('🧬 Starting Order Crossover (OX) genetic algorithm optimization...');
      
      // CDO depot location
      const depot: DepotLocation = {
        latitude: 8.4542,
        longitude: 124.6319,
        name: "DeliveryEase Depot",
        address: "Cagayan de Oro City, Philippines"
      };
      
      const optimizer = new GeneticRouteOptimizer({
        dual_route_comparison: true,
        population_size: 120,
        max_generations: 400,
        mutation_rate: 0.025
      }, depot);
      
      const optimizedRoute = await optimizer.optimizeRoute(validLocations);

      setOptimizedOrder(optimizedRoute.locations.map(loc => loc.id));
      setRouteMetrics({
        totalDistance: optimizedRoute.total_distance_km,
        totalDuration: optimizedRoute.estimated_time_hours,
        optimizationScore: optimizedRoute.optimization_score,
        fuelCostEstimate: optimizedRoute.fuel_cost_estimate,
        fitnessScore: optimizedRoute.fitness_score,
        routeComparisonData: optimizedRoute.route_comparison_data
      });

      // Reset current stop index to 0 after optimization
      setCurrentStopIndex(0);

      if (onRouteOptimized) {
        onRouteOptimized(optimizedRoute);
      }

      // Enhanced success message with dual route comparison and crossover data
      let successMessage = `🎯 Route optimized! ${optimizedRoute.optimization_score.toFixed(1)}% efficiency - ${optimizedRoute.total_distance_km.toFixed(1)}km`;
      
      if (optimizedRoute.route_comparison_data) {
        const comparison = optimizedRoute.route_comparison_data;
        
        if (comparison.crossover_data?.improved_from_parents) {
          successMessage += ` (Crossover optimization: ${comparison.distance_improvement.toFixed(1)}km saved)`;
        } else {
          successMessage += ` (Route ${comparison.selected_route} selected - ${comparison.distance_improvement.toFixed(1)}km shorter)`;
        }
        
        console.log('📊 Order Crossover Optimization Results:');
        console.log(`   Parent 1 (Route A): ${comparison.route_a.total_distance_km.toFixed(2)}km (fitness: ${comparison.route_a.fitness_score.toFixed(2)})`);
        console.log(`   Parent 2 (Route B): ${comparison.route_b.total_distance_km.toFixed(2)}km (fitness: ${comparison.route_b.fitness_score.toFixed(2)})`);
        console.log(`   Selected: Route ${comparison.selected_route}`);
        console.log(`   Distance saved: ${comparison.distance_improvement.toFixed(2)}km`);
        console.log(`   Fitness improvement: ${comparison.fitness_improvement.toFixed(2)}`);
        
        if (comparison.crossover_data) {
          console.log(`   Crossover iterations: ${comparison.crossover_data.iterations}`);
          console.log(`   Crossover improved route: ${comparison.crossover_data.improved_from_parents ? 'Yes' : 'No'}`);
          console.log(`   Final crossover distance: ${comparison.crossover_data.final_distance.toFixed(2)}km`);
          console.log(`   Final crossover fitness: ${comparison.crossover_data.final_fitness.toFixed(2)}`);
        }
      }
      
      // toast.success(successMessage, { duration: 5000 });
      
      // Update markers to show optimized order
      updateMapMarkers();
      
      // Try to draw route visualization (will show error if Directions API not enabled)
      setTimeout(drawRouteOnMap, 500);
    } catch (error) {
      console.error('Error optimizing route:', error);
      // toast.error('Failed to optimize route');
    } finally {
      setIsOptimizing(false);
    }
  };

  // Navigation controls
  const startNavigation = () => {
    setIsNavigating(true);
    toast.success('🧭 GPS navigation started!');
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    toast('Navigation stopped');
  };

  const markStopCompleted = (stopId: string) => {
    setCompletedStops(prev => new Set([...prev, stopId]));
    
    // Use optimized order for current stop tracking
    if (optimizedOrder.length > 0) {
      const currentOptimizedIndex = optimizedOrder.findIndex(id => id === stopId);
      if (currentOptimizedIndex !== -1 && currentOptimizedIndex < optimizedOrder.length - 1) {
        setCurrentStopIndex(currentOptimizedIndex + 1);
      }
    } else {
      // Fallback to original array index if no optimized order
      const currentIndex = deliveryLocations.findIndex(loc => loc.id === stopId);
      if (currentIndex !== -1 && currentIndex < deliveryLocations.length - 1) {
        setCurrentStopIndex(currentIndex + 1);
      }
    }
    
    // toast.success('✅ Stop marked as completed!');
    updateMapMarkers();
  };

  const resetRoute = () => {
    setCompletedStops(new Set());
    setCurrentStopIndex(0);
    setIsNavigating(false);
    setOptimizedOrder([]);
    // toast('Route reset to beginning');
    updateMapMarkers();
    drawRouteOnMap();
  };

  // Helper function to get delivery locations sorted by optimized order
  const getSortedDeliveryLocations = () => {
    if (optimizedOrder.length === 0) {
      return deliveryLocations; // Return original order if no optimization
    }
    
    // Sort delivery locations by optimized order
    const sortedLocations = optimizedOrder.map(id => 
      deliveryLocations.find(loc => loc.id === id)
    ).filter(Boolean) as DeliveryLocation[];
    
    // Add any locations not in optimized order (edge case)
    const missingLocations = deliveryLocations.filter(loc => 
      !optimizedOrder.includes(loc.id)
    );
    
    return [...sortedLocations, ...missingLocations];
  };

  // Initialize
  useEffect(() => {
    getCurrentLocation();
    // Start real-time location tracking
    startLocationTracking();
    
    // Cleanup function to stop tracking when component unmounts
    return () => {
      stopLocationTracking();
    };
  }, [getCurrentLocation, startLocationTracking, stopLocationTracking]);

  useEffect(() => {
    console.log('🔄 useEffect triggered with batchId:', batchId);
    if (batchId) {
      console.log('✅ Calling loadDeliveryLocations with batchId:', batchId);
      loadDeliveryLocations();
    } else {
      console.log('❌ No batchId provided');
    }
  }, [batchId, loadDeliveryLocations]);

  useEffect(() => {
    loadGoogleMaps();
  }, [loadGoogleMaps]);

  useEffect(() => {
    if (!mapLoading && deliveryLocations.length > 0 && driverLocation) {
      updateMapMarkers();
      drawRouteOnMap();
      // Auto-optimize route when locations are loaded
      if (optimizedOrder.length === 0) {
        console.log('🚀 Auto-optimizing route with genetic algorithm...');
        optimizeRoute();
      }
    }
  }, [deliveryLocations, mapLoading, driverLocation, updateMapMarkers, drawRouteOnMap, optimizedOrder.length]);

  if (loading) {
    return (
      <Card className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
        <p className="text-gray-600">Loading delivery locations...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Driver Location Status */}
      {driverLocation && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-800">🚚 {driverLocation.name}</h3>
                  <p className="text-sm text-blue-600">{driverLocation.address}</p>
                  <p className={`text-xs ${isTrackingLocation ? 'text-green-500' : 'text-blue-500'}`}>
                    {isTrackingLocation ? '📍 Live Tracking Active' : '📍 Route Starting Point'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Coords: {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
                  </p>
                  {isGpsLoading && (
                    <p className="text-xs text-blue-600 font-medium animate-pulse">
                      🔄 Acquiring GPS location...
                    </p>
                  )}
                  {isTrackingLocation && !isGpsLoading && (
                    <p className="text-xs text-green-600 font-medium animate-pulse">
                      🟢 Real-time GPS tracking enabled
                    </p>
                  )}
                  {locationError && (
                    <p className="text-xs text-orange-600 font-medium">
                      ⚠️ {locationError}
                    </p>
                  )}
                  <button
                    onClick={isTrackingLocation ? stopLocationTracking : startLocationTracking}
                    disabled={isGpsLoading}
                    className={`mt-2 px-3 py-1 rounded text-xs font-medium ${
                      isGpsLoading 
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : isTrackingLocation 
                        ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {isGpsLoading ? '⏳ Loading GPS...' : isTrackingLocation ? '⏹️ Stop Tracking' : '▶️ Start Tracking'}
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interactive Map */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="relative">
            {locationError ? (
              // Show other map errors
              <div className="w-full h-[50vh] bg-yellow-50 border-2 border-yellow-200 flex items-center justify-center">
                <div className="text-center p-8 max-w-md">
                  <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MapPin className="h-8 w-8 text-yellow-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-yellow-800 mb-2">Map Unavailable</h3>
                  <p className="text-yellow-600 mb-4">{locationError}</p>
                  <Button
                    onClick={() => {
                      setLocationError(null);
                      setMapLoading(true);
                      loadGoogleMaps();
                    }}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Retry Loading Map
                  </Button>
                </div>
              </div>
            ) : (
              // Show normal map
              <>
                <div
                  ref={mapRef}
                  className="w-full h-[50vh]"
                />
                {mapLoading && (
                  <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-gray-600">Loading map...</p>
                    </div>
                  </div>
                )}
                {!mapLoading && !locationError && (
                  <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span>Driver</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        <span>Current</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span>Completed</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                        <span>Pending</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delivery Stops Summary */}
      {getSortedDeliveryLocations().length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Delivery Progress ({completedStops.size}/{getSortedDeliveryLocations().length} completed)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {getSortedDeliveryLocations().map((location, index) => {
                const isCompleted = completedStops.has(location.id);
                
                // For sorted list, the index IS the sequence number
                const sequenceNumber = index + 1;
                const isCurrent = index === currentStopIndex && !isCompleted;
                
                return (
                  <div
                    key={location.id}
                    className={`p-3 rounded-lg border ${
                      isCompleted 
                        ? 'bg-green-50 border-green-200' 
                        : isCurrent 
                        ? 'bg-yellow-50 border-yellow-200' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                        isCompleted ? 'bg-green-500' : isCurrent ? 'bg-yellow-500' : 'bg-gray-400'
                      }`}>
                        {isCompleted ? '✓' : sequenceNumber}
                      </div>
                      <span className="font-semibold text-green-600">₱{location.total.toLocaleString()}</span>
                    </div>
                    <p className="font-medium text-gray-900 text-sm">{location.customer_name}</p>
                    <p className="text-xs text-gray-600">{location.address}</p>
                    <p className="text-xs text-blue-600 font-medium">{location.barangay}</p>
                    
                    {!isCompleted && isCurrent && (
                      <Button
                        size="sm"
                        onClick={() => markStopCompleted(location.id)}
                        className="bg-green-600 hover:bg-green-700 text-white mt-2 w-full"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Complete Stop
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {deliveryLocations.length === 0 && (
        <Card className="p-6 text-center">
          <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Delivery Locations</h3>
          <p className="text-gray-600">No approved orders found for this batch.</p>
        </Card>
      )}
    </div>
  );
} 