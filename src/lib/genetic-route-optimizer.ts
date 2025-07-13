import { supabase } from './supabase';
import { toast } from 'react-hot-toast';

export interface DeliveryLocation {
  id: string;
  order_id: string;
  customer_name: string;
  address: string;
  barangay: string;
  latitude: number | null;
  longitude: number | null;
  phone?: string;
  total: number;
  delivery_status: string;
  priority?: number; // 1-5, with 1 being highest priority
  time_window?: {
    start_hour: number; // 9 for 9:00 AM
    end_hour: number;   // 17 for 5:00 PM
  };
}

export interface DepotLocation {
  latitude: number;
  longitude: number;
  name: string;
  address: string;
}

export interface OptimizedRoute {
  locations: DeliveryLocation[];
  total_distance_km: number;
  estimated_time_hours: number;
  optimization_score: number; // 0-100
  fuel_cost_estimate: number;
  generation_count: number;
  fitness_score: number; // New: GA fitness score
  route_comparison_data?: RouteComparisonData; // New: comparison data
}

export interface RouteComparisonData {
  route_a: {
    locations: DeliveryLocation[];
    total_distance_km: number;
    fitness_score: number;
  };
  route_b: {
    locations: DeliveryLocation[];
    total_distance_km: number;
    fitness_score: number;
  };
  selected_route: 'A' | 'B';
  distance_improvement: number;
  fitness_improvement: number;
  crossover_data?: {
    iterations: number;
    final_distance: number;
    final_fitness: number;
    improved_from_parents: boolean;
  };
}

export interface GeneticAlgorithmConfig {
  population_size: number;
  max_generations: number;
  mutation_rate: number;
  crossover_rate: number;
  elite_count: number;
  convergence_threshold: number;
  dual_route_comparison: boolean; // New: enable dual route comparison
}

export class GeneticRouteOptimizer {
  private config: GeneticAlgorithmConfig;
  private depot: DepotLocation;
  
  constructor(config?: Partial<GeneticAlgorithmConfig>, depot?: DepotLocation) {
    this.config = {
      population_size: 100,
      max_generations: 500,
      mutation_rate: 0.02,
      crossover_rate: 1.0, // Set to 100% crossover probability for dual route comparison
      elite_count: 10,
      convergence_threshold: 0.001,
      dual_route_comparison: true, // Enable dual route comparison by default
      ...config
    };
    
    // Default depot location (CDO City - DeliveryEase depot)
    this.depot = depot || {
      latitude: 8.4542,
      longitude: 124.6319,
      name: "DeliveryEase Depot",
      address: "Cagayan de Oro City, Philippines"
    };
  }

  /**
   * Main optimization method with dual route comparison
   * Generates two routes and selects the one with shortest total distance
   */
  async optimizeRoute(locations: DeliveryLocation[]): Promise<OptimizedRoute> {
    console.log(`🧬 Starting dual route genetic algorithm optimization for ${locations.length} locations...`);
    
    if (locations.length <= 2) {
      return this.createSimpleRoute(locations);
    }

    // Filter locations with valid coordinates
    const validLocations = locations.filter(loc => loc.latitude && loc.longitude);
    const invalidLocations = locations.filter(loc => !loc.latitude || !loc.longitude);
    
    if (validLocations.length < 2) {
      console.warn('Not enough valid GPS coordinates for optimization');
      return this.createFallbackRoute(locations);
    }

    if (this.config.dual_route_comparison) {
      return await this.optimizeWithDualRouteComparison(validLocations, invalidLocations);
    } else {
      return await this.optimizeSingleRoute(validLocations, invalidLocations);
    }
  }

  /**
   * Enhanced dual route comparison optimization with Order Crossover (OX)
   */
  private async optimizeWithDualRouteComparison(
    validLocations: DeliveryLocation[], 
    invalidLocations: DeliveryLocation[]
  ): Promise<OptimizedRoute> {
    console.log(`🔄 Generating two initial routes as parents...`);
    
    // Generate Route A with one GA configuration (Parent 1)
    const routeA = await this.runGeneticAlgorithm(validLocations, {
      ...this.config,
      population_size: Math.floor(this.config.population_size * 0.8),
      mutation_rate: this.config.mutation_rate * 0.8,
      seed: 'route_a'
    });

    // Generate Route B with different GA configuration for diversity (Parent 2)
    const routeB = await this.runGeneticAlgorithm(validLocations, {
      ...this.config,
      population_size: Math.floor(this.config.population_size * 1.2),
      mutation_rate: this.config.mutation_rate * 1.2,
      crossover_rate: this.config.crossover_rate * 0.9,
      seed: 'route_b'
    });

    // Calculate total travel distance for each initial route
    const distanceA = this.calculateRouteDistance(routeA.locations);
    const distanceB = this.calculateRouteDistance(routeB.locations);
    
    // Calculate fitness scores (lower distance = higher fitness)
    const fitnessA = this.calculateDistanceBasedFitness(distanceA, validLocations.length);
    const fitnessB = this.calculateDistanceBasedFitness(distanceB, validLocations.length);
    
    console.log(`📊 Initial Parent Routes:`);
    console.log(`   Parent 1 (Route A): ${distanceA.toFixed(2)}km (fitness: ${fitnessA.toFixed(2)})`);
    console.log(`   Parent 2 (Route B): ${distanceB.toFixed(2)}km (fitness: ${fitnessB.toFixed(2)})`);
    
    // Apply Order Crossover (OX) process between the two parent routes
    const crossoverResult = this.applyOrderCrossoverOptimization(routeA.locations, routeB.locations);
    
    // Determine the best route after crossover optimization
    let bestRoute: DeliveryLocation[];
    let bestDistance: number;
    let bestFitness: number;
    let selectedRouteType: 'A' | 'B' | 'Crossover';
    
    if (crossoverResult.distance < Math.min(distanceA, distanceB)) {
      bestRoute = crossoverResult.route;
      bestDistance = crossoverResult.distance;
      bestFitness = crossoverResult.fitness;
      selectedRouteType = 'Crossover';
      console.log(`✅ Crossover optimization successful! New best distance: ${bestDistance.toFixed(2)}km`);
    } else {
      // Keep the best from initial evaluation
      if (distanceA < distanceB) {
        bestRoute = routeA.locations;
        bestDistance = distanceA;
        bestFitness = fitnessA;
        selectedRouteType = 'A';
      } else {
        bestRoute = routeB.locations;
        bestDistance = distanceB;
        bestFitness = fitnessB;
        selectedRouteType = 'B';
      }
      console.log(`ℹ️ No improvement from crossover, keeping best initial route: ${selectedRouteType}`);
    }
    
    // Calculate improvement metrics from initial best
    const initialBestDistance = Math.min(distanceA, distanceB);
    const distanceImprovement = Math.max(0, initialBestDistance - bestDistance);
    const fitnessImprovement = bestFitness - Math.max(fitnessA, fitnessB);
    
    console.log(`📈 Final Results:`);
    console.log(`   Best Distance: ${bestDistance.toFixed(2)}km`);
    console.log(`   Best Fitness: ${bestFitness.toFixed(2)}`);
    console.log(`   Selected Route: ${selectedRouteType}`);
    console.log(`   Distance Improvement: ${distanceImprovement.toFixed(2)}km`);
    console.log(`   Crossover Iterations: ${crossoverResult.iterations}`);
    
    // Add back locations without coordinates at the end
    const finalRoute = [...bestRoute, ...invalidLocations];
    
    const estimatedTime = this.estimateDeliveryTime(finalRoute, bestDistance);
    const optimizationScore = this.calculateOptimizationScore(bestDistance, finalRoute.length);
    const fuelCost = this.estimateFuelCost(bestDistance);

    // Create enhanced comparison data with crossover information
    const comparisonData: RouteComparisonData = {
      route_a: {
        locations: routeA.locations,
        total_distance_km: distanceA,
        fitness_score: fitnessA
      },
      route_b: {
        locations: routeB.locations,
        total_distance_km: distanceB,
        fitness_score: fitnessB
      },
      selected_route: selectedRouteType as 'A' | 'B',
      distance_improvement: distanceImprovement,
      fitness_improvement: fitnessImprovement,
      crossover_data: {
        iterations: crossoverResult.iterations,
        final_distance: crossoverResult.distance,
        final_fitness: crossoverResult.fitness,
        improved_from_parents: selectedRouteType === 'Crossover'
      }
    };

    console.log(`✅ Order Crossover optimization complete! Distance: ${bestDistance.toFixed(2)}km, Fitness: ${bestFitness.toFixed(2)}`);

    return {
      locations: finalRoute,
      total_distance_km: bestDistance,
      estimated_time_hours: estimatedTime,
      optimization_score: optimizationScore,
      fuel_cost_estimate: fuelCost,
      generation_count: Math.max(routeA.generation_count, routeB.generation_count),
      fitness_score: bestFitness,
      route_comparison_data: comparisonData
    };
  }

  /**
   * Single route optimization (fallback)
   */
  private async optimizeSingleRoute(
    validLocations: DeliveryLocation[], 
    invalidLocations: DeliveryLocation[]
  ): Promise<OptimizedRoute> {
    const result = await this.runGeneticAlgorithm(validLocations, this.config);
    const finalRoute = [...result.locations, ...invalidLocations];
    
    const totalDistance = this.calculateRouteDistance(result.locations);
    const estimatedTime = this.estimateDeliveryTime(finalRoute, totalDistance);
    const optimizationScore = this.calculateOptimizationScore(totalDistance, finalRoute.length);
    const fuelCost = this.estimateFuelCost(totalDistance);
    const fitness = this.calculateDistanceBasedFitness(totalDistance, validLocations.length);

    return {
      locations: finalRoute,
      total_distance_km: totalDistance,
      estimated_time_hours: estimatedTime,
      optimization_score: optimizationScore,
      fuel_cost_estimate: fuelCost,
      generation_count: result.generation_count,
      fitness_score: fitness
    };
  }

  /**
   * Core genetic algorithm runner
   */
  private async runGeneticAlgorithm(
    locations: DeliveryLocation[], 
    config: GeneticAlgorithmConfig & { seed?: string }
  ): Promise<{ locations: DeliveryLocation[], generation_count: number }> {
    // Initialize population with seed-based variation
    let population = this.generateInitialPopulation(locations, config.seed);
    let bestDistance = Infinity;
    let stagnationCounter = 0;
    let generation = 0;
    
    for (generation = 0; generation < config.max_generations; generation++) {
      // Evaluate fitness based on total travel distance
      const fitness = this.evaluateDistanceBasedFitness(population);
      
      // Track best solution (lowest distance)
      const currentBest = Math.min(...population.map(route => this.calculateRouteDistance(route)));
      
      if (Math.abs(bestDistance - currentBest) < config.convergence_threshold) {
        stagnationCounter++;
      } else {
        stagnationCounter = 0;
        bestDistance = currentBest;
      }
      
      // Early termination if converged
      if (stagnationCounter > 50) {
        console.log(`🎯 Converged at generation ${generation} with distance ${bestDistance.toFixed(2)}km`);
        break;
      }
      
      // Evolve population
      population = this.evolvePopulation(population, fitness);
      
      // Progress logging
      if (generation % 100 === 0) {
        console.log(`Generation ${generation}: Best distance = ${bestDistance.toFixed(2)}km`);
      }
    }

    // Get best route (highest fitness = lowest distance)
    const fitness = this.evaluateDistanceBasedFitness(population);
    const bestIndex = fitness.indexOf(Math.max(...fitness));
    const bestRoute = population[bestIndex];
    
    return {
      locations: bestRoute,
      generation_count: generation
    };
  }

  /**
   * Enhanced fitness evaluation based on total travel distance
   * Lower distance = higher fitness score
   */
  private evaluateDistanceBasedFitness(population: DeliveryLocation[][]): number[] {
    return population.map(route => {
      const distance = this.calculateRouteDistance(route);
      return this.calculateDistanceBasedFitness(distance, route.length);
    });
  }

  /**
   * Calculate fitness score where lower distance = higher fitness
   */
  private calculateDistanceBasedFitness(distance: number, locationCount: number): number {
    // Base fitness calculation: inverse of distance
    // Add scaling factors for route length
    const baseDistance = locationCount * 1.5; // Expected minimum distance (1.5km between stops)
    const excessDistance = Math.max(0, distance - baseDistance);
    
    // Fitness formula: higher score for shorter routes
    // Score ranges from 0 to 100, with 100 being the theoretical perfect route
    const fitness = Math.max(0, 100 - (excessDistance / baseDistance) * 50);
    
    return fitness;
  }

  private generateInitialPopulation(locations: DeliveryLocation[], seed?: string): DeliveryLocation[][] {
    const population: DeliveryLocation[][] = [];
    
    // Create diverse initial population with seed-based variation
    for (let i = 0; i < this.config.population_size; i++) {
      let route: DeliveryLocation[];
      
      if (i < 10) {
        // Some routes using nearest neighbor heuristic
        route = this.nearestNeighborRoute(locations);
      } else if (i < 20) {
        // Some routes prioritizing high-priority orders
        route = this.priorityBasedRoute(locations);
      } else if (i < 30 && seed) {
        // Seed-based routes for variation between dual routes
        route = this.seedBasedRoute(locations, seed, i);
      } else {
        // Random permutations
        route = this.randomRoute(locations);
      }
      
      population.push(route);
    }
    
    return population;
  }

  /**
   * Generate seed-based route for dual route variation
   */
  private seedBasedRoute(locations: DeliveryLocation[], seed: string, index: number): DeliveryLocation[] {
    const route = [...locations];
    
    // Create deterministic but varied shuffling based on seed
    const seedValue = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = (n: number) => ((seedValue + index * 7) % n) / n;
    
    // Custom shuffle with seed-based randomness
    for (let i = route.length - 1; i > 0; i--) {
      const j = Math.floor(random(i + 1) * (i + 1));
      [route[i], route[j]] = [route[j], route[i]];
    }
    
    return route;
  }

  /**
   * Apply Order Crossover (OX) optimization between two parent routes
   * Performs up to 10 iterations with 100% crossover probability
   */
  private applyOrderCrossoverOptimization(
    parent1: DeliveryLocation[], 
    parent2: DeliveryLocation[]
  ): { route: DeliveryLocation[], distance: number, fitness: number, iterations: number } {
    console.log(`🧬 Starting Order Crossover (OX) optimization with 100% crossover probability...`);
    
    const maxIterations = 10;
    const crossoverProbability = 1.0; // 100% crossover probability
    
    let bestRoute = [...parent1];
    let bestDistance = this.calculateRouteDistance(parent1);
    let bestFitness = this.calculateDistanceBasedFitness(bestDistance, parent1.length);
    
    console.log(`   Initial best distance: ${bestDistance.toFixed(2)}km`);
    
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      console.log(`   🔄 Crossover iteration ${iteration}/${maxIterations}`);
      
      // Apply Order Crossover with 100% probability
      const offspring = this.enhancedOrderCrossover(parent1, parent2, crossoverProbability);
      
      // Calculate distance and fitness for the offspring
      const offspringDistance = this.calculateRouteDistance(offspring);
      const offspringFitness = this.calculateDistanceBasedFitness(offspringDistance, offspring.length);
      
      console.log(`     Offspring distance: ${offspringDistance.toFixed(2)}km (fitness: ${offspringFitness.toFixed(2)})`);
      
      // Check if this is a better solution (shorter distance = higher fitness)
      if (offspringDistance < bestDistance) {
        bestRoute = offspring;
        bestDistance = offspringDistance;
        bestFitness = offspringFitness;
        console.log(`     ✅ New best solution found! Distance: ${bestDistance.toFixed(2)}km`);
      } else {
        console.log(`     ⭕ No improvement this iteration`);
      }
      
      // Update parents for next iteration (use best found so far + original parent)
      parent1 = bestRoute;
      // Keep parent2 as original to maintain diversity
    }
    
    const finalImprovement = this.calculateRouteDistance(parent1) - bestDistance;
    console.log(`🎯 Order Crossover complete after ${maxIterations} iterations:`);
    console.log(`   Final distance: ${bestDistance.toFixed(2)}km`);
    console.log(`   Final fitness: ${bestFitness.toFixed(2)}`);
    console.log(`   Improvement: ${finalImprovement.toFixed(2)}km`);
    
    return {
      route: bestRoute,
      distance: bestDistance,
      fitness: bestFitness,
      iterations: maxIterations
    };
  }

  /**
   * Enhanced Order Crossover (OX) with guaranteed crossover probability
   */
  private enhancedOrderCrossover(
    parent1: DeliveryLocation[], 
    parent2: DeliveryLocation[], 
    crossoverProbability: number = 1.0
  ): DeliveryLocation[] {
    // With 100% crossover probability, always perform crossover
    if (Math.random() > crossoverProbability) {
      return [...parent1]; // This won't happen with 100% probability
    }
    
    const length = parent1.length;
    if (length <= 2) return [...parent1];
    
    // Select a random segment from parent1
    const start = Math.floor(Math.random() * length);
    const end = Math.floor(Math.random() * (length - start)) + start;
    
    console.log(`     OX segment: positions ${start} to ${end}`);
    
    const offspring: DeliveryLocation[] = new Array(length);
    const selected = new Set<string>();
    
    // Copy selected segment from parent1
    for (let i = start; i <= end; i++) {
      offspring[i] = parent1[i];
      selected.add(parent1[i].id);
    }
    
    // Fill remaining positions with order from parent2
    let parent2Index = 0;
    for (let i = 0; i < length; i++) {
      if (!offspring[i]) {
        // Find next unselected location from parent2
        while (parent2Index < parent2.length && selected.has(parent2[parent2Index].id)) {
          parent2Index++;
        }
        
        if (parent2Index < parent2.length) {
          offspring[i] = parent2[parent2Index];
          selected.add(parent2[parent2Index].id);
          parent2Index++;
        }
      }
    }
    
    // Validate that all positions are filled
    for (let i = 0; i < length; i++) {
      if (!offspring[i]) {
        // Fill any remaining gaps with unselected locations
        for (const location of parent1) {
          if (!selected.has(location.id)) {
            offspring[i] = location;
            selected.add(location.id);
            break;
          }
        }
      }
    }
    
    return offspring;
  }

  /**
   * Create a simple route for cases with few locations
   */
  private createSimpleRoute(locations: DeliveryLocation[]): OptimizedRoute {
    const distance = this.calculateRouteDistance(locations);
    const fitness = this.calculateDistanceBasedFitness(distance, locations.length);
    
    return {
      locations,
      total_distance_km: distance,
      estimated_time_hours: 0.5,
      optimization_score: 100,
      fuel_cost_estimate: this.estimateFuelCost(distance),
      generation_count: 0,
      fitness_score: fitness
    };
  }

  private nearestNeighborRoute(locations: DeliveryLocation[]): DeliveryLocation[] {
    const route: DeliveryLocation[] = [];
    const remaining = [...locations];
    
    // Start with location closest to depot instead of first location
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    for (let i = 0; i < remaining.length; i++) {
      const location = remaining[i];
      if (location.latitude && location.longitude) {
        const distance = this.calculateDistanceToDepot(location);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = i;
        }
      }
    }
    
    let current = remaining.splice(closestIndex, 1)[0];
    route.push(current);
    
    while (remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      
      for (let i = 0; i < remaining.length; i++) {
        const distance = this.calculateDistance(current, remaining[i]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }
      
      current = remaining.splice(nearestIndex, 1)[0];
      route.push(current);
    }
    
    return route;
  }

  private priorityBasedRoute(locations: DeliveryLocation[]): DeliveryLocation[] {
    // Sort by priority first, then optimize locally
    const sorted = [...locations].sort((a, b) => (a.priority || 3) - (b.priority || 3));
    return this.nearestNeighborRoute(sorted);
  }

  private randomRoute(locations: DeliveryLocation[]): DeliveryLocation[] {
    const route = [...locations];
    
    // Fisher-Yates shuffle
    for (let i = route.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [route[i], route[j]] = [route[j], route[i]];
    }
    
    return route;
  }

  private async evaluateFitness(population: DeliveryLocation[][]): Promise<number[]> {
    return population.map(route => {
      const distance = this.calculateRouteDistance(route);
      const timeWindowPenalty = this.calculateTimeWindowPenalty(route);
      const priorityBonus = this.calculatePriorityBonus(route);
      
      // Fitness is inverse of cost (lower cost = higher fitness)
      const totalCost = distance + timeWindowPenalty - priorityBonus;
      return 1 / (totalCost + 1);
    });
  }

  private calculateRouteDistance(route: DeliveryLocation[]): number {
    if (route.length === 0) return 0;
    
    let totalDistance = 0;
    
    // Distance from depot to first delivery location
    if (route.length > 0) {
      totalDistance += this.calculateDistanceToDepot(route[0]);
    }
    
    // Distance between consecutive delivery locations
    for (let i = 0; i < route.length - 1; i++) {
      totalDistance += this.calculateDistance(route[i], route[i + 1]);
    }
    
    // Distance from last delivery location back to depot
    if (route.length > 0) {
      totalDistance += this.calculateDistanceToDepot(route[route.length - 1]);
    }
    
    // Add 20% for actual driving distance vs straight line
    return totalDistance * 1.2;
  }

  private calculateDistance(from: DeliveryLocation, to: DeliveryLocation): number {
    if (!from.latitude || !from.longitude || !to.latitude || !to.longitude) {
      return 1000; // Large penalty for invalid coordinates
    }

    const R = 6371; // Earth's radius in km
    const lat1 = this.toRadians(from.latitude);
    const lat2 = this.toRadians(to.latitude);
    const deltaLat = this.toRadians(to.latitude - from.latitude);
    const deltaLng = this.toRadians(to.longitude - from.longitude);

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private calculateDistanceToDepot(location: DeliveryLocation): number {
    if (!location.latitude || !location.longitude) {
      return 1000; // Large penalty for invalid coordinates
    }

    const R = 6371; // Earth's radius in km
    const lat1 = this.toRadians(this.depot.latitude);
    const lat2 = this.toRadians(location.latitude);
    const deltaLat = this.toRadians(location.latitude - this.depot.latitude);
    const deltaLng = this.toRadians(location.longitude - this.depot.longitude);

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private calculateTimeWindowPenalty(route: DeliveryLocation[]): number {
    let penalty = 0;
    let currentTime = 9; // Start at 9 AM
    
    for (const location of route) {
      if (location.time_window) {
        if (currentTime < location.time_window.start_hour) {
          penalty += (location.time_window.start_hour - currentTime) * 10; // Waiting penalty
        } else if (currentTime > location.time_window.end_hour) {
          penalty += (currentTime - location.time_window.end_hour) * 20; // Late penalty
        }
      }
      
      currentTime += 0.33; // 20 minutes per delivery
    }
    
    return penalty;
  }

  private calculatePriorityBonus(route: DeliveryLocation[]): number {
    let bonus = 0;
    
    route.forEach((location, index) => {
      if (location.priority && location.priority <= 2) {
        // Earlier delivery of high priority orders gives bonus
        bonus += (route.length - index) * (3 - location.priority);
      }
    });
    
    return bonus;
  }

  private evolvePopulation(
    population: DeliveryLocation[][], 
    fitness: number[]
  ): DeliveryLocation[][] {
    const newPopulation: DeliveryLocation[][] = [];
    
    // Elitism - keep best solutions
    const sortedIndices = fitness
      .map((f, i) => ({ fitness: f, index: i }))
      .sort((a, b) => b.fitness - a.fitness);
    
    for (let i = 0; i < this.config.elite_count; i++) {
      newPopulation.push([...population[sortedIndices[i].index]]);
    }
    
    // Generate offspring through crossover and mutation
    while (newPopulation.length < this.config.population_size) {
      const parent1 = this.tournamentSelection(population, fitness);
      const parent2 = this.tournamentSelection(population, fitness);
      
      let offspring = this.orderCrossover(parent1, parent2);
      offspring = this.mutate(offspring);
      
      newPopulation.push(offspring);
    }
    
    return newPopulation;
  }

  private tournamentSelection(population: DeliveryLocation[][], fitness: number[]): DeliveryLocation[] {
    const tournamentSize = 5;
    let bestIndex = Math.floor(Math.random() * population.length);
    let bestFitness = fitness[bestIndex];
    
    for (let i = 1; i < tournamentSize; i++) {
      const index = Math.floor(Math.random() * population.length);
      if (fitness[index] > bestFitness) {
        bestFitness = fitness[index];
        bestIndex = index;
      }
    }
    
    return [...population[bestIndex]];
  }

  private orderCrossover(parent1: DeliveryLocation[], parent2: DeliveryLocation[]): DeliveryLocation[] {
    if (Math.random() > this.config.crossover_rate) {
      return [...parent1];
    }
    
    const length = parent1.length;
    const start = Math.floor(Math.random() * length);
    const end = Math.floor(Math.random() * (length - start)) + start;
    
    const offspring: DeliveryLocation[] = new Array(length);
    const selected = new Set<string>();
    
    // Copy segment from parent1
    for (let i = start; i <= end; i++) {
      offspring[i] = parent1[i];
      selected.add(parent1[i].id);
    }
    
    // Fill remaining positions from parent2
    let parent2Index = 0;
    for (let i = 0; i < length; i++) {
      if (!offspring[i]) {
        while (selected.has(parent2[parent2Index].id)) {
          parent2Index++;
        }
        offspring[i] = parent2[parent2Index];
        selected.add(parent2[parent2Index].id);
        parent2Index++;
      }
    }
    
    return offspring;
  }

  private mutate(route: DeliveryLocation[]): DeliveryLocation[] {
    const mutated = [...route];
    
    for (let i = 0; i < mutated.length; i++) {
      if (Math.random() < this.config.mutation_rate) {
        // Swap mutation
        const j = Math.floor(Math.random() * mutated.length);
        [mutated[i], mutated[j]] = [mutated[j], mutated[i]];
      }
    }
    
    return mutated;
  }

  private estimateDeliveryTime(route: DeliveryLocation[], totalDistance: number): number {
    const drivingTime = totalDistance / 30; // Assume 30 km/h average speed
    const deliveryTime = route.length * 0.33; // 20 minutes per delivery
    return drivingTime + deliveryTime;
  }

  private calculateOptimizationScore(distance: number, locationCount: number): number {
    // Heuristic scoring based on distance efficiency
    const idealDistance = locationCount * 2; // Ideal 2km between stops
    const efficiency = Math.max(0, 1 - (distance - idealDistance) / idealDistance);
    return Math.min(100, efficiency * 100);
  }

  private estimateFuelCost(distance: number): number {
    const fuelEfficiency = 10; // km per liter
    const fuelPrice = 60; // PHP per liter
    return (distance / fuelEfficiency) * fuelPrice;
  }

  private createFallbackRoute(locations: DeliveryLocation[]): OptimizedRoute {
    const distance = locations.length * 3; // Estimate 3km per stop
    const fitness = this.calculateDistanceBasedFitness(distance, locations.length);
    
    return {
      locations,
      total_distance_km: distance,
      estimated_time_hours: locations.length * 0.5, // 30 minutes per stop
      optimization_score: 60, // Lower score for non-optimized route
      fuel_cost_estimate: locations.length * 18, // Estimate PHP 18 per stop
      generation_count: 0,
      fitness_score: fitness
    };
  }
}

// Integration with batch auto-assignment
export async function optimizeAndAssignBatch(batchId: string, orders: DeliveryLocation[], depot?: DepotLocation) {
  try {
    console.log(`🚚 Starting route optimization for batch ${batchId}...`);
    
    // Use provided depot or default CDO depot
    const depotLocation = depot || {
      latitude: 8.4542,
      longitude: 124.6319,
      name: "DeliveryEase Depot",
      address: "Cagayan de Oro City, Philippines"
    };
    
    const optimizer = new GeneticRouteOptimizer({
      population_size: 80,
      max_generations: 300,
      mutation_rate: 0.03
    }, depotLocation);
    
    const optimizedRoute = await optimizer.optimizeRoute(orders);
    
    console.log(`✅ Route optimized! Starting from depot (${depotLocation.name})`);
    console.log(`📍 First delivery: ${optimizedRoute.locations[0]?.customer_name || 'N/A'}`);
    console.log(`📏 Total distance: ${optimizedRoute.total_distance_km.toFixed(2)}km`);
    console.log(`⏱️ Estimated time: ${optimizedRoute.estimated_time_hours.toFixed(1)}h`);
    console.log(`🎯 Optimization score: ${optimizedRoute.optimization_score.toFixed(1)}%`);
    
    // Store optimization results (would need to create batch_optimization_results table)
    // await supabase
    //   .from('batch_optimization_results')
    //   .upsert({
    //     batch_id: batchId,
    //     optimized_route: optimizedRoute.locations.map(loc => loc.id),
    //     total_distance: optimizedRoute.total_distance_km,
    //     estimated_time: optimizedRoute.estimated_time_hours,
    //     optimization_score: optimizedRoute.optimization_score,
    //     fuel_cost_estimate: optimizedRoute.fuel_cost_estimate,
    //     created_at: new Date().toISOString()
    //   });
    
    // toast.success(`🧬 Route optimized! ${optimizedRoute.optimization_score.toFixed(1)}% efficiency achieved`, {
    //   duration: 6000
    // });
    
    return optimizedRoute;
    
  } catch (error) {
    console.error('Route optimization failed:', error);
    // toast.error('Route optimization failed, using default order');
    throw error;
  }
} 