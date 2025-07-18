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

// Address type matching the current database schema
type Address = {
  id: string;
  customer_id: string;
  full_name: string;
  phone: string;
  street_address: string;
  barangay: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
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
          setUserAddresses(data);
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

    // Reset the file input to ensure clean state
    e.target.value = '';

    // Debug: Log the original file details
    console.log('Original file details:', {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified
    });

    // Check if file is actually readable and can be loaded as an image
    try {
      const testRead = await file.arrayBuffer();
      console.log('File is readable, size:', testRead.byteLength);
      
      // Try to create an image from the file to validate it's actually an image
      const imageUrl = URL.createObjectURL(file);
      const img = new Image();
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('File is not a valid image'));
        img.src = imageUrl;
      });
      
      URL.revokeObjectURL(imageUrl);
      console.log('File is a valid image');
      
    } catch (readError) {
      console.error('File validation failed:', readError);
      toast.error('The selected file is not a valid image. Please try a different file.');
      return;
    }

    // Validate file type and size
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    // Check file extension as fallback
    const fileExtension = file.name.toLowerCase().split('.').pop() || '';
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    
    // More robust validation - check both MIME type and extension
    const isValidMimeType = allowedTypes.includes(file.type);
    const isValidExtension = validExtensions.includes(fileExtension);
    
    if (!isValidMimeType && !isValidExtension) {
      toast.error('Please select a valid image file (JPEG, PNG, JPG, GIF, WEBP).');
      return;
    }
    
    // Additional check for empty or corrupted files
    if (file.size === 0) {
      toast.error('The selected file appears to be empty.');
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

      // Show preview immediately
      const previewUrl = URL.createObjectURL(file);
      setImageUrl(previewUrl);

      // Create unique file path
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      
      // Determine content type based on file extension first, then fallback to file.type
      const mimeTypes: { [key: string]: string } = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
      };
      
      // Use extension-based content type as primary, fallback to file.type
      let contentType = mimeTypes[fileExtension] || file.type;
      
      // If still not a valid image type, default to jpeg
      if (!allowedTypes.includes(contentType) || contentType === 'application/json') {
        contentType = 'image/jpeg';
      }

      // Create a new file with the correct type using FileReader
      const correctedFile = await new Promise<File>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const blob = new Blob([reader.result as ArrayBuffer], { type: contentType });
          const newFile = new File([blob], file.name, { type: contentType });
          resolve(newFile);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      // Use original file name with timestamp to avoid any naming issues
      const originalName = file.name;
      const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));
      const fileExt = originalName.substring(originalName.lastIndexOf('.') + 1);
      const fileName = `${nameWithoutExt}_${timestamp}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Log upload details
      console.log('Upload details:', {
        originalFileName: file.name,
        originalFileType: file.type,
        fileExtension: fileExtension,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadPath: filePath,
        bucketPath: 'profile-images',
        contentType: contentType,
        allowedTypes: allowedTypes
      });

      // First, try to delete any existing avatar to free up space
      if (profile.avatar_url && profile.avatar_url.includes('profile-images')) {
        try {
          const urlParts = profile.avatar_url.split('/');
          const existingPath = urlParts.slice(-2).join('/');
          await supabase.storage
            .from('profile-images')
            .remove([existingPath]);
          console.log('Removed existing avatar:', existingPath);
        } catch (deleteError) {
          console.log('Could not delete existing avatar:', deleteError);
        }
      }

      // Try using the same approach as successful product uploads
      console.log('Attempting upload using FormData approach');
      console.log('Corrected file type:', correctedFile.type);
      console.log('File path:', filePath);
      console.log('File size:', correctedFile.size);
      
      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required');
      }

      // Create FormData like in ProductsPage
      const formData = new FormData();
      formData.append('file', correctedFile, fileName);

      // Get the Supabase URL and anon key
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // Upload using fetch like in ProductsPage
      const response = await fetch(
        `${supabaseUrl}/storage/v1/object/profile-images/${filePath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': supabaseAnonKey
          },
          body: formData
        }
      );

      if (!response.ok) {
        console.error('Upload failed with status:', response.status);
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const uploadData = await response.json();

      console.log('Upload successful:', uploadData);

      // Get public URL for profile images (they are publicly accessible)
      const { data: urlData } = await supabase.storage
        .from('profile-images')
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to generate public URL');
      }

      console.log('Generated public URL:', urlData.publicUrl);

      // Update profile in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', profile.id);

      if (updateError) {
        console.error('Profile update failed:', updateError);
        throw new Error(`Profile update failed: ${updateError.message}`);
      }

      // Clean up preview URL
      URL.revokeObjectURL(previewUrl);
      
      // Set the new image URL from the uploaded file
      setImageUrl(urlData.publicUrl);

      toast.success('Profile image updated successfully!');
      
    } catch (error) {
      console.error('Image upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Image upload failed';
      toast.error(errorMessage);
      
      // Reset image URL on error
      if (profile?.avatar_url) {
        setImageUrl(cleanImageUrl(profile.avatar_url));
      } else {
        setImageUrl(null);
      }
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

    setSelectedAddressText(address.street_address);
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

        // For new addresses, only save fields that exist in the database
        const addressData = {
          customer_id: user.id,
          full_name: profile?.name || 'User',
          phone: '09123456789', // Default - user can edit later
          street_address: newAddress,
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
        setUserAddresses(updatedAddresses);
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
              onClick={() => navigate('/customer/add-address')}
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
                  onClick={() => navigate(`/customer/edit-address/${address.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-500" />
                        <p className="font-semibold">{address.full_name} {address.phone && `(${address.phone})`}</p>
                      </div>
                      <p className="text-gray-600 mt-1 ml-6">
                        {address.street_address}
                        {address.barangay && (
                          <span className="block text-sm text-blue-600 mt-1">
                            📍 {address.barangay}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-blue-600 mt-2 ml-6">Click to edit address</p>
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