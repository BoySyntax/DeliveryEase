import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { ArrowLeft, MapPin, CheckCircle } from 'lucide-react';
import homeLoadingGif from '../../assets/Home Icon Loading.gif';
import locationGif from '../../assets/Location.gif';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import MapAddressSelector, { loadGoogleMapsScript } from '../components/MapAddressSelector';
import { type DetectedBarangay } from '../../lib/utils';

type AddressForm = {
  full_name: string;
  phone: string;
  postal_code: string;
  street_address: string;
};

// Removed unused CITY_COORDINATES - map component handles centering internally

export default function AddAddressPage() {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  // Removed barangays state - now auto-detected from map
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [detectedBarangayInfo, setDetectedBarangayInfo] = useState<DetectedBarangay | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<AddressForm>();

  // Gate map access until contact info is provided
  const fullNameValue = watch('full_name');
  const phoneValue = watch('phone');
  const isContactInfoValid = Boolean(fullNameValue?.trim() && /^\d{10}$/.test(phoneValue || ''));
  const currentStep = isContactInfoValid ? 2 : 1;

  // Removed manual barangay selection - now auto-detected from map

  // Removed barangay loading - now auto-detected from map location

  const handleOpenMap = async () => {
    if (!isContactInfoValid) {
      toast.error('Please fill in your Contact Information (name and valid phone) before pinning your location.');
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

  const handleAddressSelect = (address: string, coordinates?: { lat: number; lng: number }, detectedBarangay?: DetectedBarangay) => {
    setSelectedAddress(address);
    setSelectedCoordinates(coordinates || null);
    setValue('street_address', address);
    
    // Handle detected barangay
    if (detectedBarangay) {
      setDetectedBarangayInfo(detectedBarangay);
      toast.success(`📍 Auto-detected: ${detectedBarangay.barangay}, ${detectedBarangay.city}`);
    }
    
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

      if (!detectedBarangayInfo) {
        toast.error('Please pin your location on the map to detect your barangay');
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
        barangay: `${detectedBarangayInfo.barangay}, ${detectedBarangayInfo.city}`,
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="max-w-2xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            icon={<ArrowLeft size={18} />}
            onClick={() => navigate('/customer/profile')}
            className="mb-6 text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            Back to Profile
          </Button>

          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Add New Address</h1>
            <p className="text-gray-600">Fill in your details and pin your location</p>
            {/* Step Indicator */}
            <div className="mt-4 flex items-center justify-center gap-4 select-none">
              <div className="flex items-center gap-2">
                <div className={`${currentStep === 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'} w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold`}>1</div>
                <span className={`${currentStep === 1 ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>Contact Info</span>
              </div>
              <div className={`${currentStep === 2 ? 'bg-blue-400' : 'bg-gray-300'} h-0.5 w-10 rounded-full`}></div>
              <div className="flex items-center gap-2">
                <div className={`${currentStep === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'} w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold`}>2</div>
                <span className={`${currentStep === 2 ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>Pin Location</span>
              </div>
            </div>
          </div>
        </div>

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
                className="border-2 border-gray-300 focus:border-blue-500"
              />
              <Input
                label="Phone Number"
                error={errors.phone?.message}
                {...register('phone', { 
                  required: 'Phone number is required',
                  pattern: {
                    value: /^\d{10}$/,
                    message: 'Enter 10 digits after +63 (e.g., 9123456789)'
                  }
                })}
                inputMode="tel"
                pattern="[0-9]{10}"
                maxLength={10}
                startAdornment={'+63'}
                placeholder="e.g., 9123456789"
                className="border-2 border-gray-300 focus:border-blue-500"
              />
            </div>
          </div>



          {/* Location Selection */}
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
              {/* Map Button */}
              <Button
                type="button"
                onClick={handleOpenMap}
                fullWidth
                disabled={!isContactInfoValid}
                className={`py-4 rounded-xl font-medium transition-all duration-200 ${
                  selectedAddress
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                    : isContactInfoValid
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <MapPin className="w-5 h-5" />
                  <span>{selectedAddress ? 'Change Location' : 'Open Map'}</span>
                </div>
              </Button>

              {/* Selected Address Display */}
              {selectedAddress && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-medium text-green-800 mb-1">Location Confirmed</h3>
                      <p className="text-sm text-green-700 break-words">{selectedAddress}</p>
                      {detectedBarangayInfo && (
                        <p className="text-xs text-green-600 mt-1">
                          📍 Barangay: {detectedBarangayInfo.barangay}, {detectedBarangayInfo.city}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Postal Code */}
              <Input
                label="Postal Code"
                error={errors.postal_code?.message}
                {...register('postal_code', {
                  required: 'Postal code is required',
                  pattern: {
                    value: /^\d{4}$/,
                    message: 'Please enter a valid 4-digit postal code'
                  }
                })}
                disabled={!isContactInfoValid}
                className={`border-2 focus:border-blue-500 ${
                  isContactInfoValid 
                    ? 'border-gray-300' 
                    : 'border-gray-200 bg-gray-100 cursor-not-allowed'
                }`}
              />

              {/* Hidden input for form validation */}
              <input
                type="hidden"
                {...register('street_address', { required: 'Please select your location on the map' })}
                value={selectedAddress}
              />
              {errors.street_address && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm">⚠️ {errors.street_address.message}</p>
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
              disabled={!selectedAddress || !detectedBarangayInfo || !watch('postal_code')?.trim()}
              className={`py-3 rounded-xl font-medium transition-all duration-200 ${
                (!selectedAddress || !detectedBarangayInfo || !watch('postal_code')?.trim())
                  ? 'opacity-50 cursor-not-allowed bg-gray-300' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                {isSaving ? (
                  <span>Saving Address...</span>
                ) : !selectedAddress ? (
                  <>
                    <MapPin className="w-5 h-5" />
                    <span>Pin Your Location</span>
                  </>
                ) : !detectedBarangayInfo ? (
                  <>
                    <MapPin className="w-5 h-5" />
                    <span>Detecting Barangay...</span>
                  </>
                ) : !watch('postal_code')?.trim() ? (
                  <>
                    <MapPin className="w-5 h-5" />
                    <span>Enter Postal Code</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>Save Address</span>
                  </>
                )}
              </div>
            </Button>
            
            {/* Removed extra warning banner to keep UI clean */}
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