import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { User, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import VehicleForm from '../components/VehicleForm';
import { useProfile } from '../../lib/auth';
import { cleanImageUrl } from '../../lib/utils';

type ProfileFormData = {
  name: string;
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<ProfileFormData>();
  
  // Profile image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(profile?.avatar_url || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  // Sync profile image when profile changes
  useEffect(() => {
    const cleanedImageUrl = cleanImageUrl(profile?.avatar_url);
    setImageUrl(cleanedImageUrl);
  }, [profile]);

  async function loadProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single();

      if (profile) {
        setValue('name', profile.name || '');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  const onSubmit = async (data: ProfileFormData) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          name: data.name,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
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
          console.log('Deleted existing avatar:', existingPath);
        } catch (deleteError) {
          console.log('Could not delete existing avatar (may not exist):', deleteError);
        }
      }

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
        console.error('Database update error:', updateError);
        throw updateError;
      }

      // Clean up preview URL
      URL.revokeObjectURL(previewUrl);
      
      // Set the final URL
      setImageUrl(urlData.publicUrl);
      
      toast.success('Profile picture updated successfully!');

    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image. Please try again.');
      
      // Revert to original image on error
      setImageUrl(profile?.avatar_url || null);
    } finally {
      setUploadingImage(false);
    }
  };

  // Add error handling for image display
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    target.style.display = 'none';
    setImageUrl(null);
  };

  if (loading) {
    return <Loader label="Loading profile..." />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Profile & Vehicle</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Profile Image Section */}
              <div className="flex items-center mb-6 gap-6">
                <div className="relative">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Profile"
                      className="w-24 h-24 rounded-full object-cover shadow border-2 border-gray-200"
                      onError={handleImageError}
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center shadow border-2 border-gray-200">
                      <User className="w-10 h-10 text-blue-500" />
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
                    className="absolute bottom-0 right-0 bg-blue-500 text-white rounded-full p-2 shadow-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    title="Upload profile image"
                  >
                    {uploadingImage ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {profile?.name || 'Driver Profile'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Click the camera icon to upload a profile picture
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Max size: 5MB • JPG, PNG, GIF, WebP
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="Full Name"
                  icon={<User size={18} />}
                  error={errors.name?.message}
                  {...register('name', { required: 'Name is required' })}
                />

                <div className="flex justify-end space-x-2">
                  <Button type="submit">
                    Save Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <Button
                variant="outline"
                fullWidth
                onClick={handleSignOut}
              >
                Sign Out
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Vehicle Information */}
        <div className="space-y-6">
          {profile?.id && (
            <VehicleForm 
              driverId={profile.id}
              onVehicleSaved={() => {
                // Optional: Add any callback logic here
                console.log('Vehicle saved successfully');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}