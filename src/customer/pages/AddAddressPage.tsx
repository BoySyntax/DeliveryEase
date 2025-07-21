import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { ArrowLeft, MapPin, Home, Map, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import Select from '../../ui/components/Select';
import MapAddressSelector, { loadGoogleMapsScript } from '../components/MapAddressSelector';

type BarangayOption = {
  id: string;
  name: string;
  city: string;
  province: string;
  region: string;
  display_name: string;
};

type AddressForm = {
  full_name: string;
  phone: string;
  barangay_id: string;
  postal_code: string;
  street_address: string;
};

// Approximate coordinates for Region 10 cities (for map centering)
const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'Cagayan de Oro': { lat: 8.4542, lng: 124.6319 },
  'Iligan': { lat: 8.2280, lng: 124.2452 },
  'Malaybalay': { lat: 8.1531, lng: 125.1275 },
  'Valencia': { lat: 7.9094, lng: 125.0947 },
  'Oroquieta': { lat: 8.4853, lng: 123.8056 },
};

export default function AddAddressPage() {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [barangays, setBarangays] = useState<BarangayOption[]>([]);
  const [loadingBarangays, setLoadingBarangays] = useState(true);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<AddressForm>();

  const selectedBarangayId = watch('barangay_id');
  const selectedBarangay = barangays.find(b => b.id === selectedBarangayId);

  useEffect(() => {
    async function loadBarangays() {
      try {
        const { data, error } = await supabase
          .from('barangays')
          .select('id, name, city, province, region')
          .eq('active', true)
          .order('city, name');
        
        if (error) throw error;
        
        const formattedBarangays: BarangayOption[] = (data || []).map(barangay => ({
          ...barangay,
          display_name: barangay.city === 'Cagayan de Oro' 
            ? barangay.name 
            : `${barangay.name}, ${barangay.city}`
        }));
        
        setBarangays(formattedBarangays);
      } catch (error) {
        console.error('Error loading barangays:', error);
        toast.error('Failed to load barangay options');
      } finally {
        setLoadingBarangays(false);
      }
    }

    loadBarangays();
  }, []);

  const handleOpenMap = async () => {
    if (!selectedBarangay) {
      toast.error('Please select your barangay first');
      return;
    }

    try {
      if (!mapsLoaded) {
        await loadGoogleMapsScript();
        setMapsLoaded(true);
      }
      setIsMapOpen(true);
    } catch (error) {
      console.error('Failed to load Google Maps:', error);
      toast.error('Failed to load map. Please try again.');
    }
  };

  const handleAddressSelect = (address: string, coordinates?: { lat: number; lng: number }) => {
    setSelectedAddress(address);
    setSelectedCoordinates(coordinates || null);
    setValue('street_address', address);
    setIsMapOpen(false);
    toast.success('Location selected successfully!');
  };

  const onSubmit = async (data: AddressForm) => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to add an address');
        return;
      }

      if (!selectedBarangay) {
        toast.error('Please select a barangay');
        return;
      }

      if (!selectedAddress) {
        toast.error('Please select your location on the map');
        return;
      }

      const addressData = {
        customer_id: user.id,
        full_name: data.full_name,
        phone: data.phone,
        street_address: selectedAddress,
        barangay: selectedBarangay.display_name,
        // Store coordinates as metadata (could be used for future delivery optimizations)
        ...(selectedCoordinates && {
          latitude: selectedCoordinates.lat,
          longitude: selectedCoordinates.lng
        })
      };

      const { error } = await supabase
        .from('addresses')
        .insert([addressData]);

      if (error) {
        console.error('Supabase insert error:', error);
        throw new Error(`Failed to save address: ${error.message}`);
      }

      toast.success('Address added successfully!');
      navigate('/customer/profile');

    } catch (error) {
      console.error('Error adding address:', error);
      toast.error(error instanceof Error ? error.message : 'An unexpected error occurred while saving address');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <Button
            variant="ghost"
            icon={<ArrowLeft size={18} />}
            onClick={() => navigate('/customer/profile')}
            className="mb-4 sm:mb-6 text-blue-600 hover:text-blue-800 hover:bg-blue-50 text-sm sm:text-base"
          >
            Back to Profile
          </Button>

          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2 px-2">Add New Address</h1>
            
            
            {/* Progress Steps - Responsive */}
            <div className="mt-6 sm:mt-8">
              {/* Desktop/Tablet Progress */}
              <div className="hidden sm:flex items-center justify-center space-x-2 md:space-x-4">
                <div className="flex items-center">
                  <div className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-semibold ${
                    true ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    1
                  </div>
                  <span className="ml-2 text-xs md:text-sm font-medium text-gray-700">Contact Info</span>
                </div>
                <div className="w-8 md:w-12 h-0.5 bg-gray-300"></div>
                <div className="flex items-center">
                  <div className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-semibold ${
                    selectedBarangay ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    2
                  </div>
                  <span className="ml-2 text-xs md:text-sm font-medium text-gray-700">Select Barangay</span>
                </div>
                <div className="w-8 md:w-12 h-0.5 bg-gray-300"></div>
                <div className="flex items-center">
                  <div className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-semibold ${
                    selectedAddress ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    3
                  </div>
                  <span className="ml-2 text-xs md:text-sm font-medium text-gray-700">Pin Location</span>
                </div>
              </div>
              
              {/* Mobile Progress */}
              <div className="sm:hidden space-y-2">
                <div className="flex items-center justify-center space-x-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                    true ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>1</div>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                    selectedBarangay ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>2</div>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                    selectedAddress ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>3</div>
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div className={selectedBarangay ? 'text-blue-600 font-medium' : ''}>
                    Step {selectedAddress ? '3' : selectedBarangay ? '2' : '1'}: {
                      selectedAddress ? 'Pin Location' : 
                      selectedBarangay ? 'Select Barangay' : 
                      'Contact Info'
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6 lg:space-y-8">
          {/* Contact Information */}
          <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-lg border border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 sm:mb-6">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Home className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
              </div>
              <div className="text-center sm:text-left">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Contact Information</h2>
                <p className="text-xs sm:text-sm text-gray-600">Who should we contact for this delivery address?</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <Input
                label="Full Name"
                error={errors.full_name?.message}
                {...register('full_name', { required: 'Full name is required' })}
                placeholder="Enter your full name"
                className="text-base sm:text-lg"
              />
              <Input
                label="Phone Number"
                error={errors.phone?.message}
                {...register('phone', { 
                  required: 'Phone number is required',
                  pattern: {
                    value: /^09\d{9}$/,
                    message: 'Please enter a valid 11-digit phone number starting with 09'
                  }
                })}
                placeholder="e.g., 09123456789"
                className="text-base sm:text-lg"
              />
            </div>
          </div>

          {/* Step 2: Barangay Selection */}
          <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-lg border border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 sm:mb-6">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
              </div>
              <div className="text-center sm:text-left">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Step 2: Select Your Barangay</h2>
                <p className="text-xs sm:text-sm text-gray-600">Choose your barangay in Region 10 (Northern Mindanao)</p>
              </div>
            </div>
              
            <div className="space-y-4">
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                  🏙️ Available Barangays in Region 10
                </label>
                {loadingBarangays ? (
                  <div className="flex items-center justify-center py-6 sm:py-8">
                    <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-gray-600"></div>
                    <span className="ml-3 text-sm sm:text-base text-gray-600">Loading barangays...</span>
                  </div>
                ) : (
                  <Select
                    options={[
                      { value: '', label: '🔍 Search and select your barangay...' },
                      ...barangays.map(barangay => ({
                        value: barangay.id,
                        label: `📍 ${barangay.display_name} ${barangay.city !== 'Cagayan de Oro' ? `(${barangay.city})` : ''}`
                      }))
                    ]}
                    {...register('barangay_id', { required: 'Barangay is required' })}
                    error={errors.barangay_id?.message}
                    className="text-base sm:text-lg"
                  />
                )}
              </div>
              
              {/* Show selected location details */}
              {selectedBarangay && (
                <div className="bg-gray-50 p-4 sm:p-6 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                    <span className="text-sm sm:text-base font-semibold text-gray-700">Barangay Selected</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                      <span>📍</span>
                      <div>
                        <div className="font-medium text-gray-700">Barangay</div>
                        <div className="text-gray-600 break-words">{selectedBarangay.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>🏙️</span>
                      <div>
                        <div className="font-medium text-gray-700">City</div>
                        <div className="text-gray-600">{selectedBarangay.city}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
                      <span>🗺️</span>
                      <div>
                        <div className="font-medium text-gray-700">Region</div>
                        <div className="text-gray-600">{selectedBarangay.region}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Map Location Selection */}
          {selectedBarangay && (
            <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-lg border border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 sm:mb-6">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Map className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                </div>
                <div className="text-center sm:text-left">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Step 3: Pin Your Exact Location</h2>
                  <p className="text-xs sm:text-sm text-gray-600">Select your precise address in {selectedBarangay.display_name}</p>
                </div>
              </div>

              <div className="space-y-4 sm:space-y-6">
                {/* Map Button */}
                <div className="text-center">
                  <Button
                    type="button"
                    onClick={handleOpenMap}
                    className={`text-sm sm:text-base lg:text-lg py-3 sm:py-4 px-4 sm:px-6 lg:px-8 rounded-lg font-semibold transition-all duration-300 w-full sm:w-auto ${
                      selectedAddress
                        ? 'bg-gray-600 hover:bg-gray-700 text-white'
                        : 'bg-gray-900 hover:bg-gray-800 text-white'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 sm:gap-3">
                      <MapPin className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
                      <span className="break-words">{selectedAddress ? 'Change Location on Map' : 'Open Region 10 Map'}</span>
                    </div>
                  </Button>
                  <p className="text-xs sm:text-sm text-gray-500 mt-2 px-2">
                    📍 Map restricted to Region 10 (Northern Mindanao) for your convenience
                  </p>
                </div>

                {/* Selected Address Display */}
                {selectedAddress && (
                  <div className="bg-gray-50 p-4 sm:p-6 rounded-lg border border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 mx-auto sm:mx-0 sm:mt-1">
                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                      </div>
                      <div className="flex-1 text-center sm:text-left">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-700 mb-2">📍 Location Confirmed!</h3>
                        <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200">
                          <p className="text-sm sm:text-base text-gray-700 font-medium mb-2 break-words">{selectedAddress}</p>
                          {selectedCoordinates && (
                            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                              🗺️ Coordinates: {selectedCoordinates.lat.toFixed(6)}°N, {selectedCoordinates.lng.toFixed(6)}°E
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          onClick={handleOpenMap}
                          variant="outline"
                          className="mt-3 text-xs sm:text-sm border-gray-300 text-gray-700 hover:bg-gray-50 w-full sm:w-auto"
                        >
                          📍 Adjust Location
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Hidden input for form validation */}
                <input
                  type="hidden"
                  {...register('street_address', { required: 'Please select your location on the map' })}
                  value={selectedAddress}
                />
                {errors.street_address && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
                    <p className="text-red-600 text-xs sm:text-sm font-medium">⚠️ {errors.street_address.message}</p>
                  </div>
                )}

                {/* Postal Code */}
                <div>
                  <Input
                    label="📮 Postal Code (Optional)"
                    error={errors.postal_code?.message}
                    {...register('postal_code', {
                      pattern: {
                        value: /^\d{4}$/,
                        message: 'Please enter a valid 4-digit postal code'
                      }
                    })}
                    placeholder="e.g., 9000 (Cagayan de Oro), 9200 (Iligan)"
                    className="text-base sm:text-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-4 sm:pt-6 lg:pt-8">
            <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl shadow-lg border border-gray-100">
              <div className="text-center mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">Ready to Save Your Address?</h3>
                <p className="text-xs sm:text-sm text-gray-600 px-2">
                  Double-check your information before saving. You can always edit or add more addresses later.
                </p>
              </div>
              
              <Button 
                type="submit" 
                fullWidth 
                isLoading={isSaving}
                disabled={!selectedBarangay || !selectedAddress}
                className={`text-sm sm:text-base lg:text-lg py-3 sm:py-4 rounded-lg font-semibold transition-all duration-300 ${
                  (!selectedBarangay || !selectedAddress) 
                    ? 'opacity-50 cursor-not-allowed bg-gray-300' 
                    : 'bg-gray-900 hover:bg-gray-800 text-white'
                }`}
              >
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white"></div>
                      <span className="break-words">Saving Your Address...</span>
                    </>
                  ) : !selectedBarangay ? (
                    <>
                      <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="break-words">Select Your Barangay First</span>
                    </>
                  ) : !selectedAddress ? (
                    <>
                      <Map className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="break-words">Pin Your Location on Map</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="break-words">Save Address to Profile</span>
                    </>
                  )}
                </div>
              </Button>
              
              {(!selectedBarangay || !selectedAddress) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 mt-4">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-600 flex-shrink-0">⚠️</span>
                    <p className="text-xs sm:text-sm text-amber-700 font-medium">
                      {!selectedBarangay 
                        ? 'Please select your barangay in Step 2 before proceeding'
                        : 'Please pin your exact location on the map in Step 3'
                      }
                    </p>
                  </div>
                </div>
              )}
              
              {selectedBarangay && selectedAddress && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 mt-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <p className="text-xs sm:text-sm text-green-700 font-medium">
                      ✅ All information complete! Ready to save your address.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Map Address Selector */}
        <MapAddressSelector
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          onAddressSelect={handleAddressSelect}
          title={`Select Location in ${selectedBarangay?.display_name || 'Barangay'}`}
          initialAddress={selectedAddress}
        />
      </div>
    </div>
  );
}