import { useState } from 'react';
import { Bell, AlertTriangle, Package } from 'lucide-react';
import { useLowStockNotifications, LowStockProduct } from '../../lib/useLowStockNotifications';

interface NotificationIconProps {
  className?: string;
}

export default function NotificationIcon({ className = '' }: NotificationIconProps) {
  const { lowStockProducts, outOfStockCount, lowStockCount, totalNotifications, loading } = useLowStockNotifications();
  const [isOpen, setIsOpen] = useState(false);

  if (loading) {
    return null;
  }

  if (totalNotifications === 0) {
    return null;
  }

  const getNotificationColor = () => {
    if (outOfStockCount > 0) return 'text-red-500';
    if (lowStockCount > 0) return 'text-yellow-500';
    return 'text-gray-500';
  };

  const getNotificationBgColor = () => {
    if (outOfStockCount > 0) return 'bg-red-500';
    if (lowStockCount > 0) return 'bg-yellow-500';
    return 'bg-gray-500';
  };

  return (
    <div className={`relative ${className}`}>
      {/* Notification Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2.5 rounded-full transition-all duration-200 ${
          isOpen 
            ? 'bg-primary-50 text-primary-600 shadow-sm' 
            : `hover:bg-gray-100 ${getNotificationColor()}`
        }`}
        aria-label={`${totalNotifications} stock notifications`}
      >
        <Bell 
          size={22} 
          className={`transition-transform duration-200 ${
            isOpen ? 'scale-110' : 'hover:scale-105'
          }`} 
        />
        
        {/* Notification Badge */}
        {totalNotifications > 0 && (
          <span className={`absolute -top-1 -right-1 h-5 w-5 rounded-full ${getNotificationBgColor()} text-white text-xs flex items-center justify-center font-bold shadow-lg border-2 border-white animate-pulse`}>
            {totalNotifications > 99 ? '99+' : totalNotifications}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Notification Panel */}
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-80 max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl z-20 max-h-96 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
            <div className="p-3 sm:p-4 border-b border-gray-200">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Stock Alerts</h3>
              <p className="text-xs sm:text-sm text-gray-600">
                {outOfStockCount > 0 && `${outOfStockCount} out of stock`}
                {outOfStockCount > 0 && lowStockCount > 0 && ', '}
                {lowStockCount > 0 && `${lowStockCount} low stock`}
              </p>
          </div>

            <div className="p-2">
              {lowStockProducts.map((product) => (
                <div
                  key={product.id}
                  className={`flex items-center p-2 sm:p-3 rounded-lg mb-2 transition-all duration-200 hover:shadow-sm ${
                    product.quantity === 0 
                      ? 'bg-red-50 border border-red-200 hover:bg-red-100' 
                      : 'bg-yellow-50 border border-yellow-200 hover:bg-yellow-100'
                  }`}
                >
                  {/* Product Image */}
                  <div className="flex-shrink-0 mr-2 sm:mr-3">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover border border-gray-200 shadow-sm"
                        onError={(e) => {
                          // Fallback to icon if image fails to load
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center ${
                        product.quantity === 0 ? 'bg-red-100 text-red-500' : 'bg-yellow-100 text-yellow-500'
                      }`}
                      style={{ display: product.image_url ? 'none' : 'flex' }}
                    >
                      {product.quantity === 0 ? (
                        <AlertTriangle size={16} className="sm:w-5 sm:h-5" />
                      ) : (
                        <Package size={16} className="sm:w-5 sm:h-5" />
                      )}
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                      {product.name}
                    </p>
                    <p className={`text-xs ${
                      product.quantity === 0 ? 'text-red-600' : 'text-yellow-600'
                    }`}>
                      {product.quantity === 0 
                        ? 'Out of Stock' 
                        : `Low Stock: ${product.quantity}${product.unit || ''}`
                      }
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-3 sm:p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setIsOpen(false);
                  window.location.href = '/admin/products';
                }}
                className="w-full text-xs sm:text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                View All Products →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
} 