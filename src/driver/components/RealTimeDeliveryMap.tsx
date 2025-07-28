import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Minimize,
  Home,
  Eye,
  Package
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
      weight: number;
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
  const navigate = useNavigate();
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
  const isCompletingStopRef = useRef<boolean>(false);
  const autoRedirectRef = useRef<NodeJS.Timeout | null>(null);

  // Enhanced real-time location tracking with better error handling
  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Real-time tracking not supported');
      return;
    }

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
        let errorMessage = 'Real-time tracking failed';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied for real-time tracking.';
            setIsTrackingLocation(false);
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable for tracking.';
            // Continue tracking, might recover
            break;
          case error.TIMEOUT:
            errorMessage = 'Location update delayed. Continuing tracking...';
            // Don't stop tracking on timeout, just log it
            break;
        }
        
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
      setLocationError('Location unavailable. Using approximate location.');
      setDriverLocation({
        lat: DEFAULT_LOCATION.lat,
        lng: DEFAULT_LOCATION.lng,
        name: "Driver Location (Fallback)",
        address: DEFAULT_LOCATION.address
      });
      return;
    }
    
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
          if (i === geolocationConfigs.length - 1) {
            // Last attempt failed, use fallback
            throw error;
          }
        }
      }
    } catch (error) {
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

    if (window.google && window.google.maps) {
      initializeMap();
      return;
    }

    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      // Script already loading, wait for it
      window.initGoogleMaps = initializeMap;
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=geometry&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    
    // Add error handling for script loading
    script.onerror = (error) => {
      setMapLoading(false);
      setLocationError('Failed to load Google Maps API. This could be due to: invalid API key, disabled APIs, network issues, or billing problems.');
    };
    
    script.onload = () => {
      // Script loaded successfully
    };
    
    window.initGoogleMaps = () => {
      try {
        if (window.google && window.google.maps) {
          initializeMap();
        } else {
          setMapLoading(false);
          setLocationError('Google Maps failed to initialize. Check API key permissions.');
        }
      } catch (error) {
        setMapLoading(false);
        setLocationError(`Google Maps initialization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    document.head.appendChild(script);
    
    // Set a timeout to catch loading issues
    setTimeout(() => {
      if (!window.google && mapLoading) {
        setMapLoading(false);
        setLocationError('Google Maps loading timeout. Check: API key validity, Maps JavaScript API enabled, billing setup, network connection.');
      }
    }, 15000);
  }, [mapLoading]);

  // Initialize the map
  const initializeMap = useCallback(() => {
    if (!mapRef.current) {
      setTimeout(() => {
        if (mapRef.current) {
          initializeMap();
        } else {
          setTimeout(() => {
            if (mapRef.current) {
              initializeMap();
            } else {
              setMapLoading(false);
              setLocationError('Map container not ready. Please refresh the page.');
            }
          }, 500);
        }
      }, 100);
      return;
    }
    
    if (!window.google) {
      return;
    }
    
    if (!window.google.maps) {
      return;
    }

    try {
      // Use driver location or fallback to default
      const mapCenter = driverLocation || DEFAULT_LOCATION;
      
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

      mapInstanceRef.current = map;
      
      directionsServiceRef.current = new window.google.maps.DirectionsService();
      
      routeRendererRef.current = new window.google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#2563eb',
          strokeWeight: 4,
          strokeOpacity: 0.8
        }
      });
      
      routeRendererRef.current.setMap(map);
      
      setMapLoading(false);
      updateMapMarkers();
    } catch (error) {
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

    // Get the sorted delivery locations to ensure consistency with delivery progress
    const sortedLocations = getSortedDeliveryLocations();

    // Add delivery location markers with correct optimized sequence numbers
    sortedLocations.forEach((location, index) => {
      if (!location.latitude || !location.longitude) return;

      const isCompleted = completedStops.has(location.id);
      
      // The index in sorted locations IS the sequence number
      const sequenceNumber = index + 1;
      const optimizedIndex = index; // Use the sorted index
      
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
      
      let orderItemsHtml = '';
      if (extendedLocation.order_items && extendedLocation.order_items.length > 0) {
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
        } else {
          if (status === 'REQUEST_DENIED') {
            setLocationError('Directions API not enabled. Map markers work, but route lines need Directions API to be enabled in Google Cloud Console.');
          }
        }
      });
    } catch (error) {
      // Handle error silently
    }
  }, [deliveryLocations, optimizedOrder, driverLocation]);

  // Load delivery locations
  const loadDeliveryLocations = useCallback(async () => {
    if (!batchId) return;

    try {
      setLoading(true);
      
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

      console.log('🔍 Orders query result:', { orders, error });
      if (orders && orders.length > 0) {
        console.log('🔍 First order:', orders[0]);
      }

      if (error) throw error;

      // Fetch order items separately for better reliability
      let directOrderItems: any[] = [];
      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        
        // Test direct access to order_items
        console.log('🔍 Testing direct order_items access for order IDs:', orderIds);
        
        const { data: directItems, error: directError } = await supabase
          .from('order_items')
          .select(`
            id,
            order_id,
            quantity,
            price,
            product:products(name, image_url, weight)
          `)
          .in('order_id', orderIds);
        
        console.log('🔍 Direct order items query result:', { directItems, directError });
        if (directItems && directItems.length > 0) {
          console.log('🔍 First direct item:', directItems[0]);
        } else {
          console.log('🔍 No order items found. This might be an RLS policy issue.');
          
          // Test with a single order to see if it's a batch issue
          if (orderIds.length > 0) {
            const { data: singleOrderItems, error: singleError } = await supabase
              .from('order_items')
              .select('*')
              .eq('order_id', orderIds[0]);
            
            console.log('🔍 Single order test:', { singleOrderItems, singleError });
          }
        }
        
        directOrderItems = directItems || [];
      }

      // Group items by order_id
      const itemsByOrder = directOrderItems.reduce((acc: Record<string, any[]>, item: any) => {
        if (!acc[item.order_id]) {
          acc[item.order_id] = [];
        }
        acc[item.order_id].push(item);
        return acc;
      }, {} as Record<string, any[]>);

      const locations: ExtendedDeliveryLocation[] = (orders || []).map(order => {
        // Use the direct query results
        const orderItems = itemsByOrder[order.id] || [];
        
        console.log(`🔍 Order ${order.id} (${order.customer?.name}) has ${orderItems.length} items:`, orderItems);

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
      
      // Initialize completedStops based on orders already marked as 'delivered'
      const completedOrderIds = new Set<string>();
      const deliveredOrders = locations.filter(loc => loc.delivery_status === 'delivered');
      deliveredOrders.forEach(order => completedOrderIds.add(order.id));
      
      console.log('🔄 Loading delivery locations from database:');
      console.log('   Total orders:', locations.length);
      console.log('   Delivered orders:', deliveredOrders.length);
      console.log('   Delivered order IDs:', Array.from(completedOrderIds));
      console.log('   All order statuses:', locations.map(loc => `${loc.customer_name}: ${loc.delivery_status}`));
      
      setCompletedStops(completedOrderIds);
      
      // Set current stop index to first uncompleted delivery
      const firstUncompletedIndex = locations.findIndex(loc => 
        !completedOrderIds.has(loc.id)
      );
      
      console.log('   First uncompleted index:', firstUncompletedIndex);
      console.log('   Completed order IDs from DB:', Array.from(completedOrderIds));
      console.log('   All locations with their completion status:');
      locations.forEach((loc, idx) => {
        console.log(`     ${idx}: ${loc.customer_name} - ${loc.delivery_status} - completed: ${completedOrderIds.has(loc.id)}`);
      });
      
      if (firstUncompletedIndex !== -1) {
        setCurrentStopIndex(firstUncompletedIndex);
        console.log('   Current stop set to:', firstUncompletedIndex);
        console.log('   Next stop to complete:', locations[firstUncompletedIndex]?.customer_name);
      } else {
        // All deliveries are completed
        setCurrentStopIndex(locations.length);
        console.log('   All deliveries completed, current stop set to:', locations.length);
      }
      
      // Force refresh markers after data is loaded
      setTimeout(() => {
        updateMapMarkers();
      }, 100);
      
    } catch (error) {
      // Handle error silently
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

      const newOptimizedOrder = optimizedRoute.locations.map(loc => loc.id);
      setOptimizedOrder(newOptimizedOrder);
      
      setRouteMetrics({
        totalDistance: optimizedRoute.total_distance_km,
        totalDuration: optimizedRoute.estimated_time_hours,
        optimizationScore: optimizedRoute.optimization_score,
        fuelCostEstimate: optimizedRoute.fuel_cost_estimate,
        fitnessScore: optimizedRoute.fitness_score,
        routeComparisonData: optimizedRoute.route_comparison_data
      });

      // Only reset current stop index if no stops are completed yet
      if (completedStops.size === 0) {
        setCurrentStopIndex(0);
        console.log('🔄 Route optimized, resetting current stop to 0 (no completed stops)');
      } else {
        console.log('🔄 Route optimized, keeping current stop index:', currentStopIndex, '(some stops already completed)');
      }

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
      }
      
      // toast.success(successMessage, { duration: 5000 });
      
      // Update markers to show optimized order
      updateMapMarkers();
      
      // Try to draw route visualization (will show error if Directions API not enabled)
      setTimeout(drawRouteOnMap, 500);
    } catch (error) {
      // Handle error silently
    } finally {
      setIsOptimizing(false);
    }
  };

  // Navigation controls
  const startNavigation = () => {
    setIsNavigating(true);
  };

  const stopNavigation = () => {
    setIsNavigating(false);
  };

  const markStopCompleted = async (stopId: string) => {
    try {
      // Prevent map resets during completion
      isCompletingStopRef.current = true;
      console.log('🚚 Marking stop as completed:', stopId);
      
      // First, check if the driver has permission to update this order
      console.log('🔐 Checking driver permissions for batch:', batchId);
      
      const hasPermission = await verifyDriverPermissions();
      if (!hasPermission) {
        toast.error('Permission denied: You can only update orders in your assigned batches');
        return;
      }
      
      // Update the order status to 'delivered' in the database
      const { data, error: updateError } = await supabase
        .from('orders')
        .update({ 
          delivery_status: 'delivered'
        })
        .eq('id', stopId)
        .select();

      if (updateError) {
        console.error('❌ Error updating order status:', updateError);
        console.error('   Error details:', {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint
        });
        
        // Check if it's a permission error
        if (updateError.code === 'PGRST116') {
          toast.error('Permission denied: You can only update orders in your assigned batches');
        } else {
          toast.error(`Failed to update order status: ${updateError.message}`);
        }
        return;
      }

      console.log('✅ Order status updated successfully:', data);

      // Update local state immediately
      setCompletedStops(prev => new Set([...prev, stopId]));
      
      // Get sorted delivery locations
      const sortedLocations = getSortedDeliveryLocations();
      console.log('📍 Current sorted locations:', sortedLocations.map(loc => `${loc.customer_name} (${loc.id.slice(0, 8)})`));
      
      // Find the current stop index in the sorted locations
      const currentStopLocation = sortedLocations[currentStopIndex];
      console.log('🎯 Current stop index:', currentStopIndex, 'Current stop:', currentStopLocation?.customer_name);
      
      // Check if the completed stop is the current stop
      if (currentStopLocation && currentStopLocation.id === stopId) {
        console.log('✅ Completed stop matches current stop, advancing to next...');
        
        // Create updated completed stops set including the just-completed stop
        const updatedCompletedStops = new Set([...completedStops, stopId]);
        
        // Find next uncompleted stop
        let nextIndex = currentStopIndex + 1;
        while (nextIndex < sortedLocations.length) {
          const nextLocation = sortedLocations[nextIndex];
          const isNextCompleted = updatedCompletedStops.has(nextLocation.id);
          
          if (!isNextCompleted) {
            console.log(`➡️  Advancing to next stop: ${nextLocation.customer_name} (index: ${nextIndex})`);
            setCurrentStopIndex(nextIndex);
            break;
          }
          nextIndex++;
        }
        
        // If no next uncompleted stop found, all are completed
        if (nextIndex >= sortedLocations.length) {
          console.log('🎉 All stops completed!');
          setCurrentStopIndex(sortedLocations.length);
          
          // Update batch status to delivered
          const { error: batchError } = await supabase
            .from('order_batches')
            .update({ 
              status: 'delivered'
            })
            .eq('id', batchId);

          if (batchError) {
            console.error('Error updating batch status:', batchError);
          } else {
            toast.success('🎉 All deliveries completed! Batch marked as finished.');
          }
        }
      } else {
        console.log('⚠️  Completed stop does not match current stop, no navigation change needed');
      }
      

      
      // Show success message for individual order completion
      const completedOrder = sortedLocations.find(loc => loc.id === stopId);
      if (completedOrder) {
        toast.success(`✅ ${completedOrder.customer_name} - Order delivered successfully!`);
      }
      
      // Always check if all orders are completed and update batch status accordingly
      const finalCompletedStops = new Set([...completedStops, stopId]);
      const allOrdersCompleted = sortedLocations.every(location => finalCompletedStops.has(location.id));
      
      if (allOrdersCompleted) {
        console.log('🎉 All orders in batch completed, updating batch status to delivered');
        
        const { error: batchError } = await supabase
          .from('order_batches')
          .update({ 
            status: 'delivered'
          })
          .eq('id', batchId);

        if (batchError) {
          console.error('Error updating batch status:', batchError);
        } else {
          toast.success('🎉 All deliveries completed! Batch marked as finished.');
        }
      }
      
      // Update map markers without full reload to preserve map state
      console.log('🗺️  Updating map markers...');
      updateMapMarkers();
      
    } catch (error) {
      console.error('Error completing stop:', error);
      toast.error('Failed to complete delivery stop');
    } finally {
      // Allow map updates again after completion
      isCompletingStopRef.current = false;
    }
  };

  // Verify driver permissions and batch assignment
  const verifyDriverPermissions = async () => {
    try {
      console.log('🔐 Verifying driver permissions for batch:', batchId);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ No authenticated user found');
        return false;
      }
      
      console.log('👤 Current user ID:', user.id);
      
      // Check if the batch is assigned to this driver
      const { data: batchData, error: batchError } = await supabase
        .from('order_batches')
        .select('driver_id, status')
        .eq('id', batchId)
        .single();
        
      if (batchError) {
        console.error('❌ Error checking batch assignment:', batchError);
        return false;
      }
      
      console.log('📦 Batch data:', batchData);
      
      if (batchData.driver_id !== user.id) {
        console.error('❌ Batch not assigned to current driver');
        console.error('   Batch driver ID:', batchData.driver_id);
        console.error('   Current user ID:', user.id);
        return false;
      }
      
      console.log('✅ Driver has permission to update orders in this batch');
      return true;
      
    } catch (error) {
      console.error('❌ Error verifying permissions:', error);
      return false;
    }
  };

  const resetRoute = () => {
    setCompletedStops(new Set());
    setCurrentStopIndex(0);
    setIsNavigating(false);
    setOptimizedOrder([]);
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
    if (batchId) {
      console.log('🔄 Initial load of delivery locations for batch:', batchId);
      loadDeliveryLocations();
    }
  }, [batchId]); // Remove loadDeliveryLocations from dependencies to prevent infinite loops

  useEffect(() => {
    loadGoogleMaps();
  }, [loadGoogleMaps]);

  useEffect(() => {
    // Don't update map if we're in the middle of completing a stop
    if (isCompletingStopRef.current) {
      console.log('⏸️  Skipping map update during stop completion');
      return;
    }
    
    if (!mapLoading && deliveryLocations.length > 0 && driverLocation) {
      updateMapMarkers();
      drawRouteOnMap();
      // Auto-optimize route when locations are loaded
      if (optimizedOrder.length === 0) {
        optimizeRoute();
      }
    }
  }, [deliveryLocations, mapLoading, driverLocation, updateMapMarkers, drawRouteOnMap, optimizedOrder.length]);

  // Auto-redirect when all orders are completed
  useEffect(() => {
    if (getSortedDeliveryLocations().length > 0 && completedStops.size === getSortedDeliveryLocations().length) {
      console.log('🎉 All orders completed, setting auto-redirect...');
      
      // Clear any existing timeout
      if (autoRedirectRef.current) {
        clearTimeout(autoRedirectRef.current);
      }
      
      // Set auto-redirect after 5 seconds
      autoRedirectRef.current = setTimeout(() => {
        console.log('🔄 Auto-redirecting to dashboard...');
        window.location.href = '/driver';
      }, 5000);
      
      // Cleanup function
      return () => {
        if (autoRedirectRef.current) {
          clearTimeout(autoRedirectRef.current);
        }
      };
    }
  }, [completedStops.size, getSortedDeliveryLocations().length]);

  // Force re-optimization when delivery locations change significantly
  useEffect(() => {
    // Don't re-optimize if we're in the middle of completing a stop
    if (isCompletingStopRef.current) {
      console.log('⏸️  Skipping re-optimization during stop completion');
      return;
    }
    
    if (deliveryLocations.length > 0 && optimizedOrder.length > 0) {
      // Check if the optimized order still matches the current delivery locations
      const currentLocationIds = deliveryLocations.map(loc => loc.id).sort();
      const optimizedLocationIds = [...optimizedOrder].sort();
      
      // Only re-optimize if the actual delivery locations (not just their status) have changed
      // This prevents re-optimization when only delivery_status changes
      if (JSON.stringify(currentLocationIds) !== JSON.stringify(optimizedLocationIds)) {
        console.log('🔄 Delivery locations changed, re-optimizing route...');
        setOptimizedOrder([]); // Clear optimized order to trigger re-optimization
      } else {
        console.log('✅ Delivery locations unchanged, keeping current optimization');
      }
    }
  }, [deliveryLocations, optimizedOrder]);

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

      {/* All Orders Completed Success Screen */}
      {getSortedDeliveryLocations().length > 0 && completedStops.size === getSortedDeliveryLocations().length && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-green-800 mb-2">🎉 All Deliveries Completed!</h3>
            <p className="text-green-600 mb-4">
              Great job! You've successfully completed all {getSortedDeliveryLocations().length} deliveries in this batch.
            </p>
            
            {/* Delivery Summary */}
            <div className="bg-white rounded-lg p-4 mb-4 text-left">
              <h4 className="font-semibold text-gray-800 mb-2">📊 Delivery Summary</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Total Orders:</span>
                  <span className="font-medium ml-2">{getSortedDeliveryLocations().length}</span>
                </div>
                <div>
                  <span className="text-gray-600">Total Value:</span>
                  <span className="font-medium ml-2">₱{getSortedDeliveryLocations().reduce((sum, loc) => sum + loc.total, 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-600">Route Distance:</span>
                  <span className="font-medium ml-2">{routeMetrics.totalDistance.toFixed(1)} km</span>
                </div>
                <div>
                  <span className="text-gray-600">Estimated Time:</span>
                  <span className="font-medium ml-2">{routeMetrics.totalDuration.toFixed(1)} hours</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => window.location.href = '/driver'}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Home className="h-4 w-4 mr-2" />
                Return to Dashboard
              </Button>
              <Button
                onClick={() => {
                  setCompletedStops(new Set());
                  setCurrentStopIndex(0);
                }}
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-50"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Route
              </Button>
            </div>
            
            <p className="text-xs text-green-500 mt-3">
              Auto-redirecting to dashboard in 5 seconds...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Delivery Stops Summary */}
      {getSortedDeliveryLocations().length > 0 && completedStops.size < getSortedDeliveryLocations().length && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Delivery Progress ({completedStops.size}/{getSortedDeliveryLocations().length} completed)
                </h3>


              </div>
              <button
                onClick={() => {
                  console.log('🔄 Manual refresh of delivery locations...');
                  loadDeliveryLocations();
                }}
                className="px-3 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200"
              >
                🔄 Refresh Status
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {getSortedDeliveryLocations().map((location, index) => {
                const isCompleted = completedStops.has(location.id);
                
                // For sorted list, the index IS the sequence number
                const sequenceNumber = index + 1;
                
                // Find the next uncompleted stop to highlight
                const nextUncompletedIndex = getSortedDeliveryLocations().findIndex(loc => 
                  !completedStops.has(loc.id)
                );
                const isNextToDeliver = index === nextUncompletedIndex && !isCompleted;
                

                

                
                return (
                  <div
                    key={location.id}
                    className={`p-3 rounded-lg border ${
                      isCompleted 
                        ? 'bg-green-50 border-green-200' 
                        : isNextToDeliver 
                        ? 'bg-yellow-50 border-yellow-200' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                        isCompleted ? 'bg-green-500' : isNextToDeliver ? 'bg-yellow-500' : 'bg-gray-400'
                      }`}>
                        {isCompleted ? '✓' : sequenceNumber}
                      </div>
                      <span className="font-semibold text-green-600">₱{location.total.toLocaleString()}</span>
                    </div>
                    <p className="font-medium text-gray-900 text-sm">{location.customer_name}</p>
                    <p className="text-xs text-gray-600">{location.address}</p>
                    <p className="text-xs text-blue-600 font-medium">{location.barangay}</p>
                    
                    {/* Order Items */}
                    {(location as ExtendedDeliveryLocation).order_items && (location as ExtendedDeliveryLocation).order_items!.length > 0 && (
                      <div className="mt-3 border-t pt-3">
                        <p className="text-sm font-semibold text-gray-800 mb-3">Order Items:</p>
                        <div className="space-y-3 max-h-40 overflow-y-auto">
                          {(location as ExtendedDeliveryLocation).order_items!.map((item: any, itemIndex: number) => (
                            <div key={itemIndex} className="flex items-center gap-3 bg-white rounded-lg p-3 border shadow-sm">
                              {item.product?.image_url ? (
                                <img
                                  src={item.product.image_url}
                                  alt={item.product.name}
                                  className="w-12 h-12 rounded-lg object-cover border"
                                />
                              ) : (
                                <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                                  <Package className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {item.product?.name || 'Unknown Product'}
                                </p>
                                <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
                                    Qty: {item.quantity}
                                  </span>
                                  {item.product?.weight && (
                                    <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-medium">
                                      {item.product.weight.toFixed(1)}kg
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-green-600">
                                  ₱{(item.price * item.quantity).toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-500">
                                  ₱{item.price.toLocaleString()} each
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {!isCompleted && (
                      <Button
                        size="sm"
                        onClick={() => markStopCompleted(location.id)}
                        className={`mt-3 w-full ${
                          isNextToDeliver 
                            ? 'bg-green-600 hover:bg-green-700 text-white' 
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
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