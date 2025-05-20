import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import Loader from '../../ui/components/Loader';

// Assuming a similar Address type as defined in ProfilePage.tsx and CheckoutPage.tsx
// Ideally, this type should be in a shared types file.
type AddressForm = {
  full_name: string;
  phone: string;
  region: string;
  province: string;
  city: string;
  barangay: string;
  postal_code: string;
  street_address: string;
  label: string | null;
};

export default function EditAddressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { register, handleSubmit, formState: { errors }, reset } = useForm<AddressForm>();

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
          reset(data); // Populate the form with fetched data
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

  const onSubmit = async (data: AddressForm) => {
    if (!id) return; // Should not happen if fetchAddress works, but for safety

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to update an address');
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

      const { error: updateError } = await supabase
        .from('addresses')
        .update(data)
        .eq('id', id);

      if (updateError) throw updateError;

      toast.success('Address updated successfully!');
      navigate('/customer/profile'); // Navigate back to profile after saving

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

  // If loading is false and no address was found (e.g. invalid ID), show a message
   if (!reset || !id) { // More robust check if reset hasn't populated form, though fetch error should handle
     // This case is mostly handled by the fetch error toast, but a fallback UI might be desired
     return (
        <div className="max-w-2xl mx-auto py-8 px-4 text-center">
          <p>Could not load address.</p>
          <Button className="mt-4" onClick={() => navigate('/customer/profile')}>Back to Profile</Button>
        </div>
     );
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Full Name"
          error={errors.full_name?.message}
          {...register('full_name', { required: 'Full name is required' })}
        />
        <Input
          label="Phone Number"
          error={errors.phone?.message}
          {...register('phone', { required: 'Phone number is required' })}
        />
        <Input
          label="Region"
          error={errors.region?.message}
          {...register('region', { required: 'Region is required' })}
        />
        <Input
          label="Province"
          error={errors.province?.message}
          {...register('province', { required: 'Province is required' })}
        />
        <Input
          label="City"
          error={errors.city?.message}
          {...register('city', { required: 'City is required' })}
        />
         <Input
          label="Barangay"
          error={errors.barangay?.message}
          {...register('barangay', { required: 'Barangay is required' })}
        />
        <Input
          label="Street Address"
          error={errors.street_address?.message}
          {...register('street_address', { required: 'Street address is required' })}
        />
        <Input
          label="Postal Code"
          error={errors.postal_code?.message}
          {...register('postal_code', { required: 'Postal code is required' })}
        />
        <Input
          label="Label (e.g., Home, Work)"
          error={errors.label?.message}
          {...register('label')}
        />

        <Button type="submit" fullWidth isLoading={isSaving}>
          Save Changes
        </Button>
      </form>
    </div>
  );
} 