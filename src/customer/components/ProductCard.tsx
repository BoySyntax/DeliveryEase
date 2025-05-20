import { Link } from 'react-router-dom';
import { ShoppingCart, Eye } from 'lucide-react';
import { Card, CardContent } from '../../ui/components/Card';
import Button from '../../ui/components/Button';
import { formatCurrency } from '../../lib/utils';

type ProductCardProps = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  quantity?: number;
  onAddToCart: () => void;
};

export default function ProductCard({ id, name, price, imageUrl, quantity, onAddToCart }: ProductCardProps) {
  return (
    <Card className="h-full flex flex-col group">
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
        <p className="text-primary-600 font-semibold mt-2">
          {formatCurrency(price)}
        </p>
        
        <div className="mt-4 flex space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            icon={<Eye size={16} />}
            fullWidth
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <Link to={`/customer/products/${id}`} className="w-full">View</Link>
          </Button>
          
          <Button 
            size="sm"
            icon={<ShoppingCart size={16} />}
            fullWidth
            disabled={quantity === 0 || !quantity}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddToCart();
            }}
          >
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}