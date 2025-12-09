import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShoppingCart, Plus, Minus, Trash2, Coffee, CheckCircle } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function App() {
  const [view, setView] = useState('table-selection'); // table-selection, menu, order-success
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [orderSummary, setOrderSummary] = useState(null);

  // Load tables on mount
  useEffect(() => {
    loadTables();
    loadMenuItems();
  }, []);

  const loadTables = async () => {
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .order('table_number');
    
    if (!error) setTables(data || []);
  };

  const loadMenuItems = async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('available', true)
      .order('name');
    
    if (!error) setMenuItems(data || []);
  };

  const selectTable = async (table) => {
    // Check if table has an active order
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('*, order_details(*)')
      .eq('table_id', table.id)
      .eq('status', 'pending')
      .single();

    setSelectedTable(table);
    
    if (existingOrder) {
      // Load existing cart
      setActiveOrder(existingOrder);
      const cartItems = existingOrder.order_details.map(detail => ({
        ...menuItems.find(item => item.id === detail.menu_item_id),
        quantity: detail.quantity
      }));
      setCart(cartItems);
    }
    
    setView('menu');
  };

  const addToCart = (item) => {
    const existing = cart.find(i => i.id === item.id);
    if (existing) {
      setCart(cart.map(i => 
        i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const updateQuantity = (itemId, change) => {
    setCart(cart.map(item => {
      if (item.id === itemId) {
        const newQty = item.quantity + change;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (itemId) => {
    setCart(cart.filter(item => item.id !== itemId));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const placeOrder = async () => {
    if (cart.length === 0) return;

    try {
      let orderId = activeOrder?.id;

      if (!activeOrder) {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            table_id: selectedTable.id,
            total_amount: calculateTotal(),
            status: 'pending',
            payment_status: 'pending'
          })
          .select()
          .single();

        if (orderError) throw orderError;
        orderId = newOrder.id;

        // Update table status to occupied
        await supabase
          .from('tables')
          .update({ status: 'occupied' })
          .eq('id', selectedTable.id);
      } else {
        // Update existing order total
        await supabase
          .from('orders')
          .update({ total_amount: calculateTotal() })
          .eq('id', orderId);
      }

      // Insert order details and deduct ingredients
      for (const item of cart) {
        // Check if item already exists in order
        const { data: existing } = await supabase
          .from('order_details')
          .select('*')
          .eq('order_id', orderId)
          .eq('menu_item_id', item.id)
          .single();

        if (existing) {
          // Update quantity
          await supabase
            .from('order_details')
            .update({ 
              quantity: existing.quantity + item.quantity,
              subtotal: item.price * (existing.quantity + item.quantity)
            })
            .eq('id', existing.id);
        } else {
          // Insert new order detail
          await supabase
            .from('order_details')
            .insert({
              order_id: orderId,
              menu_item_id: item.id,
              quantity: item.quantity,
              price: item.price,
              subtotal: item.price * item.quantity
            });
        }

        // Deduct ingredients
        const { data: itemIngredients } = await supabase
          .from('item_ingredients')
          .select('*, ingredients(*)')
          .eq('menu_item_id', item.id);

        if (itemIngredients) {
          for (const ii of itemIngredients) {
            const newStock = ii.ingredients.stock_quantity - (ii.quantity_needed * item.quantity);
            await supabase
              .from('ingredients')
              .update({ stock_quantity: newStock })
              .eq('id', ii.ingredient_id);
          }
        }
      }

      // Load order summary
      const { data: finalOrder } = await supabase
        .from('orders')
        .select('*, order_details(*, menu_items(*))')
        .eq('id', orderId)
        .single();

      setOrderSummary(finalOrder);
      setView('order-success');
      setCart([]);
      setActiveOrder(null);
    } catch (error) {
      console.error('Error placing order:', error);
      alert('Failed to place order. Please try again.');
    }
  };

  const selectPaymentMethod = async (method) => {
    if (!orderSummary) return;

    await supabase
      .from('orders')
      .update({ 
        payment_method: method,
        payment_status: 'pending'
      })
      .eq('id', orderSummary.id);

    alert(`Payment method selected: ${method}. Please wait for confirmation from staff.`);
  };

  const startNewOrder = () => {
    setView('table-selection');
    setSelectedTable(null);
    setCart([]);
    setActiveOrder(null);
    setOrderSummary(null);
    loadTables();
  };

  // TABLE SELECTION VIEW
  if (view === 'table-selection') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <Coffee className="w-16 h-16 mx-auto text-amber-600 mb-4" />
            <h1 className="text-4xl font-bold text-gray-800 mb-2">Welcome to Our Coffee Shop</h1>
            <p className="text-gray-600">Please select your table to begin ordering</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tables.map(table => (
              <button
                key={table.id}
                onClick={() => table.status === 'free' && selectTable(table)}
                disabled={table.status !== 'free'}
                className={`p-8 rounded-xl text-center transition-all ${
                  table.status === 'free'
                    ? 'bg-white hover:bg-amber-50 border-2 border-amber-200 hover:border-amber-400 cursor-pointer'
                    : 'bg-gray-200 border-2 border-gray-300 cursor-not-allowed opacity-60'
                }`}
              >
                <div className="text-3xl font-bold mb-2">Table {table.table_number}</div>
                <div className={`text-sm font-medium ${
                  table.status === 'free' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {table.status === 'free' ? 'Available' : 'Occupied'}
                </div>
                <div className="text-xs text-gray-500 mt-1">{table.capacity} seats</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // MENU VIEW
  if (view === 'menu') {
    return (
      <div className="min-h-screen bg-gray-50 pb-32">
        {/* Header */}
        <div className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Table {selectedTable.table_number}</h1>
                <p className="text-sm text-gray-600">Browse our menu and add items to your cart</p>
              </div>
              <button
                onClick={() => setView('table-selection')}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Change Table
              </button>
            </div>
          </div>
        </div>

        {/* Menu Grid */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map(item => (
              <div key={item.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition">
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-2">{item.name}</h3>
                  <p className="text-gray-600 text-sm mb-4">{item.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-amber-600">৳{item.price}</span>
                    <button
                      onClick={() => addToCart(item)}
                      className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition"
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Floating Cart */}
        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-amber-200 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 py-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Your Cart ({cart.length} items)
                </h3>
                <div className="text-2xl font-bold text-amber-600">
                  Total: ৳{calculateTotal().toFixed(2)}
                </div>
              </div>

              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">{item.name}</div>
                      <div className="text-sm text-gray-600">৳{item.price} each</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-bold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-200 ml-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="w-20 text-right font-bold text-gray-800">
                        ৳{(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={placeOrder}
                className="w-full bg-amber-500 text-white py-4 rounded-lg font-bold text-lg hover:bg-amber-600 transition"
              >
                Place Order - ৳{calculateTotal().toFixed(2)}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ORDER SUCCESS VIEW
  if (view === 'order-success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Order Placed Successfully!</h1>
            <p className="text-gray-600">Table {selectedTable.table_number} • Order #{orderSummary?.id}</p>
          </div>

          <div className="border-t border-b border-gray-200 py-4 mb-6">
            <h3 className="font-bold text-gray-800 mb-3">Order Summary:</h3>
            <div className="space-y-2">
              {orderSummary?.order_details.map((detail, idx) => (
                <div key={idx} className="flex justify-between text-gray-700">
                  <span>{detail.menu_items.name} × {detail.quantity}</span>
                  <span className="font-medium">৳{detail.subtotal}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xl font-bold text-gray-800 mt-4 pt-4 border-t">
              <span>Total:</span>
              <span className="text-amber-600">৳{orderSummary?.total_amount}</span>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-bold text-gray-800 mb-3">Select Payment Method:</h3>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => selectPaymentMethod('cash')}
                className="p-4 border-2 border-gray-300 rounded-lg hover:border-amber-500 hover:bg-amber-50 transition"
              >
                <div className="font-bold">Cash</div>
              </button>
              <button
                onClick={() => selectPaymentMethod('card')}
                className="p-4 border-2 border-gray-300 rounded-lg hover:border-amber-500 hover:bg-amber-50 transition"
              >
                <div className="font-bold">Card</div>
              </button>
              <button
                onClick={() => selectPaymentMethod('mobile_banking')}
                className="p-4 border-2 border-gray-300 rounded-lg hover:border-amber-500 hover:bg-amber-50 transition"
              >
                <div className="font-bold">Mobile Banking</div>
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setView('menu');
                setCart([]);
              }}
              className="flex-1 bg-amber-100 text-amber-700 py-3 rounded-lg font-bold hover:bg-amber-200 transition"
            >
              Add More Items
            </button>
            <button
              onClick={startNewOrder}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-300 transition"
            >
              Finish & New Order
            </button>
          </div>
        </div>
      </div>
    );
  }
}