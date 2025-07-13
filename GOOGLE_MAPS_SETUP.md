# Google Maps Setup for Real-Time Delivery Map

## Overview
The real-time delivery map now shows an interactive Google Maps with actual routes connecting all delivery locations, just like a professional delivery app.

## Features
- 🗺️ **Interactive Map**: Real Google Maps with driver location and delivery markers
- 🛣️ **Route Visualization**: Blue route lines connecting all delivery stops
- 🎯 **Genetic Algorithm**: Optimizes delivery order for shortest distance
- 📍 **Smart Markers**: Color-coded markers (blue=driver, yellow=current, green=completed, gray=pending)
- 📊 **Live Metrics**: Distance, duration, optimization score, and fuel costs
- 🔄 **Route Controls**: Optimize, start/stop navigation, reset, expand map, refresh location

## Required Setup

### 1. Get Google Maps API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable these APIs:
   - **Maps JavaScript API**
   - **Directions API**
   - **Places API** (optional, for address search)

4. Go to "Credentials" → "Create Credentials" → "API Key"
5. Copy your API key

### 2. Configure API Key
Open `src/driver/components/RealTimeDeliveryMap.tsx` and replace:
```javascript
script.src = `https://maps.googleapis.com/maps/api/js?key=YOUR_GOOGLE_MAPS_API_KEY&libraries=geometry&callback=initGoogleMaps`;
```

With your actual API key:
```javascript
script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyC123...YOUR_ACTUAL_KEY&libraries=geometry&callback=initGoogleMaps`;
```

### 3. Driver Location (Automatic)
The map now automatically uses the driver's current GPS location as the starting point. No manual configuration needed! The system will:
- Request location permission when the page loads
- Use the driver's real-time GPS coordinates
- Fall back to Manila coordinates if location access is denied
- Show a "Refresh Location" button to update the driver's position

### 4. API Key Security (Production)
For production, restrict your API key:
1. In Google Cloud Console → Credentials
2. Click your API key → "Restrict Key"
3. Set "Application restrictions" to "HTTP referrers"
4. Add your domain: `https://yourdomain.com/*`
5. Set "API restrictions" to only the APIs you need

## How It Works

### 1. Map Display
- Shows driver's current location as blue circle marker
- Delivery locations as numbered markers (1, 2, 3...)
- Color coding: blue=driver location, gray=pending, yellow=current stop, green=completed
- Automatically requests GPS permission and updates driver position

### 2. Route Optimization
1. Click "Optimize Route" button
2. Genetic algorithm runs (100 population, 500 generations)
3. Finds shortest distance path between all locations
4. Updates map with optimized blue route line
5. Shows metrics: distance, time, optimization score, fuel cost

### 3. Navigation Controls
- **Start Navigation**: Begins GPS tracking mode
- **Complete Stop**: Mark current delivery as finished
- **Reset Route**: Start over from beginning
- **Expand Map**: Full-screen map view

### 4. Route Visualization
- Blue route line from driver location → stop 1 → stop 2 → ... → final stop
- Click markers for delivery details (customer, address, total, phone)
- Real-time updates as deliveries are completed
- "Refresh Location" button to update driver's current position

## Genetic Algorithm Details
- **Population**: 100 routes tested simultaneously
- **Generations**: Up to 500 iterations for optimization
- **Mutation Rate**: 2% for route variations
- **Selection**: Tournament selection of best routes
- **Distance**: Haversine formula + 20% driving factor
- **Convergence**: Early stop if no improvement for 50 generations

## Troubleshooting

### Map Not Loading
- Check API key is correct and not restricted
- Ensure Maps JavaScript API is enabled
- Check browser console for errors

### No Route Shown  
- Verify delivery addresses have GPS coordinates (latitude/longitude)
- Check Directions API is enabled and has quota
- Ensure at least 2 valid delivery locations

### Performance Issues
- Routes with 10+ stops may take 2-3 seconds to optimize
- Large batches (20+ orders) may hit Google API limits
- Consider reducing genetic algorithm population for faster results

## Cost Estimation
- **Maps JavaScript API**: Free up to 28,000 loads/month
- **Directions API**: $5 per 1,000 requests (first 40,000/month free)
- **Typical Usage**: ~10 route optimizations per delivery batch

## Example Usage
1. Driver opens Route page → system requests GPS permission
2. Driver location automatically detected and shown as blue marker
3. Selects active batch → sees map with all delivery locations
4. Clicks "Optimize Route" → genetic algorithm finds best path from current location
5. Clicks "Start Navigation" → begins delivery sequence from driver's position
6. Completes each stop → marker turns green, moves to next
7. Route updates in real-time as deliveries progress
8. Can click "Refresh Location" to update current position anytime

The map now provides a professional delivery experience similar to apps like DoorDash or Uber Eats! 