import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShoppingCart, Users, Package, TrendingUp, Search, Plus, Minus, Trash2, Coffee, CreditCard, Smartphone, DollarSign, Clock, CheckCircle, AlertCircle } from 'lucide-react';

// Initialize Supabase client
const supabase = createClient(
  'https://imjgssrvqxdnxluxscgo.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imltamdzc3J2cXhkbnhsdXhzY2dvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyOTA1MTAsImV4cCI6MjA4MDg2NjUxMH0.ZK5GxvgGS7nZ6E_h5FggkaGbi-uUHhR1NtHSP_GDipY'
);

const CoffeeShopPOS = () => {
  const [view, setView] = useState('pos');
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ todaySales: 0, ordersCount: 0, lowStock: 0 });
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    initializeDatabase();
    loadData();
    subscribeToChanges();
  }, []);

  const initializeDatabase = async () => {
    // This would be run once to set up your Supabase database
    // You'll need to run these SQL commands in your Supabase SQL editor:
    
    /*
    -- Products table
    CREATE TABLE products (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      image TEXT,
      available BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Customers table
    CREATE TABLE customers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      loyalty_points INTEGER DEFAULT 0,
      preferences TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Orders table
    CREATE TABLE orders (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      customer_id UUID REFERENCES customers(id),
      total DECIMAL(10,2) NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      special_instructions TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Order items table
    CREATE TABLE order_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
      product_id UUID REFERENCES products(id),
      quantity INTEGER NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      modifications TEXT
    );

    -- Inventory table
    CREATE TABLE inventory (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      min_quantity INTEGER DEFAULT 10,
      last_updated TIMESTAMP DEFAULT NOW()
    );

    -- Enable Row Level Security
    ALTER TABLE products ENABLE ROW LEVEL SECURITY;
    ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

    -- Create policies (for demo, allow all operations)
    CREATE POLICY "Allow all operations" ON products FOR ALL USING (true);
    CREATE POLICY "Allow all operations" ON customers FOR ALL USING (true);
    CREATE POLICY "Allow all operations" ON orders FOR ALL USING (true);
    CREATE POLICY "Allow all operations" ON order_items FOR ALL USING (true);
    CREATE POLICY "Allow all operations" ON inventory FOR ALL USING (true);
    */
  };

  const loadData = async () => {
    try {
      // Load products
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .order('category');
      
      if (productsData) setProducts(productsData);

      // Load customers
      const { data: customersData } = await supabase
        .from('customers')
        .select('*')
        .order('name');
      
      if (customersData) setCustomers(customersData);

      // Load today's orders
      const today = new Date().toISOString().split('T')[0];
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(name),
          order_items(*, product:products(name))
        `)
        .gte('created_at', today)
        .order('created_at', { ascending: false });
      
      if (ordersData) {
        setOrders(ordersData);
        const total = ordersData.reduce((sum, order) => sum + parseFloat(order.total), 0);
        setStats(prev => ({ ...prev, todaySales: total, ordersCount: ordersData.length }));
      }

      // Load inventory
      const { data: inventoryData } = await supabase
        .from('inventory')
        .select('*');
      
      if (inventoryData) {
        setInventory(inventoryData);
        const lowStock = inventoryData.filter(item => item.quantity <= item.min_quantity).length;
        setStats(prev => ({ ...prev, lowStock }));
      }

    } catch (error) {
      console.error('Error loading data:', error);
      showNotification('Error loading data', 'error');
    }
  };

  const subscribeToChanges = () => {
    // Real-time subscription for orders
    const ordersSubscription = supabase
      .channel('orders_channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'orders' },
        () => loadData()
      )
      .subscribe();

    return () => {
      ordersSubscription.unsubscribe();
    };
  };

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1, modifications: '' }]);
    }
    showNotification(`${product.name} added to cart`, 'success');
  };

  const updateCartItem = (id, quantity) => {
    if (quantity <= 0) {
      setCart(cart.filter(item => item.id !== id));
    } else {
      setCart(cart.map(item =>
        item.id === id ? { ...item, quantity } : item
      ));
    }
  };

  const updateModifications = (id, modifications) => {
    setCart(cart.map(item =>
      item.id === id ? { ...item, modifications } : item
    ));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2);
  };

  const processPayment = async (paymentMethod) => {
    if (cart.length === 0) {
      showNotification('Cart is empty', 'error');
      return;
    }

    try {
      const total = calculateTotal();
      const specialInstructions = cart
        .filter(item => item.modifications)
        .map(item => `${item.name}: ${item.modifications}`)
        .join('; ');

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: selectedCustomer?.id,
          total: parseFloat(total),
          payment_method: paymentMethod,
          status: 'completed',
          special_instructions: specialInstructions || null
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = cart.map(item => ({
        order_id: order.id,
        product_id: item.id,
        quantity: item.quantity,
        price: item.price,
        modifications: item.modifications || null
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Update customer loyalty points
      if (selectedCustomer) {
        const pointsEarned = Math.floor(parseFloat(total));
        await supabase
          .from('customers')
          .update({ 
            loyalty_points: selectedCustomer.loyalty_points + pointsEarned 
          })
          .eq('id', selectedCustomer.id);
      }

      // Clear cart and refresh
      setCart([]);
      setSelectedCustomer(null);
      loadData();
      showNotification(`Order #${order.id.slice(0, 8)} completed successfully!`, 'success');
      
    } catch (error) {
      console.error('Payment error:', error);
      showNotification('Payment failed. Please try again.', 'error');
    }
  };

  const addCustomer = async (customerData) => {
    try {
      const { error } = await supabase
        .from('customers')
        .insert(customerData);

      if (error) throw error;

      loadData();
      setShowCustomerModal(false);
      showNotification('Customer added successfully', 'success');
    } catch (error) {
      console.error('Error adding customer:', error);
      showNotification('Failed to add customer', 'error');
    }
  };

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const categories = [...new Set(products.map(p => p.category))];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
          notification.type === 'success' ? 'bg-green-500' : 
          notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        } text-white`}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Coffee size={32} />
              <h1 className="text-2xl font-bold">Coffee Shop POS</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setView('pos')}
                className={`px-4 py-2 rounded-lg transition ${
                  view === 'pos' ? 'bg-white text-amber-700' : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                <ShoppingCart size={20} className="inline mr-2" />
                POS
              </button>
              <button
                onClick={() => setView('orders')}
                className={`px-4 py-2 rounded-lg transition ${
                  view === 'orders' ? 'bg-white text-amber-700' : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                <Clock size={20} className="inline mr-2" />
                Orders
              </button>
              <button
                onClick={() => setView('inventory')}
                className={`px-4 py-2 rounded-lg transition ${
                  view === 'inventory' ? 'bg-white text-amber-700' : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                <Package size={20} className="inline mr-2" />
                Inventory
              </button>
              <button
                onClick={() => setView('customers')}
                className={`px-4 py-2 rounded-lg transition ${
                  view === 'customers' ? 'bg-white text-amber-700' : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                <Users size={20} className="inline mr-2" />
                Customers
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <DollarSign className="text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Today's Sales</p>
                <p className="text-xl font-bold">${stats.todaySales.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <ShoppingCart className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Orders</p>
                <p className="text-xl font-bold">{stats.ordersCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertCircle className="text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Low Stock Items</p>
                <p className="text-xl font-bold">{stats.lowStock}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {view === 'pos' && (
          <div className="grid grid-cols-3 gap-6">
            {/* Products */}
            <div className="col-span-2 space-y-4">
              {/* Search */}
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Product Grid */}
              <div className="bg-white p-4 rounded-lg shadow">
                {categories.map(category => (
                  <div key={category} className="mb-6">
                    <h3 className="text-lg font-semibold mb-3 text-amber-700">{category}</h3>
                    <div className="grid grid-cols-3 gap-3">
                      {filteredProducts
                        .filter(p => p.category === category && p.available)
                        .map(product => (
                          <button
                            key={product.id}
                            onClick={() => addToCart(product)}
                            className="p-4 border-2 border-gray-200 rounded-lg hover:border-amber-500 hover:shadow-md transition text-left"
                          >
                            <div className="font-semibold text-gray-800">{product.name}</div>
                            <div className="text-amber-600 font-bold mt-1">${product.price}</div>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cart */}
            <div className="bg-white p-4 rounded-lg shadow h-fit sticky top-4">
              <h3 className="text-xl font-bold mb-4">Current Order</h3>

              {/* Customer Selection */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                {selectedCustomer ? (
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{selectedCustomer.name}</p>
                      <p className="text-sm text-gray-600">{selectedCustomer.loyalty_points} points</p>
                    </div>
                    <button
                      onClick={() => setSelectedCustomer(null)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ) : (
                  <select
                    onChange={(e) => {
                      const customer = customers.find(c => c.id === e.target.value);
                      setSelectedCustomer(customer);
                    }}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="">Select Customer (Optional)</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} ({customer.loyalty_points} pts)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Cart Items */}
              <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                {cart.map(item => (
                  <div key={item.id} className="border-b pb-3">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium">{item.name}</span>
                      <span className="font-bold">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => updateCartItem(item.id, item.quantity - 1)}
                        className="p-1 bg-gray-200 rounded hover:bg-gray-300"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateCartItem(item.id, item.quantity + 1)}
                        className="p-1 bg-gray-200 rounded hover:bg-gray-300"
                      >
                        <Plus size={16} />
                      </button>
                      <button
                        onClick={() => updateCartItem(item.id, 0)}
                        className="ml-auto text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Special instructions..."
                      value={item.modifications}
                      onChange={(e) => updateModifications(item.id, e.target.value)}
                      className="w-full p-2 text-sm border rounded"
                    />
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="border-t pt-4 mb-4">
                <div className="flex justify-between items-center text-2xl font-bold">
                  <span>Total:</span>
                  <span className="text-amber-600">${calculateTotal()}</span>
                </div>
              </div>

              {/* Payment Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => processPayment('cash')}
                  className="w-full py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
                  disabled={cart.length === 0}
                >
                  <DollarSign size={20} />
                  Pay with Cash
                </button>
                <button
                  onClick={() => processPayment('card')}
                  className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-2"
                  disabled={cart.length === 0}
                >
                  <CreditCard size={20} />
                  Pay with Card
                </button>
                <button
                  onClick={() => processPayment('mobile')}
                  className="w-full py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center justify-center gap-2"
                  disabled={cart.length === 0}
                >
                  <Smartphone size={20} />
                  Mobile Payment
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'orders' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4">Today's Orders</h2>
            <div className="space-y-4">
              {orders.map(order => (
                <div key={order.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold">Order #{order.id.slice(0, 8)}</p>
                      <p className="text-sm text-gray-600">
                        {order.customer?.name || 'Walk-in Customer'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(order.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-amber-600">${order.total}</p>
                      <p className="text-sm text-gray-600 capitalize">{order.payment_method}</p>
                    </div>
                  </div>
                  {order.special_instructions && (
                    <p className="text-sm bg-yellow-50 p-2 rounded mt-2">
                      📝 {order.special_instructions}
                    </p>
                  )}
                  <div className="mt-3 space-y-1">
                    {order.order_items?.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.quantity}x {item.product?.name}</span>
                        <span>${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'inventory' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4">Inventory Management</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-left">Quantity</th>
                    <th className="px-4 py-3 text-left">Unit</th>
                    <th className="px-4 py-3 text-left">Min Qty</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(item => (
                    <tr key={item.id} className="border-b">
                      <td className="px-4 py-3">{item.item_name}</td>
                      <td className="px-4 py-3">{item.quantity}</td>
                      <td className="px-4 py-3">{item.unit}</td>
                      <td className="px-4 py-3">{item.min_quantity}</td>
                      <td className="px-4 py-3">
                        {item.quantity <= item.min_quantity ? (
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm">
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                            In Stock
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === 'customers' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Customers</h2>
              <button
                onClick={() => setShowCustomerModal(true)}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
              >
                Add Customer
              </button>
            </div>
            <div className="grid gap-4">
              {customers.map(customer => (
                <div key={customer.id} className="border rounded-lg p-4 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-lg">{customer.name}</p>
                    <p className="text-sm text-gray-600">{customer.email}</p>
                    <p className="text-sm text-gray-600">{customer.phone}</p>
                    {customer.preferences && (
                      <p className="text-sm text-amber-600 mt-1">
                        Preferences: {customer.preferences}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-amber-600">
                      {customer.loyalty_points}
                    </p>
                    <p className="text-sm text-gray-600">Loyalty Points</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Customer Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Add New Customer</h3>
            <div>
              <div className="space-y-4">
                <input
                  id="customerName"
                  type="text"
                  placeholder="Name"
                  className="w-full p-2 border rounded-lg"
                />
                <input
                  id="customerEmail"
                  type="email"
                  placeholder="Email"
                  className="w-full p-2 border rounded-lg"
                />
                <input
                  id="customerPhone"
                  type="tel"
                  placeholder="Phone"
                  className="w-full p-2 border rounded-lg"
                />
                <textarea
                  id="customerPreferences"
                  placeholder="Preferences (e.g., extra shot, oat milk)"
                  className="w-full p-2 border rounded-lg"
                  rows="3"
                />
              </div>
              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="flex-1 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const name = document.getElementById('customerName').value;
                    const email = document.getElementById('customerEmail').value;
                    const phone = document.getElementById('customerPhone').value;
                    const preferences = document.getElementById('customerPreferences').value;
                    if (name) {
                      addCustomer({ name, email, phone, preferences, loyalty_points: 0 });
                    }
                  }}
                  className="flex-1 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                >
                  Add Customer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoffeeShopPOS;