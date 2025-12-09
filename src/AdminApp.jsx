import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CheckCircle, XCircle, Package, ShoppingBag, RefreshCw, AlertTriangle } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function AdminApp() {
  const [activeTab, setActiveTab] = useState('orders'); // orders, inventory
  const [orders, setOrders] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadOrders();
    loadIngredients();

    // Subscribe to real-time updates
    const ordersSubscription = supabase
      .channel('orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadOrders();
      })
      .subscribe();

    return () => {
      ordersSubscription.unsubscribe();
    };
  }, []);

  const loadOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, tables(*), order_details(*, menu_items(*))')
      .order('created_at', { ascending: false });
    
    if (!error) setOrders(data || []);
  };

  const loadIngredients = async () => {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('name');
    
    if (!error) setIngredients(data || []);
  };

  const confirmPayment = async (orderId, tableId) => {
    setLoading(true);
    try {
      // Update order
      await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          status: 'completed'
        })
        .eq('id', orderId);

      // Free the table
      await supabase
        .from('tables')
        .update({ status: 'free' })
        .eq('id', tableId);

      await loadOrders();
      alert('Payment confirmed and table freed!');
    } catch (error) {
      console.error('Error confirming payment:', error);
      alert('Failed to confirm payment');
    }
    setLoading(false);
  };

  const cancelOrder = async (orderId, tableId) => {
    if (!confirm('Are you sure you want to cancel this order? This will restore ingredients.')) return;

    setLoading(true);
    try {
      // Get order details to restore ingredients
      const { data: orderDetails } = await supabase
        .from('order_details')
        .select('*, menu_items(*)')
        .eq('order_id', orderId);

      // Restore ingredients
      for (const detail of orderDetails) {
        const { data: itemIngredients } = await supabase
          .from('item_ingredients')
          .select('*, ingredients(*)')
          .eq('menu_item_id', detail.menu_item_id);

        if (itemIngredients) {
          for (const ii of itemIngredients) {
            const newStock = ii.ingredients.stock_quantity + (ii.quantity_needed * detail.quantity);
            await supabase
              .from('ingredients')
              .update({ stock_quantity: newStock })
              .eq('id', ii.ingredient_id);
          }
        }
      }

      // Cancel order
      await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);

      // Free table
      await supabase
        .from('tables')
        .update({ status: 'free' })
        .eq('id', tableId);

      await loadOrders();
      await loadIngredients();
      alert('Order cancelled and ingredients restored!');
    } catch (error) {
      console.error('Error cancelling order:', error);
      alert('Failed to cancel order');
    }
    setLoading(false);
  };

  const updateIngredientStock = async (ingredientId, newStock) => {
    await supabase
      .from('ingredients')
      .update({ stock_quantity: newStock })
      .eq('id', ingredientId);
    
    await loadIngredients();
  };

  // ORDERS TAB
  const OrdersView = () => {
    const pendingOrders = orders.filter(o => o.status === 'pending');
    const completedOrders = orders.filter(o => o.status === 'completed');
    const cancelledOrders = orders.filter(o => o.status === 'cancelled');

    return (
      <div className="space-y-6">
        {/* Pending Orders */}
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-amber-500" />
            Pending Orders ({pendingOrders.length})
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pendingOrders.map(order => (
              <div key={order.id} className="bg-white rounded-lg shadow-md p-6 border-l-4 border-amber-500">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">Order #{order.id}</h3>
                    <p className="text-gray-600">Table {order.tables.table_number}</p>
                    <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-amber-600">৳{order.total_amount}</div>
                    <div className="text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        order.payment_status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {order.payment_status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 mb-4">
                  <h4 className="font-semibold text-gray-700 mb-2">Items:</h4>
                  <div className="space-y-1">
                    {order.order_details.map((detail, idx) => (
                      <div key={idx} className="flex justify-between text-sm text-gray-600">
                        <span>{detail.menu_items.name} × {detail.quantity}</span>
                        <span>৳{detail.subtotal}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {order.payment_method && (
                  <div className="mb-4 text-sm">
                    <span className="font-medium text-gray-700">Payment Method: </span>
                    <span className="text-gray-600 capitalize">{order.payment_method.replace('_', ' ')}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => confirmPayment(order.id, order.table_id)}
                    disabled={loading}
                    className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Confirm Payment
                  </button>
                  <button
                    onClick={() => cancelOrder(order.id, order.table_id)}
                    disabled={loading}
                    className="flex-1 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Cancel Order
                  </button>
                </div>
              </div>
            ))}
          </div>
          {pendingOrders.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No pending orders
            </div>
          )}
        </div>

        {/* Completed Orders */}
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <CheckCircle className="w-6 h-6 text-green-500" />
            Completed Orders ({completedOrders.length})
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {completedOrders.slice(0, 6).map(order => (
              <div key={order.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-gray-800">Order #{order.id}</h3>
                    <p className="text-sm text-gray-600">Table {order.tables.table_number}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">৳{order.total_amount}</div>
                    <div className="text-xs text-gray-500">Completed</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cancelled Orders */}
        {cancelledOrders.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <XCircle className="w-6 h-6 text-red-500" />
              Cancelled Orders ({cancelledOrders.length})
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {cancelledOrders.slice(0, 6).map(order => (
                <div key={order.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-800">Order #{order.id}</h3>
                      <p className="text-sm text-gray-600">Table {order.tables.table_number}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-red-600">৳{order.total_amount}</div>
                      <div className="text-xs text-gray-500">Cancelled</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // INVENTORY TAB
  const InventoryView = () => {
    const lowStockItems = ingredients.filter(i => i.stock_quantity <= i.minimum_stock);

    return (
      <div className="space-y-6">
        {/* Low Stock Alert */}
        {lowStockItems.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-red-800">Low Stock Alert!</h3>
            </div>
            <p className="text-red-700 text-sm">
              {lowStockItems.length} ingredient(s) are running low. Please restock soon.
            </p>
          </div>
        )}

        {/* Inventory List */}
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-500" />
            Ingredient Inventory
          </h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Min Stock</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ingredients.map(ingredient => {
                  const isLowStock = ingredient.stock_quantity <= ingredient.minimum_stock;
                  return (
                    <tr key={ingredient.id} className={isLowStock ? 'bg-red-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{ingredient.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{ingredient.unit}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="number"
                          value={ingredient.stock_quantity}
                          onChange={(e) => updateIngredientStock(ingredient.id, parseFloat(e.target.value))}
                          className="w-24 px-2 py-1 border rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{ingredient.minimum_stock}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isLowStock ? (
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                            In Stock
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => updateIngredientStock(ingredient.id, ingredient.stock_quantity + 100)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          + Restock
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-800">Admin Panel</h1>
            <button
              onClick={() => {
                loadOrders();
                loadIngredients();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-6 py-3 font-medium border-b-2 transition ${
                activeTab === 'orders'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              Orders
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-6 py-3 font-medium border-b-2 transition ${
                activeTab === 'inventory'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              Inventory
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'orders' ? <OrdersView /> : <InventoryView />}
      </div>
    </div>
  );
}