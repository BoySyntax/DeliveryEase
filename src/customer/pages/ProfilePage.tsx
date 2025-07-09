import { useState, useEffect, useRef } from 'react';
import { useProfile } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import Button from '../../ui/components/Button';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';
import Input from '../../ui/components/Input'; // Import Input
import { useForm } from 'react-hook-form'; // Import useForm
import { cleanImageUrl } from '../../lib/utils';
import MapAddressSelector, { loadGoogleMapsScript } from '../components/MapAddressSelector';
import { MapPin } from 'lucide-react';

// Assuming a similar Address type as defined in CheckoutPage.tsx
// You might want to create a shared types file for Address.
type Address = {
  id: string;
  customer_id: string;
  full_name: string;
  phone: string;
  region: string;
  province: string;
  city: string;
  barangay: string;
  postal_code: string;
  street_address: string;
  label?: string;
};




export default function ProfilePage() {
  const { profile, loading } = useProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: profile?.name || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const [userAddresses, setUserAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);

  // useForm for profile editing
  const { register: registerProfile, handleSubmit: handleProfileFormSubmit, formState: { errors: profileErrors }, setValue: setProfileValue } = useForm<{ name: string }>();

  // Profile image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(profile?.avatar_url || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [authUser, setAuthUser] = useState<any>(null);

  // Map address selector state
  const [isMapSelectorOpen, setIsMapSelectorOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [selectedAddressText, setSelectedAddressText] = useState('');
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Fetch user addresses on component mount
  useEffect(() => {
    async function fetchAddresses() {
      if (!profile?.id) return;

      setLoadingAddresses(true);
      try {
        const { data, error } = await supabase
          .from('addresses')
          .select('*')
          .eq('customer_id', profile.id);

        if (error) {
           console.error('Error fetching addresses:', error);
           toast.error('Failed to load addresses');
           return;
        }

        if (data) {
          setUserAddresses(data as Address[]); // Cast to Address[]
        }
      } catch (error) {
        console.error('Error fetching addresses:', error);
         toast.error('Failed to load addresses');
      } finally {
        setLoadingAddresses(false);
      }
    }

    if (profile?.id) {
      fetchAddresses();
    }
  }, [profile]); // Re-run when profile data is available

  // Sync profile data with form when profile changes and not editing
  useEffect(() => {
    if (profile && !isEditing) {
      setProfileValue('name', profile.name || '');
    }
  }, [profile, isEditing, setProfileValue]);

  // Sync profile image when profile changes
  useEffect(() => {
    // Use the utility function to clean and validate the avatar URL
    const cleanedImageUrl = cleanImageUrl(profile?.avatar_url);
    setImageUrl(cleanedImageUrl);
    
    if (profile && !isEditing) {
      setProfileValue('name', profile.name || '');
    }
  }, [profile, isEditing, setProfileValue]);

  // Fetch Supabase Auth user for Google name
  useEffect(() => {
    async function fetchAuthUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setAuthUser(user);
    }
    fetchAuthUser();
  }, []);

  if (loading) {
    return <Loader fullScreen />;
  }

  const handleProfileSubmit = async (data: { name: string }) => { // Updated function signature
    if (!profile?.id) return;
    
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: data.name }) // Use data.name
        .eq('id', profile.id);

      if (error) {
         console.error('Error updating profile:', error);
         toast.error('Failed to update profile');
         return;
      }
      toast.success('Profile updated successfully!');
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
       toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    // Optional: Add a confirmation dialog here before deleting
    if (!window.confirm('Are you sure you want to delete this address?')) {
      return;
    }

    setDeletingAddressId(addressId);
    try {
      const { error } = await supabase
        .from('addresses')
        .delete()
        .eq('id', addressId);

      if (error) {
         console.error('Error deleting address:', error);
         toast.error('Failed to delete address');
         return;
      }

      // Remove the deleted address from the state
      setUserAddresses(prevAddresses => prevAddresses.filter(addr => addr.id !== addressId));
      toast.success('Address deleted successfully!');

    } catch (error) {
      console.error('Error deleting address:', error);
       toast.error('Failed to delete address');
    } finally {
      setDeletingAddressId(null);
    }
  };

  // Handle profile image upload
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      toast.error('No file selected.');
      return;
    }

    // Validate file type and size
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.type)) {
      toast.error('Please select a valid image file (JPEG, PNG, JPG).');
      return;
    }

    if (file.size > maxSize) {
      toast.error('File size should be less than 5MB.');
      return;
    }

    setUploadingImage(true);

    try {
      // Check authentication
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You are not signed in. Please sign in to upload.');
        return;
      }
      if (!profile) {
        toast.error('Profile not loaded.');
        return;
      }

      // Create a preview using FileReader
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64Preview = e.target?.result as string;
          setImageUrl(base64Preview); // Show preview immediately

          // Create a unique file name with original extension
          const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          const fileName = `${Date.now()}.${fileExt}`;
          const filePath = `${user.id}/${fileName}`;

          // Convert file to ArrayBuffer for proper binary upload
          const arrayBuffer = await file.arrayBuffer();
          const fileData = new Uint8Array(arrayBuffer);

          console.log('Uploading file:', {
            bucket: 'profile-images',
            path: filePath,
            type: file.type,
            size: file.size
          });

          // First, try to delete the old profile image if it exists
          if (profile.avatar_url) {
            try {
              const oldPath = new URL(profile.avatar_url).pathname.split('/').slice(-2).join('/');
              if (oldPath) {
                await supabase.storage
                  .from('profile-images')
                  .remove([oldPath]);
              }
            } catch (error) {
              console.warn('Failed to delete old profile image:', error);
              // Continue with upload even if delete fails
            }
          }

          // Upload to Supabase Storage with proper binary handling
          const { error: uploadError } = await supabase.storage
            .from('profile-images')
            .upload(filePath, fileData, {
              contentType: file.type,
              duplex: 'half',
              upsert: true
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            throw uploadError;
          }

          // Get public URL
          const { data } = supabase.storage
            .from('profile-images')
            .getPublicUrl(filePath);

          if (!data.publicUrl) {
            throw new Error('Failed to get public URL for uploaded image');
          }

          console.log('Generated public URL:', data.publicUrl);

          // Update profile with new avatar_url
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ avatar_url: data.publicUrl })
            .eq('id', profile.id);

          if (updateError) throw updateError;

          // Keep the base64 preview until the next successful upload
          toast.success('Profile image updated successfully!');
        } catch (error) {
          console.error('Image upload error:', error);
          if (error instanceof Error) {
            toast.error(error.message);
          } else if (typeof error === 'object' && error !== null && 'message' in error) {
            toast.error((error as any).message);
          } else {
            toast.error('Failed to upload image. Please try again.');
          }
          setImageUrl(null);
        } finally {
          setUploadingImage(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };

      reader.onerror = () => {
        toast.error('Failed to read image file.');
        setUploadingImage(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Image upload error:', error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        toast.error((error as any).message);
      } else {
        toast.error('Failed to upload image. Please try again.');
      }
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Add error handling for image display
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    target.style.display = 'none';
    setImageUrl(null);
  };

  // Map address selector functions
  const handleEditAddressWithMap = async (address: Address) => {
    // Load Google Maps if not already loaded
    if (!mapsLoaded) {
      try {
        await loadGoogleMapsScript();
        setMapsLoaded(true);
      } catch (error) {
        console.error('Failed to load Google Maps:', error);
        toast.error('Failed to load map. Please try again.');
        return;
      }
    }

    const fullAddress = [
      address.street_address,
      address.barangay,
      address.city,
      address.province,
      address.region,
      address.postal_code
    ].filter(Boolean).join(', ');

    setSelectedAddressText(fullAddress);
    setEditingAddressId(address.id);
    setIsMapSelectorOpen(true);
  };

  const handleAddAddressWithMap = async () => {
    // Load Google Maps if not already loaded
    if (!mapsLoaded) {
      try {
        await loadGoogleMapsScript();
        setMapsLoaded(true);
      } catch (error) {
        console.error('Failed to load Google Maps:', error);
        toast.error('Failed to load map. Please try again.');
        return;
      }
    }

    // Clear any previous data and open in "add mode"
    setSelectedAddressText('');
    setEditingAddressId(null);
    setIsMapSelectorOpen(true);
  };

  const handleAddressSelection = async (newAddress: string, coordinates?: { lat: number; lng: number }) => {
    if (editingAddressId) {
      // Edit existing address
      setIsSaving(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to update address');
          return;
        }

        const { error } = await supabase
          .from('addresses')
          .update({ 
            street_address: newAddress,
          })
          .eq('id', editingAddressId)
          .eq('customer_id', user.id);

        if (error) throw error;

        toast.success('Address updated successfully!');
        
      } catch (error) {
        console.error('Error updating address:', error);
        toast.error('Failed to update address');
      } finally {
        setIsSaving(false);
      }
    } else {
      // Add new address
      setIsSaving(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to add an address');
          return;
        }

        // For new addresses, we need to get basic contact info
        // For now, we'll use default values - you might want to prompt for these
        const addressData = {
          customer_id: user.id,
          full_name: profile?.name || 'User',
          phone: '09123456789', // Default - user can edit later
          street_address: newAddress,
          barangay: 'N/A', // These would normally be parsed from the address
          city: 'N/A',
          province: 'N/A', 
          region: 'N/A',
          postal_code: '0000',
        };

        const { error } = await supabase
          .from('addresses')
          .insert([addressData]);

        if (error) throw error;

        toast.success('Address added successfully!');
        
      } catch (error) {
        console.error('Error adding address:', error);
        toast.error('Failed to add address');
      } finally {
        setIsSaving(false);
      }
    }

    // Refresh addresses list
    if (profile?.id) {
      const { data: updatedAddresses, error: fetchError } = await supabase
        .from('addresses')
        .select('*')
        .eq('customer_id', profile.id);

      if (fetchError) {
        console.error('Error re-fetching addresses:', fetchError);
        toast.error('Failed to refresh addresses list');
      }
      if (updatedAddresses) {
        setUserAddresses(updatedAddresses as Address[]);
      }
    }

    setIsMapSelectorOpen(false);
    setEditingAddressId(null);
    setSelectedAddressText('');
  };

  const handleCloseMapSelector = () => {
    setIsMapSelectorOpen(false);
    setEditingAddressId(null);
    setSelectedAddressText('');
  };

  const handleLogout = async () => {
    // Add confirmation dialog
    if (!window.confirm('Are you sure you want to sign out?')) {
      return;
    }

    try {
      await supabase.auth.signOut();
      toast.success('Signed out successfully');
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    }
  };

  return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-lg space-y-8">
        {/* Profile Image and Name Display */}
        <div className="flex items-center mb-6 gap-6">
          <div className="relative">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover shadow"
                onError={handleImageError}
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center shadow">
                <span className="text-gray-400 text-3xl">?</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageChange}
              className="hidden"
              id="profile-image-upload"
              disabled={uploadingImage}
            />
            <button
              type="button"
              className="absolute bottom-0 right-0 bg-primary-500 text-white rounded-full p-2 shadow hover:bg-primary-600 focus:outline-none"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              title="Upload profile image"
            >
              {uploadingImage ? (
                <span className="loader w-4 h-4" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5v-9m0 0l-3.75 3.75M12 7.5l3.75 3.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </button>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {profile?.name ||
                authUser?.user_metadata?.full_name ||
                authUser?.user_metadata?.name ||
                authUser?.user_metadata?.given_name ||
                'Not provided'}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {authUser?.email || 'No email provided'}
            </div>
          </div>
        </div>
        {/* Profile Information Section */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Profile Information</h2>
            {!isEditing && (
              <button
                className="px-4 py-2 border rounded"
                onClick={() => setIsEditing(true)}
              >
                Edit Profile
              </button>
            )}
          </div>
          {isEditing ? (
            <form onSubmit={handleProfileFormSubmit(handleProfileSubmit)} className="space-y-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700">Full Name</label>
                 <input
                   type="text"
                   {...registerProfile('name', { required: 'Name is required' })}
                   className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                 />
                 {profileErrors.name && (
                   <p className="mt-1 text-sm text-red-600">{profileErrors.name.message}</p>
                 )}
               </div>
               <div className="flex justify-end space-x-3">
                 <Button
                   type="button"
                   variant="outline"
                   onClick={() => setIsEditing(false)}
                   disabled={isSaving}
                 >
                   Cancel
                 </Button>
                 <Button
                   type="submit"
                   disabled={isSaving}
                 >
                   {isSaving ? 'Saving...' : 'Save Changes'}
                 </Button>
               </div>
             </form>
          ) : (
            <div className="text-gray-600">
              {profile?.name || 'No name provided'}
            </div>
          )}
        </div>

        {/* Address Management Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Addresses</h2>
            <Button
              variant="outline"
              onClick={handleAddAddressWithMap}
            >
              Add New Address
            </Button>
          </div>

          {loadingAddresses ? (
            <Loader label="Loading addresses..." />
          ) : userAddresses.length > 0 ? (
            <div className="space-y-4">
              {userAddresses.map(address => (
                <div 
                  key={address.id} 
                  className="border rounded-md p-4 space-y-2 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleEditAddressWithMap(address)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-500" />
                        <p className="font-semibold">{address.full_name} {address.phone && `(${address.phone})`}</p>
                      </div>
                      <p className="text-gray-600 mt-1 ml-6">
                        {[
                          address.street_address,
                          address.barangay,
                          address.city,
                          address.province,
                          address.region,
                          address.postal_code
                        ].filter(Boolean).join(', ')}
                      </p>
                      <p className="text-sm text-blue-600 mt-2 ml-6">Click to edit on map</p>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-3" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      onClick={() => handleDeleteAddress(address.id)}
                      disabled={deletingAddressId === address.id}
                    >
                      {deletingAddressId === address.id ? 'Deleting...' : 'Delete'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center">No addresses found</p>
          )}
        </div>

        {/* Logout Section */}
        <div className="border-t pt-6 flex justify-end">
          <Button
            variant="danger"
            onClick={handleLogout}
            size="md"
          >
            Logout
          </Button>
        </div>
      </div>

      {/* Map Address Selector */}
      <MapAddressSelector
        isOpen={isMapSelectorOpen}
        onClose={handleCloseMapSelector}
        onAddressSelect={handleAddressSelection}
        initialAddress={selectedAddressText}
        title={editingAddressId ? "Edit Address Location" : "Add New Address"}
      />
    </div>
  );
}