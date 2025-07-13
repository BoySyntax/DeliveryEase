import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { ArrowLeft, MapPin, Home, Map, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import Select from '../../ui/components/Select';
import Loader from '../../ui/components/Loader';
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
  street_address: string;
};

export default function EditAddressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [barangays, setBarangays] = useState<BarangayOption[]>([]);
  const [loadingBarangays, setLoadingBarangays] = useState(true);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<AddressForm>();

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

  useEffect(() => {
    async function fetchAddress() {
      if (!id) {
        toast.error('Address ID is missing');
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('addresses')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;

        if (data) {
          // Find the barangay that matches the stored barangay name
          const matchingBarangay = barangays.find(b => 
            b.display_name === data.barangay || b.name === data.barangay
          );
          
          // Set the form data
          reset({
            full_name: data.full_name,
            phone: data.phone,
            street_address: data.street_address,
            barangay_id: matchingBarangay?.id || ''
          });

          // Set the selected address for map display
          setSelectedAddress(data.street_address || '');
          
          // If coordinates exist in the data, set them (coordinates might not exist in legacy addresses)
          if (data.latitude && data.longitude) {
            setSelectedCoordinates({
              lat: data.latitude,
              lng: data.longitude
            });
          }
        }
      } catch (error) {
        console.error('Error fetching address:', error);
        toast.error('Failed to load address details');
      } finally {
        setLoading(false);
      }
    }

    // Only fetch address after barangays are loaded
    if (!loadingBarangays && barangays.length > 0) {
      fetchAddress();
    }
  }, [id, reset, barangays, loadingBarangays]);

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
    toast.success('Location updated successfully!');
  };

  const onSubmit = async (data: AddressForm) => {
    if (!id) return;

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to update an address');
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

      // Ensure the user owns this address before updating
      const { data: address, error: fetchError } = await supabase
        .from('addresses')
        .select('customer_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!address || address.customer_id !== user.id) {
        toast.error('You do not have permission to edit this address');
        setIsSaving(false);
        return;
      }

      const updateData = {
        full_name: data.full_name,
        phone: data.phone,
        street_address: selectedAddress,
        barangay: selectedBarangay.display_name,
        // Update coordinates if available
        ...(selectedCoordinates && {
          latitude: selectedCoordinates.lat,
          longitude: selectedCoordinates.lng
        })
      };

      const { error: updateError } = await supabase
        .from('addresses')
        .update(updateData)
        .eq('id', id);

      if (updateError) throw updateError;

      toast.success('Address updated successfully!');
      navigate('/customer/profile');

    } catch (error) {
      console.error('Error updating address:', error);
      toast.error('Failed to update address');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || loadingBarangays) {
    return <Loader label="Loading address..." />;
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Button
        variant="ghost"
        icon={<ArrowLeft size={18} />}
        onClick={() => navigate('/customer/profile')}
        className="mb-6"
      >
        Back to Profile
      </Button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Address</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Contact Information */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Home className="w-5 h-5" />
            Contact Information
          </h2>
          <div className="space-y-4">
            <Input
              label="Full Name"
              error={errors.full_name?.message}
              {...register('full_name', { required: 'Full name is required' })}
              placeholder="Enter your full name"
            />
            <Input
              label="Phone Number"
              error={errors.phone?.message}
              {...register('phone', { required: 'Phone number is required' })}
              placeholder="e.g., 09123456789"
            />
          </div>
        </div>

        {/* Step 1: Barangay Selection */}
        <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
          <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            Step 1: Update Your Barangay
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Change your barangay if needed. This determines your delivery area and batch assignment.
          </p>
          
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Barangay (Region 10 - Northern Mindanao)
            </label>
            <Select
              options={[
                { value: '', label: 'Select your barangay' },
                ...barangays.map(barangay => ({
                  value: barangay.id,
                  label: barangay.display_name
                }))
              ]}
              {...register('barangay_id', { required: 'Barangay is required' })}
              error={errors.barangay_id?.message}
            />
            
            {/* Show selected location details */}
            {selectedBarangay && (
              <div className="text-sm text-gray-700 bg-white p-3 rounded border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <strong>Selected Barangay:</strong>
                </div>
                <div className="ml-6">
                  <div>📍 {selectedBarangay.name}</div>
                  <div>🏙️ {selectedBarangay.city}, {selectedBarangay.province}</div>
                  <div>🗺️ {selectedBarangay.region}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Map Location Selection */}
        {selectedBarangay && (
          <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500">
            <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Map className="w-5 h-5 text-green-600" />
              Step 2: Update Your Exact Location in {selectedBarangay.name}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Click the button below to open the map and update your exact location within {selectedBarangay.display_name}.
            </p>

            <div className="space-y-4">
              <Button
                type="button"
                onClick={handleOpenMap}
                variant="outline"
                className="w-full flex items-center justify-center gap-2 py-3 border-green-300 text-green-700 hover:bg-green-100"
              >
                <MapPin className="w-5 h-5" />
                {selectedAddress ? 'Update Location on Map' : 'Select Location on Map'}
              </Button>

              {selectedAddress && (
                <div className="bg-white p-3 rounded border border-green-200">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <strong>Current Location:</strong>
                  </div>
                  <div className="ml-6 text-sm text-gray-700">
                    📍 {selectedAddress}
                    {selectedCoordinates && (
                      <div className="text-xs text-gray-500 mt-1">
                        Coordinates: {selectedCoordinates.lat.toFixed(6)}, {selectedCoordinates.lng.toFixed(6)}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    onClick={handleOpenMap}
                    variant="outline"
                    className="mt-2 text-xs py-1 px-2"
                  >
                    Change Location
                  </Button>
                </div>
              )}

              {/* Hidden input for form validation */}
              <input
                type="hidden"
                {...register('street_address', { required: 'Please select your location on the map' })}
                value={selectedAddress}
              />
              {errors.street_address && (
                <p className="text-red-500 text-sm">{errors.street_address.message}</p>
              )}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="pt-4">
          <Button 
            type="submit" 
            fullWidth 
            isLoading={isSaving}
            disabled={!selectedBarangay || !selectedAddress}
            className={(!selectedBarangay || !selectedAddress) ? 'opacity-50 cursor-not-allowed' : ''}
          >
            {!selectedBarangay 
              ? 'Please select your barangay first' 
              : !selectedAddress
                ? 'Please select your location on the map'
                : isSaving 
                  ? 'Updating Address...' 
                  : 'Update Address'
            }
          </Button>
          
          {(!selectedBarangay || !selectedAddress) && (
            <p className="text-xs text-gray-500 text-center mt-2">
              {!selectedBarangay 
                ? 'You must select your barangay before proceeding'
                : 'You must select your location on the map before saving'
              }
            </p>
          )}
        </div>
      </form>

      {/* Map Address Selector */}
      <MapAddressSelector
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        onAddressSelect={handleAddressSelect}
        title={`Update Location in ${selectedBarangay?.display_name || 'Barangay'}`}
        initialAddress={selectedAddress}
      />
    </div>
  );
} 