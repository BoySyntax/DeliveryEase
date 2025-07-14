import { useState, useEffect, ChangeEvent, useRef } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import Button from '../../ui/components/Button';
import Input from '../../ui/components/Input';
import Select from '../../ui/components/Select';
import { Card, CardContent } from '../../ui/components/Card';
import Loader from '../../ui/components/Loader';
import { toast } from 'react-hot-toast';

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  quantity: number;
  unit: string | null;
  unit_quantity: number | null;
  featured: boolean;
  weight: number;
  category: {
    name: string;
  };
};

type Category = {
  id: string;
  name: string;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line
  }, [selectedCategory, searchQuery]);

  async function loadData() {
    setLoading(true);
    try {
      // Load categories
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (categoriesData) {
        setCategories(categoriesData);
      }

      // Build products query
      let query = supabase
        .from('products')
        .select(`
          *,
          category:categories(name)
        `)
        .order('name');

      if (selectedCategory) {
        query = query.eq('category_id', selectedCategory);
      }

      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`);
      }

      const { data: productsData } = await query;

      if (productsData) {
        setProducts(productsData);
      }
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setProducts(products.filter(product => product.id !== id));
      toast.success('Product deleted successfully');
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product');
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleToggleFeatured = async (product: Product) => {
    const newFeatured = !product.featured;
    const { error } = await supabase
      .from('products')
      .update({ featured: newFeatured })
      .eq('id', product.id);
    if (error) {
      toast.error('Failed to update featured status');
      return;
    }
    setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, featured: newFeatured } : p));
    toast.success(`Product ${newFeatured ? 'marked as' : 'removed from'} featured`);
  };

  if (loading) {
    return <Loader label="Loading products..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Products</h1>
        <Button
          icon={<Plus size={18} />}
          onClick={() => {
            setEditingProduct(null);
            setShowForm(true);
          }}
        >
          Add Product
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <Input
          placeholder="Search products..."
          icon={<Search size={18} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="md:w-64"
        />
        
        <Select
          options={[
            { value: '', label: 'All Categories' },
            ...categories.map(cat => ({
              value: cat.id,
              label: cat.name
            }))
          ]}
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="md:w-48"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product) => (
          <Card key={product.id}>
            <div className="relative w-full aspect-square min-h-[200px] bg-gray-100 rounded-t-lg overflow-hidden flex items-center justify-center">
              <img
                src={product.image_url}
                alt={product.name}
                className="object-contain w-full h-full"
                style={{ display: 'block' }}
                onError={(e) => {
                  if (e.currentTarget.src !== window.location.origin + '/placeholder.png') {
                    e.currentTarget.src = '/placeholder.png';
                  }
                }}
              />
              {product.featured && (
                <span className="absolute top-2 left-2 bg-yellow-400 text-xs font-bold px-2 py-1 rounded">Featured</span>
              )}
            </div>
            <CardContent className="p-2 sm:p-4">
              <h3 className="text-base sm:text-lg font-medium text-gray-900">{product.name}</h3>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Category: {product.category.name}
              </p>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Quantity: {product.quantity ?? 0} {product.unit || 'pieces'}
              </p>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Weight per {product.unit || 'piece'}: {product.weight} kg
                {product.unit_quantity ? ` (${product.unit_quantity} pcs per ${product.unit})` : ''}
              </p>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Total Weight: {(product.weight * product.quantity).toFixed(2)} kg
              </p>
              <p className="text-primary-600 font-semibold mt-2">
                {formatCurrency(product.price)}
                {product.unit ? ` per ${product.unit}` : ''}
                {product.unit && product.unit !== 'piece' && product.unit_quantity ? ` (${product.unit_quantity} pcs)` : ''}
              </p>
              <p className="text-xs sm:text-sm text-gray-600 mt-2 line-clamp-2">
                {product.description}
              </p>
              <div className="flex items-center mt-2">
                <input
                  type="checkbox"
                  checked={!!product.featured}
                  onChange={() => handleToggleFeatured(product)}
                  id={`featured-toggle-${product.id}`}
                  className="mr-2"
                />
                <label htmlFor={`featured-toggle-${product.id}`} className="text-xs">Featured</label>
              </div>
              <div className="mt-4 flex space-x-2">
                <Button
                  variant="outline"
                  icon={<Pencil size={16} />}
                  fullWidth
                  onClick={() => handleEdit(product)}
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  icon={<Trash2 size={16} />}
                  fullWidth
                  onClick={() => handleDelete(product.id)}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {products.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No products found</p>
        </div>
      )}

      {showForm && (
        <ProductForm
          categories={categories}
          onClose={() => setShowForm(false)}
          onSaved={loadData}
          product={editingProduct}
        />
      )}
    </div>
  );
}

type ProductFormProps = {
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  product: Product | null;
};

function ProductForm({ categories, onClose, onSaved, product }: ProductFormProps) {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || 0,
    category_id: product?.category_id || '',
    quantity: product?.quantity || 0,
    weight: product?.weight || 0.5,  // Default weight in kg
    unit: product?.unit || '',
    unit_quantity: product?.unit_quantity || 1,
    featured: product?.featured || false,
    image_url: product?.image_url || ''
  });
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Calculate total weight
  const totalWeight = formData.weight * formData.quantity;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type } = target;
    const checked = type === 'checkbox' ? target.checked : undefined;
    
    setFormData({
      ...formData,
      [name]: checked !== undefined ? checked : value,
    });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    // Validate form
    if (!formData.name || !formData.description || !formData.price || !formData.category_id || !formData.quantity) {
      toast.error('Please fill in all required fields.');
      setSaving(false);
      return;
    }
    const price = parseFloat(formData.price.toString());
    const quantity = parseInt(formData.quantity.toString(), 10);
    if (isNaN(price) || price < 0) {
      toast.error('Please enter a valid price.');
      setSaving(false);
      return;
    }
    if (isNaN(quantity) || quantity < 0) {
      toast.error('Please enter a valid quantity.');
      setSaving(false);
      return;
    }

    let imageUrl = formData.image_url;

    // If a new file is selected, upload it
    if (file) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;

        // Create a new blob with explicit type
        const blob = new Blob([file], { type: file.type });
        const formData = new FormData();
        formData.append('file', blob, fileName);

        console.log('Attempting upload:', {
          fileName,
          fileType: file.type,
          fileSize: file.size,
          blobType: blob.type
        });

        // Get the Supabase URL and anon key
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        // Get the current session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          throw new Error('Authentication required');
        }

        // Upload using fetch
        const response = await fetch(
          `${supabaseUrl}/storage/v1/object/product-images/${fileName}`,
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
          const error = await response.json();
          console.error('Upload response:', error);
          throw new Error(error.message || 'Upload failed');
        }

        // Get the public URL
        const { data: publicUrlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName);

        imageUrl = publicUrlData.publicUrl;
        console.log('Upload successful:', imageUrl);
      } catch (error: any) {
        console.error('Upload error:', error);
        toast.error(error?.message || 'Failed to upload image');
        setSaving(false);
        return;
      }
    }

    const payload = {
      ...formData,
      price,
      quantity,
      image_url: imageUrl,
      unit: formData.unit || null,
      unit_quantity: formData.unit && formData.unit !== 'piece' ? parseInt(formData.unit_quantity.toString(), 10) : null,
      featured: !!formData.featured,
      weight: parseFloat(formData.weight.toString()),
    };

    console.log('Payload:', payload);

    let result;
    if (product) {
      // Edit
      result = await supabase.from('products').update(payload).eq('id', product.id);
    } else {
      // Add
      result = await supabase.from('products').insert([payload]);
    }

    setSaving(false);

    if (result.error) {
      toast.error(result.error.message);
    } else {
      toast.success(product ? 'Product updated!' : 'Product added!');
      onSaved();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 overflow-y-auto max-h-screen p-2 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-3 sm:p-6 rounded-lg shadow-lg w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl space-y-4 mx-auto overflow-y-auto max-h-[90vh]"
      >
        <h2 className="text-xl font-semibold mb-2">{product ? 'Edit' : 'Add'} Product</h2>
        <Input
          label="Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          className="w-full"
        />
        
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Product description"
          className="w-full p-2 border rounded"
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            value={formData.price}
            onChange={handleChange}
            required
            className="w-full"
          />
          
          <Select
            label="Unit"
            name="unit"
            value={formData.unit}
            onChange={handleChange}
            options={[
              { value: '', label: 'Select unit' },
              { value: 'piece', label: 'Piece' },
              { value: 'box', label: 'Box' },
              { value: 'bag', label: 'Bag' },
              { value: 'pack', label: 'Pack' },
              { value: 'set', label: 'Set' },
              { value: 'dozen', label: 'Dozen' },
              { value: 'other', label: 'Other' }
            ]}
            required
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Weight per unit (kg)"
            name="weight"
            type="number"
            min="0.1"
            step="0.1"
            value={formData.weight}
            onChange={handleChange}
            required
            className="w-full"
          />
          
          <Input
            label="Quantity"
            name="quantity"
            type="number"
            min="0"
            value={formData.quantity}
            onChange={handleChange}
            required
            className="w-full"
          />
        </div>

        {formData.unit && formData.unit !== 'piece' && (
          <Input
            label={`How many pieces per ${formData.unit}?`}
            name="unit_quantity"
            type="number"
            min="1"
            value={formData.unit_quantity}
            onChange={handleChange}
            required
            className="w-full"
          />
        )}

        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-sm font-medium text-gray-700">Summary:</p>
          <p className="text-sm text-gray-600">
            Weight per {formData.unit || 'piece'}: {formData.weight} kg
          </p>
          <p className="text-sm text-gray-600">
            Quantity: {formData.quantity} {formData.unit || 'pieces'}
          </p>
          <p className="text-sm font-medium text-gray-700">
            Total Weight: {totalWeight.toFixed(2)} kg
          </p>
        </div>

        <Select
          label="Category"
          name="category_id"
          value={formData.category_id}
          onChange={handleChange}
          options={categories.map(cat => ({
            value: cat.id,
            label: cat.name
          }))}
          required
          className="w-full"
        />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="featured"
            checked={formData.featured}
            onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
            className="rounded border-gray-300"
          />
          <label htmlFor="featured">Featured Product</label>
        </div>

        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="w-full"
        />

        {formData.image_url && (
          <div className="relative w-32 h-32 mx-auto">
            <img
              src={formData.image_url}
              alt="Product preview"
              className="w-full h-full object-contain"
            />
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" className="w-full sm:w-auto">
            {product ? 'Update' : 'Create'} Product
          </Button>
        </div>
      </form>
    </div>
  );
}