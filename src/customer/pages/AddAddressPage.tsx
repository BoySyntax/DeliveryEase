import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';

type AddressForm = {
  full_name: string;
  phone: string;
  region: string;
  province: string;
  city: string;
  barangay: string;
  postal_code: string;
  street_address: string;
  label?: 'Work' | 'Home';
  is_default: boolean;
};

export default function AddAddressPage() {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<'Work' | 'Home' | undefined>(undefined);
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<AddressForm>();

  const onSubmit = async (data: AddressForm) => {
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
        label: selectedLabel,
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

  const handleLabelClick = (label: 'Work' | 'Home') => {
    setSelectedLabel(label);
    setValue('label', label);
  };

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

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add New Address</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
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

        <h2 className="text-lg font-semibold text-gray-900">Address</h2>
        <Input
          label="Region (Mindanao focus)"
          error={errors.region?.message}
          {...register('region', { required: 'Region is required' })}
          placeholder="e.g., Mindanao"
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
          label="Postal Code"
          error={errors.postal_code?.message}
          {...register('postal_code', { required: 'Postal code is required' })}
        />
        <Input
          label="Street Name, Building, House No."
          error={errors.street_address?.message}
          {...register('street_address', { required: 'Street address is required' })}
        />

        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Label As:</label>
            <div className="flex gap-2 mt-1">
              <Button 
                type="button"
                variant={'outline'}
                className={selectedLabel === 'Work' ? 'bg-gray-200' : ''}
                onClick={() => handleLabelClick('Work')}
              >
                Work
              </Button>
              <Button 
                type="button"
                variant={'outline'}
                className={selectedLabel === 'Home' ? 'bg-gray-200' : ''}
                onClick={() => handleLabelClick('Home')}
              >
                Home
              </Button>
              <input type="hidden" {...register('label')} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="is_default" className="text-sm font-medium text-gray-700">Set as Default Address</label>
            <input
              type="checkbox"
              id="is_default"
              {...register('is_default')}
              className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
          </div>
        </div>

        <Button type="submit" fullWidth isLoading={isSaving}>
          Submit
        </Button>
      </form>
    </div>
  );
} 