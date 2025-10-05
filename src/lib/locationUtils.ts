/**
 * Location utilities for better geolocation accuracy
 */

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  source: 'gps' | 'network' | 'cached';
}

/**
 * Get current location with multiple fallback strategies
 * This function tries different approaches to get the most accurate location
 */
export function getCurrentLocationWithFallback(): Promise<LocationResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    const strategies = [
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
        description: 'High accuracy GPS (no cache)'
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
        description: 'High accuracy GPS retry'
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 0,
        description: 'Network-based location'
      }
    ];

    let currentStrategy = 0;

    const tryLocation = () => {
      if (currentStrategy >= strategies.length) {
        reject(new Error('All location strategies failed'));
        return;
      }

      const config = strategies[currentStrategy];
      console.log(`🔍 Trying location strategy ${currentStrategy + 1}: ${config.description}`);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          
          console.log(`📍 Location acquired:`, {
            lat: latitude,
            lng: longitude,
            accuracy: `${Math.round(accuracy || 0)}m`,
            strategy: config.description
          });

          // Check if accuracy is acceptable
          const maxAccuracy = config.enableHighAccuracy ? 50 : 200;
          if (accuracy && accuracy > maxAccuracy && currentStrategy < strategies.length - 1) {
            console.log(`⚠️ Accuracy too low (${Math.round(accuracy)}m), trying next strategy...`);
            currentStrategy++;
            tryLocation();
            return;
          }

          resolve({
            latitude,
            longitude,
            accuracy: accuracy || 0,
            source: config.enableHighAccuracy ? 'gps' : 'network'
          });
        },
        (error) => {
          console.error(`❌ Strategy ${currentStrategy + 1} failed:`, error);
          currentStrategy++;
          tryLocation();
        },
        config
      );
    };

    tryLocation();
  });
}

/**
 * Check if location is in a specific area (useful for barangay detection)
 */
export function isLocationInArea(
  lat: number, 
  lng: number, 
  centerLat: number, 
  centerLng: number, 
  radiusKm: number
): boolean {
  const distance = calculateDistance(lat, lng, centerLat, centerLng);
  return distance <= radiusKm;
}

/**
 * Calculate distance between two coordinates in kilometers
 */
export function calculateDistance(
  lat1: number, 
  lng1: number, 
  lat2: number, 
  lng2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Clear browser location cache
 * This helps force fresh location data
 */
export function clearLocationCache(): void {
  // Clear any stored location data
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        if (name.includes('location') || name.includes('geolocation')) {
          caches.delete(name);
        }
      });
    });
  }
  
  // Clear localStorage location data
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.includes('location') || key.includes('geolocation') || key.includes('position')) {
      localStorage.removeItem(key);
    }
  });
  
  console.log('🧹 Location cache cleared');
}






