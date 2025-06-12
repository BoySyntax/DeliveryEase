import { Link } from 'react-router-dom';
import { ShoppingCart, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../../ui/components/Card';
import Button from '../../ui/components/Button';
import { formatCurrency } from '../../lib/utils';

type ProductCardProps = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  quantity?: number;
  unit?: string;
  unit_quantity?: number;
  onAddToCart: () => void;
  className?: string;
  loading?: boolean;
};

export default function ProductCard({ id, name, price, imageUrl, quantity, unit, unit_quantity, onAddToCart, className, loading }: ProductCardProps) {
  return (
    <Link to={`/customer/products/${id}`} className="block h-full group" style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card className={`h-full flex flex-col group cursor-pointer ${className ?? ''}`}>
        <div className="aspect-square w-full overflow-hidden bg-gray-100 rounded-t-lg">
          <img 
            src={imageUrl} 
            alt={name}
            className="h-full w-full object-cover object-center transition-transform group-hover:scale-105"
          />
        </div>
        <CardContent className="p-4 flex flex-col flex-1">
          <h3 className="text-lg font-medium text-gray-900 line-clamp-2 flex-1">
            {name}
          </h3>
          <p className={`text-sm mt-1 ${quantity === 0 || !quantity ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
            {quantity === 0 || !quantity ? 'Out of Stock' : `Quantity: ${quantity}`}
          </p>
          <p className="text-primary-600 font-semibold text-sm mt-2">{formatCurrency(price)}</p>
          {unit && (
            <div className="text-gray-700 text-sm font-normal">
              per {unit}
              {unit !== 'piece' && unit_quantity ? ` (${unit_quantity} pcs)` : ''}
            </div>
          )}
          <div className="mt-4 flex space-x-2">
            <Button 
              size="sm"
              icon={<ShoppingCart size={16} />}
              fullWidth
              disabled={quantity === 0 || !quantity || loading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddToCart();
              }}
              className="transition-transform duration-100 active:scale-95"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}