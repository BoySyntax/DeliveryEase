import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Plus, Pencil, Trash2, Search, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';

type Category = {
  id: string;
  name: string;
  image_url: string | null;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      // Delete image from storage if it exists
      const category = categories.find(cat => cat.id === id);
      if (category?.image_url) {
        const imagePath = category.image_url.split('/').pop();
        if (imagePath) {
          await supabase.storage
            .from('categories-images')
            .remove([imagePath]);
        }
      }

      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setCategories(categories.filter(cat => cat.id !== id));
      toast.success('Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setShowForm(true);
  };

  if (loading) {
    return <Loader label="Loading categories..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Categories</h1>
        <Button
          icon={<Plus size={18} />}
          onClick={() => {
            setEditingCategory(null);
            setShowForm(true);
          }}
        >
          Add Category
        </Button>
      </div>



      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {categories.map((category) => (
          <Card key={category.id} className="h-full flex flex-col">
            <div className="relative w-full aspect-square bg-gray-100 rounded-t-lg overflow-hidden flex items-center justify-center">
              {category.image_url ? (
                <img
                  src={category.image_url}
                  alt={category.name}
                  className="object-contain w-full h-full"
                  style={{ display: 'block' }}
                  onError={(e) => {
                    if (e.currentTarget.src !== window.location.origin + '/placeholder.png') {
                      e.currentTarget.src = '/placeholder.png';
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-600">
                    {category.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <CardContent className="p-3 flex flex-col flex-1">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">{category.name}</h3>
              </div>
              <div className="mt-3">
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    icon={<Pencil size={14} />}
                    fullWidth
                    onClick={() => handleEdit(category)}
                    className="text-xs py-1.5"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    icon={<Trash2 size={14} />}
                    fullWidth
                    onClick={() => handleDelete(category.id)}
                    className="text-xs py-1.5"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No categories found</p>
        </div>
      )}

      {showForm && (
        <CategoryForm
          onClose={() => setShowForm(false)}
          onSaved={loadCategories}
          category={editingCategory}
        />
      )}
    </div>
  );
}

type CategoryFormProps = {
  onClose: () => void;
  onSaved: () => void;
  category: Category | null;
};

function CategoryForm({ onClose, onSaved, category }: CategoryFormProps) {
  const [formData, setFormData] = useState({
    name: category?.name || '',
    image_url: category?.image_url || ''
  });
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(category?.image_url || null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error('Image size must be less than 5MB');
        return;
      }
      
      if (!file.type.startsWith('image/')) {
        toast.error('Please select a valid image file');
        return;
      }

      setFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadImage = async (file: File, categoryId: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${categoryId}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    // Determine the correct MIME type based on file extension
    let contentType = file.type;
    if (!contentType || contentType === 'application/octet-stream') {
      switch (fileExt?.toLowerCase()) {
        case 'png':
          contentType = 'image/png';
          break;
        case 'jpg':
        case 'jpeg':
          contentType = 'image/jpeg';
          break;
        case 'gif':
          contentType = 'image/gif';
          break;
        case 'webp':
          contentType = 'image/webp';
          break;
        default:
          contentType = 'image/png'; // Default fallback
      }
    }

    // Get the current session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No session');

    // Upload using fetch
    const response = await fetch(
      `https://vpwskrytguoiybqrpebp.supabase.co/storage/v1/object/categories-images/${filePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'image/png',
        },
        body: file
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Upload failed');
    }

    const { data: { publicUrl } } = supabase.storage
      .from('categories-images')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Please enter a category name');
      return;
    }

    setSaving(true);

    try {
      let imageUrl = formData.image_url;

      // If a new file is selected, upload it
      if (file) {
        try {
          if (category) {
            // For editing, use existing ID
            imageUrl = await uploadImage(file, category.id);
          } else {
            // For new category, create temporary ID
            const tempId = `temp-${Date.now()}`;
            imageUrl = await uploadImage(file, tempId);
          }
        } catch (error: any) {
          console.error('Upload error:', error);
          toast.error(error?.message || 'Failed to upload image');
          setSaving(false);
          return;
        }
      }

      let result;
      if (category) {
        // Update existing category
        result = await supabase
          .from('categories')
          .update({ 
            name: formData.name,
            image_url: imageUrl
          })
          .eq('id', category.id);
      } else {
        // Create new category
        result = await supabase
          .from('categories')
          .insert([{ 
            name: formData.name,
            image_url: imageUrl
          }]);
      }

      if (result.error) {
        toast.error(result.error.message);
      } else {
        toast.success(category ? 'Category updated!' : 'Category added!');
        onSaved();
        onClose();
      }
    } catch (error: any) {
      console.error('Error saving category:', error);
      toast.error(error?.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Full screen backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[9998]" />
      
      {/* Modal container */}
      <div className="fixed inset-0 flex items-center justify-center z-[9999] overflow-y-auto p-2 sm:p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white p-3 sm:p-6 rounded-lg shadow-lg w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl space-y-4 mx-auto overflow-y-auto max-h-[90vh]"
        >
        <h2 className="text-xl font-semibold mb-2">{category ? 'Edit' : 'Add'} Category</h2>
        
        <Input
          label="Category Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="Enter category name"
          required
          className="w-full"
        />

        {/* Image Upload Section */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            Category Image
          </label>
          
          {/* Image Preview */}
          {imagePreview && (
            <div className="relative inline-block">
              <img
                src={imagePreview}
                alt="Category preview"
                className="w-32 h-32 object-cover rounded-lg border-2 border-gray-200"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
              >
                <X size={16} />
              </button>
            </div>
          )}
          
          {/* Upload Button */}
          <div className="flex items-center space-x-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              icon={<Upload size={18} />}
              onClick={() => fileInputRef.current?.click()}
            >
              {imagePreview ? 'Change Image' : 'Upload Image'}
            </Button>
            {imagePreview && (
              <Button
                type="button"
                variant="outline"
                onClick={clearImage}
              >
                Remove Image
              </Button>
            )}
          </div>
          
          <p className="text-sm text-gray-500">
            Recommended size: 200x200px. Max file size: 5MB.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="w-full sm:w-auto">
            {saving ? (
              <>
                <div className="mr-2">
                  <Loader />
                </div>
                {category ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              `${category ? 'Update' : 'Create'} Category`
            )}
          </Button>
        </div>
      </form>
      </div>
    </>
  );
}