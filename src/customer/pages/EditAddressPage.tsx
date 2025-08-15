import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { ArrowLeft, MapPin, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import Loader from '../../ui/components/Loader';
import MapAddressSelector, { loadGoogleMapsScript } from '../components/MapAddressSelector';
import homeLoadingGif from '../../assets/Home Icon Loading.gif';
import locationGif from '../../assets/Location.gif';
import { type DetectedBarangay } from '../../lib/utils';

type AddressForm = {
  full_name: string;
  phone: string;
  street_address: string;
};

export default function EditAddressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [existingBarangay, setExistingBarangay] = useState<string | null>(null);
  const [detectedBarangayInfo, setDetectedBarangayInfo] = useState<DetectedBarangay | null>(null);
  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm<AddressForm>();

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
          // Set the form data
          reset({
            full_name: data.full_name,
            phone: data.phone,
            street_address: data.street_address,
          });

          // Set the selected address for map display
          setSelectedAddress(data.street_address || '');
          setExistingBarangay(data.barangay || null);
          
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

    fetchAddress();
  }, [id, reset]);

  const handleOpenMap = async () => {
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

  const handleAddressSelect = (address: string, coordinates?: { lat: number; lng: number }, detectedBarangay?: DetectedBarangay) => {
    setSelectedAddress(address);
    setSelectedCoordinates(coordinates || null);
    setValue('street_address', address);
    if (detectedBarangay) {
      setDetectedBarangayInfo(detectedBarangay);
      toast.success(`📍 Auto-detected: ${detectedBarangay.barangay}, ${detectedBarangay.city}`);
    }
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

      const barangayToSave = detectedBarangayInfo
        ? `${detectedBarangayInfo.barangay}, ${detectedBarangayInfo.city}`
        : existingBarangay;

      if (!barangayToSave) {
        toast.error('Please pin your location to auto-detect barangay');
        setIsSaving(false);
        return;
      }

      const updateData = {
        full_name: data.full_name,
        phone: data.phone,
        street_address: selectedAddress,
        barangay: barangayToSave,
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

  if (loading) {
    return <Loader label="Loading address..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="max-w-2xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        icon={<ArrowLeft size={18} />}
        onClick={() => navigate('/customer/profile')}
        className="mb-6 text-gray-600 hover:text-gray-800 hover:bg-gray-100"
      >
        Back to Profile
      </Button>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit Address</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Contact Information */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={homeLoadingGif} alt="Home" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Contact Information</h2>
              <p className="text-sm text-gray-500">Who should we contact for this delivery?</p>
            </div>
          </div>
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
              {...register('phone', { 
                required: 'Phone number is required',
                pattern: { value: /^\d{10}$/, message: 'Enter 10 digits after +63 (e.g., 9123456789)' }
              })}
              inputMode="tel"
                              pattern="[0-9]{10}"
              maxLength={10}
              startAdornment={'+63'}
              placeholder="e.g., 9123456789"
            />
          </div>
        </div>
        {/* Map Location Selection (auto-detect barangay) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={locationGif} alt="Location" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Pin Your Location</h2>
              <p className="text-sm text-gray-500">We'll automatically detect your barangay</p>
            </div>
          </div>

          <div className="space-y-4">
            <Button
              type="button"
              onClick={handleOpenMap}
              fullWidth
              className={`py-4 rounded-xl font-medium transition-all duration-200 ${
                selectedAddress
                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <MapPin className="w-5 h-5" />
                <span>{selectedAddress ? 'Change Location on Map' : 'Open Map & Auto-Detect Barangay'}</span>
              </div>
            </Button>

            {selectedAddress && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-medium text-green-800 mb-1">Location Selected</h3>
                    <p className="text-sm text-green-700 break-words">{selectedAddress}</p>
                    {(detectedBarangayInfo || existingBarangay) && (
                      <p className="text-xs text-green-600 mt-1">
                        📍 Barangay: {detectedBarangayInfo ? `${detectedBarangayInfo.barangay}, ${detectedBarangayInfo.city}` : existingBarangay}
                      </p>
                    )}
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
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{errors.street_address.message}</p>
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-0">
          <Button 
            type="submit" 
            fullWidth 
            isLoading={isSaving}
            disabled={!selectedAddress || (!detectedBarangayInfo && !existingBarangay)}
            className={`py-3 rounded-xl font-medium transition-all duration-200 ${
              (!selectedAddress || (!detectedBarangayInfo && !existingBarangay))
                ? 'opacity-50 cursor-not-allowed bg-gray-300'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              {isSaving ? (
                <span>Updating Address...</span>
              ) : !selectedAddress ? (
                <>
                  <MapPin className="w-5 h-5" />
                  <span>Pin Your Location</span>
                </>
              ) : !detectedBarangayInfo && !existingBarangay ? (
                <>
                  <MapPin className="w-5 h-5" />
                  <span>Detecting Barangay...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>Update Address</span>
                </>
              )}
            </div>
          </Button>
        </div>
      </form>

      {/* Map Address Selector */}
      <MapAddressSelector
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        onAddressSelect={handleAddressSelect}
        initialAddress={selectedAddress}
      />
      </div>
    </div>
  );
} 