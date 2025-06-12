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
  quantity?: number;
  unit?: string;
  unit_quantity?: number;
  featured?: boolean;
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
                Quantity: {product.quantity ?? 0}
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
  const [form, setForm] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price?.toString() || '',
    image_url: product?.image_url || '',
    category_id: product?.category_id || (categories[0]?.id ?? ''),
    quantity: product?.quantity?.toString() || '',
    unit: product?.unit || '',
    unit_quantity: product?.unit_quantity?.toString() || '',
    featured: product?.featured ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === 'checkbox' ? checked : value,
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
    if (!form.name || !form.description || !form.price || !form.category_id || !form.quantity) {
      toast.error('Please fill in all required fields.');
      setSaving(false);
      return;
    }
    const price = parseFloat(form.price);
    const quantity = parseInt(form.quantity, 10);
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

    let imageUrl = form.image_url;

    // If a new file is selected, upload it
    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      // Remove any leading slash from fileName
      const { data, error } = await supabase.storage
        .from('product-image')
        .upload(fileName, file, { upsert: true });

      if (error) {
        console.error('Upload error:', error);
        toast.error(error.message || 'Failed to upload image');
        setSaving(false);
        return;
      }

      // Get public URL (permanent, not signed)
      const { data: publicUrlData } = supabase
        .storage
        .from('product-image')
        .getPublicUrl(fileName);

      imageUrl = publicUrlData.publicUrl;
    }

    const payload = {
      ...form,
      price,
      quantity,
      image_url: imageUrl,
      unit: form.unit,
      unit_quantity: form.unit && form.unit !== 'piece' ? parseInt(form.unit_quantity, 10) : null,
      featured: !!form.featured,
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
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md space-y-4"
      >
        <h2 className="text-xl font-semibold mb-2">{product ? 'Edit' : 'Add'} Product</h2>
        <input
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={handleChange}
          required
          className="w-full border p-2 rounded"
        />
        <textarea
          name="description"
          placeholder="Description"
          value={form.description}
          onChange={handleChange}
          required
          className="w-full border p-2 rounded"
        />
        <input
          name="price"
          placeholder="Price"
          value={form.price}
          onChange={handleChange}
          type="number"
          min="0"
          step="0.01"
          required
          className="w-full border p-2 rounded"
        />
        <input
          name="quantity"
          placeholder="Quantity"
          value={form.quantity}
          onChange={handleChange}
          type="number"
          min="0"
          required
          className="w-full border p-2 rounded"
        />
        <select
          name="unit"
          value={form.unit}
          onChange={handleChange}
          required
          className="w-full border p-2 rounded"
        >
          <option value="">Select unit</option>
          <option value="piece">Piece</option>
          <option value="box">Box</option>
          <option value="bag">Bag</option>
          <option value="pack">Pack</option>
          <option value="set">Set</option>
          <option value="kg">Kg</option>
          <option value="liter">Liter</option>
          <option value="dozen">Dozen</option>
          <option value="other">Other</option>
        </select>
        {form.unit && form.unit !== 'piece' && (
          <input
            name="unit_quantity"
            placeholder={`How many pcs per ${form.unit}?`}
            value={form.unit_quantity}
            onChange={handleChange}
            type="number"
            min="1"
            required
            className="w-full border p-2 rounded"
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          ref={fileInputRef}
          className="w-full border p-2 rounded"
        />
        {form.image_url && !file && (
          <img
            src={form.image_url}
            alt="Current"
            className="w-24 h-24 object-cover mt-2 rounded"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
            }}
          />
        )}
        <select
          name="category_id"
          value={form.category_id}
          onChange={handleChange}
          required
          className="w-full border p-2 rounded"
        >
          {categories.length === 0 ? (
            <option value="">No categories available</option>
          ) : (
            categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))
          )}
        </select>
        <div className="flex items-center">
          <input
            type="checkbox"
            name="featured"
            id="featured"
            checked={!!form.featured}
            onChange={handleChange}
            className="mr-2"
          />
          <label htmlFor="featured" className="text-sm">Featured product</label>
        </div>
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 text-white rounded"
            disabled={saving}
          >
            {saving ? 'Saving...' : product ? 'Save Changes' : 'Add Product'}
          </button>
        </div>
      </form>
    </div>
  );
}