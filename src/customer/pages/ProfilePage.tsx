import { useState, useEffect } from 'react';
import { useProfile } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import Button from '../../ui/components/Button';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';
import Input from '../../ui/components/Input'; // Import Input
import { useForm } from 'react-hook-form'; // Import useForm

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

type AddAddressForm = {
  full_name: string;
  phone: string;
  region: string;
  province: string;
  city: string;
  barangay: string;
  postal_code: string;
  street_address: string;
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

  // State for Add Address form visibility
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);

  // useForm for profile editing
  const { register: registerProfile, handleSubmit: handleProfileFormSubmit, formState: { errors: profileErrors }, setValue: setProfileValue } = useForm<{ name: string }>();
  // useForm for adding address
  const { register: registerAdd, handleSubmit: handleAddSubmit, formState: { errors: addErrors }, reset: resetAddForm } = useForm<AddAddressForm>();


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

   const handleAddAddressSubmit = async (data: AddAddressForm) => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to add an address');
        return;
      }

      const addressData = {
        ...data,
        customer_id: user.id,
      };

      const { error } = await supabase
        .from('addresses')
        .insert([addressData]);

      if (error) {
        console.error('Supabase insert error:', error);
        throw new Error(`Failed to save address: ${error.message}`);
      }

      toast.success('Address added successfully!');
      setShowAddAddressForm(false);
      resetAddForm();
      
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

    } catch (error) {
      console.error('Error adding address:', error);
      toast.error(error instanceof Error ? error.message : 'An unexpected error occurred while saving address');
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


  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/'); // Redirect to home or login page after logout
  };

  return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-lg space-y-8"> {/* Added space-y-8 */}
        {/* Profile Information Section */}
        <div className="space-y-6"> {/* Added space-y-6 */}
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Profile Information</h2> {/* Updated heading */}
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
            <div className="space-y-4">
              <div>
                <span className="text-gray-500 text-sm">Full Name</span>
                <div className="font-semibold">{profile?.name || 'Not provided'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Address Management Section */}
        <div className="space-y-4"> {/* Added space-y-4 */}
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Addresses</h2> {/* New heading */}
            {!showAddAddressForm && (
              <Button
                variant="outline"
                onClick={() => setShowAddAddressForm(true)}
              >
                Add New Address
              </Button>
            )}
          </div>

          {showAddAddressForm ? (
             <div className="space-y-4 bg-gray-50 p-4 rounded-lg"> {/* Add Address Form */}
               <h3 className="text-xl font-semibold text-gray-900">Add New Address</h3>
                <form onSubmit={handleAddSubmit(handleAddAddressSubmit)} className="space-y-4"> {/* Updated handleSubmit to use handleAddSubmit */}
                   {/* Contact Section - Implicit from Full Name and Phone */}
                   <h4 className="text-lg font-semibold text-gray-900">Contact</h4>
                   <Input
                     label="Full Name"
                     error={addErrors.full_name?.message}
                     {...registerAdd('full_name', { required: 'Full name is required' })}
                   />
                   <Input
                     label="Phone Number"
                     error={addErrors.phone?.message}
                     {...registerAdd('phone', { required: 'Phone number is required' })}
                   />

                   {/* Address Section */}
                   <h4 className="text-lg font-semibold text-gray-900">Address</h4>
                   {/* NOTE: Implementing cascading dropdowns for Region, Province, City, Barangay requires a geographical data source. */}
                   {/* These are placeholder Inputs for now. You'll need to replace them with actual select/dropdown components */}
                   {/* and integrate with a data source for Philippine geographical divisions. */}
                   {/* Ensure the data source allows filtering to focus on Mindanao. */}
                   <Input
                     label="Region (Mindanao focus)"
                     error={addErrors.region?.message}
                     {...registerAdd('region', { required: 'Region is required' })}
                     placeholder="e.g., Mindanao"
                   />
                    <Input
                     label="Province"
                     error={addErrors.province?.message}
                     {...registerAdd('province', { required: 'Province is required' })}
                   />
                   <Input
                     label="City"
                     error={addErrors.city?.message}
                     {...registerAdd('city', { required: 'City is required' })}
                   />
                    <Input
                     label="Barangay"
                     error={addErrors.barangay?.message}
                     {...registerAdd('barangay', { required: 'Barangay is required' })}
                   />

                   <Input
                     label="Postal Code"
                     error={addErrors.postal_code?.message}
                     {...registerAdd('postal_code', { required: 'Postal code is required' })}
                   />
                   <Input
                     label="Street Name, Building, House No."
                     error={addErrors.street_address?.message}
                     {...registerAdd('street_address', { required: 'Street address is required' })}
                   />

                   <div className="flex justify-end space-x-3 mt-6">
                     <Button type="button" variant="outline" onClick={() => setShowAddAddressForm(false)} disabled={isSaving}>
                       Cancel
                     </Button>
                     <Button type="submit" isLoading={isSaving}>
                       Save Address
                     </Button>
                   </div>

                 </form>
             </div>

          ) : loadingAddresses ? (
            <Loader label="Loading addresses..." />
          ) : userAddresses.length > 0 ? (
            <div className="space-y-4">
              {userAddresses.map(address => (
                <div key={address.id} className="border rounded-md p-4 space-y-2"> {/* Address Card */}
                  <p className="font-semibold">{address.full_name} {address.phone && `(${address.phone})`}</p>
                  <p className="text-gray-600 text-sm">{address.street_address}, {address.barangay}, {address.city}, {address.province}, {address.region} {address.postal_code}</p>
                  {address.label && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {address.label}
                    </span>
                  )}
                  <div className="flex space-x-2 mt-2"> {/* Action Buttons */}
                    <Button variant="outline" size="sm" onClick={() => navigate(`/customer/edit-address/${address.id}`)}>
                      Edit
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-red-600 border-gray-200 hover:bg-red-50"
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
            <div className="text-center text-gray-500">
              No addresses found. Click 'Add New Address' to add one.
            </div>
          )}
        </div>

        {/* Logout Button - Moved to the end or kept in the profile section header as before */}
        {/* Keeping it in the header as per original structure */}
        {/* This button was originally in the header, ensure its placement is consistent if moved */} 
         {!isEditing && !showAddAddressForm && (
           <div className="flex justify-end mt-6"> {/* Adjusted margin-top */} 
             <button
               className="px-4 py-2 border rounded bg-red-50 text-red-600 hover:bg-red-100"
               onClick={handleLogout}
             >
               Logout
             </button>
           </div>
         )}

      </div>
    </div>
  );
}