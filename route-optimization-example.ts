// Route Optimization System Example

interface DeliveryLocation {
  id: string;
  orderId: string;
  customerName: string;
  address: string;
  latitude: number;
  longitude: number;
  timeWindow?: {
    start: string; // "09:00"
    end: string;   // "17:00"
  };
}

interface Route {
  locations: DeliveryLocation[];
  totalDistance: number;
  estimatedTime: number;
}

// 1. AUTO-ASSIGNMENT TRIGGER
export async function handleBatchCapacityReached(batchId: string) {
  try {
    // Check if batch is at capacity
    const batch = await getBatch(batchId);
    const totalWeight = calculateBatchWeight(batch);
    
    if (totalWeight >= 3500) {
      console.log(`Batch ${batchId} reached capacity: ${totalWeight}kg`);
      
      // Find available driver
      const driver = await findAvailableDriver();
      if (!driver) {
        console.log('No available drivers - batch remains pending');
        return;
      }
      
      // Get delivery locations
      const locations = await getDeliveryLocations(batch.orders);
      
      // Generate optimal route using genetic algorithm
      const optimizedRoute = await generateOptimalRoute(locations);
      
      // Auto-assign to driver
      await assignBatchToDriver(batchId, driver.id);
      
      // Send route to driver's mobile app
      await sendRouteToDriver(driver.id, optimizedRoute);
      
      console.log(`Batch auto-assigned to ${driver.name} with optimized route`);
    }
  } catch (error) {
    console.error('Auto-assignment failed:', error);
  }
}

// 2. GENETIC ALGORITHM IMPLEMENTATION
class GeneticRouteOptimizer {
  private populationSize = 100;
  private generations = 500;
  private mutationRate = 0.02;
  private crossoverRate = 0.8;
  
  async optimize(locations: DeliveryLocation[]): Promise<Route> {
    if (locations.length <= 2) {
      return { locations, totalDistance: 0, estimatedTime: 0 };
    }
    
    // Initialize population with random routes
    let population = this.generateInitialPopulation(locations);
    
    for (let generation = 0; generation < this.generations; generation++) {
      // Evaluate fitness (shorter distance = better fitness)
      const fitness = await this.evaluateFitness(population);
      
      // Selection and reproduction
      population = await this.evolvePopulation(population, fitness);
      
      // Check for convergence
      if (generation % 50 === 0) {
        const best = population[0];
        const distance = await this.calculateRouteDistance(best);
        console.log(`Generation ${generation}: Best distance = ${distance.toFixed(2)}km`);
      }
    }
    
    // Return best route
    const bestRoute = population[0];
    const totalDistance = await this.calculateRouteDistance(bestRoute);
    const estimatedTime = this.estimateDeliveryTime(bestRoute, totalDistance);
    
    return {
      locations: bestRoute,
      totalDistance,
      estimatedTime
    };
  }
  
  private generateInitialPopulation(locations: DeliveryLocation[]): DeliveryLocation[][] {
    const population: DeliveryLocation[][] = [];
    
    for (let i = 0; i < this.populationSize; i++) {
      // Always start from depot (first location)
      const depot = locations[0];
      const deliveries = [...locations.slice(1)];
      
      // Shuffle delivery locations randomly
      for (let j = deliveries.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [deliveries[j], deliveries[k]] = [deliveries[k], deliveries[j]];
      }
      
      population.push([depot, ...deliveries, depot]); // Return to depot
    }
    
    return population;
  }
  
  private async evaluateFitness(population: DeliveryLocation[][]): Promise<number[]> {
    const fitness: number[] = [];
    
    for (const route of population) {
      const distance = await this.calculateRouteDistance(route);
      // Fitness is inverse of distance (shorter = better)
      fitness.push(1 / (distance + 1));
    }
    
    return fitness;
  }
  
  private async calculateRouteDistance(route: DeliveryLocation[]): Promise<number> {
    let totalDistance = 0;
    
    for (let i = 0; i < route.length - 1; i++) {
      const from = route[i];
      const to = route[i + 1];
      const distance = await this.calculateDistance(from, to);
      totalDistance += distance;
    }
    
    return totalDistance;
  }
  
  private async calculateDistance(from: DeliveryLocation, to: DeliveryLocation): Promise<number> {
    // Use Haversine formula for approximate distance
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(to.latitude - from.latitude);
    const dLon = this.toRadians(to.longitude - from.longitude);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRadians(from.latitude)) * Math.cos(this.toRadians(to.latitude)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
  
  private async evolvePopulation(
    population: DeliveryLocation[][], 
    fitness: number[]
  ): Promise<DeliveryLocation[][]> {
    const newPopulation: DeliveryLocation[][] = [];
    
    // Keep best individuals (elitism)
    const sortedIndices = fitness
      .map((f, i) => ({ fitness: f, index: i }))
      .sort((a, b) => b.fitness - a.fitness);
    
    const eliteCount = Math.floor(this.populationSize * 0.1);
    for (let i = 0; i < eliteCount; i++) {
      newPopulation.push([...population[sortedIndices[i].index]]);
    }
    
    // Generate rest through crossover and mutation
    while (newPopulation.length < this.populationSize) {
      const parent1 = this.selectParent(population, fitness);
      const parent2 = this.selectParent(population, fitness);
      
      let offspring = this.crossover(parent1, parent2);
      offspring = this.mutate(offspring);
      
      newPopulation.push(offspring);
    }
    
    return newPopulation;
  }
  
  private selectParent(population: DeliveryLocation[][], fitness: number[]): DeliveryLocation[] {
    // Tournament selection
    const tournamentSize = 5;
    let bestIndex = Math.floor(Math.random() * population.length);
    let bestFitness = fitness[bestIndex];
    
    for (let i = 1; i < tournamentSize; i++) {
      const index = Math.floor(Math.random() * population.length);
      if (fitness[index] > bestFitness) {
        bestIndex = index;
        bestFitness = fitness[index];
      }
    }
    
    return [...population[bestIndex]];
  }
  
  private crossover(parent1: DeliveryLocation[], parent2: DeliveryLocation[]): DeliveryLocation[] {
    if (Math.random() > this.crossoverRate) {
      return [...parent1];
    }
    
    // Order crossover (OX)
    const start = 1; // Skip depot
    const end = parent1.length - 2; // Skip return depot
    const crossoverStart = Math.floor(Math.random() * (end - start)) + start;
    const crossoverEnd = Math.floor(Math.random() * (end - crossoverStart)) + crossoverStart;
    
    const offspring = new Array(parent1.length);
    offspring[0] = parent1[0]; // Depot start
    offspring[offspring.length - 1] = parent1[parent1.length - 1]; // Depot end
    
    // Copy segment from parent1
    for (let i = crossoverStart; i <= crossoverEnd; i++) {
      offspring[i] = parent1[i];
    }
    
    // Fill remaining positions from parent2
    const remaining = parent2.slice(1, -1).filter(
      location => !offspring.slice(crossoverStart, crossoverEnd + 1).includes(location)
    );
    
    let remainingIndex = 0;
    for (let i = 1; i < offspring.length - 1; i++) {
      if (!offspring[i]) {
        offspring[i] = remaining[remainingIndex++];
      }
    }
    
    return offspring;
  }
  
  private mutate(route: DeliveryLocation[]): DeliveryLocation[] {
    if (Math.random() > this.mutationRate) {
      return route;
    }
    
    // Swap mutation (excluding depot positions)
    const mutated = [...route];
    const i = Math.floor(Math.random() * (route.length - 2)) + 1;
    const j = Math.floor(Math.random() * (route.length - 2)) + 1;
    
    [mutated[i], mutated[j]] = [mutated[j], mutated[i]];
    
    return mutated;
  }
  
  private estimateDeliveryTime(route: DeliveryLocation[], totalDistance: number): number {
    const avgSpeed = 30; // km/h in city
    const stopTime = 15; // minutes per delivery
    
    const drivingTime = (totalDistance / avgSpeed) * 60; // minutes
    const stopTime_total = (route.length - 2) * stopTime; // exclude depot
    
    return drivingTime + stopTime_total;
  }
}

// 3. HELPER FUNCTIONS
async function findAvailableDriver() {
  const { data: drivers } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('role', 'driver')
    .is('current_batch_id', null) // Not currently assigned
    .limit(1);
    
  return drivers?.[0] || null;
}

async function getDeliveryLocations(orders: any[]): Promise<DeliveryLocation[]> {
  const locations: DeliveryLocation[] = [];
  
  // Add depot (starting point)
  locations.push({
    id: 'depot',
    orderId: 'depot',
    customerName: 'Distribution Center',
    address: 'Main Warehouse',
    latitude: 14.5995, // Manila coordinates
    longitude: 120.9842,
  });
  
  // Add customer locations
  for (const order of orders) {
    const address = order.delivery_address?.street_address || 'Unknown Address';
    const coords = await geocodeAddress(address);
    
    locations.push({
      id: order.id,
      orderId: order.id,
      customerName: order.customer?.name || 'Unknown Customer',
      address,
      latitude: coords.lat,
      longitude: coords.lng,
      timeWindow: {
        start: '09:00',
        end: '17:00'
      }
    });
  }
  
  return locations;
}

async function geocodeAddress(address: string): Promise<{lat: number, lng: number}> {
  // In production, use Google Maps Geocoding API or similar
  // For now, return random coordinates around Metro Manila
  return {
    lat: 14.5995 + (Math.random() - 0.5) * 0.2,
    lng: 120.9842 + (Math.random() - 0.5) * 0.2
  };
}

async function generateOptimalRoute(locations: DeliveryLocation[]): Promise<Route> {
  const optimizer = new GeneticRouteOptimizer();
  return await optimizer.optimize(locations);
}

async function assignBatchToDriver(batchId: string, driverId: string) {
  await supabase
    .from('order_batches')
    .update({ 
      driver_id: driverId,
      status: 'assigned'
    })
    .eq('id', batchId);
}

async function sendRouteToDriver(driverId: string, route: Route) {
  // In production, this would send to driver's mobile app
  console.log(`Route sent to driver ${driverId}:`, {
    stops: route.locations.length,
    totalDistance: route.totalDistance.toFixed(2) + 'km',
    estimatedTime: route.estimatedTime.toFixed(0) + ' minutes'
  });
}

// 4. USAGE EXAMPLE
export async function handleOrderApproval(orderId: string) {
  // When an order is approved, check if its batch is ready
  const order = await getOrder(orderId);
  if (order.batch_id) {
    await handleBatchCapacityReached(order.batch_id);
  }
} 