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
        <CardContent className="p-2 sm:p-3 flex flex-col flex-1">
          <h3 className="text-sm sm:text-base font-medium text-gray-900 line-clamp-2 flex-1 leading-tight">
            {name}
          </h3>
          <p className={`text-xs mt-1 ${quantity === 0 || !quantity ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
            {quantity === 0 || !quantity ? 'Out of Stock' : `Qty: ${quantity}`}
          </p>
          <p className="text-primary-600 font-semibold text-sm mt-1">{formatCurrency(price)}</p>
          {unit && (
            <div className="text-gray-700 text-xs font-normal">
              per {unit}
              {unit !== 'piece' && unit_quantity ? ` (${unit_quantity} pcs)` : ''}
            </div>
          )}
          <div className="mt-auto flex space-x-1">
            <Button 
              size="sm"
              icon={<ShoppingCart size={14} />}
              fullWidth
              disabled={quantity === 0 || !quantity || loading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!loading) {
                  onAddToCart();
                }
              }}
              className="transition-transform duration-100 active:scale-95 text-xs py-1 px-2 rounded-md"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add to Cart'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}